"""Transformer do pyproj, ou o mesmo pelo GDAL do rasterio quando o pyproj nao carrega.

Nesta maquina o controle de aplicativos do Windows bloqueia a DLL _geod do pyproj; o
rasterio traz o proprio PROJ e faz a mesma conversao (x = leste/longitude, y = norte/latitude,
como always_xy=True). So cobre o que os scripts usam: from_crs(...).transform(x, y).
"""
try:
    from pyproj import Transformer
except ImportError:
    import numpy as np
    from rasterio.crs import CRS
    from rasterio.warp import transform as _transformar

    class Transformer:
        def __init__(self, de, para):
            self.de, self.para = de, para

        @classmethod
        def from_crs(cls, de, para, always_xy=True):
            crs = lambda c: c if isinstance(c, CRS) else CRS.from_epsg(c) if isinstance(c, int) else CRS.from_user_input(c)
            return cls(crs(de), crs(para))

        def transform(self, x, y):
            xa, ya = np.asarray(x, float), np.asarray(y, float)
            u, v = _transformar(self.de, self.para, xa.ravel(), ya.ravel())
            if xa.ndim == 0:
                return float(u[0]), float(v[0])
            return np.reshape(u, xa.shape), np.reshape(v, ya.shape)
