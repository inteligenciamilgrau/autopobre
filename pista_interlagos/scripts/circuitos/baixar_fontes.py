"""Baixa as fontes abertas de um circuito novo para fontes/<circuito>/.

    python baixar_fontes.py cascavel [--referencia]

- OpenStreetMap (Overpass): tracado (highway=raceway), predios, vias, uso do solo.
- ANADEM v1 (ANA/UFRGS): modelo digital de TERRENO de 30 m, sem o vies da vegetacao.
- Copernicus GLO-30 (ESA): modelo de SUPERFICIE de 30 m, so para comparacao.
- ESA WorldCover 2021 v200: cobertura do solo de 10 m (arvores, campo, construido, agua).
- Sentinel-2 L2A (ESA, via Earth Search/AWS): a cena mais recente sem nuvens, cor real de 10 m.
- Microsoft Global ML Building Footprints (ODbL): pegadas de edificacoes detectadas em
  imagens (versao 2026-02-03), onde o OSM ainda nao mapeou as construcoes.
- Geoportal do DF (IDE/DF, SEDUH), onde o circuito pede (Brasilia): o MDT de 1 m pelo servico de
  perfis, edificacoes do cadastro territorial com altura, arvores isoladas e massas arboreas;
  `--idedf` baixa so essa parte.
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
    # Sem Overpass: a API do OSM entrega a mesma caixa (nos, vias que tocam nela e os nos
    # delas, relacoes) no mesmo formato JSON; aceita caixas de ate 0,25 grau quadrado.
    r = requests.get('https://api.openstreetmap.org/api/0.6/map.json', params={'bbox': f'{w},{s},{e},{n}'},
                     headers=AGENTE, timeout=300)
    if r.ok:
        dados = r.json()
        destino.write_text(json.dumps(dados, ensure_ascii=False), encoding='utf-8')
        base = max(el.get('timestamp', '') for el in dados['elements'])
        print(f'OSM: {len(dados["elements"])} elementos (API 0.6, edicao mais recente {base})')
        return base
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


IDEDF = 'https://www.geoservicos.ide.df.gov.br/arcgis/rest/services'


def idedf_camada(camada, caixa_utm, destino, descricao, campos='*', onde='1=1'):
    """Feicoes de uma camada do Geoportal do DF (ArcGIS REST da IDE/DF) dentro de uma caixa em
    SIRGAS 2000 / UTM 23S, em GeoJSON nas mesmas coordenadas, paginando de 1000 em 1000."""
    feicoes, inicio = [], 0
    while True:
        params = {'geometry': ','.join(f'{v:.1f}' for v in caixa_utm), 'geometryType': 'esriGeometryEnvelope',
                  'inSR': 31983, 'outSR': 31983, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': campos, 'where': onde,
                  'returnGeometry': 'true', 'resultOffset': inicio, 'resultRecordCount': 1000, 'f': 'geojson'}
        for tentativa in range(4):
            try:
                r = requests.get(f'{IDEDF}/{camada}/query', params=params, headers=AGENTE, timeout=300)
                r.raise_for_status()
                lote = r.json()
                break
            except (requests.RequestException, ValueError):
                if tentativa == 3:
                    raise
                time.sleep(3 + 4 * tentativa)
        feicoes += lote.get('features', [])
        if not lote.get('exceededTransferLimit') and len(lote.get('features', [])) < 1000:
            break
        inicio += len(lote['features'])
    destino.write_text(json.dumps({'type': 'FeatureCollection', 'crs': 'EPSG:31983', 'features': feicoes},
                                  ensure_ascii=False), encoding='utf-8')
    print(f'IDE/DF {descricao}: {len(feicoes)} feicoes -> {destino.name}')
    return len(feicoes)


def mdt_perfis(centro_utm, meia, destino, passo=2.0, lote=24):
    """MDT de 1 m do DF amostrado numa grade de `passo` metros: o geoprocessamento Profile1m da
    IDE/DF devolve as cotas ao longo de linhas; cada linha da grade e um perfil leste-oeste. As
    curvas de nivel de 1 m (2016) vem inteiras do servidor (linhas de quilometros) e nao cabem
    numa consulta."""
    from rasterio.transform import from_origin
    url = f'{IDEDF}/Geoprocessing/Profile1m/GPServer/Profile/execute'
    cx, cy = centro_utm
    x0, x1 = cx - meia, cx + meia
    ys = np.arange(cy + meia, cy - meia - 1e-6, -passo)          # de norte para sul (linhas do raster)
    nx = int(round((x1 - x0) / passo)) + 1
    z = np.full((len(ys), nx), np.nan, np.float32)
    campos = [{'name': 'OID', 'type': 'esriFieldTypeOID'}, {'name': 'pid', 'type': 'esriFieldTypeInteger'}]
    for k0 in range(0, len(ys), lote):
        feicoes = [{'geometry': {'paths': [[[x0, float(y)], [x1, float(y)]]], 'spatialReference': {'wkid': 31983}},
                    'attributes': {'OID': k + 1, 'pid': k}} for k, y in enumerate(ys[k0:k0 + lote], k0)]
        dados = {'InputLineFeatures': json.dumps({'geometryType': 'esriGeometryPolyline', 'spatialReference': {'wkid': 31983},
                                                  'fields': campos, 'features': feicoes}),
                 'ProfileIDField': 'pid', 'DEMResolution': '1m', 'MaximumSampleDistance': passo,
                 'MaximumSampleDistanceUnits': 'Meters', 'returnZ': 'true', 'returnM': 'true', 'f': 'json'}
        for tentativa in range(5):
            try:
                r = requests.post(url, data=dados, headers=AGENTE, timeout=300)
                r.raise_for_status()
                saida = r.json()['results'][0]['value']['features']
                break
            except (requests.RequestException, ValueError, KeyError, IndexError):
                if tentativa == 4:
                    raise
                time.sleep(4 + 6 * tentativa)
        for f in saida:
            k = f['attributes']['pid']
            pts = np.array([q for caminho in f['geometry']['paths'] for q in caminho])
            col = np.clip(np.round((pts[:, 0] - x0) / passo).astype(int), 0, nx - 1)
            z[k, col] = pts[:, 2]
        if k0 // lote % 10 == 0:
            print(f'  perfis {min(k0 + lote, len(ys))}/{len(ys)}')
    vazio = np.isnan(z)
    if vazio.any():
        from rasterio.fill import fillnodata
        z = fillnodata(np.where(vazio, 0, z).astype(np.float32), mask=(~vazio).astype('uint8'), max_search_distance=20)
    perfil = {'driver': 'GTiff', 'width': nx, 'height': len(ys), 'count': 1, 'dtype': 'float32', 'crs': 'EPSG:31983',
              'transform': from_origin(x0 - passo / 2, ys[0] + passo / 2, passo, passo), 'compress': 'deflate'}
    with rasterio.open(destino, 'w', **perfil) as dst:
        dst.write(z.astype(np.float32), 1)
    print(f'MDT 1 m do DF (Profile1m) em grade de {passo:.0f} m: {nx}x{len(ys)}, {vazio.mean():.2%} preenchido, '
          f'cotas {np.nanmin(z):.1f} a {np.nanmax(z):.1f} m -> {destino.name}')
    return {'servico': url, 'passo_m': passo, 'celulas': [nx, len(ys)], 'preenchido': float(vazio.mean()),
            'cota_min': float(np.nanmin(z)), 'cota_max': float(np.nanmax(z))}


def fontes_idedf(c, pasta):
    """Dados locais do Geoportal do DF (SEDUH, IDE/DF): o MDT de 1 m (pelo servico de perfis),
    edificacoes do cadastro territorial com altura aproximada, coberturas, arvores isoladas e
    massas arboreas da cartografia de 2016."""
    from projecao import Transformer
    T = Transformer.from_crs(4326, 31983, always_xy=True)
    w, s, e, n = caixa(c)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    perto = (float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))
    info = {'servico': IDEDF, 'baixado_em': date.today().isoformat()}
    # A grade do terreno do jogo vai ~460 m alem da caixa da pista: 1.100 m em volta do centro cobrem.
    info['mdt'] = mdt_perfis(T.transform(c['centro'][1], c['centro'][0]), c.get('mdt_meia_m', 1100), pasta / 'mdt_idedf.tif')
    info['edificacoes'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/5', perto, pasta / 'idedf_edificacoes.geojson',
                                       'edificacoes (cadastro territorial)', 'ed_nome,ed_num_pav,ed_alt_aprox,ed_situacao,ed_area')
    info['coberturas'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/2', perto, pasta / 'idedf_coberturas.geojson',
                                      'coberturas', 'cb_area')
    info['arvores_isoladas'] = idedf_camada('Publico/IDEDF/MapServer/236', perto, pasta / 'idedf_arvores.geojson',
                                            'arvores isoladas (2016)', 'id')
    info['massa_arborea'] = idedf_camada('Publico/IDEDF/MapServer/237', perto, pasta / 'idedf_massa_arborea.geojson',
                                         'massas arboreas (2016)', 'id')
    # O horizonte da cidade: os predios altos ou grandes do cadastro ate 3,5 km do autodromo (superquadras,
    # Setor Noroeste, Eixo Monumental), no lugar dos telhados genericos do horizonte do jogo.
    w, s, e, n = caixa(c, 2000)
    xs, ys = T.transform(np.array([w, e, w, e]), np.array([s, s, n, n]))
    longe = (float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))
    info['skyline'] = idedf_camada('Publico/CADASTRO_TERRITORIAL/MapServer/5', longe, pasta / 'idedf_skyline.geojson',
                                   'edificacoes do horizonte (>= 9 m ou >= 1.500 m2, 3,5 km)', 'ed_nome,ed_num_pav,ed_alt_aprox,ed_area',
                                   'ed_alt_aprox >= 9 OR ed_area >= 1500')
    (pasta / 'idedf.json').write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding='utf-8')
    return info


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
    if '--idedf' in sys.argv:
        fontes_idedf(c, pasta)
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
        if c.get('relevo_local') == 'idedf_mdt_1m' or c.get('edificios_locais') == 'idedf':
            proveniencia['idedf'] = fontes_idedf(c, pasta)
        (pasta / 'proveniencia.json').write_text(json.dumps(proveniencia, indent=1, ensure_ascii=False), encoding='utf-8')
    if '--referencia' in sys.argv or '--so-referencia' in sys.argv:
        esri_referencia(c, pasta)


if __name__ == '__main__':
    main()
