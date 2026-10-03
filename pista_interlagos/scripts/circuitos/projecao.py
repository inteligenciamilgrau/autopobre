"""Transformer do pyproj, ou o mesmo pelo GDAL do rasterio, ou por formulas em numpy.

Nesta maquina o controle de aplicativos do Windows bloqueia a DLL _geod do pyproj; o
rasterio traz o proprio PROJ e faz a mesma conversao (x = leste/longitude, y = norte/latitude,
como always_xy=True). Desde 03/10/2026 o rasterio tambem pode ser bloqueado: entao as conversoes
que os circuitos usam (geograficas WGS 84 / SIRGAS 2000 e UTM SIRGAS 2000 ou WGS 84, zonas sul e
norte) saem das series de Kruger na forma de Karney (2011), com erro abaixo de 1 mm na zona.
So cobre o que os scripts usam: from_crs(...).transform(x, y).
"""
try:
    from pyproj import Transformer
except ImportError:
    import numpy as np

    try:
        from rasterio.crs import CRS
        from rasterio.warp import transform as _transformar
    except ImportError:
        CRS = _transformar = None

    def _epsg(c):
        if isinstance(c, (int, np.integer)):
            return int(c)
        if hasattr(c, 'to_epsg'):
            return int(c.to_epsg())
        return int(str(c).upper().replace('EPSG:', ''))

    # Elipsoides: SIRGAS 2000 usa o GRS 80; WGS 84 difere dele em 0,1 mm no semieixo menor.
    _GRS80, _WGS84 = (6378137.0, 1 / 298.257222101), (6378137.0, 1 / 298.257223563)

    def _sistema(epsg):
        """('geo', elipsoide) ou ('utm', elipsoide, meridiano central, falso norte)."""
        if epsg in (4326, 4674):
            return ('geo', _WGS84 if epsg == 4326 else _GRS80)
        if 31965 <= epsg <= 31976:            # SIRGAS 2000 / UTM 11N a 22N
            return ('utm', _GRS80, -183 + 6 * (epsg - 31954), 0.0)
        if 31977 <= epsg <= 31985:            # SIRGAS 2000 / UTM 17S a 25S
            return ('utm', _GRS80, -183 + 6 * (epsg - 31960), 1e7)
        if 32601 <= epsg <= 32660:
            return ('utm', _WGS84, -183 + 6 * (epsg - 32600), 0.0)
        if 32701 <= epsg <= 32760:
            return ('utm', _WGS84, -183 + 6 * (epsg - 32700), 1e7)
        raise NotImplementedError(f'EPSG:{epsg}')

    def _coef(f):
        n = f / (2 - f)
        A = 1 / (1 + n) * (1 + n ** 2 / 4 + n ** 4 / 64 + n ** 6 / 256)
        alfa = [n / 2 - 2 * n ** 2 / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180 - 127 * n ** 5 / 288 + 7891 * n ** 6 / 37800,
                13 * n ** 2 / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440 + 281 * n ** 5 / 630 - 1983433 * n ** 6 / 1935360,
                61 * n ** 3 / 240 - 103 * n ** 4 / 140 + 15061 * n ** 5 / 26880 + 167603 * n ** 6 / 181440,
                49561 * n ** 4 / 161280 - 179 * n ** 5 / 168 + 6601661 * n ** 6 / 7257600,
                34729 * n ** 5 / 80640 - 3418889 * n ** 6 / 1995840,
                212378941 * n ** 6 / 319334400]
        beta = [n / 2 - 2 * n ** 2 / 3 + 37 * n ** 3 / 96 - n ** 4 / 360 - 81 * n ** 5 / 512 + 96199 * n ** 6 / 604800,
                n ** 2 / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440 + 46 * n ** 5 / 105 - 1118711 * n ** 6 / 3870720,
                17 * n ** 3 / 480 - 37 * n ** 4 / 840 - 209 * n ** 5 / 4480 + 5569 * n ** 6 / 90720,
                4397 * n ** 4 / 161280 - 11 * n ** 5 / 504 - 830251 * n ** 6 / 7257600,
                4583 * n ** 5 / 161280 - 108847 * n ** 6 / 3991680,
                20648693 * n ** 6 / 638668800]
        return n, A, alfa, beta

    _K0, _E0 = 0.9996, 500000.0

    def _para_utm(lon, lat, elip, lon0, n0):
        a, f = elip
        n, A, alfa, _ = _coef(f)
        e = np.sqrt(f * (2 - f))
        phi, dl = np.radians(lat), np.radians(lon - lon0)
        s = np.sin(phi)
        t = np.sinh(np.arctanh(s) - e * np.arctanh(e * s))
        xi_, eta_ = np.arctan2(t, np.cos(dl)), np.arctanh(np.sin(dl) / np.sqrt(1 + t * t))
        xi, eta = xi_.copy(), eta_.copy()
        for j, aj in enumerate(alfa, 1):
            xi += aj * np.sin(2 * j * xi_) * np.cosh(2 * j * eta_)
            eta += aj * np.cos(2 * j * xi_) * np.sinh(2 * j * eta_)
        return _E0 + _K0 * a * A * eta, n0 + _K0 * a * A * xi

    def _de_utm(x, y, elip, lon0, n0):
        a, f = elip
        n, A, _, beta = _coef(f)
        e = np.sqrt(f * (2 - f))
        xi, eta = (y - n0) / (_K0 * a * A), (x - _E0) / (_K0 * a * A)
        xi_, eta_ = xi.copy(), eta.copy()
        for j, bj in enumerate(beta, 1):
            xi_ -= bj * np.sin(2 * j * xi) * np.cosh(2 * j * eta)
            eta_ -= bj * np.cos(2 * j * xi) * np.sinh(2 * j * eta)
        tau_ = np.sin(xi_) / np.sqrt(np.sinh(eta_) ** 2 + np.cos(xi_) ** 2)
        tau = tau_.copy()
        for _ in range(6):                    # Newton (Karney 2011, eq. 19-21)
            sig = np.sinh(e * np.arctanh(e * tau / np.sqrt(1 + tau * tau)))
            ti = tau * np.sqrt(1 + sig * sig) - sig * np.sqrt(1 + tau * tau)
            tau = tau + (tau_ - ti) / np.sqrt(1 + ti * ti) * (1 + (1 - e * e) * tau * tau) / ((1 - e * e) * np.sqrt(1 + tau * tau))
        return lon0 + np.degrees(np.arctan2(np.sinh(eta_), np.cos(xi_))), np.degrees(np.arctan(tau))

    class Transformer:
        def __init__(self, de, para):
            self.de, self.para = de, para

        @classmethod
        def from_crs(cls, de, para, always_xy=True):
            if _transformar is not None:
                crs = lambda c: c if isinstance(c, CRS) else CRS.from_epsg(c) if isinstance(c, int) else CRS.from_user_input(c)
                return cls(crs(de), crs(para))
            return cls(_sistema(_epsg(de)), _sistema(_epsg(para)))

        def transform(self, x, y):
            xa, ya = np.asarray(x, float), np.asarray(y, float)
            if _transformar is not None:
                u, v = _transformar(self.de, self.para, xa.ravel(), ya.ravel())
                u, v = np.reshape(u, xa.shape), np.reshape(v, ya.shape)
            else:
                # Para geograficas e de volta; entre SIRGAS 2000 e WGS 84 a diferenca e de centimetros
                # (as realizacoes coincidem para este uso): so muda o elipsoide.
                lon, lat = (xa, ya) if self.de[0] == 'geo' else _de_utm(xa, ya, *self.de[1:])
                u, v = (lon, lat) if self.para[0] == 'geo' else _para_utm(lon, lat, *self.para[1:])
            if xa.ndim == 0:
                return float(u), float(v)
            return u, v
