"""As partes do scipy que os scripts usam, com substitutos em numpy quando o scipy nao carrega.

Nesta maquina o controle de aplicativos do Windows bloqueia algumas DLLs do scipy
(_sparsetools, _uarray: scipy.spatial, interpolate, signal e optimize); scipy.ndimage carrega.
Os substitutos cobrem so o que os scripts chamam, com a mesma assinatura e o mesmo resultado
(a menos do arredondamento):

- CubicSpline(x, y, bc_type='periodic'|'natural'), chamada cs(xq) e cs(xq, 1);
- cKDTree(dados).query(q, k=1, distance_upper_bound=inf) e .query_ball_point(p, r);
- brentq(f, a, b);
- savgol_filter(x, janela, ordem, axis=0, mode='interp');
- do scipy.ndimage (bloqueado desde 03/10/2026, pela DLL do scipy.linalg que ele importa):
  gaussian_filter1d, gaussian_filter, uniform_filter1d, minimum_filter1d, maximum_filter1d
  (modos 'reflect', 'nearest', 'wrap', 'mirror', 'constant') e map_coordinates de ordem 0, 1 e 3
  (a de ordem 3 com o pre-filtro de B-spline espelhado nas bordas).
"""
import numpy as np

try:
    from scipy.interpolate import CubicSpline
except ImportError:
    class CubicSpline:
        """Spline cubica de segunda derivada continua (fronteira periodica ou natural)."""

        def __init__(self, x, y, bc_type='not-a-knot'):
            x = np.asarray(x, float)
            y = np.asarray(y, float)
            if bc_type not in ('periodic', 'natural'):
                raise NotImplementedError(bc_type)
            self.x, self.y, self.periodico = x, y, bc_type == 'periodic'
            h = np.diff(x)
            dy = np.diff(y, axis=0) / h.reshape((-1,) + (1,) * (y.ndim - 1))
            n = len(x)
            if self.periodico:
                # Incognitas M0..M(n-2); M(n-1) = M0 (y[0] == y[-1]).
                m = n - 1
                A = np.zeros((m, m))
                rhs = np.zeros((m,) + y.shape[1:])
                for i in range(m):
                    hp, hi = h[i - 1], h[i]            # h[-1] e o ultimo intervalo
                    A[i, (i - 1) % m] += hp
                    A[i, i] += 2 * (hp + hi)
                    A[i, (i + 1) % m] += hi
                    rhs[i] = 6 * (dy[i] - dy[i - 1])
                M = np.linalg.solve(A, rhs)
                M = np.concatenate([M, M[:1]])
            else:
                A = np.zeros((n, n))
                rhs = np.zeros((n,) + y.shape[1:])
                A[0, 0] = A[-1, -1] = 1.0
                for i in range(1, n - 1):
                    A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
                    rhs[i] = 6 * (dy[i] - dy[i - 1])
                M = np.linalg.solve(A, rhs)
            self.M, self.h, self.dy = M, h, dy

        def __call__(self, xq, nu=0):
            xq = np.asarray(xq, float)
            escalar = xq.ndim == 0
            xq = np.atleast_1d(xq)
            x = self.x
            if self.periodico:
                xq = x[0] + np.mod(xq - x[0], x[-1] - x[0])
            i = np.clip(np.searchsorted(x, xq, side='right') - 1, 0, len(x) - 2)
            forma = (-1,) + (1,) * (self.y.ndim - 1)
            t = (xq - x[i]).reshape(forma)
            h = self.h[i].reshape(forma)
            M0, M1 = self.M[i], self.M[i + 1]
            b = self.dy[i] - h * (2 * M0 + M1) / 6
            if nu == 0:
                r = self.y[i] + b * t + M0 / 2 * t ** 2 + (M1 - M0) / (6 * h) * t ** 3
            elif nu == 1:
                r = b + M0 * t + (M1 - M0) / (2 * h) * t ** 2
            elif nu == 2:
                r = M0 + (M1 - M0) / h * t
            else:
                raise NotImplementedError(nu)
            return r[0] if escalar else r

try:
    from scipy.spatial import cKDTree
except ImportError:
    class cKDTree:
        """Vizinhos mais proximos por forca bruta em blocos (os circuitos tem poucos milhares de pontos)."""

        def __init__(self, dados):
            self.data = np.asarray(dados, float)
            self.n = len(self.data)
            self._p2 = np.sum(self.data ** 2, axis=1)

        def _d2(self, q):
            d2 = np.sum(q ** 2, axis=1)[:, None] + self._p2[None, :] - 2 * q @ self.data.T
            return np.maximum(d2, 0)

        def query(self, x, k=1, distance_upper_bound=np.inf):
            q = np.asarray(x, float)
            unico = q.ndim == 1
            q = np.atleast_2d(q)
            kk = min(k, self.n)
            dist = np.full((len(q), k), np.inf)
            idx = np.full((len(q), k), self.n, dtype=np.intp)
            bloco = max(1, 4_000_000 // max(self.n, 1))
            for a in range(0, len(q), bloco):
                d2 = self._d2(q[a:a + bloco])
                if kk == 1:
                    j = np.argmin(d2, axis=1)[:, None]
                else:
                    j = np.argpartition(d2, kk - 1, axis=1)[:, :kk]
                    ordem = np.argsort(np.take_along_axis(d2, j, 1), axis=1)
                    j = np.take_along_axis(j, ordem, 1)
                dd = np.sqrt(np.take_along_axis(d2, j, 1))
                fora = dd > distance_upper_bound
                dist[a:a + bloco, :kk] = np.where(fora, np.inf, dd)
                idx[a:a + bloco, :kk] = np.where(fora, self.n, j)
            if k == 1:
                dist, idx = dist[:, 0], idx[:, 0]
            if unico:
                return (float(dist[0]), int(idx[0])) if k == 1 else (dist[0], idx[0])
            return dist, idx

        def query_ball_point(self, x, r):
            q = np.asarray(x, float)
            if q.ndim == 1:
                return list(np.flatnonzero(np.sum((self.data - q) ** 2, axis=1) <= r * r))
            return [self.query_ball_point(p, r) for p in q]

try:
    from scipy.optimize import brentq
except ImportError:
    def brentq(f, a, b, xtol=2e-12, maxiter=200):
        """Raiz de f em [a, b] por bissecao (f(a) e f(b) com sinais opostos)."""
        fa, fb = f(a), f(b)
        if fa * fb > 0:
            raise ValueError('f(a) e f(b) precisam ter sinais opostos')
        for _ in range(maxiter):
            m = (a + b) / 2
            fm = f(m)
            if fm == 0 or (b - a) / 2 < xtol:
                return m
            if fa * fm < 0:
                b, fb = m, fm
            else:
                a, fa = m, fm
        return (a + b) / 2

try:
    from scipy.signal import savgol_filter
except ImportError:
    def savgol_filter(x, window_length, polyorder, axis=0, mode='interp'):
        """Savitzky-Golay; nas pontas (mode='interp') ajusta um polinomio a janela da ponta."""
        if mode != 'interp':
            raise NotImplementedError(mode)
        x = np.moveaxis(np.asarray(x, float), axis, 0)
        n, w, meio = len(x), window_length, window_length // 2
        t = np.arange(-meio, meio + 1)
        V = np.vander(t, polyorder + 1, increasing=True)
        coef = np.linalg.pinv(V)[0]                     # valor do polinomio no centro
        y = np.empty_like(x)
        for i in range(meio, n - meio):
            y[i] = np.tensordot(coef, x[i - meio:i + meio + 1], axes=(0, 0))
        tt = np.arange(w)
        Vp = np.vander(tt, polyorder + 1, increasing=True)
        P = np.linalg.pinv(Vp)
        for pedaco, alvo in ((x[:w], slice(0, meio)), (x[n - w:], slice(n - meio, n))):
            c = np.tensordot(P, pedaco, axes=(1, 0))
            ajuste = np.tensordot(Vp, c, axes=(1, 0))
            y[alvo] = ajuste[:meio] if alvo.start == 0 else ajuste[w - meio:]
        return np.moveaxis(y, 0, axis)

try:
    from scipy.ndimage import (gaussian_filter, gaussian_filter1d, map_coordinates, maximum_filter1d,
                               minimum_filter1d, uniform_filter1d)
except ImportError:
    _MODOS = {'reflect': 'symmetric', 'nearest': 'edge', 'wrap': 'wrap', 'mirror': 'reflect', 'constant': 'constant'}

    def _janela(x, antes, depois, axis, mode, cval=0.0):
        x = np.moveaxis(np.asarray(x, float), axis, -1)
        larg = [(0, 0)] * (x.ndim - 1) + [(antes, depois)]
        extra = {'constant_values': cval} if mode == 'constant' else {}
        return np.pad(x, larg, mode=_MODOS[mode], **extra)

    def gaussian_filter1d(input, sigma, axis=-1, order=0, output=None, mode='reflect', cval=0.0, truncate=4.0, radius=None):
        if order != 0:
            raise NotImplementedError(order)
        r = int(truncate * float(sigma) + .5) if radius is None else int(radius)
        k = np.exp(-.5 * (np.arange(-r, r + 1) / float(sigma)) ** 2)
        k /= k.sum()
        p = _janela(input, r, r, axis, mode, cval)
        n = p.shape[-1] - 2 * r
        y = np.zeros(p.shape[:-1] + (n,))
        for j, w in enumerate(k):
            y += w * p[..., j:j + n]
        return np.moveaxis(y, -1, axis)

    def gaussian_filter(input, sigma, mode='reflect', cval=0.0, truncate=4.0):
        y = np.asarray(input, float)
        sig = np.broadcast_to(sigma, (y.ndim,))
        for ax in range(y.ndim):
            if sig[ax] > 0:
                y = gaussian_filter1d(y, sig[ax], axis=ax, mode=mode, cval=cval, truncate=truncate)
        return y

    def _deslizante(input, size, axis, mode, cval):
        # A janela de tamanho par fica um a mais para tras, como no scipy (origin 0).
        p = _janela(input, size // 2, (size - 1) // 2, axis, mode, cval)
        return np.lib.stride_tricks.sliding_window_view(p, size, axis=-1)

    def uniform_filter1d(input, size, axis=-1, output=None, mode='reflect', cval=0.0, origin=0):
        p = _janela(input, size // 2, (size - 1) // 2, axis, mode, cval)
        c = np.concatenate([np.zeros(p.shape[:-1] + (1,)), np.cumsum(p, axis=-1)], axis=-1)
        n = p.shape[-1] - size + 1
        return np.moveaxis((c[..., size:size + n] - c[..., :n]) / size, -1, axis)

    def minimum_filter1d(input, size, axis=-1, output=None, mode='reflect', cval=0.0, origin=0):
        return np.moveaxis(_deslizante(input, size, axis, mode, cval).min(-1), -1, axis)

    def maximum_filter1d(input, size, axis=-1, output=None, mode='reflect', cval=0.0, origin=0):
        return np.moveaxis(_deslizante(input, size, axis, mode, cval).max(-1), -1, axis)

    _POLO = np.sqrt(3) - 2

    def _prefiltro_bspline3(a, axis):
        """Coeficientes da B-spline cubica que interpola a (filtro recursivo, borda espelhada)."""
        c = np.moveaxis(np.array(a, float), axis, 0)
        n = c.shape[0]
        if n < 2:
            return np.moveaxis(c, 0, axis)
        z = _POLO
        c *= (1 - z) * (1 - 1 / z)
        # Valor inicial causal com a borda espelhada (Thevenaz, Blu e Unser, 2000): soma exata.
        k = np.arange(n)
        w = z ** k + np.where((k > 0) & (k < n - 1), z ** (2 * n - 2 - k), 0.0)
        c[0] = np.tensordot(w, c, axes=(0, 0)) / (1 - z ** (2 * n - 2))
        for i in range(1, n):
            c[i] += z * c[i - 1]
        c[n - 1] = z / (z * z - 1) * (c[n - 1] + z * c[n - 2])
        for i in range(n - 2, -1, -1):
            c[i] = z * (c[i + 1] - c[i])
        return np.moveaxis(c, 0, axis)

    def _bspline3(t):
        t = np.abs(t)
        return np.where(t < 1, 2 / 3 - t * t + t ** 3 / 2, np.where(t < 2, (2 - t) ** 3 / 6, 0.0))

    def map_coordinates(input, coordinates, output=None, order=3, mode='nearest', cval=0.0, prefilter=True):
        """Amostra a grade 2D nas coordenadas (linha, coluna); fora dela vale a borda (mode='nearest')."""
        if mode != 'nearest':
            raise NotImplementedError(mode)
        a = np.asarray(input, float)
        lin, col = (np.asarray(v, float) for v in coordinates)
        H, W = a.shape
        lin, col = np.clip(lin, 0, H - 1), np.clip(col, 0, W - 1)
        if order == 0:
            return a[np.floor(lin + .5).astype(int).clip(0, H - 1), np.floor(col + .5).astype(int).clip(0, W - 1)]
        if order == 1:
            r0, c0 = np.floor(lin).astype(int).clip(0, H - 2), np.floor(col).astype(int).clip(0, W - 2)
            fr, fc = lin - r0, col - c0
            return (a[r0, c0] * (1 - fr) * (1 - fc) + a[r0 + 1, c0] * fr * (1 - fc)
                    + a[r0, c0 + 1] * (1 - fr) * fc + a[r0 + 1, c0 + 1] * fr * fc)
        if order != 3:
            raise NotImplementedError(order)
        cf = _prefiltro_bspline3(_prefiltro_bspline3(a, 0), 1) if prefilter else a
        def espelho(i, n):
            m = np.mod(i, 2 * n - 2)
            return np.where(m >= n, 2 * n - 2 - m, m)
        r0, c0 = np.floor(lin).astype(int), np.floor(col).astype(int)
        out = np.zeros(np.broadcast(lin, col).shape)
        for di in range(-1, 3):
            ri = espelho(r0 + di, H)
            wr = _bspline3(lin - (r0 + di))
            for dj in range(-1, 3):
                out += cf[ri, espelho(c0 + dj, W)] * wr * _bspline3(col - (c0 + dj))
        return out
