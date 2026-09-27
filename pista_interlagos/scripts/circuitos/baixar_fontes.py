"""Baixa as fontes abertas de um circuito novo para fontes/<circuito>/.

    python baixar_fontes.py cascavel [--referencia]

- OpenStreetMap (Overpass): tracado (highway=raceway), predios, vias, uso do solo.
- ANADEM v1 (ANA/UFRGS): modelo digital de TERRENO de 30 m, sem o vies da vegetacao.
- Copernicus GLO-30 (ESA): modelo de SUPERFICIE de 30 m, so para comparacao.
- ESA WorldCover 2021 v200: cobertura do solo de 10 m (arvores, campo, construido, agua).
- Sentinel-2 L2A (ESA, via Earth Search/AWS): a cena mais recente sem nuvens, cor real de 10 m.
- Microsoft Global ML Building Footprints (ODbL): pegadas de edificacoes detectadas em
  imagens (versao 2026-02-03), onde o OSM ainda nao mapeou as construcoes.
- --referencia: mosaico de imagem aerea Esri World Imagery, so para conferencia visual
  local (nao entra no jogo nem no pacote publico).

Os rasters sao lidos por janela (COG com requisicoes parciais), sem baixar os
arquivos inteiros. Requer numpy, rasterio, requests, pillow (ver README da pasta).
"""
import json
import math
import sys
import time
from datetime import date, timedelta
from io import BytesIO

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds

from config import CIRCUITOS, pasta_fontes

AGENTE = {'User-Agent': 'autopobre-circuitos/1.0 (jogo Auto-Pobre Racing)'}
OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
GDAL = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='120', GDAL_HTTP_MAX_RETRY='4',
            GDAL_HTTP_RETRY_DELAY='3', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.TIF')


def caixa(c, margem_m=0.0):
    lat, lon = c['centro']
    r = c['raio_m'] + margem_m
    dlat = r / 111320.0
    dlon = r / (111320.0 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat      # oeste, sul, leste, norte


def overpass(c, destino):
    w, s, e, n = caixa(c)
    q = f"""[out:json][timeout:240];
(way({s},{w},{n},{e});relation["type"="multipolygon"]({s},{w},{n},{e}););
(._;>;);out body;"""
    for url in OVERPASS:
        try:
            r = requests.post(url, data={'data': q}, headers=AGENTE, timeout=300)
            if r.ok and r.text.lstrip().startswith('{'):
                dados = r.json()
                destino.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
                print(f'OSM: {len(dados["elements"])} elementos ({url}, base {dados["osm3s"]["timestamp_osm_base"]})')
                return dados['osm3s']['timestamp_osm_base']
            print(f'OSM: {url} respondeu {r.status_code}')
        except requests.RequestException as err:
            print(f'OSM: {url} falhou: {err}')
    raise SystemExit('Nenhum servidor Overpass respondeu.')


def recorte(url, destino, bounds_ll, descricao):
    """Recorta a janela lon/lat de um COG remoto e grava em GeoTIFF local."""
    with rasterio.Env(**GDAL), rasterio.open('/vsicurl/' + url) as src:
        b = transform_bounds('EPSG:4326', src.crs, *bounds_ll) if src.crs.to_epsg() != 4326 else bounds_ll
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        dados = src.read(window=win)
        perfil = src.profile.copy()
        perfil.update(width=dados.shape[2], height=dados.shape[1], transform=src.window_transform(win),
                      compress='deflate', tiled=False, driver='GTiff')
        for k in ('blockxsize', 'blockysize'):
            perfil.pop(k, None)
    with rasterio.open(destino, 'w', **perfil) as dst:
        dst.write(dados)
    print(f'{descricao}: {dados.shape[2]}x{dados.shape[1]} px -> {destino.name}')
    return dados


def sentinel2(c, pasta):
    """Cena Sentinel-2 L2A mais recente com a area do circuito sem nuvem."""
    w, s, e, n = caixa(c)
    fim = date.today()
    busca = {'collections': ['sentinel-2-l2a'], 'bbox': [w, s, e, n],
             'datetime': f'{fim - timedelta(days=400)}T00:00:00Z/{fim}T23:59:59Z',
             'query': {'eo:cloud_cover': {'lt': 20}}, 'limit': 40,
             'sortby': [{'field': 'properties.datetime', 'direction': 'desc'}]}
    r = requests.post('https://earth-search.aws.element84.com/v1/search', json=busca, headers=AGENTE, timeout=120)
    r.raise_for_status()
    cenas = r.json()['features']
    print(f'Sentinel-2: {len(cenas)} cenas candidatas')
    for cena in cenas:
        scl_url = cena['assets']['scl']['href']
        try:
            with rasterio.Env(**GDAL), rasterio.open('/vsicurl/' + scl_url) as src:
                b = transform_bounds('EPSG:4326', src.crs, w, s, e, n)
                win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
                scl = src.read(1, window=win, boundless=True, fill_value=0)
        except Exception as err:          # noqa: BLE001 - cena indisponivel, tenta a proxima
            print(f'  {cena["id"]}: SCL indisponivel ({err})')
            continue
        validos = scl > 0
        nuvem = np.isin(scl, [3, 8, 9, 10])   # sombra, nuvem media/alta, cirrus
        if validos.mean() < .99:
            print(f'  {cena["id"]}: fora da faixa imageada')
            continue
        frac = nuvem[validos].mean()
        print(f'  {cena["id"]}: nuvem na area {frac:.1%}')
        if frac > .002:
            continue
        rgb = recorte(cena['assets']['visual']['href'], pasta / 'sentinel2_rgb.tif', (w, s, e, n), 'Sentinel-2 cor real')
        info = {'id': cena['id'], 'datetime': cena['properties']['datetime'],
                'cloud_cover_tile': cena['properties'].get('eo:cloud_cover'), 'nuvem_area': float(frac)}
        (pasta / 'sentinel2.json').write_text(json.dumps(info, indent=1), encoding='utf-8')
        return info
    raise SystemExit('Nenhuma cena Sentinel-2 limpa encontrada.')


def quadkey(lat, lon, z=9):
    x = int((lon + 180) / 360 * 2 ** z)
    sn = math.sin(math.radians(lat))
    y = int((.5 - math.log((1 + sn) / (1 - sn)) / (4 * math.pi)) * 2 ** z)
    return ''.join(str(((x >> (i - 1)) & 1) + 2 * ((y >> (i - 1)) & 1)) for i in range(z, 0, -1))


def edificios_microsoft(c, pasta):
    """Pegadas de edificacoes da Microsoft no recorte do circuito (GeoJSON)."""
    import csv
    import gzip
    q = quadkey(*c['centro'])
    indice = requests.get('https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv',
                          headers=AGENTE, timeout=180).text.splitlines()
    urls = [r['Url'] for r in csv.DictReader(indice) if r['Location'] == 'Brazil' and r['QuadKey'] == q]
    w, s, e, n = caixa(c)
    feicoes = []
    for url in urls:
        bruto = requests.get(url, headers=AGENTE, timeout=600).content
        for linha in gzip.decompress(bruto).decode('utf-8').splitlines():
            f = json.loads(linha)
            anel = f['geometry']['coordinates'][0]
            lon = sum(p[0] for p in anel) / len(anel)
            lat = sum(p[1] for p in anel) / len(anel)
            if w <= lon <= e and s <= lat <= n:
                feicoes.append(f)
    destino = pasta / 'edificios_microsoft.geojson'
    destino.write_text(json.dumps({'type': 'FeatureCollection', 'features': feicoes}), encoding='utf-8')
    print(f'Microsoft Building Footprints: {len(feicoes)} edificacoes (quadkey {q})')
    return {'quadkey': q, 'urls': urls, 'edificacoes': len(feicoes)}


def esri_referencia(c, pasta, z=18):
    """Mosaico aereo so para conferencia visual local (nao publicado)."""
    w, s, e, n = caixa(c, -c['raio_m'] * .45)
    def tile(lon, lat):
        k = 2 ** z
        x = (lon + 180) / 360 * k
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k
        return x, y
    x0, y0 = tile(w, n)
    x1, y1 = tile(e, s)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    img = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    sess = requests.Session()
    sess.headers.update(AGENTE)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            url = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{ty}/{tx}'
            for tentativa in range(4):
                try:
                    r = sess.get(url, timeout=60)
                    r.raise_for_status()
                    img.paste(Image.open(BytesIO(r.content)).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
                    break
                except requests.RequestException:
                    time.sleep(2 + tentativa * 3)
    img.save(pasta / 'referencia_esri.jpg', quality=90)
    meta = {'z': z, 'tx0': tx0, 'ty0': ty0, 'tx1': tx1, 'ty1': ty1,
            'aviso': 'Esri World Imagery: conferencia visual local; nao distribuir.'}
    (pasta / 'referencia_esri.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')
    print(f'Referencia Esri z{z}: {img.size[0]}x{img.size[1]} px')


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in CIRCUITOS:
        raise SystemExit(f'uso: baixar_fontes.py {{{"|".join(CIRCUITOS)}}} [--referencia] [--so-referencia]')
    nome = sys.argv[1]
    c = CIRCUITOS[nome]
    pasta = pasta_fontes(nome)
    if '--edificios' in sys.argv:
        edificios_microsoft(c, pasta)
        return
    if '--so-referencia' not in sys.argv:
        proveniencia = {'circuito': nome, 'baixado_em': date.today().isoformat(), 'caixa_lonlat': caixa(c)}
        proveniencia['osm_base'] = overpass(c, pasta / 'osm.json')
        grande = caixa(c, 400)
        recorte(f'https://metadados.snirh.gov.br/files/anadem_v1_tiles/anadem_v1_{c["anadem"]}.tif',
                pasta / 'anadem.tif', grande, 'ANADEM v1 (terreno)')
        recorte(f'https://copernicus-dem-30m.s3.amazonaws.com/{c["copernicus"]}/{c["copernicus"]}.tif',
                pasta / 'copernicus_dsm.tif', grande, 'Copernicus GLO-30 (superficie)')
        recorte(f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{c["worldcover"]}_Map.tif',
                pasta / 'worldcover.tif', caixa(c), 'ESA WorldCover 2021')
        proveniencia['sentinel2'] = sentinel2(c, pasta)
        proveniencia['edificios_microsoft'] = edificios_microsoft(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(proveniencia, indent=1, ensure_ascii=False), encoding='utf-8')
    if '--referencia' in sys.argv or '--so-referencia' in sys.argv:
        esri_referencia(c, pasta)


if __name__ == '__main__':
    main()
