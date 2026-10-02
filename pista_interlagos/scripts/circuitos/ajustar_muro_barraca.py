"""Aplica a pista_<id>.json ja gerado o alargamento do muro dos boxes sob a banca do Box 99.

    python ajustar_muro_barraca.py cascavel [piracicaba ...]

E a mesma regra que gerar_pista.py aplica ao gerar (muro_barraca.largura_muro), para quando as
fontes nao podem ser reprocessadas. Cada ponto de 'Muro_boxes' nasce de uma estacao da pista de
boxes (ponto = eixo + normal * deslocamento); aqui a espessura sobe e o deslocamento recua para
o lado da pista principal mantendo a face da pista de boxes, sem levar a face da pista a menos de
0,6 m do asfalto (colunas lane_lo e gap). Idempotente.
"""
import json
import sys

import numpy as np

from config import DADOS
from muro_barraca import FOLGA_PISTA_M, largura_muro


def ajustar(nome):
    arq = DADOS / f'pista_{nome}.json'
    dados = json.loads(arq.read_text(encoding='utf-8'))
    pit = dados.get('pit')
    if not pit:
        print(f'{nome}: sem pista de boxes')
        return
    col = {n: i for i, n in enumerate(pit['columns'])}
    amostras = np.array(pit['samples'])
    ps, xy, z = amostras[:, col['s']], amostras[:, [col['x'], col['y']]], amostras[:, col['z']]
    normal, bank = amostras[:, [col['lx'], col['ly']]], amostras[:, col['bank']]
    tang = amostras[:, [col['tx'], col['ty']]]
    s99 = pit['box99']['s']
    mudados = 0
    for muro in pit['walls']:
        if muro['name'] != 'Muro_boxes':
            continue
        for ponto in muro['points']:
            p = np.array(ponto[:2])
            # A estacao de onde o ponto nasceu: a unica com o ponto sobre a sua normal.
            rel = p - xy
            custo = np.abs(np.einsum('ij,ij->i', rel, tang)) + 100 * (np.abs(np.einsum('ij,ij->i', rel, normal)) > 25)
            i = int(np.argmin(custo))
            desloc = float(rel[i] @ normal[i])
            esp = ponto[3]
            face = desloc + esp / 2                      # face voltada para a pista de boxes
            # O asfalto da pista principal fica a 'gap' alem da borda da pista de boxes (lane_lo).
            maximo = face - amostras[i, col['lane_lo']] + amostras[i, col['gap']] - FOLGA_PISTA_M if 'gap' in col else None
            nova = float(largura_muro(ps[i], s99, esp, maximo))
            if nova <= esp + 2e-3:                 # ja alargado (a espessura gravada tem 1 mm de arredondamento)
                continue
            desloc = face - nova / 2
            q = xy[i] + normal[i] * desloc
            ponto[:] = [round(float(q[0]), 3), round(float(q[1]), 3), round(float(z[i] + bank[i] * desloc), 3), round(nova, 3)]
            mudados += 1
    arq.write_text(json.dumps(dados, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{nome}: {mudados} estacoes do muro alargadas')


if __name__ == '__main__':
    for nome in sys.argv[1:] or ['cascavel']:
        ajustar(nome)
