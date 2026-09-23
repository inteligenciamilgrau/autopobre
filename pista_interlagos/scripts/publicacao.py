"""Explicit public file boundary shared by the build and local preview server."""
from pathlib import Path
import base64
import hashlib
import re

ROOT = Path(__file__).resolve().parents[2]
GAME = 'pista_interlagos/teste/'
MODULES = (
    'pilot-profile.js', 'ai-records.js', 'ai-record-references.js',
    'car-condition.js', 'pit-lane.js', 'pitstop.js', 'pitstop.css',
    'circuits.js', 'curvelo-data.js', 'curvelo-scene.js',
    'race-results.js', 'race-results.css', 'lap-records.js',
    'race-roster.js',
    "sound-effects.js", "game-music.js", "recorded-music.js", "race-field.js", "crash-parts.js", "settings.js", "settings.css", "mobile-controls.js", "mobile.css",
    'main.js', 'player-preferences.js', 'physics.js', 'camera-return.js', 'car-audio.js', 'cockpit.js',
    'driver.js', 'driver-rig.js', 'driver-controls.js', 'driver-helmet.js', 'family-phone.js',
    'immersive-mode.js', 'immersive-state.js', 'immersive-visuals.js',
    'skid-marks.js', 'track-surface.js', 'tyre-smoke.js', 'sky.js', 'landscape.js',
    'style.css', 'immersive.css', 'abertura.css', 'index.html', 'sobre.html',
    'favicon.svg', 'favicon.ico', 'apple-touch-icon.png',
)
ASSETS = (
    'branding/old_stock_preparada_v1.png',
    'opala99_assinaturas_omp.glb', 'opala99_seiva_danilo.glb',
    'abertura/desclassificado_v1.png', 'abertura/abertura_stevan_opala99.png', 'abertura/logo_auto_pobre_racing.png',
    'piloto/capacete_publico.jpg', 'piloto/referencia_frente.png',
    'texturas/asfalto_diff_v2.jpg', 'texturas/asfalto_nor_gl_v2.jpg', 'texturas/asfalto_rough_v2.jpg',
    'texturas/asfalto_creditos.txt', 'texturas/cockpit_faixa_invent.png',
    'texturas/grama_diff_v1.jpg', 'texturas/grama_nor_gl_v1.jpg', 'texturas/mato_diff_v1.jpg',
    'texturas/brita_diff_v1.jpg', 'texturas/concreto_diff_v1.jpg', 'texturas/terreno_creditos.txt',
)
THREE = (
    'build/three.module.js', 'build/three.core.js',
    'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/controls/OrbitControls.js',
    'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/utils/SkeletonUtils.js',
    'LICENSE',
)
PUBLIC_FILES = {name: GAME + name for name in MODULES}
PUBLIC_FILES.update({'assets/' + name: GAME + 'assets/' + name for name in ASSETS})
PUBLIC_FILES.update({'vendor/three/' + name: GAME + 'node_modules/three/' + name for name in THREE})
PUBLIC_FILES.update({
    'dados/pista.json': 'pista_interlagos/dados/pista.json',
    'exports/interlagos_pista.glb': 'pista_interlagos/exports/interlagos_pista.glb',
})
AUDIO_NAMES = ('intro.mp3', 'race.mp3', 'patrocinio.mp3', 'turbo.mp3', 'hojenaodeu.mp3', 'energia.mp3')
OPTIONAL_AUDIO = {'assets/audio/' + name: GAME + 'assets/audio/' + name for name in AUDIO_NAMES}


def audio_manifest():
    files = []
    for name in AUDIO_NAMES:
        path = ROOT / GAME / 'assets/audio' / name
        if path.exists():
            contained_file(ROOT, GAME + 'assets/audio/' + name)
            files.append(name)
    return files


def contained_file(root, relative):
    """No symlinks/junctions, parent traversal or files outside the selected root."""
    root = root.resolve()
    parts = Path(relative).parts
    if Path(relative).is_absolute() or '..' in parts:
        raise ValueError('Invalid public path')
    path = root
    for part in parts:
        path /= part
        if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
            raise ValueError('Links are not public files')
    if not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError('Public file is missing or outside its root')
    return path


def content_policy(html):
    inline = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    if not inline:
        raise ValueError('Missing import map')
    digest = base64.b64encode(hashlib.sha256(inline[1].encode()).digest()).decode()
    return (
        "default-src 'self'; "
        f"script-src 'self' 'sha256-{digest}'; "
        "script-src-attr 'none'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; connect-src 'self' blob:; "
        "font-src 'self'; media-src 'self' blob:; worker-src 'none'; "
        "object-src 'none'; base-uri 'none'; form-action 'none'"
    )


def security_headers(html):
    return {
        'Content-Security-Policy': content_policy(html) + "; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    }
