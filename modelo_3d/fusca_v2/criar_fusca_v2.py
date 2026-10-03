# -*- coding: utf-8 -*-
"""Fusca v2 (VW Type 1, ~1967-72) procedural no Blender, feito a partir de medidas reais.

Base de medidas: desenho tecnico ortogonal do Type 1 (lateral, planta, frontal, traseira) com as cotas
entre-eixos 2,40 m | largura 1,54 m | altura ~1,55 m | comprimento 4,08 m (tabelas em medidas_fusca.py).

Convencoes: frente do carro = -Y | lado esquerdo (motorista) = +X | Z para cima | metros | origem no centro do
entre-eixos, no chao.
"""
import bpy
import bmesh
import math
import os
import sys
import time
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
import medidas_fusca as MED

# ----------------------------------------------------------------------------------------------
# Constantes de projeto (m)
# ----------------------------------------------------------------------------------------------
Y_NARIZ, Y_RABO = -1.78, 1.945          # extremos da carroceria (sem para-choques)
FILETE = 0.03                           # raio do filete nas arestas das pontas
EIXO_F, EIXO_T = -1.20, 1.20            # entre-eixos 2,40
RAIO_RODA = 0.335                       # pneu (do desenho: 0,67 m de diametro)


# ----------------------------------------------------------------------------------------------
# Curvas 1D suaves (PCHIP + gaussiana)
# ----------------------------------------------------------------------------------------------
def _pchip(x, y, xi):
    x = np.asarray(x, float); y = np.asarray(y, float)
    h = np.diff(x); d = np.diff(y) / h
    m = np.zeros_like(y)
    for i in range(1, len(x) - 1):
        if d[i - 1] * d[i] > 0:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]; m[-1] = d[-1]
    xi = np.clip(xi, x[0], x[-1])
    i = np.clip(np.searchsorted(x, xi, side="right") - 1, 0, len(x) - 2)
    t = (xi - x[i]) / h[i]
    return ((2 * t**3 - 3 * t**2 + 1) * y[i] + (t**3 - 2 * t**2 + t) * h[i] * m[i]
            + (-2 * t**3 + 3 * t**2) * y[i + 1] + (t**3 - t**2) * h[i] * m[i + 1])


class Perfil:
    """tabela [(y, v)] -> funcao suave de y (aceita arrays)"""
    def __init__(self, pts, sigma=0.0):
        pts = sorted(pts)
        ded = []                                   # x duplicado/muito proximo: fica o ultimo
        for p in pts:
            if ded and p[0] - ded[-1][0] < 1e-3:
                ded[-1] = p
            else:
                ded.append(p)
        ys = [p[0] for p in ded]; vs = [p[1] for p in ded]
        passo = 0.004
        self.g = np.arange(-2.6, 2.6 + 1e-9, passo)
        base = _pchip(ys, vs, self.g)
        if sigma > 0:
            k = np.exp(-0.5 * (np.arange(-4 * sigma, 4 * sigma + 1e-9, passo) / sigma) ** 2)
            k /= k.sum()
            pad = len(k) // 2
            base = np.convolve(np.pad(base, pad, mode="edge"), k, mode="valid")
        self.v = base

    def __call__(self, y):
        return np.interp(y, self.g, self.v)


def degrau(y, a, b):
    """0 antes de a, 1 depois de b, suave entre"""
    t = np.clip((np.asarray(y, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def superel(x, z, cx, cz, ax, azu, azd, n):
    """funcao implicita de uma super-elipse (distancia aproximada, em m: <0 dentro, >0 fora)"""
    dx = np.abs(x - cx); dz = z - cz
    az = np.where(dz >= 0, azu, azd)
    ux = dx / ax; uz = np.abs(dz) / az
    g = ux**n + uz**n - 1.0
    gx = n * ux ** (n - 1) / ax; gz = n * uz ** (n - 1) / az
    return g / (np.hypot(gx, gz) + 1e-3)


# ----------------------------------------------------------------------------------------------
# Carroceria: cada secao (plano YZ... perpendicular ao eixo Y) e a uniao suave de primitivas
#   D  = caixa base (soleira, portas, "banheira")
#   S  = espinha central: capo -> cabine -> tampa do motor (topo = perfil lateral medido)
#   FB = bojos dos para-lamas dianteiros | RB = bojos dos para-lamas traseiros
# e recortada pela largura maxima medida (planta) e pelo topo medido (lateral).
# ----------------------------------------------------------------------------------------------
class Carroceria:
    def __init__(self):
        C = MED
        # ---- perfil lateral (linha de centro): nariz e rabeta completam a parte medida
        nariz = [(-1.79, 0.585), (-1.75, 0.625), (-1.71, 0.660), (-1.67, 0.700), (-1.62, 0.757)]
        rabo = [(1.84, 0.700), (1.89, 0.600), (1.93, 0.500), (1.95, 0.450)]
        self.ztop = Perfil(nariz + C.TOPO_Z + rabo, sigma=0.018)
        self.zpiso = Perfil([(-1.79, 0.33), (-1.74, 0.30), (-1.6, 0.27), (-0.9, 0.26), (0.9, 0.26), (1.6, 0.28),
                             (1.9, 0.31), (1.95, 0.33)], sigma=0.04)

        # ---- largura maxima (planta): silhueta medida + fechamento do bico (frente plana) e da rabeta (elipse)
        front = [(-1.80, 0.47), (-1.78, 0.47), (-1.765, 0.52), (-1.74, 0.606), (-1.70, 0.688),
                 (-1.66, 0.728), (-1.62, 0.749)]
        rear = [(1.66, 0.725), (1.72, 0.700), (1.78, 0.650), (1.84, 0.560), (1.89, 0.420), (1.93, 0.250), (1.96, 0.12)]
        sil = [p for p in C.LARG_SILHUETA if -1.60 <= p[0] <= 1.62]
        self.wmax = Perfil(front + sil + rear, sigma=0.012)

        # ---- D: base / portas
        corpo = [p for p in C.LARG_CORPO if p[0] >= -0.62]
        aD_f = [(-1.79, 0.20), (-1.76, 0.50), (-1.72, 0.62), (-1.5, 0.64), (-0.9, 0.64), (-0.70, 0.64)]
        self.aD = Perfil(aD_f + corpo, sigma=0.02)
        self.zDt = Perfil([(-1.79, 0.70), (-1.6, 0.78), (-0.95, 0.80), (-0.82, 0.88), (-0.72, 0.95), (-0.60, 0.98), (-0.55, 1.15), (0.6, 1.15),
                           (0.9, 1.12), (1.2, 1.0), (1.4, 0.90), (1.6, 0.78), (1.8, 0.60), (1.95, 0.45)], sigma=0.03)

        # ---- S: espinha (capo / cabine / tampa). Passa pelo topo medido e pelo ponto de vinco (x_h, z_h)
        xh = ([(-1.79, 0.10), (-1.77, 0.183)] + list(C.CAPO_X) +
              [(-0.60, 0.62), (-0.50, 0.629), (-0.30, 0.636), (0.30, 0.641), (0.80, 0.638), (1.0, 0.629),
               (1.14, 0.620), (1.30, 0.560), (1.47, 0.500), (1.71, 0.380), (1.85, 0.280), (1.95, 0.100)])
        zh = ([(-1.79, 0.580), (-1.70, 0.640), (-1.60, 0.720), (-1.50, 0.790), (-1.40, 0.835), (-1.30, 0.860)] +
              list(C.CAPO_VINCO_Z) +
              [(-0.50, 0.98), (1.0, 0.98), (1.14, 1.02), (1.30, 0.97), (1.47, 0.89), (1.60, 0.80), (1.71, 0.72),
               (1.85, 0.60), (1.95, 0.45)])
        delta = [(-1.79, 0.14), (-1.00, 0.14), (-0.74, 0.04), (-0.66, 0.0), (1.0, 0.0), (1.14, 0.12), (1.95, 0.12)]
        self.xh = Perfil(xh, sigma=0.02); self.zh = Perfil(zh, sigma=0.02); self.delta = Perfil(delta, sigma=0.03)
        self.nS = Perfil([(-1.79, 2.45), (-0.75, 2.5), (-0.5, 3.0), (1.0, 3.0), (1.3, 2.6), (1.95, 2.45)], sigma=0.05)
        self.roof_a, self.roof_h = 0.60, 0.28                          # cupula do teto (semi-eixos)

        # ---- FB / RB: bojos dos para-lamas
        xo_f = [(-1.80, 0.47), (-1.78, 0.47), (-1.765, 0.52), (-1.74, 0.606), (-1.70, 0.688),
                (-1.66, 0.728), (-1.62, 0.749), (-1.58, 0.758), (-1.50, 0.763), (-1.30, 0.759), (-1.10, 0.755),
                (-0.90, 0.747), (-0.74, 0.731), (-0.66, 0.706), (-0.63, 0.665), (-0.60, 0.62)]
        crest_f = [(-1.79, 0.600), (-1.74, 0.660), (-1.70, 0.700), (-1.66, 0.735)] + \
                  [p for p in C.CRISTA_PARALAMA_F if p[0] >= -1.60]
        self.xoF = Perfil(xo_f, sigma=0.01); self.crF = Perfil(crest_f, sigma=0.015)
        xo_t = [(0.60, 0.66), (0.66, 0.70), (0.72, 0.760), (0.76, 0.766), (0.82, 0.770), (0.88, 0.773), (1.0, 0.777), (1.12, 0.780),
                (1.20, 0.781), (1.30, 0.781), (1.36, 0.779), (1.48, 0.773), (1.54, 0.765), (1.6, 0.748)] + rear
        crest_t = [(0.60, 0.34)] + list(C.CRISTA_PARALAMA_T) + \
                  [(1.60, 0.73), (1.66, 0.70), (1.72, 0.66), (1.80, 0.60), (1.88, 0.52), (1.95, 0.42)]
        self.xoT = Perfil(xo_t, sigma=0.01); self.crT = Perfil(crest_t, sigma=0.015)

    # ------------------------------------------------------------------ parametros por estacao
    def params(self, y):
        y = np.asarray(y, float)
        P = {}
        zt = self.ztop(y); zp = self.zpiso(y)
        P["zt"], P["zp"], P["wmax"] = zt, zp, self.wmax(y)
        d = np.minimum(y - Y_NARIZ, Y_RABO - y)                       # distancia a ponta mais proxima
        P["fil"] = np.where(d < FILETE, FILETE - np.sqrt(np.maximum(FILETE**2 - (FILETE - d) ** 2, 0.0)), 0.0)
        # D
        P["D"] = dict(cx=0.0, cz=0.58, ax=self.aD(y), azu=np.maximum(self.zDt(y) - 0.58, 0.05), azd=0.58 - zp, n=4.0)
        # S
        xh, zh, dl, n = self.xh(y), self.zh(y), self.delta(y), self.nS(y)
        r = np.clip(dl / np.maximum(zt - zh + dl, 1e-3), 0.0, 0.88)
        aS = xh / (1 - r**n) ** (1 / n)
        zS0 = zh - dl
        # cupula do teto: elipse (0,60 x 0,28 m) centrada 0,28 m abaixo do topo — reproduz o envelope do desenho ate a coroa
        P["C"] = dict(cz=zt - self.roof_h, pres=degrau(y, -0.30, -0.18) * (1 - degrau(y, 0.85, 1.05)))
        rp = degrau(y, -1.74, -1.66) * (1 - degrau(y, -0.66, -0.58))     # vinco central do capo
        P["S"] = dict(cx=0.0, cz=zS0, ax=aS, azu=np.maximum(zt - zS0 - 0.014 * rp, 0.03), azd=0.10, n=n)
        P["R"] = dict(cz=zt - 0.05, ax=0.045, azu=0.05, n=2.0, pres=rp)
        # FB: presenca (some entre y=-0.70 e -0.60); topo = crista medida
        for nome, xo, cr, pres in (("FB", self.xoF(y), self.crF(y), 1.0 - degrau(y, -0.60, -0.56)),
                                   ("RB", self.xoT(y), self.crT(y), degrau(y, 0.56, 0.62))):
            cr = np.minimum(cr, zt - 0.004)
            top = np.maximum(cr, zp + 0.08)
            xo = xo - 0.004                               # concilia planta x vista frontal (o desenho difere ~1 cm)
            af = np.minimum(0.25, xo * 0.9)
            P[nome] = dict(cx=xo - af, cz=0.5 * (top + zp), ax=af, azu=0.5 * (top - zp), azd=0.5 * (top - zp), n=2.5,
                           pres=pres)
        return P

    # ------------------------------------------------------------------ funcao implicita da secao
    def campo(self, P, x, z):
        """x, z: arrays (NS, NT, NR); P: parametros por estacao (NS,) -> reshape (NS,1,1)"""
        def c(v): return np.asarray(v, float).reshape(-1, 1, 1) if np.ndim(v) else v
        ax_ = np.abs(x)
        D = P["D"]
        fD = superel(ax_, z, 0.0, D["cz"], c(D["ax"]), c(D["azu"]), c(D["azd"]), D["n"])
        S = P["S"]
        fS = superel(ax_, z, 0.0, S["cz"].reshape(-1, 1, 1), c(S["ax"]), c(S["azu"]), S["azd"], c(S["n"]))
        f = smin(fD, fS, 0.045)
        R = P["R"]
        fR = superel(ax_, z, 0.0, c(R["cz"]), R["ax"], c(R["azu"]), c(R["azu"]), R["n"]) + (1 - c(R["pres"])) * 0.5
        f = smin(f, fR, 0.016)
        for nome in ("FB", "RB"):
            B = P[nome]
            cx = c(B["cx"]); cz = c(B["cz"]); ax = c(B["ax"]); az = c(B["azu"])
            f1 = superel(ax_, z, cx, cz, ax, az, az, B["n"])
            f2 = superel(ax_, z, -cx, cz, ax, az, az, B["n"])
            fb = np.minimum(f1, f2) + (1 - c(B["pres"])) * 0.5
            f = smin(f, fb, 0.05)
        Ct = P["C"]
        cz_c = c(Ct["cz"])
        fC = superel(ax_, z, 0.0, cz_c, self.roof_a, self.roof_h, 0.9, 2.0) - (1 - c(Ct["pres"])) * 0.5
        fC = smin(fC, (z - (cz_c - 0.02)) * 10.0, 0.01)          # so vale acima do centro da elipse (nao mexe em portas/para-lamas)
        f = smax(f, fC, 0.02)
        # recortes: largura maxima (planta) e altura maxima (perfil lateral); filete nas pontas
        fil = c(P["fil"])
        f = smax(f, ax_ - (c(P["wmax"]) - fil), 0.02)
        f = smax(f, z - (c(P["zt"]) - fil), 0.006)
        f = smax(f, (c(P["zp"]) + fil) - z, 0.006)
        return f

    # ------------------------------------------------------------------ aneis
    def aneis(self, ys, NT=192, NR=72, R=1.25):
        P = self.params(ys)
        NS = len(ys)
        zO = 0.5 * (P["zp"] + P["zt"])
        th = 2 * np.pi * np.arange(NT) / NT
        cs, sn = np.cos(th)[None, :, None], np.sin(th)[None, :, None]
        r = np.linspace(0, R, NR)[None, None, :]
        zO3 = zO.reshape(-1, 1, 1)
        x = r * cs; z = zO3 + r * sn
        F = self.campo(P, np.broadcast_to(x, (NS, NT, NR)), np.broadcast_to(z, (NS, NT, NR)))
        dentro = F < 0
        # ultimo indice dentro (contorno mais externo)
        idx = NR - 1 - np.argmax(dentro[..., ::-1], axis=-1)
        idx = np.minimum(idx, NR - 2)
        lo = r[0, 0, idx]; hi = r[0, 0, idx + 1]
        cs2, sn2 = cs[:, :, 0], sn[:, :, 0]
        zO2 = zO.reshape(-1, 1)
        for _ in range(14):
            mid = 0.5 * (lo + hi)
            fm = self.campo(P, (mid * cs2)[..., None], (zO2 + mid * sn2)[..., None])[..., 0]
            ins = fm < 0
            lo = np.where(ins, mid, lo); hi = np.where(ins, hi, mid)
        rr = 0.5 * (lo + hi)
        return rr * cs2, zO2 + rr * sn2


def malha_carroceria(car, NS=300, NT=192):
    t = np.linspace(0, 1, NS)
    ys = Y_NARIZ + (Y_RABO - Y_NARIZ) * (1 - np.cos(np.pi * t)) / 2
    ys[0] += 1e-5; ys[-1] -= 1e-5
    x, z = car.aneis(ys, NT)
    verts = np.stack([x, np.broadcast_to(ys[:, None], x.shape), z], -1).reshape(-1, 3)
    faces = []
    for i in range(NS - 1):
        for k in range(NT):
            k2 = (k + 1) % NT
            faces.append((i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2))
    # tampas: leque em torno do centro do primeiro/ultimo anel
    vlist = verts.tolist()
    for anel, invert in ((0, True), (NS - 1, False)):
        c = verts[anel * NT:(anel + 1) * NT].mean(0)
        vlist.append(tuple(c)); ci = len(vlist) - 1
        for k in range(NT):
            k2 = (k + 1) % NT
            a, b = anel * NT + k, anel * NT + k2
            faces.append((ci, b, a) if invert else (ci, a, b))
    return vlist, faces


# ----------------------------------------------------------------------------------------------
# Helpers Blender
# ----------------------------------------------------------------------------------------------
COL = {"atual": None}


def usar_colecao(nome):
    col = bpy.data.collections.get(nome) or bpy.data.collections.new(nome)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    COL["atual"] = col
    return col


def linkar(ob):
    (COL["atual"] or bpy.context.scene.collection).objects.link(ob)
    return ob


def novo_objeto(nome, verts, faces, mats=(), suave=True):
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(nome, me)
    linkar(ob)
    if suave:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def recalcular_normais(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data); bm.free()


def material(nome, cor, metal=0.0, rug=0.5, **kw):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*cor[:3], 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rug
    for k, v in kw.items():
        k = k.replace("_", " ")
        if k in b.inputs:
            b.inputs[k].default_value = (*v, 1.0) if isinstance(v, tuple) else v
    return m


def emissivo(nome, cor, forca):
    return material(nome, cor, rug=0.25, Emission_Color=cor, Emission_Strength=forca)


def criar_materiais():
    m = {}
    m["tinta"] = material("Tinta_Azul", (0.006, 0.030, 0.22), metal=0.30, rug=0.20, Coat_Weight=1.0, Coat_Roughness=0.02)
    m["interior"] = material("Interior_Escuro", (0.025, 0.025, 0.03), rug=0.85)
    m["baixo"] = material("Assoalho", (0.008, 0.008, 0.009), rug=0.9)
    m["cromo"] = material("Cromo", (0.85, 0.86, 0.88), metal=1.0, rug=0.06)
    m["borracha"] = material("Borracha", (0.012, 0.012, 0.013), rug=0.65)
    m["pneu"] = material("Pneu", (0.020, 0.020, 0.021), rug=0.92, Specular_IOR_Level=0.12)
    m["roda"] = material("Roda_Aco", (0.035, 0.035, 0.04), metal=0.55, rug=0.38)
    m["linha"] = material("Linha_Painel", (0.004, 0.004, 0.006), rug=0.85, Specular_IOR_Level=0.1)
    m["farol_luz"] = emissivo("Farol_Luz", (1.0, 0.80, 0.50), 30.0)              # bulbo
    m["farol_disco"] = emissivo("Farol_Disco", (1.0, 0.62, 0.26), 0.9)            # fundo do refletor
    vf = material("Vidro_farol", (1.0, 0.97, 0.88), rug=0.0, Transmission_Weight=1.0, IOR=1.45)
    vf.node_tree.nodes["Principled BSDF"].inputs["Thin Wall"].default_value = True
    m["vidro_farol"] = vf
    m["ambar"] = emissivo("Seta_Ambar", (1.0, 0.36, 0.03), 7.0)
    m["lanterna"] = emissivo("Lanterna", (0.9, 0.02, 0.01), 0.8)
    m["placa"] = material("Placa", (0.75, 0.75, 0.72), rug=0.4)
    m["branco"] = material("Capacete", (0.85, 0.85, 0.83), rug=0.25, Coat_Weight=0.5)
    m["viseira"] = material("Viseira", (0.01, 0.01, 0.012), metal=0.5, rug=0.05)
    m["assento"] = material("Assento", (0.03, 0.03, 0.035), rug=0.7)
    m["macacao"] = material("Macacao", (0.02, 0.02, 0.025), rug=0.8)
    v = material("Vidro", (0.50, 0.58, 0.58), rug=0.0, Transmission_Weight=1.0, IOR=1.45)
    v.node_tree.nodes["Principled BSDF"].inputs["Thin Wall"].default_value = True
    m["vidro"] = v
    return m


def construir_carroceria(mats, NS=300, NT=192):
    car = Carroceria()
    v, f = malha_carroceria(car, NS, NT)
    # slots: 0 tinta | 1 interior (face interna da casca) | 2 assoalho | 3 interior do assoalho
    ob = novo_objeto("Fusca_Carroceria", v, f, [mats["tinta"], mats["interior"], mats["baixo"], mats["interior"]])
    recalcular_normais(ob)
    for p in ob.data.polygons:
        if p.center.z < 0.285 and p.normal.z < -0.5:
            p.material_index = 2
    # tampas planas das pontas: aresta viva entre a tampa e o corpo (o filete ja arredonda a transicao)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    caps = set(bm.faces[i].index for i in range(len(bm.faces) - 2 * NT, len(bm.faces)))
    for fc in list(bm.faces)[-2 * NT:]:
        for e in fc.edges:
            if any(lf.index not in caps for lf in e.link_faces):
                e.smooth = False
    bm.to_mesh(ob.data); bm.free()
    return car, ob


# ----------------------------------------------------------------------------------------------
# Projecao na superficie (BVH) e utilidades geometricas
# ----------------------------------------------------------------------------------------------
class Superficie:
    """superficie externa (sem recortes) para projetar contornos: raios horizontais (laterais) ou verticais (topo)"""
    def __init__(self, ob):
        me = ob.data
        self.bvh = BVHTree.FromPolygons([tuple(v.co) for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def lado(self, y, z, s=1.0):
        loc, nor, _, _ = self.bvh.ray_cast(Vector((s * 3.0, y, z)), Vector((-s, 0.0, 0.0)), 6.0)
        return loc, nor

    def topo(self, x, y):
        loc, nor, _, _ = self.bvh.ray_cast(Vector((x, y, 3.5)), Vector((0.0, 0.0, -1.0)), 7.0)
        return loc, nor

    def frente(self, x, z):
        loc, nor, _, _ = self.bvh.ray_cast(Vector((x, -4.0, z)), Vector((0.0, 1.0, 0.0)), 8.0)
        return loc, nor


def densificar(pts, passo=0.02, fechar=True):
    P = [np.array(p, float) for p in pts]
    n = len(P); saida = []
    for i in range(n if fechar else n - 1):
        a, b = P[i], P[(i + 1) % n]
        k = max(1, int(math.ceil(np.linalg.norm(b - a) / passo)))
        for j in range(k):
            saida.append(tuple(a + (b - a) * j / k))
    if not fechar:
        saida.append(tuple(P[-1]))
    return saida


def dentro_poligono(P, poly):
    """even-odd vetorizado: P (N,2), poly (M,2) -> bool (N,)"""
    x, y = P[:, 0], P[:, 1]
    r = np.zeros(len(P), bool)
    m = len(poly)
    for i in range(m):
        x0, y0 = poly[i]; x1, y1 = poly[(i + 1) % m]
        cond = ((y0 > y) != (y1 > y))
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = (x1 - x0) * (y - y0) / (y1 - y0) + x0
        r ^= cond & (x < xi)
    return r


def escalar_poligono(poly, f):
    P = np.array(poly, float); c = P.mean(0)
    return c + (P - c) * f


def triangular(poly2d):
    from mathutils import geometry
    tris = geometry.tessellate_polygon([[Vector((a, b, 0.0)) for a, b in poly2d]])
    return [tuple(t) for t in tris]


def laje(pts_in, pts_out, tris, V, F):
    """acumula uma laje fechada (dois aneis + tampas trianguladas) para uso como cortador booleano"""
    n = len(pts_in); base = len(V)
    V.extend(tuple(p) for p in pts_in); V.extend(tuple(p) for p in pts_out)
    for a, b, c in tris:
        F.append((base + a, base + c, base + b)); F.append((base + n + a, base + n + b, base + n + c))
    for i in range(n):
        j = (i + 1) % n
        F.append((base + i, base + j, base + n + j, base + n + i))


def prisma_yz(poly, x0, x1, V, F):
    tris = triangular(poly)
    n = len(poly); base = len(V)
    V.extend((x0, y, z) for y, z in poly); V.extend((x1, y, z) for y, z in poly)
    for a, b, c in tris:
        F.append((base + a, base + c, base + b)); F.append((base + n + a, base + n + b, base + n + c))
    for i in range(n):
        j = (i + 1) % n
        F.append((base + i, base + j, base + n + j, base + n + i))


def aplicar_mods(ob):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
    antigo = ob.data
    ob.modifiers.clear()
    ob.data = me
    if antigo.users == 0:
        bpy.data.meshes.remove(antigo)


def subtrair(ob, V, F):
    """ob - cortador (solver Manifold, com conferencia; cai para o Exact se o resultado sair estranho)"""
    cut = novo_objeto("Cortador", V, F, suave=False)
    recalcular_normais(cut)
    n0 = len(ob.data.polygons)
    original = ob.data.copy()
    for solver in ("MANIFOLD", "EXACT"):
        b = ob.modifiers.new("Corte", "BOOLEAN")
        b.operation = "DIFFERENCE"; b.object = cut; b.solver = solver
        if solver == "EXACT":
            b.use_self = True
        aplicar_mods(ob)
        n1 = len(ob.data.polygons)
        if 0.8 * n0 < n1 < 1.3 * n0 or solver == "EXACT":
            break
        ob.data = original.copy()
    bpy.data.objects.remove(cut)
    bpy.data.meshes.remove(original)


def tubo(nome, pts, raio, mat, ciclico=False, res=3):
    cu = bpy.data.curves.new(nome, "CURVE")
    cu.dimensions = "3D"; cu.bevel_depth = raio; cu.bevel_resolution = res; cu.use_fill_caps = True
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1.0)
    sp.use_cyclic_u = ciclico
    cu.materials.append(mat)
    ob = bpy.data.objects.new(nome, cu)
    linkar(ob)
    return ob


def revolucao(nome, perfil, cx, cy, cz, seg, mat, sinal=1, suave=True):
    """Torneia um laco fechado [(r, a)] em torno do eixo X que passa por (cy, cz); a = deslocamento axial."""
    P = len(perfil)
    verts = []
    for r, a in perfil:
        for k in range(seg):
            th = 2 * math.pi * k / seg
            verts.append((cx + sinal * a, cy + r * math.cos(th), cz + r * math.sin(th)))
    faces = []
    for j in range(P):
        j2 = (j + 1) % P
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((j * seg + k, j2 * seg + k, j2 * seg + k2, j * seg + k2))
    ob = novo_objeto(nome, verts, faces, [mat], suave)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data); bm.free()
    recalcular_normais(ob)
    return ob


def caixa(nome, centro, dims, mat, chanfro=0.0, seg=3, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= dims[0]; v.co.y *= dims[1]; v.co.z *= dims[2]
    if chanfro > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=chanfro, segments=seg, affect="EDGES")
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(nome, me)
    linkar(ob)
    ob.location = centro; ob.rotation_euler = rot
    return ob


def esfera(nome, centro, escala, mat, seg=24, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(8, seg // 2), radius=1.0)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(nome, me)
    linkar(ob)
    ob.location = centro; ob.scale = escala; ob.rotation_euler = rot
    return ob


# ----------------------------------------------------------------------------------------------
# Vidros (copiados das proprias faces da carroceria), casca oca e recortes
# ----------------------------------------------------------------------------------------------
def _dados_faces(ob):
    me = ob.data
    n = len(me.polygons)
    c = np.zeros(n * 3); nr = np.zeros(n * 3)
    me.polygons.foreach_get("center", c); me.polygons.foreach_get("normal", nr)
    return c.reshape(-1, 3), nr.reshape(-1, 3)


def vidro_de_faces(base, selecao, nome, mat, recuo=0.012):
    """copia as faces 'selecao' (bool por face) da malha base, recuadas 'recuo' para dentro"""
    me = base.data
    idx = np.nonzero(selecao)[0]
    if len(idx) == 0:
        return None
    vn = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("normal", vn); vn = vn.reshape(-1, 3)
    vs = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get("co", vs); vs = vs.reshape(-1, 3)
    mapa = {}; verts = []; faces = []
    for i in idx:
        f = []
        for vi in me.polygons[int(i)].vertices:
            if vi not in mapa:
                mapa[vi] = len(verts); verts.append(tuple(vs[vi] - vn[vi] * recuo))
            f.append(mapa[vi])
        faces.append(tuple(f))
    return novo_objeto(nome, verts, faces, [mat])


def construir_vidros(base, mats):
    """vidros a partir da malha base (antes da casca). Devolve lista de objetos."""
    C, N = _dados_faces(base)
    objs = []
    for s in (1, -1):
        for nome, poly in (("porta", MED.JAN_PORTA), ("quarto", MED.JAN_QUARTO)):
            pol = escalar_poligono(poly, 1.05)
            sel = dentro_poligono(C[:, [1, 2]], pol) & (C[:, 0] * s > 0.30) & (N[:, 0] * s > 0.15)
            o = vidro_de_faces(base, sel, "Vidro_%s_%s" % (nome, "E" if s > 0 else "D"), mats["vidro"])
            if o:
                objs.append(o)
    for nome, poly, zmin in (("parabrisa", MED.PLANTA_PARABRISA, 0.95), ("traseiro", MED.PLANTA_VIDRO_TRAS, 1.0)):
        pol = escalar_poligono(poly, 1.05)
        sel = dentro_poligono(C[:, [0, 1]], pol) & (C[:, 2] > zmin) & (N[:, 2] > 0.1)
        o = vidro_de_faces(base, sel, "Vidro_" + nome, mats["vidro"])
        if o:
            objs.append(o)
    return objs


def casca_oca(ob, espessura=0.02):
    sol = ob.modifiers.new("Casca", "SOLIDIFY")
    sol.thickness = espessura; sol.offset = -1.0; sol.use_even_offset = False; sol.use_rim = True
    sol.material_offset = 1; sol.material_offset_rim = 0
    aplicar_mods(ob)


def recortar(ob, sup):
    """arcos de roda (perfil medido) + janelas (contornos medidos) em grupos disjuntos"""
    arco = Perfil(MED.ARCO_LINHA, sigma=0.0)
    V, F = [], []
    for y0, y1 in ((-1.72, -0.78), (0.78, 1.72)):
        ys = np.linspace(y0, y1, 46)
        poly = [(float(y0), -0.25)] + [(float(y), float(arco(y))) for y in ys] + [(float(y1), -0.25)]
        prisma_yz(poly, 0.30, 1.10, V, F)
        prisma_yz(poly, -1.10, -0.30, V, F)
    subtrair(ob, V, F)
    # janelas laterais (lajes que seguem a superficie)
    V, F = [], []
    for poly in (MED.JAN_PORTA, MED.JAN_QUARTO):
        dens = densificar(poly, 0.02, True)
        tris = triangular(dens)
        for s in (1, -1):
            dentro, fora = [], []
            for y, z in dens:
                loc, nor = sup.lado(y, z, s)
                dentro.append(loc - nor * 0.07); fora.append(loc + nor * 0.07)
            laje(dentro, fora, tris, V, F)
    subtrair(ob, V, F)
    # para-brisa e vidro traseiro
    V, F = [], []
    for poly in (MED.PLANTA_PARABRISA, MED.PLANTA_VIDRO_TRAS):
        dens = densificar(poly, 0.02, True)
        tris = triangular(dens)
        dentro, fora = [], []
        for x, y in dens:
            loc, nor = sup.topo(x, y)
            dentro.append(loc - nor * 0.08); fora.append(loc + nor * 0.08)
        laje(dentro, fora, tris, V, F)
    subtrair(ob, V, F)


def molduras(sup, mats):
    objs = []
    for s in (1, -1):
        for nome, poly in (("porta", MED.JAN_PORTA), ("quarto", MED.JAN_QUARTO)):
            pts = []
            for y, z in densificar(poly, 0.015, True):
                loc, nor = sup.lado(y, z, s)
                pts.append(tuple(loc + nor * 0.002))
            objs.append(tubo("Moldura_%s_%s" % (nome, "E" if s > 0 else "D"), pts, 0.008, mats["borracha"], True))
    for nome, poly in (("parabrisa", MED.PLANTA_PARABRISA), ("traseiro", MED.PLANTA_VIDRO_TRAS)):
        pts = []
        for x, y in densificar(poly, 0.015, True):
            loc, nor = sup.topo(x, y)
            pts.append(tuple(loc + nor * 0.002))
        objs.append(tubo("Moldura_" + nome, pts, 0.009, mats["borracha"], True))
    return objs


# ----------------------------------------------------------------------------------------------
# Rodas, caixas de roda, estribos
# ----------------------------------------------------------------------------------------------
BITOLA = 0.666


def construir_estribos(mats):
    objs = []
    for s in (1, -1):
        objs.append(caixa("Estribo_%d" % s, (s * 0.688, 0.06, 0.305), (0.125, 1.34, 0.062), mats["borracha"], 0.012))
        objs.append(tubo("Estribo_friso_%d" % s, [(s * 0.745, -0.60, 0.339), (s * 0.745, 0.72, 0.339)], 0.006, mats["cromo"]))
    return objs



# ----------------------------------------------------------------------------------------------
# Varredura ao longo de um caminho (para-choques) e utilidades de posicionamento
# ----------------------------------------------------------------------------------------------
def perfil_arredondado(larg, alt, n=3.5, k=20, y0=0.0):
    """laco (dn, dz) super-eliptico: dn de y0 a y0+larg, dz de -alt/2 a alt/2"""
    pts = []
    for i in range(k):
        t = 2 * math.pi * i / k
        c, s = math.cos(t), math.sin(t)
        pts.append((y0 + larg / 2 + larg / 2 * np.sign(c) * abs(c) ** (2 / n), alt / 2 * np.sign(s) * abs(s) ** (2 / n)))
    return pts


def varredura(nome, caminho, normais, perfil, mat, tampas=True):
    """extrude o laco 'perfil' [(dn, dz)] ao longo de 'caminho'; dn segue a normal horizontal de cada ponto"""
    N, P = len(caminho), len(perfil)
    verts = []
    for i in range(N):
        p = np.array(caminho[i], float); n = np.array(normais[i], float)
        for dn, dz in perfil:
            verts.append(tuple(p + n * dn + np.array((0.0, 0.0, dz))))
    faces = []
    for i in range(N - 1):
        for j in range(P):
            j2 = (j + 1) % P
            faces.append((i * P + j, (i + 1) * P + j, (i + 1) * P + j2, i * P + j2))
    if tampas:
        faces.append(tuple(range(P))[::-1]); faces.append(tuple(range((N - 1) * P, N * P)))
    ob = novo_objeto(nome, verts, faces, [mat])
    recalcular_normais(ob)
    return ob


def posicionar(ob, pos, eixo, rolar=0.0):
    """leva o eixo X local do objeto para a direcao 'eixo' e coloca a origem em 'pos'"""
    q = Vector((1, 0, 0)).rotation_difference(Vector(eixo).normalized())
    ob.matrix_world = Matrix.Translation(pos) @ q.to_matrix().to_4x4() @ Matrix.Rotation(rolar, 4, "X")


# ----------------------------------------------------------------------------------------------
# Para-choques (lamina dupla cromada + faixa de borracha + garras)
# ----------------------------------------------------------------------------------------------
FACE_PARACHOQUE_F = [(0.0, -1.885), (0.30, -1.885), (0.48, -1.883), (0.54, -1.865), (0.60, -1.838), (0.66, -1.796),
                     (0.69, -1.752), (0.707, -1.715)]
FACE_PARACHOQUE_T = [(0.0, 2.073), (0.12, 2.069), (0.24, 2.054), (0.36, 2.025), (0.48, 2.000), (0.54, 1.975),
                     (0.60, 1.935), (0.66, 1.867), (0.72, 1.780)]


def construir_parachoques(mats, frente=True):
    objs = []
    face = FACE_PARACHOQUE_F if frente else FACE_PARACHOQUE_T
    xs_t = np.array([p[0] for p in face]); ys_t = np.array([p[1] for p in face])
    nome = "Frente" if frente else "Tras"
    sg = -1.0 if frente else 1.0                                   # sentido "para fora" em Y
    xx = np.linspace(-face[-1][0], face[-1][0], 81)
    yy = _pchip(xs_t, ys_t, np.abs(xx))
    caminho = [(x, y, 0.0) for x, y in zip(xx, yy)]
    normais = []
    for i in range(len(xx)):
        a = caminho[max(i - 1, 0)]; b = caminho[min(i + 1, len(xx) - 1)]
        t = np.array([b[0] - a[0], b[1] - a[1], 0.0]); t /= np.linalg.norm(t)
        n = np.array([t[1], -t[0], 0.0])
        if n[1] * sg < 0:
            n = -n
        normais.append(n)
    barras = (("inf", 0.4140, 0.078), ("faixa", 0.4670, 0.030), ("sup", 0.5210, 0.078))
    for tag, zc, alt in barras:
        cam = [(x, y, zc) for x, y, _ in caminho]
        mat = mats["borracha"] if tag == "faixa" else mats["cromo"]
        perf = perfil_arredondado(0.034 if tag != "faixa" else 0.024, alt, 3.0, 20, y0=-0.034 if tag != "faixa" else -0.030)
        objs.append(varredura("Parachoque_%s_%s" % (nome, tag), cam, normais, perf, mat))
    # garras (guardas) de borracha com friso cromado
    for s in (1, -1):
        xg = s * (0.36 if frente else 0.42)
        yb = float(_pchip(xs_t, ys_t, abs(xg)))
        yc = yb + sg * 0.030
        objs.append(caixa("Garra_%s_%d" % (nome, s), (xg, yc, 0.488), (0.062, 0.056, 0.262), mats["borracha"], 0.014))
        objs.append(caixa("Garra_friso_%s_%d" % (nome, s), (xg, yc + sg * 0.030, 0.488), (0.030, 0.006, 0.228), mats["cromo"], 0.003))
    return objs


# ----------------------------------------------------------------------------------------------
# Farois, setas, tira do capo, grelhas
# ----------------------------------------------------------------------------------------------
def construir_farois(sup, body, mats):
    """recorta o nicho no para-lama e monta aro cromado + lente + refletor + lampada em cada lado"""
    objs = []
    R_NICHO = 0.108
    # nicho: cilindro com eixo em Y
    V, F = [], []
    for s in (1, -1):
        cx, cz = s * 0.505, 0.66
        seg = 40
        base = len(V)
        for y in (-1.95, -1.685):
            for k in range(seg):
                th = 2 * math.pi * k / seg
                V.append((cx + R_NICHO * math.cos(th), y, cz + R_NICHO * math.sin(th)))
        F.append(tuple(range(base, base + seg))[::-1]); F.append(tuple(range(base + seg, base + 2 * seg)))
        for k in range(seg):
            k2 = (k + 1) % seg
            F.append((base + k, base + k2, base + seg + k2, base + seg + k))
    subtrair(body, V, F)
    aro = [(0.106, -0.004), (0.106, 0.012), (0.100, 0.020), (0.090, 0.020), (0.090, 0.010), (0.092, -0.004)]
    def _a_ext(r): return 0.030 - 0.016 * (r / 0.088) ** 2
    ext = [(0.001 + k * 0.004, _a_ext(0.001 + k * 0.004) + (0.0006 if k % 2 else 0.0)) for k in range(22)]      # estrias concentricas
    lente = ext + [(0.088, 0.010)] + [(r, a - 0.009) for r, a in reversed(ext)]
    refletor = [(0.001, -0.040), (0.030, -0.035), (0.060, -0.022), (0.087, -0.004), (0.088, -0.010), (0.060, -0.028),
                (0.030, -0.041), (0.001, -0.046)]
    brilho = [(0.001, -0.005), (0.080, -0.004), (0.080, -0.007), (0.001, -0.008)]
    for s in (1, -1):
        pos = Vector((s * 0.505, -1.735, 0.66))
        eixo = (0.0, -1.0, 0.0)
        # X local -> -Y: rotacao em torno de Z; depois guinada leve para fora
        for nome, perf, mat, seg in (("Aro", aro, mats["cromo"], 48), ("Lente", lente, mats["vidro_farol"], 64),
                                     ("Refletor", refletor, mats["cromo"], 48), ("Brilho", brilho, mats["farol_disco"], 40)):
            ob = revolucao("Farol_%s_%d" % (nome, s), perf, 0, 0, 0, seg, mat)
            posicionar(ob, pos, (s * 0.13, -1.0, 0.0))
            objs.append(ob)
        bulbo = esfera("Farol_Bulbo_%d" % s, pos + Vector((s * 0.0, 0.035, 0.0)), (0.014, 0.014, 0.014), mats["farol_luz"], 16)
        objs.append(bulbo)
    return objs


def construir_setas(sup, mats):
    objs = []
    for s in (1, -1):
        x, y = s * 0.565, -1.31
        loc, nor = sup.topo(x, y)
        z = loc.z
        base = esfera("Seta_base_%d" % s, (x, y, z - 0.004), (0.050, 0.086, 0.026), mats["tinta"], 22)
        len_ = esfera("Seta_%d" % s, (x, y - 0.006, z + 0.016), (0.040, 0.070, 0.026), mats["ambar"], 22)
        objs += [base, len_]
    return objs


def construir_capo_detalhes(sup, mats):
    objs = []
    # tira cromada sobre o vinco central
    pts = []
    for y in np.linspace(-0.93, -1.66, 60):
        loc, nor = sup.topo(0.0, float(y))
        pts.append((0.0, float(y), loc.z + 0.002))
    objs.append(tubo("Capo_tira", pts, 0.0055, mats["cromo"]))
    # puxador em gancho (desce pela frente)
    loc, _ = sup.topo(0.0, -1.68)
    z0 = loc.z
    gancho = [(0.0, -1.68, z0 + 0.004), (0.0, -1.705, z0 - 0.010), (0.0, -1.725, z0 - 0.040), (0.0, -1.735, z0 - 0.075),
              (0.012, -1.738, z0 - 0.098), (0.030, -1.735, z0 - 0.104)]
    objs.append(tubo("Capo_puxador", gancho, 0.0075, mats["cromo"], False, 4))
    # grelhas de buzina (oval com aletas verticais) sob os farois
    for s in (1, -1):
        x = s * 0.448
        loc, nor = sup.frente(x, 0.54)
        if loc is None:
            continue
        objs.append(esfera("Grelha_%d" % s, (x, loc.y + 0.002, 0.54), (0.030, 0.006, 0.026), mats["cromo"], 16))
        for k in range(-3, 4):
            objs.append(caixa("Grelha_aleta_%d_%d" % (s, k), (x + k * 0.0075, loc.y - 0.0035, 0.54), (0.0034, 0.004, 0.036),
                              mats["linha"], 0.0008, 1))
    return objs


# ----------------------------------------------------------------------------------------------
# Laterais: juntas de painel, macanetas, espelhos, limpadores, friso do para-brisa, estribo
# ----------------------------------------------------------------------------------------------
def construir_linhas(sup, mats):
    """juntas das portas e do capo: tubos escuros finos sobre a superficie"""
    L = mats["linha"]
    objs = []
    for s in (1, -1):
        lado = "E" if s > 0 else "D"
        # porta: aresta dianteira, soleira e aresta traseira (ate a calha do teto)
        pts = []
        for z in np.linspace(0.86, 0.345, 24):
            loc, nor = sup.lado(MED.PORTA_Y_FRENTE, float(z), s)
            if loc is not None: pts.append(tuple(loc + nor * 0.0008))
        for y in np.linspace(MED.PORTA_Y_FRENTE, MED.PORTA_Y_TRAS, 40):
            loc, nor = sup.lado(float(y), MED.PORTA_Z_SOLEIRA, s)
            if loc is not None: pts.append(tuple(loc + nor * 0.0008))
        for z in np.linspace(0.345, 1.02, 30):
            loc, nor = sup.lado(MED.PORTA_Y_TRAS, float(z), s)
            if loc is not None: pts.append(tuple(loc + nor * 0.0008))
        objs.append(tubo("Junta_porta_" + lado, pts, 0.0022, L))
    # capo: contorno medido em planta projetado na superficie
    pts = []
    for x, y in densificar(MED.PLANTA_CAPO, 0.02, True):
        loc, nor = sup.topo(x, y)
        if loc is not None: pts.append(tuple(loc + nor * 0.0008))
    objs.append(tubo("Junta_capo", pts, 0.0024, L, True))
    return objs


def construir_acessorios(sup, mats):
    objs = []
    for s in (1, -1):
        lado = "E" if s > 0 else "D"
        # macaneta (botao) na porta
        loc, nor = sup.lado(0.22, 0.905, s)
        if loc is not None:
            objs.append(caixa("Macaneta_%s" % lado, tuple(loc + nor * 0.004), (0.014, 0.19, 0.038), mats["cromo"], 0.006, 2))
            objs.append(caixa("Macaneta_botao_%s" % lado, tuple(loc + nor * 0.012), (0.014, 0.05, 0.028), mats["cromo"], 0.006, 2))
        # retrovisor no canto do cowl
        loc, nor = sup.lado(-0.60, 1.02, s)
        if loc is not None:
            base = tuple(loc)
            fim = (loc.x + s * 0.028, loc.y - 0.02, loc.z + 0.06)
            objs.append(tubo("Espelho_haste_" + lado, [base, fim], 0.006, mats["cromo"]))
            objs.append(esfera("Espelho_" + lado, (fim[0] + s * 0.018, fim[1] + 0.02, fim[2] + 0.02), (0.014, 0.038, 0.048),
                               mats["cromo"], 20, (0, 0, math.radians(-20) * s)))
    # limpadores de para-brisa
    for a, b in (((-0.45, -0.575), (-0.05, -0.548)), ((0.05, -0.548), (0.45, -0.575))):
        pts = []
        for t in np.linspace(0, 1, 14):
            x = a[0] + (b[0] - a[0]) * t; y = a[1] + (b[1] - a[1]) * t
            loc, nor = sup.topo(x, y)
            pts.append(tuple(loc + nor * 0.014))
        objs.append(tubo("Limpador", pts, 0.006, mats["borracha"]))
    return objs


def friso_janelas(sup, mats):
    """friso metalico fino em volta do para-brisa e do vidro traseiro"""
    objs = []
    for nome, poly in (("parabrisa", MED.PLANTA_PARABRISA), ("traseiro", MED.PLANTA_VIDRO_TRAS)):
        pts = []
        for x, y in densificar(poly, 0.015, True):
            loc, nor = sup.topo(x * 1.03, y)
            pts.append(tuple(loc + nor * 0.004))
        objs.append(tubo("Friso_" + nome, pts, 0.0035, mats["cromo"], True))
    return objs



# ----------------------------------------------------------------------------------------------
# Caixas de roda (seguem o recorte medido), traseira, interior
# ----------------------------------------------------------------------------------------------
def caixa_de_roda(nome, s, y0, y1, mat, x_int=0.30, x_ext=0.62):
    """meia-caixa escura atras do pneu, com o mesmo contorno do recorte do arco: parede + tampa interna"""
    arco = Perfil(MED.ARCO_LINHA, sigma=0.0)
    ys = np.linspace(y0, y1, 36)
    zs = [float(arco(y)) - 0.03 for y in ys]
    verts, faces = [], []
    n = len(ys)
    for a in (x_int, x_ext):
        for y, z in zip(ys, zs):
            verts.append((s * a, float(y), z))
    for i in range(n - 1):
        faces.append((i, i + 1, n + i + 1, n + i))                               # parede (teto do arco)
    # tampa interna: regiao entre a curva e o chao (z=0.05), em leque simples
    base = len(verts)
    for y, z in zip(ys, zs):
        verts.append((s * x_int, float(y), 0.33))
    for i in range(n - 1):
        faces.append((i, i + 1, base + i + 1, base + i))
    return novo_objeto(nome, verts, faces, [mat], False)


def fendas_roda(disco, s, cx, ya, n=10):
    """recorta n fendas radiais de ventilacao no disco da roda (cortador = caixas atravessando o disco)"""
    V, F = [], []
    rc, hx, ht, hr = 0.132, 0.05, 0.0105, 0.030
    for k in range(n):
        th = 2 * math.pi * (k + 0.5) / n
        ur = np.array([0.0, math.cos(th), math.sin(th)]); ut = np.array([0.0, -math.sin(th), math.cos(th)])
        c = np.array([cx + s * 0.03, ya, RAIO_RODA]) + ur * rc
        base = len(V)
        for sx in (-1, 1):
            for st in (-1, 1):
                for sr in (-1, 1):
                    V.append(tuple(c + np.array([1.0, 0, 0]) * sx * hx + ut * st * ht + ur * sr * hr))
        idx = lambda sx, st, sr: base + (sx > 0) * 4 + (st > 0) * 2 + (sr > 0)
        for a, b, c_, d in (((-1, -1, -1), (-1, 1, -1), (-1, 1, 1), (-1, -1, 1)), ((1, -1, -1), (1, -1, 1), (1, 1, 1), (1, 1, -1)),
                            ((-1, -1, -1), (-1, -1, 1), (1, -1, 1), (1, -1, -1)), ((-1, 1, -1), (1, 1, -1), (1, 1, 1), (-1, 1, 1)),
                            ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1)), ((-1, -1, 1), (-1, 1, 1), (1, 1, 1), (1, -1, 1))):
            F.append((idx(*a), idx(*b), idx(*c_), idx(*d)))
    subtrair(disco, V, F)


def construir_rodas(mats):
    objs = []
    meia = [(0.3365, 0.0), (0.3365, 0.011), (0.3330, 0.012), (0.3330, 0.016), (0.3365, 0.017), (0.3365, 0.027),
            (0.3330, 0.028), (0.3330, 0.032), (0.3360, 0.033), (0.3350, 0.044), (0.3280, 0.054), (0.3120, 0.066),
            (0.2700, 0.076), (0.2150, 0.072), (0.1920, 0.062)]
    pneu_h = [(r, -a) for r, a in reversed(meia[1:])] + meia
    disco = [(0.196, 0.058), (0.198, 0.040), (0.184, 0.030), (0.150, 0.026), (0.120, 0.020), (0.060, 0.026), (0.058, 0.018),
             (0.120, 0.012), (0.150, 0.016), (0.180, 0.020), (0.190, 0.034), (0.190, 0.054)]
    calota = [(0.001, 0.076), (0.040, 0.073), (0.085, 0.060), (0.112, 0.042), (0.116, 0.030), (0.112, 0.026), (0.001, 0.026)]
    tambor = [(0.001, 0.000), (0.17, 0.000), (0.17, 0.008), (0.001, 0.008)]
    for ya in (EIXO_F, EIXO_T):
        for s, lado in ((1, "E"), (-1, "D")):
            cx = s * BITOLA
            objs.append(revolucao("Pneu_%s_%+.1f" % (lado, ya), pneu_h, cx, ya, RAIO_RODA, 96, mats["pneu"], s))
            disco_ob = revolucao("Roda_%s_%+.1f" % (lado, ya), disco, cx, ya, RAIO_RODA, 64, mats["roda"], s)
            fendas_roda(disco_ob, s, cx, ya)
            objs.append(disco_ob)
            objs.append(revolucao("Tambor_%s_%+.1f" % (lado, ya), tambor, cx, ya, RAIO_RODA, 32, mats["baixo"], s))
            objs.append(revolucao("Calota_%s_%+.1f" % (lado, ya), calota, cx, ya, RAIO_RODA, 40, mats["cromo"], s))
            objs.append(revolucao("Aro_roda_%s_%+.1f" % (lado, ya), [(0.201, 0.064), (0.201, 0.040), (0.190, 0.038), (0.190, 0.062)], cx, ya, RAIO_RODA, 64, mats["cromo"], s))
        for s, lado in ((1, "E"), (-1, "D")):
            y0, y1 = (-1.72, -0.78) if ya < 0 else (0.78, 1.72)
            objs.append(caixa_de_roda("Caixa_roda_%s_%+.1f" % (lado, ya), s, y0, y1, mats["baixo"]))
    return objs


def _tras(sup, x, z):
    loc, nor, _, _ = sup.bvh.ray_cast(Vector((x, 4.0, z)), Vector((0.0, -1.0, 0.0)), 8.0)
    return loc, nor


def _alinhar(ob, nor):
    """gira o objeto para que seu eixo Z local aponte na direcao 'nor'"""
    q = Vector((0, 0, 1)).rotation_difference(Vector(nor).normalized())
    ob.rotation_euler = q.to_euler()


def construir_traseira(sup, mats):
    objs = []
    # lanternas traseiras (lentes ovais verticais nos para-lamas)
    for s in (1, -1):
        loc, nor = _tras(sup, s * 0.545, 0.635)
        if loc is None:
            continue
        objs.append(esfera("Lanterna_base_%d" % s, (loc.x, loc.y - 0.004, loc.z), (0.056, 0.030, 0.100), mats["cromo"], 22))
        objs.append(esfera("Lanterna_%d" % s, (loc.x, loc.y + 0.004, loc.z), (0.046, 0.028, 0.086), mats["lanterna"], 22))
    # placa (levemente inclinada acompanhando o rabo) + lanterna da placa
    loc, nor = _tras(sup, 0.0, 0.665)
    if loc is not None:
        pl = caixa("Placa", tuple(loc + nor * 0.006), (0.34, 0.006, 0.13), mats["placa"], 0.004, 2)
        q = Vector((0, 1, 0)).rotation_difference(Vector(nor).normalized())
        pl.rotation_euler = q.to_euler()
        objs.append(pl)
    # macaneta da tampa do motor
    loc, nor = _tras(sup, 0.0, 0.775)
    if loc is not None:
        objs.append(esfera("Tampa_macaneta", tuple(loc + nor * 0.012), (0.045, 0.020, 0.030), mats["cromo"], 16))
    # venezianas da tampa do motor
    for k in range(20):
        y = 1.415 + k * 0.0060
        pts = []
        for x in np.linspace(-0.37, 0.37, 26):
            loc, nor = sup.topo(float(x), y)
            if loc is not None:
                pts.append(tuple(loc + nor * 0.0006))
        if len(pts) > 3:
            objs.append(tubo("Veneziana_%d" % k, pts, 0.0019, mats["linha"]))
    # escapamento duplo
    for s in (1, -1):
        objs.append(tubo("Escape_%d" % s, [(s * 0.175, 1.90, 0.305), (s * 0.175, 2.035, 0.305)], 0.030, mats["cromo"], False, 6))
    return objs


def construir_interior(mats):
    objs = []
    objs.append(caixa("Piso", (0.0, 0.05, 0.30), (1.24, 1.75, 0.02), mats["interior"]))
    for s in (1, -1):
        objs.append(caixa("Banco_%d" % s, (s * 0.34, 0.04, 0.44), (0.46, 0.50, 0.14), mats["assento"], 0.04))
        objs.append(caixa("Encosto_%d" % s, (s * 0.34, 0.31, 0.74), (0.46, 0.11, 0.58), mats["assento"], 0.04,
                          rot=(math.radians(-8), 0, 0)))
    objs.append(caixa("Banco_tras", (0.0, 0.78, 0.47), (1.20, 0.40, 0.16), mats["assento"], 0.04))
    objs.append(caixa("Encosto_tras", (0.0, 1.00, 0.80), (1.20, 0.10, 0.50), mats["assento"], 0.04))
    objs.append(caixa("Painel", (0.0, -0.44, 0.83), (1.28, 0.24, 0.20), mats["interior"], 0.05))
    # volante (aro + raios)
    C = np.array([0.34, -0.26, 0.90]); u = np.array([1.0, 0, 0]); v = np.array([0, 0.30, -0.95])
    aro = [tuple(C + 0.20 * (math.cos(t) * u + math.sin(t) * v)) for t in np.linspace(0, 2 * math.pi, 40, endpoint=False)]
    objs.append(tubo("Volante", aro, 0.013, mats["assento"], True))
    objs.append(tubo("Volante_raio", [tuple(C - 0.20 * u), tuple(C + 0.20 * u)], 0.010, mats["assento"]))
    objs.append(tubo("Coluna", [tuple(C), (0.34, -0.44, 0.80)], 0.018, mats["assento"]))
    # piloto: macacao, bracos, capacete
    objs.append(caixa("Piloto_torso", (0.34, 0.16, 0.84), (0.38, 0.22, 0.50), mats["macacao"], 0.08, rot=(math.radians(-8), 0, 0)))
    for s in (-1, 1):
        objs.append(tubo("Piloto_braco_%d" % s, [(0.34 + s * 0.21, 0.14, 1.00), (0.34 + s * 0.19, -0.05, 0.94),
                                                 tuple(C + s * 0.17 * u)], 0.042, mats["macacao"], False, 5))
    objs.append(esfera("Piloto_capacete", (0.34, 0.14, 1.20), (0.125, 0.150, 0.140), mats["branco"], 32))
    objs.append(esfera("Piloto_viseira", (0.34, 0.010, 1.205), (0.104, 0.055, 0.050), mats["viseira"], 22))
    return objs


def construir_tudo(car, body, mats):
    """monta o carro. Devolve dict com os objetos gerados (e a superficie usada para projetar detalhes)."""
    sup = Superficie(body)
    R = {"sup": sup}
    R["vidros"] = construir_vidros(body, mats)
    casca_oca(body)
    recortar(body, sup)
    R["molduras"] = molduras(sup, mats) + friso_janelas(sup, mats)
    R["farois"] = construir_farois(sup, body, mats)
    R["setas"] = construir_setas(sup, mats)
    R["capo"] = construir_capo_detalhes(sup, mats)
    R["linhas"] = construir_linhas(sup, mats)
    R["acessorios"] = construir_acessorios(sup, mats)
    R["parachoques"] = construir_parachoques(mats, True) + construir_parachoques(mats, False)
    R["rodas"] = construir_rodas(mats)
    R["estribos"] = construir_estribos(mats)
    R["traseira"] = construir_traseira(sup, mats)
    R["interior"] = construir_interior(mats)
    return R


# ----------------------------------------------------------------------------------------------
# Cenario, camera, luzes, render
# ----------------------------------------------------------------------------------------------
VISTAS = {
    # nome: (posicao camera, alvo, lente)
    "foto": ((-2.15, -3.35, 0.72), (-0.15, -0.80, 0.40), 30),        # enquadramento da foto de referencia (frente-direita, baixo)
    "f34": ((3.6, -5.2, 1.3), (0, 0, 0.75), 45),
    "fd34": ((-3.6, -5.2, 1.3), (0, 0, 0.75), 45),
    "t34": ((-3.8, 5.4, 1.5), (0, 0.2, 0.75), 45),
    "td34": ((3.8, 5.4, 1.5), (0, 0.2, 0.75), 45),
    "lado": ((8.5, 0, 0.9), (0, 0, 0.75), 45),
    "frente": ((0, -7, 0.9), (0, 0, 0.75), 50),
    "baixo": ((3.2, -3.0, 0.25), (0, -0.6, 0.6), 35),
    "det_frente": ((-1.5, -3.3, 0.85), (-0.30, -1.75, 0.62), 48),
    "det_roda": ((-1.9, -2.0, 0.42), (-0.7, -1.2, 0.36), 42),
    "det_cabine": ((-2.3, -1.9, 1.55), (-0.15, -0.35, 1.15), 42),
    "det_tras": ((-1.7, 3.8, 1.0), (0.0, 1.8, 0.6), 45),
}


def mirar(obj, alvo):
    d = Vector(alvo) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def mat_procedural(nome, escala, cor_a, cor_b, rug, relevo=0.2):
    """material com variacao de cor por ruido (asfalto, grama...)"""
    m = bpy.data.materials.new(nome); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = escala; nz.inputs["Detail"].default_value = 10.0
    rp = nt.nodes.new("ShaderNodeValToRGB")
    rp.color_ramp.elements[0].color = (*cor_a, 1.0); rp.color_ramp.elements[1].color = (*cor_b, 1.0)
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = relevo; bm.inputs["Distance"].default_value = 0.01
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], rp.inputs["Fac"]); nt.links.new(rp.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(nz.outputs["Fac"], bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = rug
    return m


def mat_torcida():
    m = bpy.data.materials.new("Torcida"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 6.0
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    rp = nt.nodes.new("ShaderNodeValToRGB")
    rp.color_ramp.elements[0].color = (0.015, 0.015, 0.018, 1.0); rp.color_ramp.elements[1].color = (0.55, 0.53, 0.50, 1.0)
    rp.color_ramp.elements[0].position = 0.30; rp.color_ramp.elements[1].position = 0.75
    el = rp.color_ramp.elements.new(0.52); el.color = (0.16, 0.15, 0.16, 1.0)
    nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
    nt.links.new(vo.outputs["Color"], bw.inputs["Color"]); nt.links.new(bw.outputs["Val"], rp.inputs["Fac"])
    nt.links.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    return m


def construir_cenario():
    import random
    rng = random.Random(11)
    usar_colecao("Cenario")
    asf = mat_procedural("Asfalto", 55, (0.020, 0.020, 0.022), (0.085, 0.082, 0.085), 0.5, 0.25)
    gra = mat_procedural("Grama", 90, (0.040, 0.110, 0.012), (0.170, 0.340, 0.040), 0.92, 0.4)

    def plano(nome, x0, x1, y0, y1, z, mat):
        return novo_objeto(nome, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [(0, 1, 2, 3)], [mat], False)
    plano("Pista", -1.10, 400, -400, 400, 0.0, asf)
    plano("Grama", -400, -1.95, -400, 400, -0.02, gra)
    # zebra vermelho/branco/verde ao longo da pista
    cores = [(0.55, 0.02, 0.02), (0.75, 0.75, 0.72), (0.02, 0.32, 0.06), (0.75, 0.75, 0.72)]
    mz = [material("Zebra_%d" % i, c, rug=0.55) for i, c in enumerate(cores)]
    seg = 0.62
    for i in range(int(40 / seg)):
        caixa("Zebra_%d" % i, (-1.525, -22 + i * seg + seg / 2, -0.005), (0.85, seg, 0.05), mz[i % 4])
    # skyline ao fundo, longe e enevoado, do lado do sol
    predio = material("Predio", (0.16, 0.13, 0.14), rug=0.9, Emission_Color=(0.85, 0.52, 0.38), Emission_Strength=0.55)
    for i in range(70):
        az = math.radians(rng.uniform(72, 135)); r = rng.uniform(1300, 2600)
        w, d = rng.uniform(25, 70), rng.uniform(25, 70)
        h = rng.choice([40, 55, 70, 95, 130]) * rng.uniform(0.7, 1.3)
        caixa("Predio_%d" % i, (r * math.cos(az), r * math.sin(az), h / 2), (w, d, h), predio, rot=(0, 0, az))
    # arquibancada + cerca, do lado direito da imagem
    centro = Vector((40.0, 8.0, 0.0))
    dx, dy = -centro.x / centro.length, -centro.y / centro.length
    yaw = math.atan2(dx, -dy)
    base = bpy.data.objects.new("Arquibancada", None); linkar(base)
    base.location = centro; base.rotation_euler = (0, 0, yaw)
    torcida = mat_torcida(); concreto = material("Concreto", (0.12, 0.12, 0.125), rug=0.9)
    metal = material("Metal_Cerca", (0.10, 0.10, 0.11), metal=0.7, rug=0.5)
    partes = []
    for k in range(9):
        h = 0.5 * (k + 1)
        partes.append(caixa("Degrau_%d" % k, (0, 5 + k * 1.1, h / 2), (70, 1.1, h), torcida if k else concreto))
    partes.append(caixa("Cobertura", (0, 11.0, 7.5), (70, 13.0, 0.4), concreto))
    for i in range(8):
        partes.append(caixa("Pilar_%d" % i, (-31 + i * 8.8, 16.5, 3.7), (0.5, 0.5, 7.4), concreto))
    for i in range(29):
        partes.append(caixa("Estaca_%d" % i, (-28 + i * 2.0, 2.0, 1.8), (0.10, 0.10, 3.6), metal))
    for hz in (1.0, 1.9, 2.8):
        partes.append(caixa("Cerca_%.1f" % hz, (0, 2.0, hz), (58, 0.03, 0.03), metal))
    partes.append(caixa("Guard_rail", (0, 0.4, 0.55), (70, 0.06, 0.32), metal))
    for p in partes:
        p.parent = base
    # efeito de "panning": o cenario corre para tras enquanto o carro fica nitido (motion blur do Cycles)
    raiz = bpy.data.objects.new("Cenario_Raiz", None); linkar(raiz)
    for ob in list(bpy.data.collections["Cenario"].objects):
        if ob is not raiz and ob.parent is None:
            ob.parent = raiz
    for frame, y in ((0, -0.4), (2, 0.4)):
        raiz.location = (0, y, 0)
        raiz.keyframe_insert("location", index=1, frame=frame)
    return raiz


def configurar_cena(cfg, body=None):
    sc = bpy.context.scene
    usar_colecao("Camera_Luzes")
    pos, alvo, lente = VISTAS[cfg["vista"]]
    cam = bpy.data.cameras.new("Camera"); cam.lens = lente; cam.clip_end = 5000
    co = bpy.data.objects.new("Camera", cam); linkar(co)
    co.location = pos; mirar(co, alvo); sc.camera = co
    if cfg["vista"] == "foto" and body is not None:
        cam.dof.use_dof = True; cam.dof.focus_object = body; cam.dof.aperture_fstop = 1.4

    # ceu de fim de tarde: Nishita (sol baixo) + nuvens
    w = bpy.data.worlds.new("Ceu"); w.use_nodes = True; sc.world = w
    nt = w.node_tree; nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky"); sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(4.0); sky.sun_rotation = math.radians(24)          # direcao do sol = (sin rot, cos rot)
    sky.sun_size = math.radians(2.0); sky.sun_intensity = 1.8; sky.air_density = 1.7; sky.aerosol_density = 7.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1.0, 1.0, 3.2)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.4; nz.inputs["Detail"].default_value = 9.0; nz.inputs["Roughness"].default_value = 0.58
    rp = nt.nodes.new("ShaderNodeValToRGB")
    rp.color_ramp.elements[0].position = 0.48; rp.color_ramp.elements[1].position = 0.57
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    alt = nt.nodes.new("ShaderNodeMapRange")
    alt.inputs["From Min"].default_value = 0.03; alt.inputs["From Max"].default_value = 0.30
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 1.0
    mul2 = nt.nodes.new("ShaderNodeMath"); mul2.operation = "MULTIPLY"; mul2.inputs[1].default_value = 0.9
    esc = nt.nodes.new("ShaderNodeMix"); esc.data_type = "RGBA"; esc.blend_type = "MULTIPLY"
    esc.inputs[0].default_value = 1.0; esc.inputs[7].default_value = (0.55, 0.48, 0.55, 1.0)
    som = nt.nodes.new("ShaderNodeMix"); som.data_type = "RGBA"; som.blend_type = "ADD"
    som.inputs[0].default_value = 1.0; som.inputs[7].default_value = (0.020, 0.018, 0.026, 1.0)
    fin = nt.nodes.new("ShaderNodeMix"); fin.data_type = "RGBA"; fin.blend_type = "MIX"
    bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = 0.5
    out = nt.nodes.new("ShaderNodeOutputWorld")
    L = nt.links.new
    L(tc.outputs["Generated"], mp.inputs["Vector"]); L(mp.outputs["Vector"], nz.inputs["Vector"])
    L(nz.outputs["Fac"], rp.inputs["Fac"]); L(tc.outputs["Generated"], sep.inputs["Vector"])
    L(sep.outputs["Z"], alt.inputs["Value"]); L(rp.outputs["Color"], mul.inputs[0]); L(alt.outputs["Result"], mul.inputs[1])
    L(mul.outputs["Value"], mul2.inputs[0])
    L(sky.outputs["Color"], esc.inputs[6]); L(esc.outputs[2], som.inputs[6])
    L(sky.outputs["Color"], fin.inputs[6]); L(som.outputs[2], fin.inputs[7]); L(mul2.outputs["Value"], fin.inputs[0])
    L(fin.outputs[2], bg.inputs["Color"]); L(bg.outputs["Background"], out.inputs["Surface"])

    # luz de preenchimento quente (softbox)
    luz = bpy.data.lights.new("Preenchimento", "AREA")
    luz.shape = "RECTANGLE"; luz.size = 6.0; luz.size_y = 3.0; luz.energy = 300.0; luz.color = (1.0, 0.86, 0.7)
    lo = bpy.data.objects.new("Preenchimento", luz); linkar(lo)
    lo.location = (-5.5, -4.5, 2.4); mirar(lo, (0.0, -0.6, 0.7))


def compositor_brilho(forca=0.35):
    """brilho suave (fog glow) em torno do sol, dos faróis e dos reflexos fortes"""
    sc = bpy.context.scene
    try:
        ng = bpy.data.node_groups.new("Composicao", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        sal = ng.nodes.new("NodeGroupOutput")
        gl.inputs["Type"].default_value = "Fog Glow"
        gl.inputs["Threshold"].default_value = 1.2
        gl.inputs["Strength"].default_value = forca
        gl.inputs["Size"].default_value = 0.6
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"]); ng.links.new(gl.outputs["Image"], sal.inputs[0])
        sc.compositing_node_group = ng
    except Exception as e:
        print("compositor indisponivel:", e)


def configurar_render(cfg):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    try:
        pref = bpy.context.preferences.addons["cycles"].preferences
        pref.compute_device_type = "OPTIX"
        pref.get_devices()
        for d in pref.devices:
            d.use = d.type == "OPTIX"
        cy.device = "GPU"
    except Exception as e:
        print("GPU indisponivel, usando CPU:", e)
    if cfg["render"] == "final":
        sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
        cy.samples = 512
    else:
        sc.render.resolution_x, sc.render.resolution_y = 960, 540
        cy.samples = 64
    if cfg["amostras"]:
        cy.samples = cfg["amostras"]
    cy.use_denoising = True
    cy.max_bounces = 12; cy.transparent_max_bounces = 16
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    sc.render.image_settings.file_format = "PNG"
    if cfg["vista"] == "foto":
        sc.render.use_motion_blur = True
        sc.render.motion_blur_shutter = 0.5
        compositor_brilho()
    sc.frame_set(1)


# ----------------------------------------------------------------------------------------------
# Argumentos e main
# ----------------------------------------------------------------------------------------------
def ler_args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    cfg = {"render": "none", "vista": "foto", "saida": None, "amostras": None, "cenario": True}
    i = 0
    while i < len(a):
        if a[i] in ("--render", "--vista", "--saida"):
            cfg[a[i][2:]] = a[i + 1]; i += 2
        elif a[i] == "--amostras":
            cfg["amostras"] = int(a[i + 1]); i += 2
        elif a[i] == "--sem-cenario":
            cfg["cenario"] = False; i += 1
        else:
            i += 1
    return cfg


def main():
    cfg = ler_args()
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = criar_materiais()
    usar_colecao("Fusca_v2")
    car, body = construir_carroceria(mats)
    construir_tudo(car, body, mats)
    # tudo preso a um Empty: mover/girar/escalar o Fusca inteiro de uma vez
    raiz = bpy.data.objects.new("Fusca_v2", None); linkar(raiz)
    for ob in list(bpy.data.collections["Fusca_v2"].objects):
        if ob is not raiz and ob.parent is None:
            ob.parent = raiz
    if cfg["cenario"]:
        construir_cenario()
    configurar_cena(cfg, body)
    configurar_render(cfg)
    print("montagem em %.1fs" % (time.time() - t0))

    try:
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    except Exception as e:
        print("nao foi possivel limpar orfaos:", e)
    if not cfg["cenario"]:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, "fusca_v2_carro.blend"))
    elif cfg["vista"] == "foto":
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, "fusca_v2.blend"))
    if cfg["render"] != "none":
        os.makedirs(os.path.join(AQUI, "renders"), exist_ok=True)
        saida = cfg["saida"] or os.path.join(AQUI, "renders", "%s_%s.png" % (cfg["vista"], cfg["render"]))
        bpy.context.scene.render.filepath = saida
        bpy.ops.render.render(write_still=True)
        print("RENDER_OK", saida)


if __name__ == "__main__":
    main()
