"""Coarse grain of the race asphalt: a tileable map that keeps its contrast far from the camera.

The scanned asphalt (asfalto_*_v3, 2 m per tile) holds its detail at the millimetre scale, so its
mipmaps fade to a flat grey a few metres ahead of the car and the road reads as smooth paint at
speed. This map adds what the scan lacks: coarse stones (12-33 mm) polished by the tyres, voids,
and patches where the stones are more or less exposed, with energy at every scale from 1 cm to
about 1.5 m, so each mip level keeps part of the grain. Game art, not survey data.

Uso: python scripts/gerar_asfalto_grao.py [saida.jpg]   (numpy + Pillow; e.g. the geo-venv)
Grava teste/assets/texturas/asfalto_grao_v1.jpg: 2048 x 2048, 6 m por repeticao, cinza com media 0.5.
O jogo (track-surface.js) desenha o mapa nesse tamanho.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

N = 2048          # pixels per tile
TILE_M = 6.0      # metres per tile
MM = TILE_M * 1000 / N
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'teste/assets/texturas/asfalto_grao_v1.jpg'
rng = np.random.default_rng(20261003)


def field(beta, low_m, high_m):
    """Periodic Gaussian noise with amplitude ~ f^-beta between wavelengths high_m and low_m (metres)."""
    f = np.fft.fftfreq(N, d=TILE_M / N)
    r = np.hypot(*np.meshgrid(f, f, indexing='ij'))
    band = (r >= 1 / low_m) & (r <= 1 / high_m)
    amp = np.where(band, np.power(np.maximum(r, 1e-9), -beta), 0.0)
    spec = amp * np.exp(2j * np.pi * rng.random((N, N)))
    out = np.fft.ifft2(spec).real
    return (out - out.mean()) / (out.std() + 1e-12)


def stamp(canvas, weight, cx, cy, radius, value, aspect, angle, rough):
    """Soft irregular stone on a torus (the tile wraps), drawn as an alpha-blended value."""
    r = int(np.ceil(radius * max(aspect, 1) + 2))
    ys, xs = np.mgrid[-r:r + 1, -r:r + 1]
    fx, fy = xs + (cx % 1), ys + (cy % 1)
    ca, sa = np.cos(angle), np.sin(angle)
    u, v = (fx * ca + fy * sa) / aspect, (-fx * sa + fy * ca)
    theta = np.arctan2(v, u)
    # A few lobes make the outline angular like crushed stone.
    edge = radius * (1 + rough[0] * np.cos(3 * theta + rough[1]) + rough[2] * np.cos(5 * theta + rough[3]))
    alpha = np.clip(edge - np.hypot(u, v) + .5, 0, 1)
    # Slight dome: the middle of an exposed stone catches more light than its rim.
    shade = value * (1 + .25 * (1 - np.clip(np.hypot(u, v) / max(radius, 1e-3), 0, 1)))
    iy = (int(cy) + ys) % N
    ix = (int(cx) + xs) % N
    canvas[iy, ix] = canvas[iy, ix] * (1 - alpha) + shade * alpha
    weight[iy, ix] = np.maximum(weight[iy, ix], alpha)


def main():
    # Patches where the binder wore off (stones exposed, lighter and busier) or stayed rich.
    exposure = field(1.0, 1.8, .045)
    exposure = 1 / (1 + np.exp(-1.6 * exposure))
    # Binder tone: broad, low mottling from 4.5 cm to 3 m.
    binder = .44 + .035 * field(1.1, 3.0, .045) + .018 * field(.6, .09, .012)
    canvas = binder.copy()
    weight = np.zeros((N, N))
    # Coarse aggregate, 12-33 mm, denser where it is exposed.
    # Mean stone area: log-uniform diameter (E[d^2] = (33^2 - 12^2) / (2 ln(33/12))), mean aspect 1.3.
    mean_area = np.pi / 4 * (33 ** 2 - 12 ** 2) / (2 * np.log(33 / 12)) * 1.3 / MM ** 2
    count = int(N * N * .42 / mean_area)
    placed = 0
    for _ in range(count * 3):
        if placed >= count:
            break
        cx, cy = rng.random() * N, rng.random() * N
        e = exposure[int(cy), int(cx)]
        if rng.random() > .25 + .75 * e:
            continue
        diameter = np.exp(rng.uniform(np.log(12), np.log(33))) / MM
        dark = rng.random() < .22
        value = (.3 - .05 * rng.random()) if dark else (.56 + .14 * e + .09 * rng.normal())
        stamp(canvas, weight, cx, cy, diameter / 2, value, rng.uniform(1, 1.6), rng.uniform(0, np.pi),
              (rng.uniform(0, .14), rng.uniform(0, 6.3), rng.uniform(0, .08), rng.uniform(0, 6.3)))
        placed += 1
    # Voids between the stones: small dark pits, more of them where the binder wore off.
    pits = int(N * N * .012)
    for _ in range(pits):
        cx, cy = rng.random() * N, rng.random() * N
        if weight[int(cy), int(cx)] > .5 or rng.random() > .3 + .7 * exposure[int(cy), int(cx)]:
            continue
        stamp(canvas, weight, cx, cy, rng.uniform(.6, 1.6), .2 + .06 * rng.random(), 1, 0, (0, 0, 0, 0))
    # Fine sand between it all.
    canvas += .025 * field(0.0, .015, 2 * MM / 1000)
    canvas = np.clip(canvas - canvas.mean() + .5, 0, 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.round(canvas * 255).astype(np.uint8), 'L').save(OUT, quality=85, optimize=True)
    a = canvas
    report = [f'{OUT.name}: {N}px, {TILE_M} m, {placed} stones, mean {a.mean():.3f}']
    for level in range(0, 9):
        k = 2 ** level
        b = a.reshape(N // k, k, N // k, k).mean(axis=(1, 3))
        report.append(f'  mip {level} ({k * MM:.1f} mm/texel): std {b.std():.4f}')
    print('\n'.join(report))


if __name__ == '__main__':
    main()
