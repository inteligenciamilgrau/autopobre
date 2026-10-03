"""GeoTIFF pelo rasterio, ou por tifffile + numpy quando o rasterio nao carrega.

Nesta maquina o controle de aplicativos do Windows passou a bloquear as DLLs do rasterio (e de
parte do scipy e do pyproj) no geo-venv. Os scripts dos circuitos so precisam de poucas operacoes
com GeoTIFF, e elas sao feitas aqui com o rasterio quando ele carrega e, senao, com o tifffile
(Python puro) e numpy:

- ler(caminho) -> Grade: bandas (b, linhas, colunas), transform (Affine), epsg, nodata;
- gravar(caminho, a, transform, epsg, nodata=None);
- recortar(url, caixa_lonlat, preencher=None) -> Grade: a janela de um COG remoto que cobre a caixa
  (lon/lat), lida por requisicoes parciais de HTTP, sem baixar o arquivo inteiro.

Sem o rasterio cobre o que as fontes usam: GeoTIFF em blocos ou em faixas, sem compressao ou
DEFLATE, preditores 1, 2 e 3 (ponto flutuante), CRS por codigo EPSG (geografico ou projetado).
"""
import io
import math
import zlib

import numpy as np
from affine import Affine

try:
    import rasterio
except ImportError:          # DLL bloqueada: tifffile + numpy
    rasterio = None


class Grade:
    def __init__(self, a, transform, epsg, nodata=None):
        self.a = a if a.ndim == 3 else a[None]
        self.transform = transform
        self.epsg = epsg
        self.nodata = nodata

    def banda(self, k=1):
        return self.a[k - 1]


# --- Leitura de TIFF sem o rasterio ---------------------------------------------------

class HttpArquivo(io.RawIOBase):
    """Arquivo remoto so leitura, buscado em blocos de 64 KB por requisicoes Range."""
    BLOCO = 1 << 16

    def __init__(self, url, sessao=None):
        import requests
        self.url, self.pos, self.cache = url, 0, {}
        self.sessao = sessao or requests.Session()
        self.sessao.headers.setdefault('User-Agent', 'autopobre-circuitos/1.0 (jogo Auto-Pobre Racing)')
        r = self.sessao.head(url, timeout=120, allow_redirects=True)
        r.raise_for_status()
        self.tamanho = int(r.headers['Content-Length'])

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.tamanho + off
        return self.pos

    def _faixa(self, a, b):
        for tentativa in range(5):
            try:
                r = self.sessao.get(self.url, headers={'Range': f'bytes={a}-{b}'}, timeout=180)
                r.raise_for_status()
                if len(r.content) == b - a + 1:
                    return r.content
            except Exception:              # noqa: BLE001 - rede instavel, tenta de novo
                if tentativa == 4:
                    raise
            import time
            time.sleep(2 + 3 * tentativa)
        raise IOError(f'{self.url}: faixa {a}-{b} incompleta')

    def ler_faixa(self, off, n):
        """Bytes [off, off+n) numa so requisicao (os blocos de dados de um COG)."""
        return self._faixa(off, off + n - 1) if n > 0 else b''

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.tamanho - self.pos
        n = max(0, min(n, self.tamanho - self.pos))
        out = bytearray()
        while len(out) < n:
            k, o = divmod(self.pos + len(out), self.BLOCO)
            if k not in self.cache:
                a = k * self.BLOCO
                self.cache[k] = self._faixa(a, min(self.tamanho, a + self.BLOCO) - 1)
            out += self.cache[k][o:o + n - len(out)]
        self.pos += n
        return bytes(out)

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def _georreferencia(pagina):
    """Affine (canto do pixel), EPSG e nodata das etiquetas GeoTIFF de uma pagina do tifffile."""
    g = pagina.geotiff_tags or {}
    if 'ModelTransformation' in g:
        m = np.asarray(g['ModelTransformation'], float).reshape(4, 4)
        t = Affine(m[0, 0], m[0, 1], m[0, 3], m[1, 0], m[1, 1], m[1, 3])
    else:
        sx, sy = g['ModelPixelScale'][:2]
        i, j, _, x, y, _ = g['ModelTiepoint'][:6]
        t = Affine(sx, 0, x - i * sx, 0, -sy, y + j * sy)
    if int(g.get('GTRasterTypeGeoKey', 1)) == 2:
        # PixelIsPoint: o ponto de amarracao e o centro do pixel (como o GDAL, meio pixel atras).
        t = t * Affine.translation(-.5, -.5)
    epsg = int(g.get('ProjectedCSTypeGeoKey') or g.get('GeographicTypeGeoKey') or 4326)
    return t, epsg, pagina.nodata


def _decodificar(pagina, dados, largura, altura):
    """Um bloco (ou faixa) comprimido -> array (altura, largura, amostras) no tipo da imagem."""
    comp = int(pagina.compression)
    if comp == 1:
        bruto = dados
    elif comp in (8, 32946):
        bruto = zlib.decompress(dados)
    else:
        raise NotImplementedError(f'compressao TIFF {comp}')
    spp = pagina.samplesperpixel if int(pagina.planarconfig) == 1 else 1
    tipo = np.dtype(pagina.dtype).newbyteorder(pagina.parent.byteorder)
    pred = int(pagina.predictor)
    if pred == 3:
        # Ponto flutuante (TIFF Technote 3): por linha, os bytes de cada valor em planos (o mais
        # significativo primeiro) com diferenca horizontal entre bytes vizinhos.
        nb = tipo.itemsize
        b = np.frombuffer(bruto, np.uint8)[:altura * largura * spp * nb].reshape(altura, largura * spp * nb)
        b = np.cumsum(b.reshape(altura, -1, spp), axis=1, dtype=np.uint8).reshape(altura, -1) if spp > 1 \
            else np.cumsum(b, axis=1, dtype=np.uint8)
        planos = b.reshape(altura, nb, largura * spp)
        valores = np.ascontiguousarray(np.moveaxis(planos, 1, 2)).view(np.dtype(tipo.kind + str(nb)).newbyteorder('>'))
        return valores.reshape(altura, largura, spp).astype(tipo.newbyteorder('='))
    a = np.frombuffer(bruto, tipo)[:altura * largura * spp].reshape(altura, largura, spp)
    if pred == 2:
        a = np.cumsum(a, axis=1, dtype=a.dtype)
    return a.astype(tipo.newbyteorder('='))


def _janela_pagina(arq, pagina, c0, r0, c1, r1, preencher):
    """Pixels [r0:r1, c0:c1] da pagina (fora da imagem: preencher), lendo so os blocos necessarios."""
    import tifffile  # noqa: F401 - a pagina ja vem dele
    h, w = r1 - r0, c1 - c0
    spp = pagina.samplesperpixel
    saida = np.full((h, w, spp), preencher if preencher is not None else 0, np.dtype(pagina.dtype).newbyteorder('='))
    W, H = pagina.imagewidth, pagina.imagelength
    if pagina.is_tiled:
        tw, tl = pagina.tilewidth, pagina.tilelength
    else:
        tw, tl = W, pagina.rowsperstrip
    nx = (W + tw - 1) // tw
    for ty in range(max(0, r0 // tl), min((H + tl - 1) // tl, (r1 - 1) // tl + 1)):
        for tx in range(max(0, c0 // tw), min(nx, (c1 - 1) // tw + 1)):
            k = ty * nx + tx
            n = pagina.databytecounts[k]
            if n == 0:
                continue
            dados = arq.ler_faixa(pagina.dataoffsets[k], n) if isinstance(arq, HttpArquivo) else \
                (arq.seek(pagina.dataoffsets[k]), arq.read(n))[1]
            bloco = _decodificar(pagina, dados, tw, tl if pagina.is_tiled else min(tl, H - ty * tl))
            ya, xa = ty * tl, tx * tw
            sy0, sy1 = max(r0, ya), min(r1, ya + bloco.shape[0], H)
            sx0, sx1 = max(c0, xa), min(c1, xa + tw, W)
            if sy1 > sy0 and sx1 > sx0:
                saida[sy0 - r0:sy1 - r0, sx0 - c0:sx1 - c0] = bloco[sy0 - ya:sy1 - ya, sx0 - xa:sx1 - xa]
    return np.moveaxis(saida, -1, 0)


# --- API ------------------------------------------------------------------------------

def ler(caminho):
    if rasterio is not None:
        with rasterio.open(caminho) as r:
            return Grade(r.read(), r.transform, r.crs.to_epsg(), r.nodata)
    import tifffile
    with open(caminho, 'rb') as f, tifffile.TiffFile(f) as t:
        p = t.pages[0]
        t_, epsg, nodata = _georreferencia(p)
        a = _janela_pagina(f, p, 0, 0, p.imagewidth, p.imagelength, None)
    return Grade(a, t_, epsg, nodata)


def gravar(caminho, a, transform, epsg, nodata=None):
    a = a if a.ndim == 3 else a[None]
    if rasterio is not None:
        perfil = {'driver': 'GTiff', 'width': a.shape[2], 'height': a.shape[1], 'count': a.shape[0], 'dtype': a.dtype.name,
                  'crs': f'EPSG:{epsg}', 'transform': transform, 'compress': 'deflate', 'nodata': nodata}
        with rasterio.open(caminho, 'w', **perfil) as dst:
            dst.write(a)
        return
    import tifffile
    geografico = epsg in (4326, 4674)
    chaves = [1, 1, 0, 3, 1024, 0, 1, 2 if geografico else 1, 1025, 0, 1, 1,
              2048 if geografico else 3072, 0, 1, epsg]
    extras = [(33550, 'd', 3, (transform.a, -transform.e, 0.0)),
              (33922, 'd', 6, (0.0, 0.0, 0.0, transform.c, transform.f, 0.0)),
              (34735, 'H', len(chaves), chaves)]
    if nodata is not None:
        extras.append((42113, 's', 0, str(nodata)))
    dados = np.moveaxis(a, 0, -1) if a.shape[0] > 1 else a[0]
    tifffile.imwrite(caminho, dados, compression='zlib', photometric='rgb' if a.shape[0] == 3 else 'minisblack',
                     planarconfig='contig', extratags=extras)


def recortar(url, caixa_lonlat, preencher=None):
    """Janela de um COG remoto (GeoTIFF em blocos) que cobre a caixa (oeste, sul, leste, norte)."""
    from projecao import Transformer
    if rasterio is not None:
        from rasterio.warp import transform_bounds
        from rasterio.windows import from_bounds
        env = dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_TIMEOUT='120', GDAL_HTTP_MAX_RETRY='4',
                   GDAL_HTTP_RETRY_DELAY='3', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif,.TIF')
        with rasterio.Env(**env), rasterio.open('/vsicurl/' + url) as src:
            b = transform_bounds('EPSG:4326', src.crs, *caixa_lonlat) if src.crs.to_epsg() != 4326 else caixa_lonlat
            win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            extra = {'boundless': True, 'fill_value': preencher} if preencher is not None else {}
            return Grade(src.read(window=win, **extra), src.window_transform(win), src.crs.to_epsg(), src.nodata)
    import tifffile
    arq = HttpArquivo(url)
    with tifffile.TiffFile(arq) as t:
        p = t.pages[0]
        t_, epsg, nodata = _georreferencia(p)
        w, s, e, n = caixa_lonlat
        if epsg != 4326:
            # Caixa da janela no CRS da imagem: as bordas amostradas (como o transform_bounds).
            u = np.linspace(0, 1, 21)
            lon = np.r_[w + (e - w) * u, np.full(21, e), w + (e - w) * u, np.full(21, w)]
            lat = np.r_[np.full(21, s), s + (n - s) * u, np.full(21, n), s + (n - s) * u]
            x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
            w, s, e, n = x.min(), y.min(), x.max(), y.max()
        inv = ~t_
        cs, rs = zip(*(inv * (x, y) for x, y in ((w, n), (e, s))))
        c0, r0 = int(math.floor(min(cs) + 1e-6)), int(math.floor(min(rs) + 1e-6))
        c1, r1 = int(math.floor(max(cs) + .5)), int(math.floor(max(rs) + .5))
        if preencher is None:
            c0, r0 = max(0, c0), max(0, r0)
            c1, r1 = min(p.imagewidth, c1), min(p.imagelength, r1)
        a = _janela_pagina(arq, p, c0, r0, c1, r1, preencher)
    return Grade(a, t_ * Affine.translation(c0, r0), epsg, nodata)
