"""V06 trunk (photos carro_37, carro_38, carro_22): a shallow trunk with a raised floor about 0.41 m up, black paint
worn to rust near the seams and speckled with white paint, the fuel cell sunk through an opening of that floor into the
closed belly on a dirty dark tubular cradle with blue-grey hangers, a horizontal two-hole flange on the rear bulkhead
just ahead of the cell, plain inner quarter walls, the inner face of the rear panel with the lamp backs and its rolled
top lip, and the gutter and seal round the lid opening.

The ribbed steel cell (0.58 x 0.53 x 0.21 m) runs from the flange back to the rear panel, y -0.20..+0.33, its lower
rear edge chamfered over the belly's kick-up; the white filler cap sits on its rear edge 45 % of the width in from the
driver edge (carro_37/38). Nothing of it or its cradle shows under the rear valance or through the belly. It hangs from
Tanque_combustivel_CONJUNTO (carro_22 shows it fallen out). The wheelhouses of this body end at x -1.46, ahead of the
trunk bulkhead (x -1.49): the trunk has no tubs."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from v06_comum import *

FLOOR_Z,FLOOR_RISE=.405,.012         # trunk floor: raised above the belly, rising 12 mm toward the tail
BULKHEAD_X=-1.4905
# Fuel cell 0.58 x 0.53 x 0.21 m (critique, measured on carro_37/38): front edge at the bulkhead flange, top 6 cm
# above the floor, the rest sunk through the floor opening into the closed belly. Its driver edge lines up with the
# 99's right end, 0.07 m of it past the centre line (carro_37). The belly rises toward the tail (z .217 up to x -1.75,
# .258 at -1.95, .39 at -2.10), so the cell's lower rear edge is chamfered to stay 1.5 cm or more above it: nothing
# of the cell or its cradle can be seen under the rear valance or through the belly.
TANK_X0,TANK_X1,TANK_Y0,TANK_Y1,TANK_H=-2.095,-1.515,-.20,.33,.21
TANK_TOP=FLOOR_Z+.06
CHAMFER=((-1.76,TANK_TOP-TANK_H),(TANK_X0,.40))       # (x, z) where the chamfer leaves the flat bottom, and at the rear face
def chamfer_z(x):
 (xa,za),(xb,zb)=CHAMFER;return za+(zb-za)*max(0.,(xa-x)/(xa-xb))
HOLE=(TANK_X0-.028,TANK_Y0-.055,TANK_X1+.012,TANK_Y1+.028)   # opening round the cell, wider on the inner side (carro_38)
REAR_PROFILE=[(.852,-2.170),(.80,-2.168),(.70,-2.165),(.625,-2.162),(.612,-2.170),(.600,-2.176),(.56,-2.177),
 (.48,-2.173),(.40,-2.163),(.34,-2.148),(.30,-2.122),(.275,-2.085),(.262,-2.045)]   # from remodelar_opala_v05.py
smoothstep=lambda t:(lambda c:c*c*(3-2*c))(np.clip(t,0,1))
def rear_x(y,z):
 zs=[p[0] for p in REAR_PROFILE][::-1];xs=[p[1] for p in REAR_PROFILE][::-1]
 return float(np.interp(z,zs,xs))+.045*smoothstep((abs(y)-.56)/.22)
def floor_z(x):return FLOOR_Z+FLOOR_RISE*np.clip((BULKHEAD_X-x)/.66,0,1)

def noise(n,seed,octaves=((8,1.),(16,.5),(32,.25),(64,.12))):
 rng=np.random.default_rng(seed);f=np.zeros((n,n))
 for octave,amp in octaves:
  g=rng.random((octave+1,octave+1));idx=np.linspace(0,octave,n,endpoint=False);i0=idx.astype(int);t=idx-i0;t=t*t*(3-2*t)
  a=g[i0][:,i0]*(1-t)[None,:]+g[i0][:,i0+1]*t[None,:];b=g[i0+1][:,i0]*(1-t)[None,:]+g[i0+1][:,i0+1]*t[None,:]
  f+=amp*(a*(1-t)[:,None]+b*t[:,None])
 return (f-f.min())/(f.max()-f.min())

BASE,RUST,SPECK=np.array([.030,.030,.032]),np.array([.21,.11,.05]),np.array([.80,.80,.78])
def trunk_material():
 """Walls: black paint over bare steel, a little rust low down, tiled every 0.6 m."""
 if 'Chapa_porta_malas' in bpy.data.materials:return bpy.data.materials['Chapa_porta_malas']
 n=256;f=noise(n,99);rust=.55*smoothstep((f-.80)/.12)
 img=BASE*(1-rust[...,None])+RUST*rust[...,None]+(np.random.default_rng(3).random((n,n,1))-.5)*.02
 img=np.concatenate([np.clip(img,0,1),np.ones((n,n,1))],-1)
 return material('Chapa_porta_malas',(9,9,10),metal=.05,rough=.8,image=image_from_array('porta_malas_chapa',img))

def floor_material(x0,x1,y0,y1):
 """Floor, mapped once over the whole floor (u along x, v along y): the paint is worn to rust in a few large patches
 along the seams with the walls and round the cell opening, and flecked with white paint (carro_37/38)."""
 n=512;u=np.linspace(0,1,n);X,Y=np.meshgrid(x0+(x1-x0)*u,y0+(y1-y0)*u)
 # distance to the seams: walls, bulkhead, rear panel and the cell opening
 d=np.minimum.reduce([np.abs(Y-y0),np.abs(Y-y1),np.abs(X-x0),np.abs(X-x1)])
 inside=(X>HOLE[0])&(X<HOLE[2])&(Y>HOLE[1])&(Y<HOLE[3])
 dh=np.maximum.reduce([HOLE[0]-X,X-HOLE[2],HOLE[1]-Y,Y-HOLE[3]]);d=np.minimum(d,np.where(inside,0,np.abs(dh)))
 f=noise(n,38,((6,1.),(12,.5),(24,.25),(48,.12)));near=1-smoothstep(d/.09)
 rust=np.clip(.9*near*smoothstep((f-.50)/.18)+.6*smoothstep((f-.86)/.08),0,.9)   # patches, mostly by the seams
 rng=np.random.default_rng(37);img=BASE*(1-rust[...,None])+RUST*rust[...,None]
 for _ in range(55):                                   # white paint flecks, a few in small clusters
  cx,cy=rng.integers(0,n,2);r=rng.uniform(1.2,3.5)
  for _ in range(rng.integers(1,4)):
   ox,oy=cx+rng.integers(-9,10),cy+rng.integers(-9,10);yy,xx=np.ogrid[:n,:n];m=(xx-ox)**2+(yy-oy)**2<r*r
   img[m]=SPECK
 img=np.clip(img+(rng.random((n,n,1))-.5)*.02,0,1)
 img=np.concatenate([img,np.ones((n,n,1))],-1)[::-1]  # row 0 = v 1 (image_from_array wants the top row first)
 return material('Chapa_porta_malas_assoalho',(9,9,10),metal=.05,rough=.78,image=image_from_array('porta_malas_assoalho',img))

def build(mats):
 k=dict(mats);k['chapa']=trunk_material()
 k['rack']=material('Tubo_rack_azul_acinzentado',(78,98,118),metal=.4,rough=.5)
 k['tanque']=material('Aco_tanque_escurecido',(38,33,28),metal=.55,rough=.6)
 k['tampa_branca']=material('Plastico_branco_tampa',(226,224,214),rough=.4)
 k['mangueira_cinza']=material('Mangueira_cinza_translucida',(150,150,146),rough=.35,alpha=.9)
 floor_and_walls(k)
 fuel_cell(k)

def floor_and_walls(k):
 O=bpy.data.objects;ch=k['chapa']
 # (the belly under the trunk stays closed: the cell sits in the well between it and the raised floor)
 # raised floor between the walls, the bulkhead and the rear panel, with the opening for the cell
 x0,x1,y0,y1=BULKHEAD_X,-2.16,-.765,.765
 xs=np.linspace(x0,x1,34);ys=np.linspace(y0,y1,40)
 xs=np.unique(np.concatenate([xs,[HOLE[0],HOLE[2]]]))[::-1];ys=np.unique(np.concatenate([ys,[HOLE[1],HOLE[3]]]))
 V=[];UV=[]
 for x in xs:
  for y in ys:
   xx=max(x,rear_x(y,FLOOR_Z)+.014);V.append((xx,y,float(floor_z(xx))));UV.append(((xx-x0)/(x1-x0),(y-y0)/(y1-y0)))
 F=[f for f in grid_faces(len(xs),len(ys)) if not all(HOLE[0]-1e-6<=V[i][0]<=HOLE[2]+1e-6 and HOLE[1]-1e-6<=V[i][1]<=HOLE[3]+1e-6 for i in f)]
 new_mesh('Assoalho_porta_malas',V,F,floor_material(x0,x1,y0,y1),'10_Porta_malas',uv=UV,outward=(0,0,1))
 P=Part('Porta_malas_interior','10_Porta_malas',None,smooth=40)
 # the opening's turned-down lip, and the two pressed ribs running fore-aft beside the cell
 lip=[(HOLE[0],HOLE[1]),(HOLE[2],HOLE[1]),(HOLE[2],HOLE[3]),(HOLE[0],HOLE[3])];Vl=[];m=len(lip)
 for dz in (0,-.035):Vl+=[(x,y,float(floor_z(x))+dz) for x,y in lip]
 P.mesh(ch,Vl,[(i,(i+1)%m,m+(i+1)%m,m+i) for i in range(m)],outward=lambda c:Vector(((HOLE[0]+HOLE[2])/2-c.x,(HOLE[1]+HOLE[3])/2-c.y,0)))
 for y in (-.34,-.56):
  P.sweep(ch,[(x,y,float(floor_z(x))+.002) for x in np.linspace(-1.53,-2.10,12)],.012,8)
 # drilled holes in the floor, light where the ground shows through them
 rng=np.random.default_rng(38)
 for _ in range(18):
  x=rng.uniform(-2.08,-1.55);y=rng.uniform(-.70,-.30)
  P.cyl(k['cinza_claro'],(x,y,float(floor_z(x))+.0005),(x,y,float(floor_z(x))+.0012),rng.uniform(.004,.008),10)
 # inner quarter walls, from the floor up to the gutter
 for s in (-1,1):
  xs=np.linspace(BULKHEAD_X,-2.04,24);zs=np.linspace(0,1,10);V=[];UV=[]
  for x in xs:
   zb=float(floor_z(x))-.004
   for t in zs:z=zb+(.84-zb)*t;V.append((x,s*.765,z));UV.append((x/.6,z/.6))
  new_mesh(f'Porta_malas_lateral_{"Motorista" if s>0 else "Passageiro"}',V,grid_faces(len(xs),len(zs)),ch,'10_Porta_malas',uv=UV,outward=(0,-s,0))
 # inner face of the rear panel with the backs of the four lamps, from the floor to its rolled top lip
 zs=np.linspace(FLOOR_Z,.845,12);ys=np.linspace(-.76,.76,33);V=[];UV=[]
 for y in ys:
  for z in zs:V.append((rear_x(y,z)+.014,y,z));UV.append((y/.6,z/.6))
 new_mesh('Painel_traseiro_interno',V,grid_faces(len(ys),len(zs)),ch,'10_Porta_malas',uv=UV,outward=(1,0,0))
 P.sweep(k['pintura'],[(rear_x(y,.84)+.012,y,.828) for y in np.linspace(-.74,.74,15)],.007,10)        # rolled lip
 for y in (-.66,-.47,.47,.66):
  x=rear_x(y,.69)+.014;P.cyl(k['aco_escuro'],(x,y,.69),(x+.05,y,.69),.066,20,r1=.05);P.cyl(k['aco'],(x+.05,y,.69),(x+.06,y,.69),.02,10)
  ye=y*.7 if not HOLE[1]-.02<y*.7<HOLE[3]+.02 else HOLE[3]+.03   # the lamp wires end on the floor, beside the cell
  P.sweep(k['aco_escuro'],[(x+.06,y,.69),(x+.10,y*.95,.62),(x+.12,(y+ye)/2,.52),(-1.95,ye,FLOOR_Z+.006)],.004,6)
 # trunk face of the rear bulkhead (same worn paint as the walls)
 ys=np.linspace(-.765,.765,9);zs=np.linspace(FLOOR_Z-.005,.86,6);V=[(BULKHEAD_X,y,z) for y in ys for z in zs];UV=[(y/.6,z/.6) for y in ys for z in zs]
 new_mesh('Porta_malas_anteparo',V,grid_faces(len(ys),len(zs)),ch,'10_Porta_malas',uv=UV,outward=(-1,0,0))
 # horizontal two-hole flange on the bulkhead, over the cell's front edge (carro_37): holes facing up
 fz=TANK_TOP+.03;fx0,fx1=BULKHEAD_X,BULKHEAD_X-.07                                  # 7 cm deep, over the cell's front
 outer=rounded_rect((fx0+fx1)/2,(TANK_Y0+TANK_Y1)/2-.02,fx0-fx1,.62,.01,3)
 cy=(TANK_Y0+TANK_Y1)/2;holes=[ellipse((fx0+fx1)/2,y,.011,.011,16) for y in (cy-.25,cy+.20)]
 pts,tris=polygon_fill(outer,holes);P.mesh(ch,[(x,y,fz) for x,y in pts],[tuple(t) for t in tris],outward=(0,0,1))
 m=len(outer);Vf=[(x,y,fz) for x,y in outer]+[(x,y,fz-.004) for x,y in outer]
 P.mesh(ch,Vf,[(i,(i+1)%m,m+(i+1)%m,m+i) for i in range(m)],outward=lambda c:Vector((c.x-(fx0+fx1)/2,c.y-(TANK_Y0+TANK_Y1)/2+.02,0)))
 P.box(ch,(fx0+.004,(TANK_Y0+TANK_Y1)/2-.02,(fz+FLOOR_Z)/2),(.008,.62,fz-FLOOR_Z),.002)                   # its web down the bulkhead
 # the gutter and seal round the lid opening
 Tl=bvh(O['Tampa_porta_malas_painel'])
 for s in (-1,1):
  pts=[]
  for x in np.linspace(-1.56,-2.13,14):
   h=Tl.ray_cast(Vector((x,s*.715,.5)),Vector((0,0,1)));zb=h[0].z if h[0] is not None else .90;pts.append((x,zb))
  V=[];F=[]
  for x,zb in pts:V+=[(x,s*.712,zb-.018),(x,s*.712,zb-.055),(x,s*.775,zb-.055),(x,s*.775,zb-.008)]
  for i in range(len(pts)-1):
   for j in range(3):a=i*4+j;F.append((a,a+1,a+5,a+4))
  P.mesh(k['pintura'],V,F,outward=lambda c,s=s:Vector((0,0,1)))
  P.sweep(k['borracha'],[(x,s*.718,zb-.016) for x,zb in pts],.0045,8)
 P.sweep(k['borracha'],[(rear_x(y,.846)+.012,y,.846) for y in np.linspace(-.70,.70,15)],.0045,8)   # follows the panel's corners
 P.build()

def fuel_cell(k):
 cx=(TANK_X0+TANK_X1)/2;cy=(TANK_Y0+TANK_Y1)/2;L=TANK_X1-TANK_X0;W=TANK_Y1-TANK_Y0;z1=TANK_TOP;z0=z1-TANK_H
 piv=pivot('Tanque_combustivel_CONJUNTO',(cx,cy,z0),'tanque_combustivel','',0.,
  'Celula de combustivel com o berco tubular; vazio estatico (na foto carro_22 o tanque caiu do carro).',collection='10_Porta_malas')
 P=Part('Tanque_combustivel','10_Porta_malas',piv,smooth=40)
 # shell: a rounded box with its lower rear edge cut along the belly's kick-up and closed again
 t=bmesh.new();bmesh.ops.create_cube(t,size=1,matrix=Matrix.Translation((cx,cy,(z0+z1)/2))@Matrix.Diagonal((L-.03,W-.03,TANK_H,1)))
 bmesh.ops.bevel(t,geom=t.edges[:],offset=.03,segments=4,profile=.5,affect='EDGES',clamp_overlap=True)
 (xa,za),(xb,zb_)=CHAMFER;d=Vector((xb-xa,0,zb_-za));nrm=Vector((0,1,0)).cross(d).normalized()
 if nrm.z>0:nrm=-nrm
 bmesh.ops.bisect_plane(t,geom=t.verts[:]+t.edges[:]+t.faces[:],plane_co=(xa,0,za),plane_no=nrm,clear_outer=True)
 bmesh.ops.holes_fill(t,edges=t.edges[:],sides=0);bmesh.ops.recalc_face_normals(t,faces=t.faces[:])
 P._add(k['tanque'],t)
 P.box(k['tanque'],(cx,cy,z1-.012),(L,W,.018),.012,2)                                # the wide rim round the top (carro_38)
 for x in np.arange(TANK_X0+.05,TANK_X1-.04,.045):                                   # pressed ribs across the top
  P.box(k['tanque'],(x,cy,z1-.001),(.016,W-.08,.008),.003,1)
 for x in np.arange(TANK_X0+.06,TANK_X1-.05,.09):                                    # and down the sides
  zlo=max(z0,chamfer_z(x+.009))+.02;zhi=z1-.04
  for sy in (TANK_Y0+.015,TANK_Y1-.015):P.box(k['tanque'],(x,sy,(zlo+zhi)/2),(.018,.01,zhi-zlo),.003,1)
 # white filler/vent cap on a dark neck at the rear edge, 45 % of the width in from the driver edge (carro_37/38),
 # its hose looping over the cell toward the driver side
 fx,fy=TANK_X0+.07,TANK_Y1-.45*W
 P.cyl(k['tanque'],(fx,fy,z1),(fx,fy,z1+.012),.05,24)
 P.cyl(k['aco_escuro'],(fx,fy,z1+.012),(fx,fy,z1+.06),.03,20)
 P.cyl(k['tampa_branca'],(fx,fy,z1+.06),(fx,fy,z1+.125),.037,28)
 P.cyl(k['tampa_branca'],(fx,fy,z1+.125),(fx,fy,z1+.14),.027,24)
 P.sweep(k['mangueira_cinza'],[(fx+.01,fy+.03,z1+.11),(fx+.03,fy+.12,z1+.13),(fx+.08,TANK_Y1-.04,z1+.07),(fx+.20,TANK_Y1+.005,z1+.02),(TANK_X1-.05,TANK_Y1+.008,z1-.03)],.008,8)
 P.cyl(k['aco'],(TANK_X1-.07,cy-.10,z1),(TANK_X1-.07,cy-.10,z1+.02),.018,12)          # pickup / sender
 P.build()
 # tubular cradle under the cell (carro_38): two rails along its sides, under the flat bottom and up the chamfer,
 # four cross tubes, all dirty dark steel; blue-grey hangers up to the floor rim beside the cell, their tabs bolted on
 # the floor. It stays over the belly (1.4 cm at the lowest) and ahead of the kick-up.
 R=Part('Tanque_suporte','10_Porta_malas',piv,smooth=30);r=.011
 k['berco']=material('Tubo_berco_sujo',(44,42,38),metal=.3,rough=.75)
 xs_=[TANK_X1-.012,CHAMFER[0][0]]+list(np.linspace(CHAMFER[0][0]-.05,-2.02,4))
 zr=lambda x:(chamfer_z(x) if x<CHAMFER[0][0] else z0)-r-.001
 ya,yb=TANK_Y0-.03,TANK_Y1+.012
 for y in (ya,yb):R.sweep(k['berco'],[(x,y,zr(x)) for x in xs_],r,8)
 for x in (TANK_X1-.03,-1.64,CHAMFER[0][0]-.01,-1.97):R.cyl(k['berco'],(x,ya-.01,zr(x)),(x,yb+.01,zr(x)),r*.9,8)
 for x in (TANK_X1-.03,-1.95):
  for y in (ya,yb):
   zf=float(floor_z(x))
   R.box(k['rack'],(x,y,(zr(x)+zf)/2),(.02,.02,zf-zr(x)),.003,1)                     # hangers up to the floor rim
   R.box(k['rack'],(x,y+(-.035 if y==ya else .035),zf+.003),(.05,.05,.006),.001)   # tabs bolted on it, to the sides
 R.build()
