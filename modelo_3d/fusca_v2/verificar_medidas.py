# -*- coding: utf-8 -*-
"""Compara a carroceria do v2 com as medidas do desenho tecnico (medidas_fusca.py).

Uso:  blender --background --python verificar_medidas.py

Mede, sobre a malha da carroceria (antes dos recortes): perfil lateral (topo), largura em planta e envelope frontal,
e imprime o erro medio/maximo de cada um. As referencias de largura incluem os estribos na zona das portas,
portanto essa faixa (y de -0,62 a 0,70) e ignorada no calculo.
"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import criar_fusca_v2 as V2
import medidas_fusca as MED


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = V2.criar_materiais()
    V2.usar_colecao("Fusca_v2")
    car, body = V2.construir_carroceria(mats)
    v = np.array([tuple(p.co) for p in body.data.vertices])
    x, y, z = np.abs(v[:, 0]), v[:, 1], v[:, 2]

    def resumo(nome, erros):
        e = np.array(erros)
        print("%-34s n=%3d  erro medio %5.1f mm | maximo %5.1f mm" % (nome, len(e), 1000 * np.abs(e).mean(), 1000 * np.abs(e).max()))

    # 1) topo do perfil lateral (y de -1,58 a 1,78)
    err = []
    for yy, zr in MED.TOPO_Z:
        m = np.abs(y - yy) < 0.006
        if m.any():
            err.append(z[m].max() - zr)
    resumo("perfil lateral (topo)", err)

    # 2) largura em planta, fora da zona dos estribos
    err = []
    for yy, wr in MED.LARG_SILHUETA:
        if -0.62 <= yy <= 0.70:
            continue
        m = np.abs(y - yy) < 0.006
        if m.any():
            err.append(x[m].max() - wr)
    resumo("largura em planta (para-lamas)", err)

    # 3) envelope frontal na cabine (z de 1,00 a 1,50; sem os espelhos, z 1,04-1,12)
    err = []
    for zz, wr in MED.ENV_FRENTE_Z:
        if 1.00 <= zz <= 1.50 and not (1.03 <= zz <= 1.13):
            m = np.abs(z - zz) < 0.006
            if m.any():
                err.append(x[m].max() - wr)
    resumo("envelope frontal (cabine)", err)

    # 4) envelope frontal dos para-lamas (z de 0,50 a 0,76)
    err = []
    for zz, wr in MED.ENV_FRENTE_Z:
        if 0.50 <= zz <= 0.76:
            m = np.abs(z - zz) < 0.006
            if m.any():
                err.append(x[m].max() - wr)
    resumo("envelope frontal (para-lamas)", err)

    print("dimensoes da carroceria: comprimento %.3f m | largura %.3f m | altura %.3f m" %
          (y.max() - y.min(), 2 * x.max(), z.max()))


if __name__ == "__main__":
    main()
