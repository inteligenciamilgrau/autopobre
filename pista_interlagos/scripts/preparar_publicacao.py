"""Build only approved game files into dist/. No dependencies beyond Python 3.10+."""
import hashlib
import json
from pathlib import Path
import re
from publicacao import ROOT, PUBLIC_FILES, contained_file, content_policy, security_headers


def build():
    dist = ROOT / 'dist'
    # A previous build may be replaced, but unexpected files are never published or deleted.
    if dist.is_symlink() or (hasattr(dist, 'is_junction') and dist.is_junction()):
        raise ValueError('dist must be a regular directory')
    expected = set(PUBLIC_FILES) | {'_headers', '.nojekyll'}
    if dist.exists():
        for p in dist.rglob('*'):
            if p.is_symlink() or (hasattr(p, 'is_junction') and p.is_junction()):
                raise ValueError('dist contains a link')
            if p.is_file() and p.relative_to(dist).as_posix() not in expected:
                raise ValueError('dist contains an unexpected file; inspect it before building')
    payload = {out: contained_file(ROOT, src).read_bytes() for out, src in PUBLIC_FILES.items()}
    html = payload['index.html'].decode('utf-8').replace('./node_modules/three/', './vendor/three/')
    policy = content_policy(html)
    html = html.replace('<link rel="icon"', '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n<meta name="referrer" content="no-referrer">\n<link rel="icon"', 1)
    payload['index.html'] = html.encode('utf-8')
    payload['main.js'] = payload['main.js'].replace(b'../dados/pista.json', b'./dados/pista.json').replace(b'../exports/interlagos_pista.glb', b'./exports/interlagos_pista.glb')
    payload['_headers'] = ('/*\n' + ''.join(f'  {k}: {v}\n' for k, v in security_headers(html).items())).encode()
    payload['.nojekyll'] = b''
    # Fail closed on accidental workstation paths or credential-like literals in text.
    private = re.compile(rb'(?i)(?<![A-Za-z0-9])[a-z]:[\\/]|/Users/|/home/|file://[A-Za-z/]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{24,}')
    for name, data in payload.items():
        if Path(name).suffix in {'.js', '.json', '.html', '.css'} and private.search(data):
            raise ValueError('Private data candidate in public file: ' + name)
    dist.mkdir(exist_ok=True)
    for name, data in payload.items():
        p = dist / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    report = {'files': len(payload), 'bytes': sum(map(len, payload.values())), 'artifacts': {
        name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in payload.items()
    }}
    audit = ROOT / '.audit-local'
    audit.mkdir(exist_ok=True)
    (audit / 'publicacao.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f"dist/: {report['files']} files, {report['bytes'] / 1000000:.1f} MB. Publish only this directory.")
    return report


if __name__ == '__main__':
    build()
