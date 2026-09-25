"""V06 engine bay (photos carro_41, carro_42; also carro_1/4/23): Chevrolet 250 / Opala 4100 inline six with its
accessories, bay structure (firewall with tunnel and cowl plenum, aprons, rails, crossmember, radiator support),
radiator behind the grille, gearbox, driveshaft, rear axle and the exhaust run to the V05 tailpipe.

Engine frame: x along the crank (forward), origin on the crank axis at the block's rear face; the block is tilted 3
degrees nose-up like a real installation (the driveline falls toward the rear axle). Chevrolet 250: bore spacing
4.40 in (111.8 mm), deck 0.72 m long, crank-to-deck 236 mm; intake and exhaust both on the driver side (+Y),
distributor, plugs, starter and oil filter on the passenger side (-Y)."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from v06_comum import *

COLLECTOR,COLLECTOR_AXIS=(-.07,.24,-.11),Vector((-1,0,-.35)).normalized()   # headers merge here (engine frame)
X_REAR,Z_CRANK,TILT=1.13,.345,math.radians(3.)     # crank centre at the block rear face; front ends ~0.38 high
M_ENG=Matrix.Translation((X_REAR,0,Z_CRANK))@Matrix.Rotation(-TILT,4,'Y')
BORE=.1118;CYL=[.0805+i*BORE for i in range(6)];DECK=.236;L_BLOCK=.72
FIREWALL_X,PLENUM_Z,APRON_Y,SHELF_Z=.80,.76,.546,.80   # the apron top shelf sits just under the fender top (carro_41)
TUNNEL=dict(half=.13,h=.16,cy=-.06)                 # cabin tunnel = the game's cockpit tunnel (cockpit.js), dropped to the V06 floor
FLOOR_TOP=.217
def E(x,y,z):return tuple(M_ENG@Vector((x,y,z)))
_HOOD=[]
def shelf_z(x,s):
 """Apron shelf height: just under the fender top, but always 1.2 cm under the closed hood (its frame included)."""
 if not _HOOD:_HOOD.append(bvh([o for o in bpy.data.objects if o.name.startswith(('Capo_painel','Capo_estrutura_interna'))]))
 T=_HOOD[0]
 h=[ray_z(T,xx,s*y,down=False) for y in np.arange(.56,.81,.01) for xx in (x-.03,x,x+.03)]
 return min([SHELF_Z]+[z-.012 for z in h if z is not None])

def mats_engine(mats):
 m=material
 return {**mats,
  'bloco':m('Motor_laranja_Chevrolet',(122,30,20),metal=.05,rough=.6,coat=.1),     # deep, dirty Chevrolet red (carro_41/42)
  'tampa':m('Aluminio_polido_tampa',(196,198,200),metal=1.,rough=.3),             # finned valve cover (satin, dusty)
  'fundido':m('Aluminio_fundido',(97,97,94),metal=.4,rough=.7),                    # dirty cast aluminium: bellhousing, gearbox, pump
  'escape':m('Escape_bronze_temperado',(.24,.18,.12),metal=.45,rough=.7,linear=True),  # dusty tan-bronze headers (carro_41/42)
  'mangueira_brilho':m('Mangueira_borracha_brilhante',(12,12,13),rough=.22,coat=.4),   # the big upper radiator hose
  'trancada':m('Mangueira_trancada_prata',(188,188,192),metal=.8,rough=.45),       # braided steel hose
  'aco_nu':m('Aco_nu',(168,170,174),metal=.9,rough=.35),                            # bare booster and master cylinder
  'escape_frio':m('Escape_aco_oxidado',(66,58,52),metal=.5,rough=.65),
  'mangueira':m('Mangueira_borracha',(14,14,15),rough=.7),
  'verde':m('Mangueira_trancada_verde',(66,150,112),metal=.3,rough=.5),
  'fio_verm':m('Fio_vermelho',(170,14,14),rough=.5),
  'azul':m('Tampa_azul',(18,74,196),rough=.35,coat=.5),
  'translucido':m('Plastico_translucido_branco',(222,220,210),rough=.35,alpha=.82),
  'preto_fosco':m('Plastico_preto_fosco',(20,20,22),rough=.75),
  'filtro_oleo':m('Filtro_oleo_azul',(20,40,120),metal=.3,rough=.4),
  'correia':m('Correia_borracha',(24,24,24),rough=.9),
  'radiador':radiator_material()}

def radiator_material():
 """Radiator core: fine vertical fins and tubes as a packed texture (no geometry per fin)."""
 if 'Colmeia_radiador' in bpy.data.materials:return bpy.data.materials['Colmeia_radiador']
 h,w=64,256;x=np.arange(w);fin=(x%4<2).astype(float)*.35+.25;tube=np.zeros(h);tube[(np.arange(h)%16)<3]=1
 v=np.clip(fin[None,:]*(1-tube[:,None])+tube[:,None]*.12,0,1);img=np.stack([v*.52,v*.54,v*.55,np.ones_like(v)],-1)
 return material('Colmeia_radiador',(120,122,124),metal=.7,rough=.5,image=image_from_array('radiador_colmeia',img))

def build(mats):
 k=mats_engine(mats)
 for n in ('Corta_fogo_dianteiro_V04','Parede_frontal'):remove(n)
 bay_structure(k)
 radiator(k)
 motor=pivot('Motor_CONJUNTO',E(.36,0,0),'motor','',0.,
  'Motor Chevrolet 250 (4100) seis em linha com cambio, coletores e acessorios; vazio estatico para esconder ou vibrar.',collection='09_Motor')
 engine(k,motor)
 accessories(k)
 driveline(k)
 exhaust(k)
 return motor

# ---------------------------------------------------------------- bay structure
# Opening over the front suspension in the wheel-well wall and in the apron: x 1.37-1.74 up to z 0.58, its upper
# corners rounded (r 8 cm) like a pressed opening, not a sawn rectangle.
WELL,WELL_TOP,WELL_R=(1.37,1.74),.58,.08
def apron_low(x):
 """Lower edge of the apron wall at x: the frame rail (0.24), or the rounded top of the suspension opening."""
 a,b=WELL
 if not a<x<b:return .24
 d=max(0.,WELL_R-min(x-a,b-x))
 return WELL_TOP-WELL_R+math.sqrt(max(WELL_R*WELL_R-d*d,0.)) if d>0 else WELL_TOP
def bay_structure(k):
 O=bpy.data.objects;floor=O['Assoalho_continuo_V04']
 # Floor: no floor pan under the engine; slots for the gearbox tunnel and over the rear axle (kick-up).
 for lo,hi in (((FIREWALL_X-.003,-APRON_Y,-.1),(2.6,APRON_Y,.4)),((.40,-.16,-.1),(FIREWALL_X+.01,.12,.4)),((-.985,-.17,-.1),(.42,.06,.4)),((-1.45,-.515,-.1),(-.985,.515,.4))):
  c=box_cutter('CUT_floor',lo,hi);boolean(floor,c,'DIFFERENCE');remove(c)
 # (slot edges stay 1 cm inside the tunnel and pan walls, so no slit opens between floor and wall)
 S=k['estrutura'];P=Part('Estrutura_cofre_V06','06_Fechamentos_estruturais_V04',None,smooth=30)
 # Firewall: vertical face at the cabin's pedal box (x 0.80, as in the game cockpit), sloping up to the windscreen
 # base, with the mouth of the gearbox tunnel.
 W=.70
 prof=[(FIREWALL_X,FLOOR_TOP),(FIREWALL_X,.70),(.86,.78),(.935,.872)]
 def tunnel_hole(y):return .47 if abs(y+.02)<.15 else None
 ys=np.linspace(-W,W,57);V=[];F=[]
 for i,(x,z) in enumerate(prof):
  for y in ys:
   th=tunnel_hole(y);zz=max(z,th) if (th and i==0) else z
   V.append((x,y,zz))
 n=len(ys)
 for i in range(len(prof)-1):
  for j in range(n-1):F.append((i*n+j,i*n+j+1,(i+1)*n+j+1,(i+1)*n+j))
 P.mesh(S,V,F,outward=(1,0,0))
 # Gearbox tunnel from the firewall back to x 0.26 (wider and taller than the cabin tunnel), then the cabin tunnel.
 def tunnel_section(x):
  t=np.clip((x-.26)/(.42-.26),0,1)
  half=TUNNEL['half']+t*(.15-TUNNEL['half']);cy=TUNNEL['cy']+t*(-.02-TUNNEL['cy'])
  top=FLOOR_TOP+TUNNEL['h']+t*(.468-FLOOR_TOP-TUNNEL['h'])
  pts=[]
  for a in np.linspace(math.pi,0,13):
   r=.055;pts.append((cy+half*math.cos(a),top-r+r*math.sin(a)))
  return [(cy-half,FLOOR_TOP-.004)]+pts+[(cy+half,FLOOR_TOP-.004)]
 xs=list(np.linspace(FIREWALL_X,.42,6))+list(np.linspace(.40,-.975,24));V=[];F=[]
 for x in xs:V+=[(x,y,z) for y,z in tunnel_section(x)]
 m=len(tunnel_section(0))
 for i in range(len(xs)-1):
  for j in range(m-1):F.append((i*m+j,i*m+j+1,(i+1)*m+j+1,(i+1)*m+j))
 P.mesh(S,V,F,outward=lambda c:Vector((0,c.y+.03,c.z-.2)))
 # Rear kick-up over the axle: heel riser, seat pan at the game's pan height and a hump for the differential.
 PAN,PW=.387,.525                                   # the V05 rear wheel-well plates and bulkhead close its sides and back
 P.mesh(S,[(-.975,-PW,FLOOR_TOP),(-.975,PW,FLOOR_TOP),(-.975,PW,PAN),(-.975,-PW,PAN)],[(0,1,2,3)],outward=(1,0,0))
 ys=np.linspace(-PW,PW,31);xs=np.linspace(-.975,-1.452,21);V=[]
 for x in xs:
  for y in ys:
   d=math.hypot((x+1.117)/.20,y/.19);hump=.10*max(0,1-d*d)**.5
   V.append((x,y,PAN+hump))
 P.mesh(S,V,grid_faces(len(xs),len(ys)),outward=(0,0,1))
 P.build()
 # Bay: plenum tray under the cowl, inner fender aprons with the upper-arm turrets, frame rails, crossmember and the
 # radiator support. Gloss black like the body (carro_41/42).
 B=Part('Cofre_motor','08_Cofre_do_motor',None,smooth=35);pin=k['pintura']
 B.mesh(pin,[(.84,-.28,PLENUM_Z),(1.10,-.28,PLENUM_Z),(1.10,.28,PLENUM_Z),(.84,.28,PLENUM_Z)],[(0,1,2,3)],outward=(0,0,1))
 B.mesh(pin,[(1.10,-.28,PLENUM_Z),(1.10,.28,PLENUM_Z),(1.10,.28,.80),(1.10,-.28,.80)],[(0,1,2,3)],outward=(1,0,0))
 for s in (-1,1):
  # apron wall from the frame rail up to the shelf under the fender top, and the shelf out to the fender
  # (inside the wheel well the V05 well wall is the apron: the bay's wall stays 12 mm inboard of it, and over the
  # suspension it only comes down to the upper arm's mount)
  xs=np.unique(np.r_[np.linspace(FIREWALL_X,2.12,40),np.linspace(WELL[0],WELL[1],25)]);zs=np.linspace(0,1,10)
  V=[]
  for x in xs:V+=[(x,s*(APRON_Y-.018),apron_low(x)+(shelf_z(max(x,.965),s)-apron_low(x))*t) for t in zs]
  B.mesh(pin,V,grid_faces(len(xs),len(zs)),outward=(0,-s,0))
  xs=np.linspace(.965,2.12,26);ys=np.linspace(APRON_Y,.80,6);V=[(x,s*y,shelf_z(x,s)) for x in xs for y in ys]   # starts ahead of the door
  B.mesh(pin,V,grid_faces(len(xs),len(ys)),outward=(0,0,1))
  # spring tower: a pressed drum on the apron with a domed top, the shock's nut and three bolts (carro_41)
  ty=s*(APRON_Y-.03)
  B.lathe(pin,[(.078,.0),(.078,.17),(.070,.20),(.050,.215),(.0,.22)],(1.555,ty,.55),(0,0,1),28)
  B.cyl(k['aco'],(1.555,ty,.768),(1.555,ty,.782),.012,8)
  for a in range(3):B.cyl(k['aco'],(1.555+.034*math.cos(2*math.pi*a/3),ty+.034*math.sin(2*math.pi*a/3),.764),(1.555+.034*math.cos(2*math.pi*a/3),ty+.034*math.sin(2*math.pi*a/3),.772),.007,6)
  B.box(pin,(1.555,s*(APRON_Y-.018),.57),(.20,.012,.05),.006,2)               # upper-arm mount on the apron
  B.box(k['aco_escuro'],(1.48,s*.40,.235),(1.36,.06,.09),.008,2)              # frame rail
  if s>0:                                                                  # driver apron: stamped recess with 4 bolts
   rx,rz=1.25,.60
   B.mesh(pin,[(rx+dx,s*(APRON_Y-.028),rz+dz) for dx,dz in ((-.10,-.06),(.10,-.06),(.10,.06),(-.10,.06))],[(0,1,2,3)],outward=(0,-s,0))
   for dx,dz,w,h in ((0,-.065,.21,.01),(0,.065,.21,.01),(-.105,0,.01,.14),(.105,0,.01,.14)):B.box(pin,(rx+dx,s*(APRON_Y-.024),rz+dz),(w,.012,h),.003)
   for dx,dz in ((-.085,-.045),(.085,-.045),(.085,.045),(-.085,.045)):B.cyl(k['aco'],(rx+dx,s*(APRON_Y-.03),rz+dz),(rx+dx,s*(APRON_Y-.036),rz+dz),.008,6)
 B.box(k['aco_escuro'],(1.555,0,.185),(.12,.86,.07),.01,2)                  # front crossmember under the sump
 front_suspension(k)
 # radiator support: top bar under the header panel, side posts, bottom bar
 B.box(pin,(2.14,0,.72),(.05,1.46,.045),.008,2)
 for s in (-1,1):B.box(pin,(2.14,s*.447,.49),(.05,.05,.46),.008,2)
 B.box(pin,(2.14,0,.27),(.05,.94,.05),.008,2)
 # flat top plate of the radiator support behind the eletric panel, with its two bolts (carro_41/42)
 B.box(pin,(2.117,0,.7425),(.115,1.30,.015),.004,1)
 for y in (-.25,.25):B.cyl(k['aco'],(2.10,y,.75),(2.10,y,.756),.011,6)
 # back wall of the eletric header panel, down to that plate: seen from above it reads as the deep panel of carro_41
 Th=bvh(bpy.data.objects['Painel_frontal_superior']);ys=np.linspace(-.64,.64,33);V=[]
 for y in ys:
  zt=ray_z(Th,2.182,y,down=False);V+=[(2.18,y,.748),(2.18,y,(zt or .79)-.002)]
 B.mesh(pin,V,grid_faces(len(ys),2),outward=(-1,0,0))
 # splash shields low in the bay: the ground under the car no longer shows beside the engine. They stop behind
 # the front suspension crossbar (x 1.85): further forward they stuck out under the nose like two flaps.
 for s in (-1,1):B.box(k['aco_escuro'],(1.345,s*.41,.14),(.99,.27,.006),.003,1)
 B.box(k['aco_escuro'],(1.91,0,.20),(.38,.60,.006),.003,1)
 B.build()

def front_suspension(k):
 """Double wishbones with coil springs over the lower arms, shocks inside the springs, uprights with their spindles
 into the hubs, the steering's centre link and tie rods, and the sway bar in front of the crossmember: seen from
 below and through the wheel wells (the V05 well walls get an opening over them)."""
 S=Part('Suspensao_dianteira','08_Cofre_do_motor',None,smooth=35);bk=k['aco_escuro']
 for s in (-1,1):
  lb,ub=(1.55,s*.64,.19),(1.56,s*.625,.525)                               # lower and upper ball joints
  for x in (1.44,1.67):S.sweep(bk,[(x,s*.43,.215),((x+1.55)/2,s*.55,.20),lb],.016,8)   # lower A-arm
  S.box(bk,(1.555,s*.52,.203),(.13,.12,.008),.003)                         # spring seat on it
  for x in (1.48,1.63):S.sweep(bk,[(x,s*(APRON_Y-.02),.57),((x+1.56)/2,s*.59,.545),ub],.012,8)   # upper A-arm
  for p in (lb,ub):S.lathe(bk,[(.0,-.018),(.022,-.015),(.024,.0),(.022,.015),(.0,.018)],p,(0,0,1),14)
  S.sweep(bk,[lb,(1.555,s*.655,.30),(1.558,s*.645,.43),ub],.02,10)          # upright
  S.cyl(k['aco'],(1.55,s*.655,.316),(1.55,s*.84,.316),.02,14)               # spindle into the hub
  S.sweep(bk,[(1.55,s*.645,.28),(1.62,s*.64,.26),(1.68,s*.62,.25)],.011,8)   # steering arm, forward of the axle
  S.sweep(k['aco'],[(1.68,s*.61,.25),(1.68,s*.45,.20),(1.68,s*.31,.17)],.011,8)   # tie rod down to the centre link
  coil=[(1.555+.055*math.cos(a),s*.52+.055*math.sin(a),.21+.26*a/(12*math.pi)) for a in np.linspace(0,12*math.pi,180)]
  S.sweep(k['aco_escuro'],coil,.0075,6,samples=180)                         # coil spring
  S.cyl(k['aco'],(1.555,s*.52,.215),(1.555,s*.52,.55),.018,12)              # shock inside it
  S.cyl(bk,(1.555,s*.52,.215),(1.555,s*.52,.36),.026,12)
  S.sweep(bk,[(1.95,s*.40,.17),(1.84,s*.50,.18),(1.66,s*.58,.195)],.011,8)   # sway-bar arm back to the lower arm
  S.cyl(bk,(1.66,s*.58,.205),(1.66,s*.58,.17),.008,8)
 S.cyl(bk,(1.95,-.40,.17),(1.95,.40,.17),.011,12)                           # sway bar across the front, under the pan's nose
 S.cyl(bk,(1.68,-.31,.17),(1.68,.31,.17),.014,12)                           # centre link, under the sump
 S.sweep(bk,[(1.68,.31,.17),(1.73,.36,.23),(1.79,.40,.29)],.013,8)            # pitman arm up to the steering box
 S.box(bk,(1.80,.40,.33),(.10,.08,.09),.012,2)                              # steering box on the driver frame rail
 S.build()
 # openings in the V05 wheel-well walls over the suspension
 for s,side in ((1,'Motorista'),(-1,'Passageiro')):
  c=prism('CUT_well',rounded_rect((WELL[0]+WELL[1])/2,(.12+WELL_TOP+.02)/2,WELL[1]-WELL[0],WELL_TOP+.02-.12,WELL_R,6),'Y',min(s*.50,s*.58),max(s*.50,s*.58))
  for n in ('Fundo_caixa_roda_'+side,'Retorno_soleira_'+side.lower()):
   o=bpy.data.objects.get(n)
   if o:boolean(o,c,'DIFFERENCE')
  remove(c)

def radiator(k):
 R=Part('Radiador','08_Cofre_do_motor',None,smooth=30)
 # core with UVs so the fin texture reads at its real size
 xs=2.10;ys=np.linspace(-.37,.37,2);zs=np.linspace(.31,.67,2)
 for x,flip in ((xs+.025,False),(xs-.025,True)):
  V=[(x,y,z) for y in ys for z in zs];me_uv=[((y+.37)/.74*8,(z-.31)/.36*2) for y in ys for z in zs]
  o=new_mesh('Radiador_colmeia'+('_tras' if flip else ''),V,grid_faces(2,2,flip),k['radiador'],'08_Cofre_do_motor',uv=me_uv,outward=(-1 if flip else 1,0,0))
 for s in (-1,1):R.box(k['preto_fosco'],(xs,s*.395,.49),(.07,.05,.42),.01,2)   # end tanks
 R.box(k['aluminio'],(xs,0,.685),(.06,.80,.03),.005,1);R.box(k['aluminio'],(xs,0,.295),(.06,.80,.03),.005,1)
 R.cyl(k['aluminio'],(xs-.01,.39,.64),(xs-.07,.39,.64),.028,14)              # inlet (upper hose), driver side
 R.cyl(k['aluminio'],(xs-.01,-.39,.35),(xs-.07,-.39,.35),.021,14)            # outlet (lower hose)
 R.cyl(k['cromado'],(xs,.395,.705),(xs,.395,.725),.02,14)                     # cap on the inlet tank
 # electric puller fan in a shroud behind the core
 R.box(k['preto_fosco'],(2.055,0,.49),(.03,.60,.36),.01,2)
 R.cyl(k['preto_fosco'],(2.03,0,.49),(2.04,0,.49),.155,32)
 R.cyl(k['aco_escuro'],(2.00,0,.49),(2.03,0,.49),.05,20)
 for a in range(7):
  ang=2*math.pi*a/7;R.box(k['preto_fosco'],(2.035,.09*math.cos(ang),.49+.09*math.sin(ang)),(.008,.05,.12),.002,M=Matrix.Rotation(ang,4,'X'))
 R.build()

# ---------------------------------------------------------------- engine
def engine(k,motor):
 P=Part('Motor','09_Motor',motor,M=M_ENG,smooth=32);b=k['bloco']
 # block: deck, skirt down to the pan rail, water jacket bulges per cylinder, front and rear faces
 P.box(b,(L_BLOCK/2,0,DECK-.08),(L_BLOCK,.21,.16),.012,2)
 P.box(b,(L_BLOCK/2,0,.06),(L_BLOCK,.26,.14),.015,2)
 P.box(b,(L_BLOCK/2,0,-.045),(L_BLOCK+.01,.30,.05),.01,2)
 for x in CYL:
  for s in (-1,1):P.cyl(b,(x,s*.10,.08),(x,s*.10,.20),.045,16)
 P.box(b,(L_BLOCK/2,-.135,.13),(.46,.02,.08),.008,2)                     # pushrod side cover (passenger side)
 for x in np.linspace(.17,.55,4):P.cyl(k['aco'],(x,-.146,.13),(x,-.152,.13),.006,6)
 # cylinder head and head bolts' bosses, spark plugs on the passenger side
 P.box(b,(L_BLOCK/2,0,DECK+.05),(L_BLOCK+.01,.225,.10),.01,2)
 for x in CYL:P.cyl(k['aco'],(x,-.105,DECK+.03),(x,-.15,DECK+.02),.009,8);P.cyl(k['fio_verm'],(x,-.15,DECK+.02),(x,-.20,DECK+.012),.011,10)
 # valve cover: polished finned aluminium, oil filler with a blue top near the front (carro_41/42)
 vc=k['tampa']
 P.box(vc,(L_BLOCK/2,0,DECK+.10+.012),(.68,.18,.024),.006,2)
 P.box(vc,(L_BLOCK/2,0,DECK+.10+.045),(.66,.16,.05),.02,3)
 for y in np.linspace(-.06,.06,7):P.box(vc,(L_BLOCK/2-.03,y,DECK+.10+.074),(.52,.007,.012),.003,1)
 for x in np.linspace(.05,.67,8):P.cyl(k['cromado'],(x,.083,DECK+.113),(x,.083,DECK+.125),.006,8);P.cyl(k['cromado'],(x,-.083,DECK+.113),(x,-.083,DECK+.125),.006,8)
 P.cyl(vc,(.60,-.03,DECK+.16),(.60,-.03,DECK+.185),.028,20)
 P.cyl(k['azul'],(.60,-.03,DECK+.185),(.60,-.03,DECK+.2),.032,20)
 P.box(k['cromado'],(.36,0,DECK+.172),(.12,.05,.004),.001)                # badge plate
 # front: timing cover, damper and pulley, water pump with its pulley, thermostat housing
 P.box(b,(L_BLOCK+.012,0,.03),(.025,.20,.20),.02,3)
 P.cyl(k['aco_escuro'],(L_BLOCK+.02,0,0),(L_BLOCK+.06,0,0),.085,32);P.cyl(k['aco'],(L_BLOCK+.06,0,0),(L_BLOCK+.07,0,0),.03,16)
 P.cyl(k['fundido'],(L_BLOCK+.01,0,.155),(L_BLOCK+.09,0,.155),.06,20)
 P.cyl(k['aco'],(L_BLOCK+.09,0,.155),(L_BLOCK+.10,0,.155),.075,32);P.cyl(k['aco_escuro'],(L_BLOCK+.10,0,.155),(L_BLOCK+.105,0,.155),.03,16)
 P.cyl(k['fundido'],(L_BLOCK+.005,-.03,DECK+.06),(L_BLOCK+.05,-.03,DECK+.07),.024,14)
 # alternator on the passenger side, belt round crank, pump and alternator pulleys
 P.cyl(k['fundido'],(L_BLOCK-.13,-.17,.13),(L_BLOCK+.03,-.17,.13),.062,24)
 for a in range(10):ang=2*math.pi*a/10;P.box(k['fundido'],(L_BLOCK-.05,-.17+.062*math.cos(ang),.13+.062*math.sin(ang)),(.14,.008,.008),.001)
 P.cyl(k['aco'],(L_BLOCK+.03,-.17,.13),(L_BLOCK+.045,-.17,.13),.035,20)
 P.box(k['aco_escuro'],(L_BLOCK-.03,-.10,.13),(.04,.10,.025),.004)          # adjuster bracket
 path=[(L_BLOCK+.052,.0,-.089),(L_BLOCK+.052,.089,0),(L_BLOCK+.052,.075,.155+.03),(L_BLOCK+.052,.0,.155+.079),(L_BLOCK+.052,-.06,.21),
  (L_BLOCK+.052,-.17,.17),(L_BLOCK+.052,-.205,.13),(L_BLOCK+.052,-.17,.09),(L_BLOCK+.052,-.07,-.07),(L_BLOCK+.052,.0,-.089)]
 P.sweep(k['correia'],path,.006,6,samples=90,caps=False)
 # distributor (passenger side, mid block) with its cap and plug leads; coil
 dx,dy,dz=.40,-.165,.15
 P.cyl(k['fundido'],(dx,-.13,dz-.06),(dx,dy,dz+.08),.028,16)
 P.cyl(k['preto_fosco'],(dx,dy,dz+.08),(dx,dy-.01,dz+.14),.048,20)
 for i,x in enumerate(CYL):
  a=2*math.pi*i/6;tx,ty=dx+.032*math.cos(a),dy-.01+.032*math.sin(a)
  P.cyl(k['preto_fosco'],(tx,ty,dz+.14),(tx,ty,dz+.16),.008,8)
  P.sweep(k['fio_verm'],[(tx,ty,dz+.16),(tx+(x-dx)*.3,ty-.02,dz+.20),((x+dx)/2,-.20,DECK+.03),(x,-.205,DECK+.012)],.0045,6,samples=24)
 P.cyl(k['aco_escuro'],(.52,-.20,.22),(.52,-.20,.34),.03,16)                  # coil on the block side
 P.sweep(k['fio_verm'],[(.52,-.20,.34),(.48,-.22,.36),(dx,dy-.01,dz+.165)],.005,6)
 # starter and oil filter low on the passenger side, oil pan with a rear sump
 P.cyl(k['aco_escuro'],(-.03,-.15,-.03),(.16,-.15,-.03),.052,20);P.cyl(k['aco'],(.16,-.15,-.03),(.19,-.15,-.03),.03,12)
 P.cyl(k['filtro_oleo'],(.17,-.14,.0),(.19,-.23,-.08),.047,20)
 P.box(k['aco_escuro'],(.18,0,-.15),(.34,.26,.16),.02,3);P.box(k['aco_escuro'],(.53,0,-.10),(.38,.26,.06),.02,3)
 P.box(k['aco_escuro'],(L_BLOCK/2,0,-.075),(L_BLOCK+.01,.31,.012),.003)       # pan rail flange
 # intake log with the carburettor and a low air filter (driver side), fuel line
 P.sweep(k['fundido'],[(.06,.155,DECK+.07),(.36,.165,DECK+.075),(.66,.155,DECK+.07)],.034,14)
 for x in CYL[::2]:P.cyl(k['fundido'],(x+BORE/2,.11,DECK+.07),(x+BORE/2,.16,DECK+.07),.025,12)
 P.cyl(k['fundido'],(.36,.17,DECK+.09),(.36,.17,DECK+.125),.04,16)
 P.box(k['fundido'],(.36,.17,DECK+.16),(.10,.095,.07),.012,2)
 P.cyl(k['preto_fosco'],(.36,.17,DECK+.195),(.36,.17,DECK+.24),.085,32)
 P.cyl(k['cromado'],(.36,.17,DECK+.24),(.36,.17,DECK+.244),.02,12)
 P.box(k['aco'],(.30,.23,DECK+.14),(.03,.02,.03),.004)                       # throttle linkage
 # small parts that make it read as a working 250: freeze plugs, dipstick with its yellow handle, mechanical fuel
 # pump, starter solenoid, temperature sender, lifting eye, breather fittings on the valve cover, plug-wire looms,
 # carburettor fuel inlet and choke housing, header flange bolts and the collector clamp
 for x in (.15,.36,.57):
  for s in (-1,1):P.cyl(k['aco'],(x,s*.128,.07),(x,s*.136,.07),.02,16)
 P.cyl(k['aco'],(.47,-.15,-.06),(.47,-.17,DECK+.10),.005,8);P.sweep(k['aco'],[(.47,-.17,DECK+.10),(.47,-.185,DECK+.15),(.48,-.19,DECK+.17)],.005,8)
 P.box(material('Alca_amarela',(232,190,20),rough=.5),(.48,-.19,DECK+.185),(.035,.012,.025),.005,2)
 P.cyl(k['fundido'],(.63,-.13,-.02),(.63,-.19,-.02),.035,16);P.cyl(k['aco'],(.63,-.19,-.02),(.63,-.20,-.02),.02,12)
 P.sweep(k['aco'],[(.63,-.20,.0),(.73,-.19,.12),(.78,-.05,DECK+.02),(.75,.12,DECK+.03),(.55,.19,DECK+.08),(.40,.228,DECK+.155)],.0035,6,samples=40)
 P.cyl(k['aco_escuro'],(.02,-.105,.03),(.13,-.105,.03),.022,14)
 P.cyl(k['cromado'],(.70,.06,DECK+.08),(.70,.09,DECK+.08),.009,8)
 P.box(k['aco_escuro'],(.69,0,DECK+.12),(.012,.06,.05),.004)
 for x in (.10,.55):P.cyl(vc,(x,-.05,DECK+.165),(x,-.05,DECK+.185),.009,10)
 for x in (.19,.43):
  P.box(k['preto_fosco'],(x,-.19,DECK+.035),(.02,.03,.035),.004)
 P.cyl(k['aco'],(.40,.23,DECK+.155),(.40,.26,DECK+.155),.006,8)
 P.box(k['fundido'],(.36,.225,DECK+.185),(.03,.01,.03),.004)
 for x in CYL:
  for dx in (-.04,.04):P.cyl(k['aco'],(x+dx,.112,DECK+.005),(x+dx,.12,DECK+.005),.006,6)
 # engine mounts to the frame rails
 for s in (-1,1):
  P.box(k['aco_escuro'],(.46,s*.175,.02),(.08,.06,.06),.006,2);P.box(k['borracha_pneu'],(.46,s*.23,-.02),(.07,.05,.05),.01,2)
  P.sweep(k['aco_escuro'],[(.46,s*.25,-.03),(.46,s*.32,-.07),(.44,s*.40,-.08)],.014,8)
 # bellhousing and the four-speed gearbox with its tail housing
 P.lathe(k['fundido'],[(.0,-.005),(.21,-.005),(.20,-.08),(.17,-.18),(.13,-.25),(.0,-.25)],(0,0,0),(1,0,0),28)
 P.lathe(k['fundido'],[(.0,-.25),(.105,-.25),(.11,-.30),(.105,-.52),(.075,-.58),(.055,-.70),(.052,-.86),(.0,-.86)],(0,0,0),(1,0,0),20)
 P.box(k['fundido'],(-.42,0,-.07),(.22,.20,.05),.01,2)                        # gearbox sump/side cover
 P.box(k['fundido'],(-.52,0,.10),(.10,.10,.06),.01,2)                         # shift tower
 P.build()
 # Headers: six primaries from the driver-side ports, down along the block into a collector (heat-tinted bronze).
 H=Part('Motor_coletores_escape','09_Motor',motor,M=M_ENG,smooth=40)
 for i,x in enumerate(CYL):
  j=i/5.;drop=.05+.03*(1-abs(i-2.5)/2.5)
  pts=[(x,.108,DECK+.028),(x,.15,DECK+.0),(x-.01,.205,DECK-.05),(x-.03-.02*j,.24-.012*(i%2),.10),(x*.55-.03,.26-.015*(i%2),-.02),(-.02,.245,-.085),(-.07,.24,-.11)]
  H.sweep(k['escape'],pts,.0195,12,samples=56)
  H.cyl(k['escape'],(x,.105,DECK+.028),(x,.12,DECK+.028),.028,12)
 H.box(k['escape'],(L_BLOCK/2,.108,DECK+.028),(.66,.012,.05),.004)           # flange
 H.lathe(k['escape'],[(.0,0),(.062,0),(.055,.05),(.038,.11),(.0,.11)],COLLECTOR,COLLECTOR_AXIS,24)
 H.lathe(k['aco'],[(.064,.035),(.068,.035),(.068,.05),(.064,.05)],COLLECTOR,COLLECTOR_AXIS,24)   # collector clamp
 H.build()

def accessories(k):
 """Body-mounted parts around the engine (fixed, they do not shake with it)."""
 A=Part('Cofre_acessorios','08_Cofre_do_motor',None,smooth=35)
 th=E(L_BLOCK+.05,-.03,DECK+.07);wp=E(L_BLOCK+.02,-.06,.10)
 # big gloss-black upper hose (58 mm) arching from the thermostat housing over to the driver-side radiator inlet, as
 # in carro_42; the lower hose runs from the pump to the outlet low on the passenger side
 A.sweep(k['mangueira_brilho'],[th,(th[0]+.035,.0,th[2]+.035),(th[0]+.08,.14,th[2]+.045),(1.98,.30,.66),(2.03,.39,.64)],.029,16,samples=44)
 A.sweep(k['mangueira'],[wp,(wp[0]+.04,-.05,wp[2]-.06),(1.99,-.30,.36),(2.03,-.39,.35)],.022,14,samples=36)
 for p in ((2.03,.39,.64),(2.03,-.39,.35)):A.cyl(k['aco'],(p[0]-.012,p[1],p[2]),(p[0]+.012,p[1],p[2]),.033,12)   # clamps
 A.cyl(k['aco'],(th[0]-.002,th[1],th[2]),(th[0]+.02,th[1],th[2]),.033,12)
 # coolant overflow bottle, translucent white with a blue cap, passenger side front (carro_41/42)
 ox,oy=1.98,-.46
 A.box(k['translucido'],(ox,oy,.62),(.11,.09,.15),.03,3)
 A.cyl(k['translucido'],(ox,oy,.695),(ox,oy,.715),.02,14);A.cyl(k['azul'],(ox,oy,.715),(ox,oy,.735),.025,16)
 A.box(k['aco_escuro'],(ox,oy+.05,.58),(.09,.01,.08),.003)
 A.sweep(k['translucido'],[(ox,oy,.70),(ox+.04,oy+.03,.72),(2.06,-.10,.715),(2.07,.25,.715),(2.08,.395,.73)],.005,6)
 # black catch-can with green braided breathers and red wires, passenger side toward the firewall
 cx,cy=1.20,-.37
 A.box(k['preto_fosco'],(cx,cy,.70),(.13,.09,.16),.012,2)
 for dy in (-.025,.025):A.cyl(k['aco'],(cx,cy+dy,.78),(cx,cy+dy,.795),.01,10)
 vc_rear=E(.10,-.05,DECK+.19);vc_front=E(.55,-.05,DECK+.19)          # onto the breather fittings' tops
 A.sweep(k['verde'],[(cx,cy-.025,.795),(cx+.03,cy+.02,.815),(cx+.10,-.17,.81),vc_front],.011,10,samples=30)
 A.sweep(k['verde'],[(cx,cy+.025,.795),(cx-.02,cy+.08,.81),(1.17,-.12,.80),vc_rear],.011,10,samples=30)
 A.sweep(k['trancada'],[(cx+.05,cy+.03,.78),(cx+.08,cy+.09,.80),(1.30,-.14,.78),E(.30,-.05,DECK+.19)],.008,10,samples=30)
 A.sweep(k['fio_verm'],[(cx-.06,cy,.72),(1.10,-.30,.70),(1.02,-.20,.72),(.99,-.10,.74)],.005,6)
 # wiring looms taped along both aprons and across the firewall, held by clips (carro_41/42)
 for s in (-1,1):
  loom=[(FIREWALL_X+.012,s*.46,.68),(1.00,s*(APRON_Y-.012),.69),(1.30,s*(APRON_Y-.012),.672),(1.75,s*(APRON_Y-.012),.668),(2.06,s*(APRON_Y-.015),.66)]
  A.sweep(k['preto_fosco'],loom,.0095,8,samples=40)
  A.sweep(k['preto_fosco'],[(p[0],p[1]-s*.012,p[2]-.018) for p in loom[1:]],.005,6,samples=30)
  for x in (1.05,1.40,1.70,1.98):A.box(k['aco_escuro'],(x,s*(APRON_Y-.004),.68),(.02,.008,.04),.002)
 A.sweep(k['preto_fosco'],[(FIREWALL_X+.013,-.46,.68),(FIREWALL_X+.013,-.20,.69),(FIREWALL_X+.013,.10,.692),(FIREWALL_X+.013,.46,.68)],.008,8,samples=30)
 A.sweep(k['fio_verm'],[(cx+.06,cy,.66),(1.35,-.30,.60),E(.50,-.21,.34)],.005,6)
 # brake master cylinder and booster on the driver side firewall; clutch master beside it
 A.cyl(k['aco_nu'],(FIREWALL_X+.005,.40,.62),(FIREWALL_X+.085,.40,.62),.105,32)
 A.lathe(k['aco_nu'],[(.105,0),(.098,.008),(.07,.014),(.0,.016)],(FIREWALL_X+.085,.40,.62),(1,0,0),32)   # booster's domed face
 A.cyl(k['aco_nu'],(FIREWALL_X+.095,.40,.64),(FIREWALL_X+.23,.40,.64),.03,16)
 for dz in (-.05,.05):A.cyl(k['aco'],(FIREWALL_X+.086,.40+dz,.62),(FIREWALL_X+.1,.40+dz,.62),.008,8)       # mounting studs
 for dx in (.12,.19):A.cyl(k['translucido'],(FIREWALL_X+dx,.40,.67),(FIREWALL_X+dx,.40,.715),.022,14);A.cyl(k['preto_fosco'],(FIREWALL_X+dx,.40,.715),(FIREWALL_X+dx,.40,.73),.024,14)
 A.cyl(k['fundido'],(FIREWALL_X+.005,.26,.60),(FIREWALL_X+.12,.26,.60),.022,14)
 A.cyl(k['translucido'],(FIREWALL_X+.07,.26,.625),(FIREWALL_X+.07,.26,.665),.018,12)
 A.sweep(k['aco'],[(FIREWALL_X+.20,.37,.62),(FIREWALL_X+.25,.30,.52),(FIREWALL_X+.3,.46,.40),(1.4,APRON_Y-.01,.40)],.0035,6)
 # the clutter of a working bay: headlight loom along the passenger apron, brake lines to the front wheels, braided
 # fuel line with a filter to the carburettor, throttle cable, starter cable through the firewall, fan relay box
 A.sweep(k['preto_fosco'],[(FIREWALL_X+.01,-.50,.66),(1.20,-APRON_Y+.012,.70),(1.70,-APRON_Y+.012,.68),(2.05,-APRON_Y+.02,.62),(2.12,-.62,.60)],.009,8,samples=40)
 A.sweep(k['preto_fosco'],[(1.40,-APRON_Y+.012,.69),(1.45,-.50,.64),E(.52,-.21,.30)],.005,6)
 for s in (-1,1):A.sweep(k['aco'],[(FIREWALL_X+.25,s*.33,.50),(1.20,s*(APRON_Y-.012),.45),(1.46,s*(APRON_Y-.012),.43),(1.55,s*.60,.40)],.0032,6)
 carb=E(.36,.23,DECK+.14);A.sweep(k['aco'],[carb,(carb[0]-.05,.30,carb[2]-.02),(1.25,.40,.60),(FIREWALL_X+.05,.44,.50)],.0045,6,samples=30)
 A.cyl(k['translucido'],(1.30,.395,.595),(1.36,.405,.60),.016,12)
 A.sweep(k['preto_fosco'],[E(.30,.24,DECK+.14),(1.35,.30,.70),(1.05,.28,.72),(FIREWALL_X+.01,.22,.70)],.003,6)
 st=E(.10,-.20,-.03);A.sweep(k['preto_fosco'],[st,(st[0]-.08,-.24,st[2]+.05),(.95,-.30,.45),(FIREWALL_X+.01,-.30,.55)],.008,8)
 A.box(k['preto_fosco'],(1.85,APRON_Y-.03,.62),(.08,.05,.06),.008,2)
 # heater hoses from the head to the firewall and an ignition box on the passenger side
 for dy,dz in ((-.035,0),(.0,-.04)):
  A.sweep(k['mangueira'],[E(.06,-.115+dy,DECK+.05+dz),(1.05,-.20+dy,.62+dz),(.93,-.16+dy,.64+dz),(FIREWALL_X+.01,-.14+dy,.62+dz)],.012,10)
 A.box(k['preto_fosco'],(1.00,-.43,.62),(.12,.08,.10),.01,2)
 A.sweep(k['fio_verm'],[(1.00,-.39,.66),(1.03,-.33,.68),(1.10,-.30,.66)],.004,6)
 # low in the bay, seen past the engine from above (carro_41/42): a hose bundle and a loom along each frame rail,
 # taped and clamped, the fan relay box on the passenger apron, a canister fuel filter on the driver apron, and bolt
 # heads and grommets on the apron shelves
 for s in (-1,1):
  yo=.47 if s>0 else .40                                  # the driver side runs outboard of the steering box
  rail=[(FIREWALL_X+.02,s*.36,.36),(1.00,s*.40,.31),(1.35,s*.42,.30),(1.62,s*yo,.30),(1.90,s*yo,.30),(2.06,s*.42,.34)]
  for dy,dz,r,mat in ((0.,0.,.011,'mangueira'),(s*.021,.003,.008,'mangueira'),(-s*.017,.012,.006,'preto_fosco')):
   A.sweep(k[mat],[(x,y+dy,z+dz) for x,y,z in rail],r,8,samples=44)
  for x,y,z in rail[1:-1]:A.cyl(k['preto_fosco'],(x-.012,y,z+.004),(x+.012,y,z+.004),.024,10)   # tape wraps
  A.sweep(k['preto_fosco'],[rail[2],(1.40,s*.47,.40),(1.33,s*(APRON_Y-.03),.62)],.005,6)          # branch up the apron
  for x in np.linspace(1.02,2.05,8):
   z=shelf_z(x,s)
   if abs(x-1.555)>.10:A.cyl(k['aco'],(x,s*(APRON_Y+.035),z),(x,s*(APRON_Y+.035),z+.005),.007,6)
  for x in (1.18,1.86):A.cyl(k['borracha'],(x,s*(APRON_Y+.10),shelf_z(x,s)),(x,s*(APRON_Y+.10),shelf_z(x,s)+.004),.016,12)
 ry=-(APRON_Y-.018-.032)
 A.box(k['preto_fosco'],(1.86,ry,.47),(.11,.06,.075),.006,2)                                     # relay box
 for dx in (-.03,0.,.03):A.box(k['azul'] if dx==0 else k['preto_fosco'],(1.86+dx,ry,.515),(.024,.024,.022),.003)
 A.sweep(k['fio_verm'],[(1.86,ry+.02,.44),(1.80,-.44,.36),(1.70,-.41,.31)],.004,6)
 A.sweep(k['preto_fosco'],[(1.83,ry+.02,.44),(1.76,-.43,.34),(1.62,-.40,.31)],.006,6)
 fy=APRON_Y-.018-.04
 A.cyl(k['filtro_oleo'],(1.88,fy,.47),(2.01,fy,.47),.030,18)                                        # fuel filter
 for x0,x1 in ((1.86,1.88),(2.01,2.03)):A.cyl(k['aco'],(x0,fy,.47),(x1,fy,.47),.012,10)
 A.box(k['aco'],(1.945,fy+.025,.47),(.04,.012,.07),.003)                                            # its clamp to the apron
 A.sweep(k['trancada'],[(2.03,fy,.47),(2.07,fy-.03,.44),(2.08,.40,.36)],.006,8)
 A.sweep(k['trancada'],[(1.86,fy,.47),(1.80,fy-.02,.50),(1.62,.47,.58),(1.35,.44,.62)],.006,8)
 A.build()

def driveline(k):
 D=Part('Transmissao','08_Cofre_do_motor',None,smooth=35)
 out=E(-.86,0,0);pin=(-.955,0,.316)
 D.cyl(k['aco_escuro'],out,(out[0]-.04,0,out[2]),.03,14)
 D.cyl(k['aco'],(out[0]-.04,0,out[2]),(pin[0]+.05,0,pin[2]),.038,20)          # driveshaft
 for p in ((out[0]-.045,0,out[2]),(pin[0]+.045,0,pin[2])):D.box(k['aco_escuro'],p,(.03,.07,.07),.01,2)
 # rear axle: banjo housing, pinion nose, axle tubes, trailing arms to the floor
 D.lathe(k['fundido'],[(.0,-.075),(.09,-.07),(.135,-.02),(.135,.03),(.10,.075),(.0,.08)],(-1.117,0,.316),(0,1,0),28,cap=True)
 D.lathe(k['aco_escuro'],[(.0,-.13),(.11,-.12),(.13,-.06),(.13,.06),(.11,.12),(.0,.13)],(-1.117,0,.316),(1,0,0),28,cap=True)
 D.cyl(k['aco_escuro'],(-1.03,0,.316),(pin[0],0,pin[2]),.055,20,r1=.042)
 for s in (-1,1):
  D.cyl(k['aco_escuro'],(-1.117,s*.10,.316),(-1.117,s*.70,.316),.042,20)
  D.cyl(k['aco'],(-1.117,s*.70,.316),(-1.117,s*.83,.316),.025,14)
  D.cyl(k['aco_escuro'],(-1.117,s*.66,.316),(-1.117,s*.68,.316),.08,24)
  D.sweep(k['aco_escuro'],[(-1.10,s*.50,.26),(-1.00,s*.50,.18),(-.85,s*.50,.15),(-.60,s*.50,.15)],.018,8)   # lower trailing arm, under the floor
  D.box(k['aco_escuro'],(-.60,s*.50,.19),(.06,.05,.02),.004)
  D.cyl(k['aco_escuro'],(-1.20,s*.46,.35),(-1.25,s*.44,.38),.03,12)
 D.build()

def exhaust(k):
 """Down-pipe from the collector, under the gearbox to the passenger side and back to the V05 tailpipe."""
 X=Part('Escapamento_dianteiro','08_Cofre_do_motor',None,smooth=45)
 c=E(*(Vector(COLLECTOR)+COLLECTOR_AXIS*.11));esc=bpy.data.objects['Escape'];W=world_verts(esc)
 front=W[W[:,0]>W[:,0].max()-.004];tail=Vector(front.mean(0))
 path=[c,(c[0]-.07,.22,c[2]-.02),(.86,.16,.15),(.62,-.02,.14),(.30,-.155,.14),(-.40,-.16,.14),(tail.x+.06,tail.y,tail.z),(tail.x-.005,tail.y,tail.z)]
 X.sweep(k['escape_frio'],path,.034,12,samples=70)
 X.cyl(k['escape_frio'],(tail.x+.05,tail.y,tail.z),(tail.x-.01,tail.y,tail.z),.04,14)
 for x in (.10,-.70):X.box(k['borracha_pneu'],(x,-.16,.175),(.03,.02,.03),.005)   # rubber hangers
 X.build()
