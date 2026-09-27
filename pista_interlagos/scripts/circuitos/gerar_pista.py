"""Gera dados/pista_<circuito>.json e teste/assets/circuitos/<circuito>_solo.jpg.

    python gerar_pista.py cascavel

Entradas (fontes/<circuito>/, ver baixar_fontes.py e refinar_eixo.py):
  eixo_refinado.json   eixo e larguras (e o pit lane, quando o OSM o traz)
  anadem.tif           relevo do terreno (ANADEM v1, 30 m, sem vegetacao)
  copernicus_dsm.tif   superficie (Copernicus GLO-30), so para validar o perfil
  worldcover.tif       cobertura do solo 2021 (ESA, 10 m)
  sentinel2_rgb.tif    cor real (Sentinel-2 L2A, 10 m) para a cor do chao ao longe
  osm.json, edificios_microsoft.geojson   vias, matas, agua e edificacoes

O formato segue dados/pista.json de Interlagos (mesmas colunas, bloco `pit`,
grade `terrain`), com `scenery` a mais: cobertura do solo em grade, edificacoes
reais como retangulos orientados e arquibancadas. O perfil longitudinal vem do
ANADEM suavizado (comprimento de onda < ~150 m nao e resolvido por um modelo de
30 m); caimentos, zebras e muros sao escolhas de modelagem por curva.
"""
import json
import math
import sys

import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.warp import reproject, Resampling
from scipy.ndimage import gaussian_filter1d, map_coordinates, minimum_filter1d, uniform_filter1d
from scipy.optimize import brentq
from scipy.spatial import cKDTree

from config import ASSETS, CIRCUITOS, DADOS, pasta_fontes

PASSO = 4.0          # grade do terreno (m), como Interlagos
MARGEM = 460.0       # terreno alem da caixa da pista e do pit (m)
DS = 2.0

# --- Por circuito: o que as fontes publicadas dizem e o que e modelagem declarada.
EXTRA = {
    'cascavel': {
        # Nomes na ordem da volta a partir da linha de chegada (curvas detectadas pela geometria).
        # Nomes das curvas pela posicao na volta (s do inicio da curva, a partir da chegada);
        # 'depois' nomeia a reta que comeca depois dela. So o Baciao (curva 1) tem nome
        # publicado; o resto descreve o lugar, sem inventar numeracao oficial.
        'trechos': {385: 'Bacião · curva 1', 1082: 'Dobra da reta oposta', 1239: 'Curva à direita do topo',
                    1538: 'Tangência à direita', 1872: 'Primeira das curvas gêmeas',
                    2066: 'Segunda das curvas gêmeas', 2798: 'Curva para a reta dos boxes'},
        'depois': {385: 'Reta oposta · subida', 2066: 'Reta de trás', 2798: 'Reta dos boxes · concreto, em descida'},
        'reta': 'Reta dos boxes · concreto, em descida',
        'caimento_extra': {'Bacião · curva 1': .045},      # "inclinada"; valor de modelagem
        'arquibancadas': [{'antes_da_chegada': 150, 'blocos': 7, 'lado': -1, 'recuo': 13}],
        'linha_chegada': 'meio_boxes',
        # "Concreto presente na reta de chegada" (Wikipedia; visivel nas placas da imagem).
        'concreto': True,
        'zebras': ['#c8201e', '#f1efe8'],
    },
    'piracicaba': {
        'trechos': {194: 'Curva do paddock', 400: 'Anel externo', 684: 'Entrada do miolo', 839: 'Miolo',
                    1137: 'Grampo do miolo', 1362: 'Grampo interno', 1666: 'Curva da reta principal'},
        'depois': {1666: 'Reta principal'},
        'reta': 'Reta principal',
        'caimento_extra': {},
        # Arquibancada no lado oeste da reta, antes da chegada; paddock e boxes depois dela.
        'arquibancadas': [{'antes_da_chegada': 110, 'blocos': 3, 'lado': 1, 'recuo': 12}],
        'linha_chegada': 0.36,     # fracao da reta principal (a partir do inicio dela)
        'zebras': ['#c8201e', '#f1efe8'],
        # Sem pit lane no OSM: faixa de servico a esquerda da reta, diante do paddock.
        'pit_sintetico': {'lado': 1, 'inicio': .29, 'entrada': 50, 'saida': 50, 'largura': 7.6},
    },
}


def carregar(nome):
    pasta = pasta_fontes(nome)
    eixo = json.loads((pasta / 'eixo_refinado.json').read_text(encoding='utf-8'))
    return pasta, eixo


class Raster:
    """Amostra um GeoTIFF (qualquer CRS) em pontos UTM do circuito."""

    def __init__(self, caminho, epsg, banda=1):
        with rasterio.open(caminho) as r:
            self.a = r.read(banda).astype(np.float64)
            self.t = r.transform
            self.nodata = r.nodata
            crs = r.crs
        self.inv = Transformer.from_crs(epsg, crs, always_xy=True)

    def __call__(self, x, y, ordem=3):
        u, v = self.inv.transform(np.asarray(x, float), np.asarray(y, float))
        col, lin = ~self.t * (u, v)
        return map_coordinates(self.a, [np.asarray(lin) - .5, np.asarray(col) - .5], order=ordem, mode='nearest')


def quadro(P, fechado=True):
    T = (np.roll(P, -1, 0) - np.roll(P, 1, 0)) if fechado else np.gradient(P, axis=0)
    T = T / np.linalg.norm(T, axis=1)[:, None]
    return T, np.column_stack([-T[:, 1], T[:, 0]])


def curvatura(P, janela=10.0):
    T, _ = quadro(P)
    rumo = np.unwrap(np.arctan2(T[:, 1], T[:, 0]))
    k = int(janela / DS)
    giro = (np.roll(rumo, -k) - np.roll(rumo, k))
    # O desenrolar deixa um salto de 2*pi na emenda do laco.
    giro = (giro + np.pi) % (2 * np.pi) - np.pi
    return gaussian_filter1d(giro / (2 * k * DS), 2, mode='wrap')


def curvas(kappa, s, L):
    """Curvas: trechos com raio menor que 350 m e giro total acima de 20 graus."""
    n = len(kappa)
    em = np.abs(kappa) > 1 / 350
    lista = []
    if em.all():
        return lista
    ini = np.argmin(em)
    k = 0
    while k < n:
        i = (ini + k) % n
        if em[i]:
            j = k
            while j < n and em[(ini + j) % n] and np.sign(kappa[(ini + j) % n]) == np.sign(kappa[i]):
                j += 1
            idx = [(ini + q) % n for q in range(k, j)]
            giro = abs(np.sum(kappa[idx])) * DS
            if giro > math.radians(20):
                apice = idx[int(np.argmax(np.abs(kappa[idx])))]
                lista.append({'ini': idx[0], 'fim': idx[-1], 'apice': apice, 'lado': int(np.sign(kappa[apice])),
                              'raio_min': float(1 / abs(kappa[apice])), 'giro_graus': float(math.degrees(giro))})
            k = j
        else:
            k += 1
    # Curvas separadas por menos de 25 m no mesmo sentido viram uma so.
    unidas = []
    for c in sorted(lista, key=lambda c: s[c['ini']]):
        if unidas and c['lado'] == unidas[-1]['lado'] and (s[c['ini']] - s[unidas[-1]['fim']]) % L < 25:
            u = unidas[-1]
            u['fim'] = c['fim']
            u['giro_graus'] += c['giro_graus']
            if c['raio_min'] < u['raio_min']:
                u['raio_min'], u['apice'] = c['raio_min'], c['apice']
        else:
            unidas.append(dict(c))
    return unidas


def alisar_rumo(P):
    """Suaviza o rumo do eixo fechado com uma gaussiana que vai de 40 m nas retas a 5 m nas
    curvas fechadas, reintegra o tracado, fecha o laco e o realinha (rotacao e translacao)
    ao eixo medido. Remove o serpentear das retas sem abrir os grampos."""
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    L = seg.sum()
    s = np.r_[0, np.cumsum(seg[:-1])]
    d = np.roll(P, -1, 0) - P
    th = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
    volta = np.round((th[-1] - th[0] + (np.arctan2(*(d[0, ::-1])) - np.arctan2(*(d[-1, ::-1])))) / (2 * np.pi))
    tendencia = 2 * np.pi * volta * s / L
    base = th - tendencia
    sigmas = [2.5, 5, 10, 20]            # estacoes de 2 m: 5, 10, 20, 40 m
    versoes = [gaussian_filter1d(base, sg, mode='wrap') for sg in sigmas]
    kap = np.abs(np.gradient(gaussian_filter1d(base, 10, mode='wrap') + tendencia, s))
    # Peso de cada versao pela curvatura local (raio 100 m -> 5 m; raio > 600 m -> 40 m).
    nivel = np.clip(np.interp(np.log(np.maximum(kap, 1e-5)), np.log([1 / 600, 1 / 300, 1 / 150, 1 / 60]), [3, 2, 1, 0]), 0, 3)
    nivel = gaussian_filter1d(nivel, 10, mode='wrap')
    V = np.array(versoes)
    k0 = np.floor(nivel).astype(int).clip(0, 2)
    f = nivel - k0
    thn = V[k0, np.arange(n)] * (1 - f) + V[k0 + 1, np.arange(n)] * f + tendencia
    Q = np.zeros_like(P)
    Q[0] = P[0]
    for i in range(1, n):
        Q[i] = Q[i - 1] + seg[i - 1] * np.array([math.cos(thn[i - 1]), math.sin(thn[i - 1])])
    fim = Q[-1] + seg[-1] * np.array([math.cos(thn[-1]), math.sin(thn[-1])])
    Q -= np.outer(s / L, fim - P[0]) - 0
    # Realinha ao medido: rotacao e translacao de minimos quadrados.
    cp, cq = P.mean(0), Q.mean(0)
    H = (Q - cq).T @ (P - cp)
    U, _, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    Q = (Q - cq) @ R.T + cp
    # A deriva da integracao e lenta: devolve o residuo de baixa frequencia (100 m).
    for _ in range(3):
        Q = Q + gaussian_filter1d(P - Q, 50, axis=0, mode='wrap')
    # Estacoes igualmente espacadas ao longo do eixo alisado (mesma contagem).
    from scipy.interpolate import CubicSpline
    fechado = np.vstack([Q, Q[:1]])
    sq = np.r_[0, np.cumsum(np.linalg.norm(np.diff(fechado, axis=0), axis=1))]
    cs = CubicSpline(sq, fechado, bc_type='periodic')
    Q = cs(np.linspace(0, sq[-1], n, endpoint=False))
    desvio = cKDTree(P).query(Q)[0]
    print(f'eixo alisado: desvio do medido media {desvio.mean():.2f} m, max {desvio.max():.2f} m')
    return Q


def main():
    nome = sys.argv[1]
    c, x = CIRCUITOS[nome], EXTRA[nome]
    pasta, eixo = carregar(nome)
    epsg = c['epsg']
    anadem = Raster(pasta / 'anadem.tif', epsg)
    # Superficie das vias: o ANADEM suavizado em 2D (~18 m). Trechos vizinhos da volta leem
    # a mesma superficie e ficam coerentes entre si; o terreno longe das vias usa o original.
    from scipy.ndimage import gaussian_filter
    vias_dem = Raster(pasta / 'anadem.tif', epsg)
    vias_dem.a = gaussian_filter(vias_dem.a, .6, mode='nearest')
    cop = Raster(pasta / 'copernicus_dsm.tif', epsg)

    # O eixo medido ondula (nos do OSM, ruido da deteccao): suaviza o rumo, forte nas retas.
    P = alisar_rumo(gaussian_filter1d(np.array(eixo['eixo']), 2, axis=0, mode='wrap'))
    largura = np.clip(np.array(eixo['largura_m']), 9.0, 16.0)
    largura = uniform_filter1d(largura, 15, mode='wrap')
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    s_bruto = np.r_[0, np.cumsum(seg[:-1])]
    L_bruto = float(seg.sum())
    boxes = eixo.get('boxes')
    Pb = np.array(boxes['eixo']) if boxes else None

    # --- Linha de chegada: s = 0 na reta principal (meio do predio dos boxes, ou meio da reta).
    T, E = quadro(P)
    kappa = curvatura(P)
    reta = np.abs(curvatura(P, 30.0)) < 1 / 700
    # Maior trecho reto do circuito: rumo dentro de +-4 graus do rumo medio do trecho.
    Ts = gaussian_filter1d(T, 5, axis=0, mode='wrap')
    rumo = np.unwrap(np.arctan2(Ts[:, 1], Ts[:, 0]))
    rumo2 = np.r_[rumo, rumo + (rumo[-1] - rumo[0] + (rumo[1] - rumo[0]))]
    melhor = (0, 0)
    for a0 in range(n):
        b0 = a0
        while b0 + 1 < a0 + n and np.ptp(rumo2[a0:b0 + 2]) < math.radians(8):
            b0 += 1
        if b0 - a0 > melhor[0]:
            melhor = (b0 - a0, a0)
    reta_ini, reta_n = melhor[1], melhor[0]
    if x['linha_chegada'] == 'meio_boxes' and Pb is not None:
        # Diante do meio do predio das garagens (medido na imagem, refinar_eixo.py).
        sb = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Pb, axis=0), axis=1))]
        meio = int(np.searchsorted(sb, sum(boxes['garagens_s']) / 2))
        i0 = int(cKDTree(P).query(Pb[meio])[1])
    else:
        runs = [(reta_n, (reta_ini + reta_n // 2) % n)]
        comp, meio = max(runs)
        frac = x['linha_chegada'] if isinstance(x['linha_chegada'], float) else .5
        i0 = (meio - comp // 2 + int(frac * comp)) % n
        x['reta_principal'] = (-frac * comp * DS, (1 - frac) * comp * DS)
    # Reta de chegada em s (relativo a linha): o trecho reto que contem a linha.
    cru = np.arctan2(Ts[:, 1], Ts[:, 0])
    desvio = lambda j: abs((cru[j % n] - cru[i0] + np.pi) % (2 * np.pi) - np.pi)
    ida = volta = 0
    while ida < n // 2 and desvio(i0 + ida + 1) < math.radians(5):
        ida += 1
    while volta < n // 2 and desvio(i0 - volta - 1) < math.radians(5):
        volta += 1
    reta_s = (-volta * DS, ida * DS)
    P = np.roll(P, -i0, 0)
    largura = np.roll(largura, -i0)

    # --- Relevo: ANADEM ao longo do eixo, suavizado; Copernicus so para comparar.
    z_anadem = anadem(P[:, 0], P[:, 1])
    z_cop = cop(P[:, 0], P[:, 1])
    z_abs = gaussian_filter1d(vias_dem(P[:, 0], P[:, 1]), 12 / DS, mode='wrap')
    base = math.floor((min(z_abs.min(), np.percentile(anadem.a[anadem.a > -1000], 1)) - 5) / 10) * 10
    origem = np.array([round(float(P[:, 0].mean()) / 10) * 10, round(float(P[:, 1].mean()) / 10) * 10, float(base)])
    xy = P - origem[:2]
    z = z_abs - base

    # --- Escala: so se a diferenca para a extensao oficial for pequena (< 2%).
    delta = np.roll(xy, -1, 0) - xy
    dz = np.roll(z, -1) - z
    comp3d = lambda k: float(np.sqrt(np.sum((delta * k) ** 2, axis=1) + dz ** 2).sum())
    escala = 1.0
    if abs(comp3d(1) / c['extensao_m'] - 1) < .02:
        escala = brentq(lambda k: comp3d(k) - c['extensao_m'], .97, 1.03)
    xy *= escala
    largura *= escala
    ds = np.linalg.norm(np.roll(xy, -1, 0) - xy, axis=1)
    s = np.r_[0, np.cumsum(ds[:-1])]
    L = float(ds.sum())
    T, E = quadro(xy)
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (ds + np.roll(ds, 1))
    kappa = curvatura(xy)

    # --- Trechos da volta que correm lado a lado (a reta do miolo do ECPA desce junto a
    # reta principal): um canteiro de 2 m entre os asfaltos, e sem guard-rail entre eles.
    arv = cKDTree(xy)
    vizinho = np.full(n, np.inf)
    lado_viz = {-1: np.zeros(n, bool), 1: np.zeros(n, bool)}
    for i in range(n):
        for j in arv.query_ball_point(xy[i], 45):
            sep = abs(s[j] - s[i])
            if min(sep, L - sep) < 60:
                continue
            d = xy[j] - xy[i]
            e, ao = d @ E[i], d @ T[i]
            vizinho[i] = min(vizinho[i], np.hypot(e, ao))
            if abs(ao) < 12 and abs(e) < largura[i] / 2 + 5 + 8 + 3:
                lado_viz[1 if e > 0 else -1][i] = True
    largura = np.minimum(largura, np.maximum(8.0, vizinho - 2.0))
    largura = np.minimum(largura, gaussian_filter1d(largura, 3, mode='wrap'))
    # Curvas muito fechadas: a zebra de dentro (1 m alem da borda) fica a pelo menos 3,5 m do
    # centro da curva. A entrada do miolo do ECPA sai do anel externo por um entroncamento:
    # a largura medida ali (16 m) somava o asfalto do anel que segue reto, e o raio de 10 m
    # deixava a borda de dentro a 2 m do centro (a imagem mostra ~12 m de asfalto na perna).
    # O raio e o das tangentes finais, estacao a estacao (o que o carro sente).
    rumo_t = np.arctan2(T[:, 1], T[:, 0])
    giro_t = (np.roll(rumo_t, -1) - rumo_t + np.pi) % (2 * np.pi) - np.pi
    raio_loc = 1 / np.maximum(np.abs(gaussian_filter1d(giro_t / ds, 1, mode='wrap')), 1e-6)
    teto_largura = gaussian_filter1d(minimum_filter1d(2 * (raio_loc - 1.0 - 3.5), 15, mode='wrap'), 3, mode='wrap')
    largura = np.minimum(largura, np.maximum(8.0, teto_largura))
    # O DEM de 30 m nao separa dois asfaltos a poucos metros um do outro: entre trechos lado
    # a lado a diferenca de altura fica limitada a um talude de 25% no canteiro; cada perfil
    # cede metade do excesso, com a correcao espalhada suavemente ao longo da volta.
    for _ in range(4):
        corr = np.zeros(n)
        peso_c = np.zeros(n)
        for i in range(n):
            melhor = None
            for j in arv.query_ball_point(xy[i], 35):
                sep = abs(s[j] - s[i])
                if min(sep, L - sep) < 60:
                    continue
                dd = float(np.hypot(*(xy[j] - xy[i])))
                if melhor is None or dd < melhor[0]:
                    melhor = (dd, j)
            if melhor is None:
                continue
            dd, j = melhor
            vao = max(0.5, dd - largura[i] / 2 - largura[j] / 2)
            excesso = abs(z[i] - z[j]) - max(.4, .25 * vao)
            if excesso > 0:
                corr[i] += -np.sign(z[i] - z[j]) * excesso / 2
                peso_c[i] = 1
        if not peso_c.any():
            break
        z = z + gaussian_filter1d(corr, 6, mode='wrap') * 1.0
    grade = (np.roll(z, -1) - np.roll(z, 1)) / (ds + np.roll(ds, 1))

    # --- Curvas, trechos, caimento e zebras.
    cv = curvas(kappa, s, L)
    def nome_curva(sv, tabela):
        perto = min(tabela, key=lambda q: abs(q - sv)) if tabela else None
        return perto if perto is not None and abs(perto - sv) < 120 else None
    trechos = [[0.0, x['reta']]]
    nomes_cv = []
    for k, cc in enumerate(cv):
        chave = nome_curva(float(s[cc['ini']]), x['trechos'])
        nomes_cv.append(x['trechos'][chave] if chave is not None else 'Curva')
        trechos.append([round(float(s[cc['ini']]), 1), nomes_cv[-1]])
        if chave in x['depois']:
            trechos.append([round(float(s[cc['fim']]) + 15, 1), x['depois'][chave]])
    trechos.sort()
    print(f'{len(cv)} curvas detectadas:')
    for k, cc in enumerate(cv):
        print(f'  s={s[cc["ini"]]:7.1f}  {"esq" if cc["lado"] > 0 else "dir"}  raio min {cc["raio_min"]:6.1f} m  '
              f'giro {cc["giro_graus"]:5.1f} graus  {nomes_cv[k]}')

    # Caimento de projeto: o lado de dentro da curva mais baixo (ate 2,5%), 1% nas retas.
    raio = 1 / np.maximum(np.abs(kappa), 1e-6)
    intens = np.clip((400 - raio) / 300, 0, 1)
    bank = -np.sign(kappa) * (.01 + .015 * intens)
    for k, cc in enumerate(cv):
        extra = x['caimento_extra'].get(nomes_cv[k])
        if extra:
            idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
            bank[idx] = -cc['lado'] * extra
    bank = gaussian_filter1d(bank, 10 / DS, mode='wrap')
    zebra_d, zebra_e = np.zeros(n), np.zeros(n)
    for cc in cv:
        if cc['raio_min'] > 160:
            continue
        idx = np.arange(cc['ini'], cc['fim'] + 1) if cc['fim'] >= cc['ini'] else np.r_[cc['ini']:n, 0:cc['fim'] + 1]
        pico = abs(kappa[cc['apice']])
        dentro = [i for i in idx if abs(kappa[i]) > .7 * pico]
        a = int(np.where(idx == cc['apice'])[0][0])
        saida = list(idx[a:]) + [(idx[-1] + q) % n for q in range(1, 6)]
        (zebra_e if cc['lado'] > 0 else zebra_d)[dentro] = 1
        (zebra_d if cc['lado'] > 0 else zebra_e)[[i for i in saida if abs(kappa[i]) < .8 * pico]] = 1

    validacao = {
        'anadem_menos_copernicus_mediana_m': float(np.median(z_anadem - z_cop)),
        'anadem_menos_copernicus_p95_abs_m': float(np.percentile(np.abs(z_anadem - z_cop), 95)),
        'suavizacao_residuo_rms_m': float(np.sqrt(np.mean((z_anadem - z_abs) ** 2))),
    }

    # --- Pit lane.
    pit = None
    kd = cKDTree(xy)

    def superficie(q):
        k = kd.query(q)[1]
        dd = q - xy[k]
        lat = np.sum(dd * E[k], axis=1)
        along = np.sum(dd * T[k], axis=1)
        return k, (s[k] + along) % L, lat, z[k] + grade[k] * along + bank[k] * lat

    if Pb is not None:
        pxy = (Pb - origem[:2]) * escala
        pw = np.clip(np.array(boxes['largura_m']), 6.0, 9.5) * escala
        pit = montar_pit(pxy, pw, xy, z, E, T, bank, largura, s, L, superficie, vias_dem, origem, base, escala,
                         fonte='Pit lane: OSM (way 628049496) refinado sobre imagem aérea de 2025; garagens sob a cobertura, medidas nos transectos.',
                         garagens_s=boxes['garagens_s'])
    elif x.get('pit_sintetico'):
        pit = pit_sintetico(x['pit_sintetico'], x['reta_principal'], xy, z, E, T, bank, largura, s, L, superficie)

    # --- Terreno: ANADEM na grade de 4 m; perto das vias segue o plano da pista.
    pontos = [xy] + ([np.array(pit['xy'])] if pit else [])
    todos = np.vstack(pontos)
    x0 = math.floor((todos[:, 0].min() - MARGEM) / PASSO) * PASSO
    y0 = math.floor((todos[:, 1].min() - MARGEM) / PASSO) * PASSO
    nx = int((todos[:, 0].max() + MARGEM - x0) / PASSO) + 1
    ny = int((todos[:, 1].max() + MARGEM - y0) / PASSO) + 1
    gx = x0 + np.arange(nx) * PASSO
    gy = y0 + np.arange(ny) * PASSO
    XX, YY = np.meshgrid(gx, gy)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    dem = anadem(q[:, 0] / escala + origem[0], q[:, 1] / escala + origem[1]) - base
    k, _, lat, road = superficie(q)
    fora = np.abs(lat) - largura[k] / 2
    # Entre dois trechos da volta que passam perto (a menos de 26 m das bordas), o chao
    # vai de um plano ao outro em talude continuo, em vez de trocar de colar num degrau.
    dist, viz = kd.query(q, k=48, distance_upper_bound=60)
    outro = np.full(len(q), -1)
    for col in range(1, viz.shape[1]):
        j = viz[:, col]
        ok = (j < len(xy)) & (outro < 0)
        ds = np.abs(s[np.minimum(j, len(xy) - 1)] - s[k])
        ok &= np.minimum(ds, L - ds) > 60
        outro[ok] = j[ok]
    tem2 = outro >= 0
    j2 = np.where(tem2, outro, 0)
    d2 = q - xy[j2]
    lat2 = np.sum(d2 * E[j2], axis=1)
    along2 = np.sum(d2 * T[j2], axis=1)
    fora2 = np.where(tem2, np.abs(lat2) - largura[j2] / 2, np.inf)
    road2 = z[j2] + grade[j2] * along2 + bank[j2] * lat2
    duplo = tem2 & (fora2 < 26) & (fora > 0)
    f1, f2 = np.maximum(fora, 0), np.maximum(fora2, 0)
    w2 = np.where(duplo, f1 / np.maximum(f1 + f2, 1e-6), 0)
    road = road * (1 - w2) + road2 * w2
    fora_min = np.where(duplo, np.minimum(fora, fora2), fora)
    peso = np.clip((26 - fora_min) / 20, 0, 1)
    zt = dem * (1 - peso) + (road - .06) * peso
    if pit:
        pk = cKDTree(np.array(pit['xy']))
        dp, ip = pk.query(q)
        pz = np.array(pit['z_lane'])
        pl = np.array(pit['lx_ly'])
        plat = np.sum((q - np.array(pit['xy'])[ip]) * pl[ip], axis=1)
        pout = np.maximum(np.maximum(pit['lo_arr'][ip] - plat, plat - pit['hi_arr'][ip]), 0)
        # So ao lado da faixa: alem das pontas do pit (entrada, saida) vale o terreno da pista.
        pt_ = np.gradient(np.array(pit['xy']), axis=0)
        pt_ /= np.linalg.norm(pt_, axis=1)[:, None]
        adiante = np.sum((q - np.array(pit['xy'])[ip]) * pt_[ip], axis=1)
        ponta = ((ip == 0) & (adiante < -1)) | ((ip == len(pz) - 1) & (adiante > 1))
        ppeso = np.clip((22 - pout) / 16, 0, 1) * (dp < 60) * ~ponta
        usa = (ppeso > 0) & ((pout < fora) | (ppeso > peso))
        zt = np.where(usa, dem * (1 - ppeso) + (pz[ip] - .06) * ppeso, zt)
    terrain = {'x0': float(x0), 'y0': float(y0), 'step': PASSO, 'nx': nx, 'ny': ny, 'z': np.round(zt, 2).tolist()}

    # --- Cenario: cobertura do solo, edificacoes reais, arquibancadas.
    scenery = cenario(nome, pasta, epsg, origem, escala, gx, gy, xy, largura, pit, s, L, T, E, x)
    solo(nome, pasta, epsg, origem, escala, gx, gy)

    # --- Muros/guard-rails: dos dois lados, menos do lado do pit enquanto ele corre junto
    # e onde outro trecho da volta passa ao lado.
    def trechos_de(mask):
        runs, k = [], 0
        while k < n:
            j = k
            while j < n and mask[j] == mask[k]:
                j += 1
            if mask[k] and (j - k) * DS >= 30:
                runs.append([float(s[k]), float(s[j - 1]) + DS if j < n else L])
            k = j
        return runs
    tem = {lado: gaussian_filter1d((~lado_viz[lado]).astype(float), 4, mode='wrap') > .98 for lado in (-1, 1)}
    if pit:
        a, b = (pit['entry_main_s'] - 25) % L, (pit['exit_main_s'] + 25) % L
        fora_pit = ~((s >= a) | (s <= b)) if a > b else ~((s >= a) & (s <= b))
        tem[1] = tem[1] & fora_pit            # o pit fica a esquerda da pista nos dois circuitos
    rails = {str(lado): [[round(f, 1), round(t, 1)] for f, t in trechos_de(tem[lado])] for lado in (-1, 1)}
    frenagens = []
    for cc in cv:
        if cc['raio_min'] < 160:
            a = s[cc['ini']]
            frenagens.append([round(float((a - 120) % L), 1), round(float((a + 25) % L), 1)])

    colunas = ['s_xy_m', 'x_east_m', 'y_north_m', 'z_local_m', 'width_m', 'crossfall_left', 'grade', 'tx', 'ty',
               'left_x', 'left_y', 'fit_rmse_m', 'ground_points', 'kerb_right', 'kerb_left']
    rmse = np.abs(z_anadem - z_abs)
    samples = np.column_stack([s, xy, z, largura, bank, grade, T, E, rmse, np.zeros(n), zebra_d, zebra_e])
    comp_3d = float(np.sqrt(np.sum((np.roll(xy, -1, 0) - xy) ** 2, axis=1) + (np.roll(z, -1) - z) ** 2).sum())
    fontes = json.loads((pasta / 'proveniencia.json').read_text(encoding='utf-8'))
    meta = {
        'id': nome, 'name': c['nome'], 'nominal_m': c['extensao_m'], 'direction': c['sentido'],
        'reconstructed_xy_m': L, 'reconstructed_3d_m': comp_3d,
        'measured_centreline_m': float(eixo['comprimento_refinado_m']), 'osm_centreline_m': float(eixo['comprimento_osm_m']),
        'horizontal_scale_to_nominal': escala, 'difference_nominal_pct': 100 * (comp_3d / c['extensao_m'] - 1),
        'elevation_min_m': float(z_abs.min()), 'elevation_max_m': float(z_abs.max()),
        'elevation_range_m': float(np.ptp(z_abs)), 'grade_min_pct': float(100 * grade.min()),
        'grade_max_pct': float(100 * grade.max()), 'width_min_m': float(largura.min()),
        'width_max_m': float(largura.max()), 'kerb_m': float((zebra_d.sum() + zebra_e.sum()) * DS),
        'pit_lane_m': float(pit['length_m']) if pit else None, 'samples': n,
        'origin_utm': origem.tolist(), 'epsg': epsg, 'altitude_base_m': base,
        'sections': trechos, 'rails': rails, 'brake_zones': frenagens,
        'kerb_colors': x.get('zebras'),
        # Concreto na reta de chegada; os ultimos 100 m antes da curva ficam de asfalto (frenagem).
        'surface_zones': ([{'from': round(reta_s[0] * escala, 1), 'to': round(reta_s[1] * escala - 100, 1), 'kind': 'concreto'}]
                          if x.get('concreto') else []),
        'city_angle': angulo_cidade(c, origem, epsg),
        'elevation_check': validacao, 'sources': fontes,
        'centreline': 'OSM (highway=raceway) refinado sobre imagem aérea de 2025 (scripts/circuitos/refinar_eixo.py)',
        'caveat': ('Reconstrução para jogo. Eixo e larguras medidos sobre imagem aérea; perfil do ANADEM (30 m) '
                   'suavizado; caimento, zebras e muros são escolhas de modelagem.'),
    }
    if pit:
        pit = {k: v for k, v in pit.items() if k not in ('xy', 'z_lane', 'lx_ly', 'lo_arr', 'hi_arr')}
    saida = {'meta': meta, 'columns': colunas, 'samples': np.round(samples, 5).tolist(), 'pit': pit,
             'terrain': terrain, 'scenery': scenery}
    if pit is None:
        del saida['pit']
    destino = DADOS / f'pista_{nome}.json'
    destino.write_text(json.dumps(saida, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    print(f'{destino.name}: {destino.stat().st_size / 1e6:.2f} MB')
    resumo = {k: meta[k] for k in ('reconstructed_xy_m', 'reconstructed_3d_m', 'horizontal_scale_to_nominal',
                                    'difference_nominal_pct', 'elevation_min_m', 'elevation_max_m', 'elevation_range_m',
                                    'grade_min_pct', 'grade_max_pct', 'width_min_m', 'width_max_m', 'kerb_m',
                                    'pit_lane_m', 'altitude_base_m', 'elevation_check')}
    print(json.dumps(resumo, indent=1, ensure_ascii=False))


def angulo_cidade(c, origem, epsg):
    """Direcao do centro da cidade (radianos, x leste, y norte), para o horizonte urbano."""
    lat, lon = c['centro_cidade']
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
    return round(math.atan2(y - origem[1], x - origem[0]), 4)


def ramp(v, a, b):
    return np.clip((v - a) / (b - a), 0, 1)


def projetar_main_s(pxy, pt, superficie, L):
    """Distancia de volta enquanto o carro esta no pit: projetada onde ele corre junto
    da pista, interpolada onde se afasta (sempre crescente)."""
    k, main_s, lat, _ = superficie(pxy)
    return k, main_s, lat


def completar_pit(pxy, pw_lo, pw_hi, pz, pbank, main_s, gap, garagens, superficie, fonte, entry_open, wall_nose, wall_end, L,
                  muro_trechos):
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    pt, pl = quadro(pxy, fechado=False)
    end = float(ps[-1])
    pgrade = np.gradient(pz, ps)
    lane_lo, lane_hi = pw_lo.copy(), pw_hi.copy()
    g0, g1 = garagens
    zona_g = ramp(ps, g0 - 30, g0 - 10) * (1 - ramp(ps, g1 + 5, g1 + 25))
    fast_hi = lane_hi * (1 - zona_g) + (lane_lo + .52 * (lane_hi - lane_lo)) * zona_g
    bays = max(1, round((g1 - g0) / 13))
    bay = (g1 - g0) / bays
    BOX99 = bays // 2
    s99 = g0 + (BOX99 + .5) * bay
    s_cafe = s99 - bay
    DEPTH = 16.0
    front = float(np.interp(s99, ps, lane_hi))

    def at(sv, d):
        cc = np.array([np.interp(sv, ps, pxy[:, 0]), np.interp(sv, ps, pxy[:, 1])])
        nn = np.array([np.interp(sv, ps, pl[:, 0]), np.interp(sv, ps, pl[:, 1])])
        nn /= np.linalg.norm(nn)
        qq = cc + nn * d
        return [round(float(qq[0]), 3), round(float(qq[1]), 3), round(float(np.interp(sv, ps, pz) + np.interp(sv, ps, pbank) * d), 3)]

    def poly(off, a, b, esp):
        m = (ps >= a) & (ps <= b)
        qq = pxy[m] + pl[m] * off[m][:, None]
        zp = pz[m] + pbank[m] * off[m]
        return np.column_stack([qq, zp, np.broadcast_to(esp, ps.shape)[m]]).round(3).tolist()

    box_walls = [at(s99 + bay / 2, front + .2), at(s99 + bay / 2, front + DEPTH + .3), at(s_cafe - bay / 2, front + DEPTH + .3),
                 at(s_cafe - bay / 2, front + .2), at(s99 - bay / 2, front + .2)]
    rail = [[at(s99 - bay / 2, front + .6), at(s99 - bay / 2, front + 4.3)], [at(s99 - bay / 2, front + 5.7), at(s99 - bay / 2, front + DEPTH)]]
    dentro = np.abs(ps - s99) <= bay / 2 - .45
    paved_hi = lane_hi.copy()
    paved_hi[dentro] = front + DEPTH
    zona_garagem = (ps >= g0 - 12) & (ps <= g1 + 4)
    externo = lane_hi + np.where(zona_garagem, .35, 1.5)
    # Muro dos boxes entre a pista e o pit (regra de Interlagos): onde a folga passa de 6 m
    # ele afina ate 0,6 m, 1,5 m longe da faixa; ate 6 m ocupa a folga como plataforma de
    # concreto (a banca da equipe do Box 99 fica sobre ela), a 0,6 m de cada via.
    folga = np.maximum(gap, 0)
    recuo = .6 + .9 * ramp(folga, 6, 9)
    esp = np.where(folga <= 6, np.maximum(folga - 1.2, .6), np.clip(4.8 - (folga - 6) * 1.4, .6, 4.8))
    muro_off = lane_lo - recuo - esp / 2
    walls = []
    for a, b in muro_trechos:
        walls.append({'name': 'Muro_boxes', 'points': poly(muro_off, a, b, esp), 'height': 1.05, 'fence': 2.6, 'fence_side': -1})
    walls += [{'name': 'Muro_externo_boxes', 'points': poly(externo, 6, s99 - bay / 2, .4), 'height': 1.0, 'fence': 0},
              {'name': 'Muro_externo_boxes', 'points': poly(externo, s99 + bay / 2, end - 20, .4), 'height': 1.0, 'fence': 0},
              {'name': 'Box99_paredes', 'points': [qq + [.3] for qq in box_walls], 'height': 5.2, 'fence': 0},
              *({'name': 'Box99_divisoria', 'points': [qq + [.12] for qq in r], 'height': 1.1, 'fence': 0} for r in rail)]
    amostras = np.column_stack([ps, pxy, pz, pw_lo, paved_hi, pbank, pgrade, pt, pl, main_s, lane_lo, lane_hi, fast_hi, gap])
    return {
        'columns': ['s', 'x', 'y', 'z', 'lo', 'hi', 'bank', 'grade', 'tx', 'ty', 'lx', 'ly', 'main_s', 'lane_lo', 'lane_hi', 'fast_hi', 'gap'],
        'samples': np.round(amostras, 4).tolist(), 'length_m': end, 'entry_open': float(entry_open),
        'wall_nose': float(wall_nose), 'wall_end': float(wall_end),
        'garages': [round(float(g0), 2), round(float(g1), 2)],
        # 60 km/h diante das garagens, so onde a faixa ja corre separada da pista por muro.
        'limit': {'from': float(max(g0 - 40, ps[np.argmax(gap > 1.0)] + 5)),
                  'to': float(min(g1 + 15, ps[len(gap) - 1 - np.argmax(gap[::-1] > 1.0)] - 5)), 'kmh': 60}, 'walls': walls,
        'box99': {'index': BOX99, 's': float(s99), 'bay': float(bay), 'cafe_s': float(s_cafe), 'front': front, 'depth': DEPTH},
        'entry_main_s': float(main_s[0]), 'exit_main_s': float(main_s[-1]), 'source': fonte,
        # So para montar o terreno (removidos antes de gravar).
        'xy': pxy.tolist(), 'z_lane': pz.tolist(), 'lx_ly': pl.tolist(), 'lo_arr': pw_lo, 'hi_arr': paved_hi,
    }


def main_s_monotono(ps, main_s, lat, pt, T, k, L):
    align = pt[:, 0] * T[k, 0] + pt[:, 1] * T[k, 1]
    unwrapped = np.unwrap(main_s, period=L)
    confiavel = (np.abs(lat) < 25) & (align > .97)
    confiavel[[0, -1]] = True
    a_s, a_u = [], []
    for a, u in zip(ps[confiavel], unwrapped[confiavel]):
        if not a_u or u > a_u[-1] + .01:
            a_s.append(a)
            a_u.append(u)
    return np.interp(ps, a_s, a_u) % L


def montar_pit(pxy, pw, xy, z, E, T, bank, largura, s, L, superficie, vias_dem, origem, base, escala, fonte, garagens_s):
    """Pit lane medido (Cascavel): perfil do ANADEM, juntando-se ao plano da pista nas pontas."""
    # Reamostra a cada 2 m.
    ps0 = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    ps = np.arange(0, ps0[-1] + 1e-6, DS)
    pxy = np.column_stack([np.interp(ps, ps0, pxy[:, 0]), np.interp(ps, ps0, pxy[:, 1])])
    pw = np.interp(ps, ps0, pw)
    pt, pl = quadro(pxy, fechado=False)
    k, main_s, lat, z_main = superficie(pxy)
    gap = np.maximum(0, lat - pw / 2 - largura[k] / 2)
    # Perfil: ANADEM suavizado; onde corre a menos de 12 m da pista segue o plano dela.
    zd = vias_dem(pxy[:, 0] / escala + origem[0], pxy[:, 1] / escala + origem[1]) - base
    zd = gaussian_filter1d(zd, 12 / DS, mode='nearest')
    junto = gaussian_filter1d(np.clip((14 - gap) / 8, 0, 1), 5, mode='nearest')
    pz = zd * (1 - junto) + z_main * junto
    kb = k
    pbank = bank[kb] * (pt[:, 0] * T[kb, 0] + pt[:, 1] * T[kb, 1]) * junto
    main_s = main_s_monotono(ps, main_s, lat, pt, T, k, L)
    lo, hi = -pw / 2, pw / 2
    # Garagens: o predio medido na imagem (telhado claro do lado de dentro do pit).
    g0, g1 = (v * escala for v in garagens_s)
    abertura = float(ps[np.argmax(gap > .3)])
    muro = gap > 1.0
    muro_idx = np.flatnonzero(muro & (ps > abertura))
    trechos = np.split(muro_idx, np.flatnonzero(np.diff(muro_idx) > 2) + 1)
    muro_trechos = [(ps[t[0]], ps[t[-1]]) for t in trechos if len(t) and (ps[t[-1]] - ps[t[0]]) > 30 and gap[t].min() < 8]
    wall_nose = muro_trechos[0][0] if muro_trechos else abertura
    wall_end = muro_trechos[-1][1] if muro_trechos else ps[-1] - 40
    print(f'pit lane {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m; '
          f'muro {[(round(a), round(b)) for a, b in muro_trechos]}')
    return completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie, fonte, abertura, wall_nose, wall_end, L,
                         muro_trechos)


def pit_sintetico(cfg, reta, xy, z, E, T, bank, largura, s, L, superficie):
    """Faixa de servico paralela a reta principal (aproximacao declarada)."""
    lado = cfg['lado']
    r0, r1 = reta
    a = r0 + cfg['inicio'] * (r1 - r0)
    b = r1 - 4
    print(f'reta principal: s de {r0:.0f} a {r1:.0f} m; faixa dos boxes de {a:.0f} a {b:.0f}')
    us = np.arange(a, b + 1e-6, DS)
    sm = us % L
    idx = np.clip(np.searchsorted(s, sm) - 1, 0, len(s) - 1)
    # Plataforma de 4,6 m entre a pista e a faixa (muro dos boxes e banca da equipe).
    off_final = largura[idx] / 2 + 4.6 + cfg['largura'] / 2
    t = us - a
    tot = b - a
    fe, fs = cfg['entrada'], cfg['saida']
    assert tot > fe + fs + 60, 'reta curta demais para a faixa dos boxes'
    blend = np.where(t < fe, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / fe, 0, 1)),
                     np.where(t > tot - fs, 0.5 + 0.5 * np.cos(np.pi * np.clip((t - (tot - fs)) / fs, 0, 1)), 1.0))
    # Nas pontas a faixa nasce/morre dentro da pista (encosta a borda).
    borda = largura[idx] / 2 - cfg['largura'] / 2 + .3
    off = lado * (borda + (off_final - borda) * blend)
    pxy = xy[idx] + E[idx] * off[:, None]
    pw = np.full(len(us), cfg['largura'])
    ps = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pxy, axis=0), axis=1))]
    pt, pl = quadro(pxy, fechado=False)
    k, main_s, lat, z_main = superficie(pxy)
    pz = z_main
    pbank = bank[k]
    main_s = sm.copy()
    gap = np.maximum(0, np.abs(lat) - pw / 2 - largura[k] / 2)
    lo, hi = -pw / 2, pw / 2
    par = np.flatnonzero(blend > .999)
    g0, g1 = ps[par[0]] + 12, ps[par[-1]] - 12
    abertura = float(ps[np.argmax(gap > .3)])
    muro_idx = np.flatnonzero(gap > 1.3)
    muro_trechos = [(ps[muro_idx[0]], ps[muro_idx[-1]])] if len(muro_idx) else []
    print(f'pit sintetico {ps[-1]:.0f} m: entra em s={main_s[0]:.0f}, volta em s={main_s[-1]:.0f}; garagens {g0:.0f}-{g1:.0f} m')
    return completar_pit(pxy, lo, hi, pz, pbank, main_s, gap, (g0, g1), superficie,
                         'Faixa de serviço fictícia ao lado da reta principal, diante do paddock: o ECPA não tem pit lane mapeado.',
                         abertura, muro_trechos[0][0] if muro_trechos else abertura, muro_trechos[0][1] if muro_trechos else ps[-1] - 40,
                         L, muro_trechos)


# --- Cenario -------------------------------------------------------------------------
# Classes da cobertura do solo (um caractere por celula da grade):
# '0' campo/grama  '1' mata  '2' arbusto/cerrado  '3' lavoura  '4' construido
# '5' solo exposto  '6' agua  '7' pavimento (vias OSM)
WORLDCOVER = {10: '1', 20: '2', 30: '0', 40: '3', 50: '4', 60: '5', 70: '5', 80: '6', 90: '0', 95: '1', 100: '0'}


def cenario(nome, pasta, epsg, origem, escala, gx, gy, xy, largura, pit, s, L, T, E, x):
    from shapely.geometry import Polygon, LineString, Point
    from shapely import prepared
    para_local = Transformer.from_crs(4326, epsg, always_xy=True)
    loc = lambda lon, lat: ((np.array(para_local.transform(lon, lat)).T - origem[:2]) * escala)

    # Cobertura: WorldCover (10 m, vizinho mais proximo) na grade de 4 m.
    wc = Raster(pasta / 'worldcover.tif', epsg)
    XX, YY = np.meshgrid(gx, gy)
    cls = wc(XX.ravel() / escala + origem[0], YY.ravel() / escala + origem[1], ordem=0).astype(int)
    cover = np.array([WORLDCOVER.get(v, '0') for v in cls]).reshape(XX.shape)

    osm = json.loads((pasta / 'osm.json').read_text(encoding='utf-8'))
    nos = {e['id']: (e['lon'], e['lat']) for e in osm['elements'] if e['type'] == 'node'}
    vias = [e for e in osm['elements'] if e['type'] == 'way']

    def geom(w):
        pts = [nos[n] for n in w['nodes'] if n in nos]
        if len(pts) < 2:
            return None
        arr = np.array(pts)
        return loc(arr[:, 0], arr[:, 1])

    import shapely

    def pinta(poly, ch):
        if not poly.is_valid:
            poly = poly.buffer(0)
        mnx, mny, mxx, mxy = poly.bounds
        i0, i1 = max(0, int((mnx - gx[0]) / PASSO)), min(len(gx) - 1, int((mxx - gx[0]) / PASSO) + 1)
        j0, j1 = max(0, int((mny - gy[0]) / PASSO)), min(len(gy) - 1, int((mxy - gy[0]) / PASSO) + 1)
        if i1 < i0 or j1 < j0:
            return
        sx, sy = np.meshgrid(gx[i0:i1 + 1], gy[j0:j1 + 1])
        dentro = shapely.contains_xy(poly, sx, sy)
        bloco = cover[j0:j1 + 1, i0:i1 + 1]
        bloco[dentro] = ch

    classe_area = {('natural', 'wood'): '1', ('landuse', 'forest'): '1', ('natural', 'scrub'): '2',
                   ('landuse', 'farmland'): '3', ('landuse', 'meadow'): '0', ('landuse', 'grass'): '0',
                   ('natural', 'grassland'): '0', ('natural', 'water'): '6', ('landuse', 'residential'): None,
                   ('landuse', 'industrial'): None}
    for w in vias:
        t = w.get('tags', {})
        for (kk, vv), ch in classe_area.items():
            if ch and t.get(kk) == vv and w['nodes'][0] == w['nodes'][-1]:
                g = geom(w)
                if g is not None and len(g) >= 4:
                    pinta(Polygon(g), ch)
    larg_via = {'motorway': 11, 'trunk': 10, 'primary': 9, 'secondary': 8, 'tertiary': 7, 'motorway_link': 6,
                'primary_link': 6, 'trunk_link': 6, 'secondary_link': 6, 'tertiary_link': 6, 'unclassified': 6,
                'residential': 6, 'service': 4}
    for w in vias:
        t = w.get('tags', {})
        hw = t.get('highway')
        if hw in larg_via and t.get('area') != 'yes':
            g = geom(w)
            if g is not None:
                pinta(LineString(g).buffer(larg_via[hw] / 2), '7')

    # Edificacoes: OSM primeiro; da Microsoft so as que nao caem sobre uma do OSM.
    bandas = [(LineString(np.vstack([xy, xy[:1]])), np.median(largura) / 2 + 16)]
    if pit:
        bandas.append((LineString(np.array(pit['xy'])), 34))
    livre = lambda g: all(g.distance(linha) > folga for linha, folga in bandas)
    edificios, polys_osm = [], []
    for w in vias:
        t = w.get('tags', {})
        if 'building' in t and w['nodes'][0] == w['nodes'][-1]:
            g = geom(w)
            if g is None or len(g) < 4:
                continue
            p = Polygon(g).buffer(0)
            if p.area < 12:
                continue
            polys_osm.append(p)
            alt = None
            try:
                alt = float(str(t.get('height', '')).replace('m', '').strip())
            except ValueError:
                pass
            if alt is None and t.get('building:levels'):
                try:
                    alt = 3.1 * float(t['building:levels']) + .8
                except ValueError:
                    pass
            edificios.append((p, alt, 'osm'))
    ms = pasta / 'edificios_microsoft.geojson'
    if ms.exists():
        idx_osm = [prepared.prep(p) for p in polys_osm]
        for f in json.loads(ms.read_text(encoding='utf-8'))['features']:
            anel = np.array(f['geometry']['coordinates'][0])
            p = Polygon(loc(anel[:, 0], anel[:, 1])).buffer(0)
            if p.area < 12 or any(pp.contains(p.centroid) for pp in idx_osm):
                continue
            h = f['properties'].get('height', -1)
            edificios.append((p, h if h and h > 0 else None, 'microsoft'))
    lista = []
    xmin, xmax, ymin, ymax = gx[0] + 10, gx[-1] - 10, gy[0] + 10, gy[-1] - 10
    for p, alt, fonte in edificios:
        cx, cy = p.centroid.x, p.centroid.y
        if not (xmin < cx < xmax and ymin < cy < ymax) or not livre(p):
            continue
        r = p.minimum_rotated_rectangle
        q = np.array(r.exterior.coords)[:4]
        a, b = q[1] - q[0], q[2] - q[1]
        la, lb = np.linalg.norm(a), np.linalg.norm(b)
        rumo = math.atan2(a[1], a[0])
        area = p.area
        if alt is None:
            alt = 3.4 if area < 90 else 5.8 if area < 250 else 7.5 if area < 1200 else 9.5
        tipo = 'galpao' if area >= 600 else 'casa'
        lista.append([round(cx, 2), round(cy, 2), round(la, 2), round(lb, 2), round(rumo, 4), round(alt, 2), tipo, fonte])
        # Pinta o chao sob a edificacao como construido.
        pinta(p, '4')
    # O asfalto da pista e do pit e desenhado pelo jogo; a cobertura so marca o entorno.
    arq = []
    for cfg in x['arquibancadas']:
        arq.append({'first_s': cfg['antes_da_chegada'], 'blocks': cfg['blocos'], 'side': cfg['lado'], 'gap': cfg['recuo']})
    contagem = {ch: int((cover == ch).sum()) for ch in '01234567'}
    print(f'cenario: {len(lista)} edificacoes ({sum(1 for e in lista if e[7] == "osm")} OSM), cobertura {contagem}')
    return {'cover': {'x0': float(gx[0]), 'y0': float(gy[0]), 'step': PASSO, 'nx': len(gx), 'ny': len(gy),
                      'classes': ''.join(cover.ravel()),
                      'legend': {'0': 'campo', '1': 'mata', '2': 'arbusto', '3': 'lavoura', '4': 'construido',
                                 '5': 'solo exposto', '6': 'agua', '7': 'via pavimentada'}},
            'buildings': {'columns': ['x', 'y', 'w', 'd', 'heading', 'h', 'kind', 'source'], 'items': lista},
            'stands': arq}


def solo(nome, pasta, epsg, origem, escala, gx, gy):
    """Cor do chao: Sentinel-2 (10 m) reprojetado na caixa do terreno, 2 m por pixel."""
    with rasterio.open(pasta / 'sentinel2_rgb.tif') as src:
        rgb = src.read()
        px = 2.0
        w = int((gx[-1] - gx[0]) / px)
        h = int((gy[-1] - gy[0]) / px)
        from rasterio.transform import from_origin
        # Grade local (sem escala) em coordenadas UTM do circuito.
        dst_t = from_origin(origem[0] + gx[0] / escala, origem[1] + gy[-1] / escala, px / escala, px / escala)
        out = np.zeros((3, h, w), np.uint8)
        for b in range(3):
            reproject(rgb[b], out[b], src_transform=src.transform, src_crs=src.crs, dst_transform=dst_t,
                      dst_crs=f'EPSG:{epsg}', resampling=Resampling.cubic)
    img = Image.fromarray(np.moveaxis(out, 0, -1))
    ASSETS.mkdir(parents=True, exist_ok=True)
    lado = 1024
    img = img.resize((lado, int(lado * h / w)) if w >= h else (int(lado * w / h), lado), Image.LANCZOS)
    destino = ASSETS / f'{nome}_solo.jpg'
    img.save(destino, quality=86)
    print(f'{destino.name}: {img.size}')


if __name__ == '__main__':
    main()
