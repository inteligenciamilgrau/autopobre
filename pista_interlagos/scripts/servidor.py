"""Local preview only. Serves the explicit public file list, never the workspace."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import argparse
import socket
import webbrowser
import io
import json
from urllib.parse import urlsplit, unquote
from urllib.request import urlopen
from publicacao import ROOT, GAME, PUBLIC_FILES, OPTIONAL_AUDIO, audio_manifest, contained_file, security_headers


class Handler(SimpleHTTPRequestHandler):
    server_version = 'AutoPobrePreview'
    sys_version = ''
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript',
                      '.glb': 'model/gltf-binary', '.json': 'application/json'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        port = self.server.server_port
        if self.headers.get('Host', '').lower() not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            self.send_error(403, 'Forbidden')
            return None
        if self.headers.get('Sec-Fetch-Site') == 'cross-site' and self.headers.get('Sec-Fetch-Mode') != 'navigate':
            self.send_error(403, 'Forbidden')
            return None
        path = unquote(urlsplit(self.path).path)
        if path == '/':
            self.send_response(302)
            self.send_header('Location', '/' + GAME)
            self.end_headers()
            return None
        if path == '/' + GAME:
            path += 'index.html'
        if path == '/' + GAME + 'assets/audio/tracks.json':
            try:
                data = json.dumps(audio_manifest()).encode('utf-8')
            except (ValueError, OSError):
                self.send_error(404, 'Not found')
                return None
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return io.BytesIO(data)
        allowed = {'/' + src for src in [*PUBLIC_FILES.values(), *OPTIONAL_AUDIO.values()]}
        if path not in allowed:
            self.send_error(404, 'Not found')
            return None
        try:
            self.public_path = contained_file(ROOT, path[1:])
        except (ValueError, OSError):
            self.send_error(404, 'Not found')
            return None
        return super().send_head()

    def translate_path(self, path):
        return str(self.public_path)

    def list_directory(self, path):
        self.send_error(404, 'Not found')
        return None

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except ConnectionError:
            pass  # The browser cancelled a download or closed the tab.

    def end_headers(self):
        html = (ROOT / GAME / 'index.html').read_text(encoding='utf-8')
        for name, value in security_headers(html).items():
            self.send_header(name, value)
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-AutoPobre-Preview', 'restricted-v1')
        super().end_headers()

    def log_message(self, *args):
        pass


class LocalServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('port', nargs='?', type=int, default=8799)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    for candidate in range(args.port, min(args.port + 10, 65536)):
        url = f'http://127.0.0.1:{candidate}/' + GAME
        try:
            with urlopen(url, timeout=1) as response:
                existing = response.headers.get('X-AutoPobre-Preview') == 'restricted-v1'
            if existing:
                print(url, flush=True)
                if not args.no_browser:
                    webbrowser.open(url)
                return
        except OSError:
            pass
        try:
            server = LocalServer(('127.0.0.1', candidate), Handler)
            break
        except OSError:
            pass
    else:
        raise RuntimeError('Nenhuma porta local livre no intervalo solicitado.')
    print(url, flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
