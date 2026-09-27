"""Planta de conferencia: dados/pista_<c>.json desenhado sobre a imagem de referencia.

    python desenhar_planta.py cascavel [saida.jpg]

Eixo e bordas (amarelo), zebras (magenta), pit lane (ciano), garagens e Box 99
(laranja), arquibancadas (branco), edificacoes (azul), nomes dos trechos.
So para conferencia local: a imagem de referencia nao e publicada.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer

from config import CIRCUITOS, DADOS, pasta_fontes

Image.MAX_IMAGE_PIXELS = None


def main():
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    d = json.loads((DADOS / f'pista_{nome}.json').read_text(encoding='utf-8'))
    meta = d['meta']
    ox, oy, _ = meta['origin_utm']
    k = meta['horizontal_scale_to_nominal']
    ref = json.loads((pasta / 'referencia_esri.json').read_text())
    img = Image.open(pasta / 'referencia_esri.jpg').convert('RGB')
    inv = Transformer.from_crs(meta['epsg'], 4326, always_xy=True)
    z = ref['z']

    def px(x, y):
        lon, lat = inv.transform(np.asarray(x) / k + ox, np.asarray(y) / k + oy)
        n = 2 ** z
        col = (np.asarray(lon) + 180) / 360 * n
        row = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
        return (col - ref['tx0']) * 256, (row - ref['ty0']) * 256

    dr = ImageDraw.Draw(img)
    a = np.array(d['samples'])
    x, y, w, lx, ly = a[:, 1], a[:, 2], a[:, 4], a[:, 9], a[:, 10]
    for lado in (-1, 1):
        cc, rr = px(x + lx * w / 2 * lado, y + ly * w / 2 * lado)
        dr.line(list(zip(cc, rr)) + [(cc[0], rr[0])], fill=(255, 230, 0), width=2)
    for col, lado in ((13, -1), (14, 1)):
        m = a[:, col] > 0
        cc, rr = px(x + lx * (w / 2 + .6) * lado, y + ly * (w / 2 + .6) * lado)
        for i in np.flatnonzero(m):
            dr.ellipse([cc[i] - 2, rr[i] - 2, cc[i] + 2, rr[i] + 2], fill=(255, 0, 255))
    cc, rr = px(x, y)
    dr.line(list(zip(cc, rr)), fill=(255, 60, 60), width=1)
    # Linha de chegada e trechos.
    dr.line([px(x[0] + lx[0] * 9, y[0] + ly[0] * 9), px(x[0] - lx[0] * 9, y[0] - ly[0] * 9)], fill=(255, 255, 255), width=5)
    s = a[:, 0]
    for sv, nm in meta['sections']:
        i = int(np.searchsorted(s, sv))
        i = min(i, len(s) - 1)
        c0, r0 = px(x[i] + lx[i] * (w[i] / 2 + 14), y[i] + ly[i] * (w[i] / 2 + 14))
        dr.text((c0, r0), f'{sv:.0f} {nm}', fill=(255, 255, 255))
    if 'pit' in d:
        p = d['pit']
        col = {n: i for i, n in enumerate(p['columns'])}
        b = np.array(p['samples'])
        for key, cor in (('lane_lo', (0, 220, 255)), ('lane_hi', (0, 220, 255)), ('fast_hi', (0, 120, 255))):
            cc, rr = px(b[:, col['x']] + b[:, col['lx']] * b[:, col[key]], b[:, col['y']] + b[:, col['ly']] * b[:, col[key]])
            dr.line(list(zip(cc, rr)), fill=cor, width=1)
        for wall in p['walls']:
            q = np.array(wall['points'])
            cc, rr = px(q[:, 0], q[:, 1])
            dr.line(list(zip(cc, rr)), fill=(160, 160, 160) if wall['name'] == 'Muro_boxes' else (255, 140, 0), width=2)
        for sv in p['garages']:
            i = int(np.searchsorted(b[:, 0], sv))
            i = min(i, len(b) - 1)
            c0, r0 = px(b[i, col['x']] + b[i, col['lx']] * 25, b[i, col['y']] + b[i, col['ly']] * 25)
            c1, r1 = px(b[i, col['x']], b[i, col['y']])
            dr.line([(c0, r0), (c1, r1)], fill=(255, 140, 0), width=3)
    for it in d['scenery']['buildings']['items']:
        bx, by, bw, bd, h = it[0], it[1], it[2], it[3], it[4]
        u = np.array([math.cos(h), math.sin(h)])
        v = np.array([-u[1], u[0]])
        cn = [np.array([bx, by]) + u * sa * bw / 2 + v * sb * bd / 2 for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        pts = [px(q[0], q[1]) for q in cn]
        dr.polygon([(float(p0), float(p1)) for p0, p1 in pts], outline=(80, 160, 255))
    for st in d['scenery']['stands']:
        L = meta['reconstructed_xy_m']
        for blk in range(st['blocks']):
            sv = (L - st['first_s'] + blk * 28) % L
            i = min(int(np.searchsorted(s, sv)), len(s) - 1)
            side = st['side']
            q0 = (x[i] + lx[i] * side * (w[i] / 2 + st['gap']), y[i] + ly[i] * side * (w[i] / 2 + st['gap']))
            q1 = (x[i] + lx[i] * side * (w[i] / 2 + st['gap'] + 17), y[i] + ly[i] * side * (w[i] / 2 + st['gap'] + 17))
            dr.line([px(*q0), px(*q1)], fill=(255, 255, 255), width=3)
    cc, rr = px(x, y)
    m = 160
    img = img.crop((int(cc.min() - m), int(rr.min() - m), int(cc.max() + m), int(rr.max() + m)))
    saida = sys.argv[2] if len(sys.argv) > 2 else str(pasta / 'planta.jpg')
    img.save(saida, quality=88)
    print(saida, img.size)


if __name__ == '__main__':
    main()
