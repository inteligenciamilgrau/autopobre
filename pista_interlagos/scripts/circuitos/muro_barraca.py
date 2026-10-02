"""Muro dos boxes sob a banca da equipe do Box 99 (so numpy).

A banca (pit-box99.js) fica sobre o muro entre a pista de boxes e a pista: piso de 2,2 m
com a beirada ate o alambrado, e os degraus no lado da pista de boxes. Onde a folga entre as
duas pistas e grande (Cascavel, ~11 m) a regra do gerador afina o muro a 0,6 m e a banca nao
tem onde ficar: sem muro largo ela vai parar do outro lado do alambrado. Aqui o muro alarga so
em volta do Box 99, para o lado da pista principal, e mantem a face da pista de boxes. O
alambrado e desenhado na face externa e acompanha o alargamento. O alargamento nunca leva a
face da pista a menos de FOLGA_PISTA_M do asfalto: onde a folga entre as pistas e curta a banca
fica com menos piso (gerar_pista.py avisa).

Usado por gerar_pista.py e por ajustar_muro_barraca.py (que aplica a mesma regra a um JSON ja
gerado quando as fontes nao podem ser reprocessadas).
"""
import numpy as np

LARGURA_M = 3.4                # 2,2 m de piso + 1,0 m de beirada + folga do alambrado
DE_M, ATE_M = -3.6, 3.4        # trecho de largura cheia, ao longo da pista de boxes a partir do Box 99
AFINA_M = 4.0                  # a largura volta ao muro normal em tantos metros fora do trecho
FOLGA_PISTA_M = 0.6            # da face do muro ao asfalto da pista principal, como a regra do gerador


def trecho_cheio(ps, s99):
    """Onde o muro deve ter a largura cheia da banca."""
    ao_longo = np.asarray(ps) - s99
    return (ao_longo >= DE_M) & (ao_longo <= ATE_M)


def largura_muro(ps, s99, esp, maximo=None):
    """Espessura do muro com a plataforma da banca; ps e a distancia ao longo da pista de boxes.

    maximo: a maior espessura que ainda deixa a face da pista a FOLGA_PISTA_M do asfalto
    (folga entre as pistas - recuo da face dos boxes - FOLGA_PISTA_M). O alargamento para ali;
    a espessura da regra normal (esp) fica como esta.
    """
    ao_longo = np.asarray(ps) - s99
    fora = np.maximum(np.maximum(DE_M - ao_longo, ao_longo - ATE_M), 0)
    larga = LARGURA_M * (1 - np.clip(fora / AFINA_M, 0, 1))
    if maximo is not None:
        larga = np.minimum(larga, maximo)
    return np.maximum(esp, larga)
