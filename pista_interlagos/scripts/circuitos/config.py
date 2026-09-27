"""Circuitos da Old Stock Race reconstruidos a partir de dados abertos.

Cada circuito guarda aqui o que vem de fontes publicadas (extensao oficial,
sentido, largura) e onde buscar os dados geograficos. Os scripts
baixar_fontes.py e gerar_pista.py leem esta tabela.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]          # pista_interlagos/
FONTES = RAIZ / 'fontes'
DADOS = RAIZ / 'dados'
ASSETS = RAIZ / 'teste' / 'assets' / 'circuitos'

CIRCUITOS = {
    'cascavel': {
        'nome': 'Autódromo Internacional Zilmar Beux',
        'cidade': 'Cascavel, PR',
        # Centro aproximado do complexo (OSM leisure=sports_centre 398629834).
        'centro': (-24.9814, -53.3846),
        'raio_m': 1700,
        'epsg': 31982,                 # SIRGAS 2000 / UTM 22S
        'anadem': '22J',
        'copernicus': 'Copernicus_DSM_COG_10_S25_00_W054_00_DEM',
        'worldcover': 'S27W054',
        # Prefeitura de Cascavel / CBA: 3.058 m, 12 m de largura, sentido anti-horario.
        'extensao_m': 3058,
        'centro_cidade': (-24.9555, -53.4553),   # Catedral de Cascavel
        'largura_m': 12,
        'sentido': 'anti-horario',
    },
    'piracicaba': {
        'nome': 'Autódromo do ECPA',
        'cidade': 'Piracicaba, SP',
        # OSM relation 19345029 (Esporte Clube Piracicabano de Automobilismo).
        'centro': (-22.7387, -47.5337),
        'raio_m': 1500,
        'epsg': 31983,                 # SIRGAS 2000 / UTM 23S
        'anadem': '23K',
        'copernicus': 'Copernicus_DSM_COG_10_S23_00_W048_00_DEM',
        'worldcover': 'S24W048',
        # ECPA: 2.100 m, 9 curvas, sentido horario.
        'extensao_m': 2100,
        'centro_cidade': (-22.7253, -47.6492),   # Catedral de Piracicaba
        'largura_m': None,
        'sentido': 'horario',
    },
}


def pasta_fontes(circuito):
    pasta = FONTES / circuito
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta
