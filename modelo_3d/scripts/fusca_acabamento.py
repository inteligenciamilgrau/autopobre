"""The Fusca's finish outside for the game (exportar_fusca_jogo.py): a rounded nose, door mirrors on both doors,
rubber seals round the windows' cut edges inside, the engine lid's outline and its two banks of louvres, headlamps
with a chrome reflector behind clear glass, the plate ready for its letters.

The nose: criar_fusca_v2.py closes the body's front with a flat cap (straight across in plan, with a 3 cm fillet),
which shows as a flat panel between the headlamps over the bumper. RoundNose (the exporter builds the body with it)
brings the hood's front 2 cm forward, curves the front in plan (the middle leads, the fenders round back to the
headlamps) and rounds the end over 9 cm, the hood rolling down into the apron as a Fusca's does.

The door mirrors replace criar_fusca_v2.py's small chrome eggs on the cowl, which the driver could not use: a chrome
base on the door's front corner under the window, a curved arm and an oval head, its glass (Espelho_fusca) turned
as a driver sets it, the road straight back seen past the car's flank from the cockpit camera (main.js, on the
car's centre line). The head sits where that camera sees it through the door window, just behind the A-pillar, as
far forward as that allows (the game's side-mirrors.js shows the road behind in the player's glass).

Frame: criar_fusca_v2.py's (front -Y, +X the driver's left side, Z up), as fusca_cabine.py.
"""
import bpy,math,re
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import criar_fusca_v2 as V2,medidas_fusca as MED
import fusca_cabine as C

STUDIO_MIRRORS=('Espelho_E','Espelho_D','Espelho_haste_E','Espelho_haste_D')
STUDIO_LOUVRES=re.compile(r'^Veneziana_\d+$')
HEAD=(.135,.09,.045) # the head's width, height and depth
OUT,UP=.095,.075 # the head's centre from the arm's base: out from the door, up
OUTWARD=.12 # the glass shows the road this much out past the flank (side-mirrors.js SIDE_MIRRORS.outward)

NOSE_Y,NOSE_R=-1.80,.09 # the body's front end, the radius it is rounded with
FENDER_NOSE,APRON=.19,.55 # the front fenders' half width at the nose; the base's top there (under the headlamps)
def resampled(old,front,start=-1.60,sigma=.012):
 """A criar_fusca_v2 profile with its front replaced by these points (y, value) up to start."""
 return V2.Perfil(front+[(float(y),float(old(y))) for y in np.arange(start,2.2,.02)],sigma)

class RoundNose(V2.Carroceria):
 """criar_fusca_v2.Carroceria with a rounded nose (the module's Y_NARIZ must be NOSE_Y: exportar_fusca_jogo.py)."""
 def __init__(self):
  super().__init__()
  self.ztop=resampled(self.ztop,[(-1.80,.575),(-1.78,.598),(-1.75,.628),(-1.71,.66),(-1.67,.70),(-1.62,.757)])
  self.zpiso=resampled(self.zpiso,[(-1.80,.37),(-1.78,.335),(-1.75,.305),(-1.70,.285),(-1.64,.275)],sigma=.03)
  front=[(-1.80,.40),(-1.79,.455),(-1.775,.515),(-1.755,.57),(-1.73,.62),(-1.70,.665),(-1.66,.715),(-1.62,.749)]
  self.wmax=resampled(self.wmax,front)
  self.xoF=resampled(self.xoF,front,sigma=.01)
  self.crF=resampled(self.crF,[(-1.80,.585),(-1.77,.63),(-1.74,.66),(-1.70,.70),(-1.66,.735)],sigma=.015)
  self.aD=resampled(self.aD,[(-1.80,.20),(-1.77,.48),(-1.72,.62)],start=-1.50,sigma=.02)
  self.xh=resampled(self.xh,[(-1.80,.10),(-1.77,.183)],start=-1.73,sigma=.02)
  self.zh=resampled(self.zh,[(-1.80,.575),(-1.70,.64),(-1.60,.72)],start=-1.50,sigma=.02)
 def params(self,y):
  P=super().params(y);y=np.asarray(y,float)
  front,rear=y-NOSE_Y,V2.Y_RABO-y
  arc=lambda d,r:np.where(d<r,r-np.sqrt(np.maximum(r**2-(r-d)**2,0.)),0.)
  P['fil']=np.where(front<rear,arc(front,NOSE_R),arc(rear,V2.FILETE))
  # The front fenders: bulbs round the headlamps, narrower toward the nose, with a valley between them and the hood
  # (criar_fusca_v2's 25 cm half bulbs met over the middle and filled it).
  F=P['FB'];xo=F['cx']+F['ax'];af=np.minimum(F['ax'],np.interp(y,[-1.8,-1.6,-1.3,-1.0],[FENDER_NOSE,.20,.22,.25]))
  F['cx'],F['ax']=xo-af,af
  # The base box under them stops lower at the front: the apron behind the bumper, not a wall up to the fenders.
  D=P['D'];D['azu']=np.where(y<-1.0,np.minimum(D['azu'],np.interp(y,[-1.8,-1.5,-1.0],[APRON-D['cz'],.12,.30])),D['azu'])
  return P

def build(sup,body,m):
 for name in STUDIO_MIRRORS:
  o=bpy.data.objects.get(name)
  if o:bpy.data.objects.remove(o)
 glass=C.material('Espelho_fusca',(.62,.65,.68),metal=1,rough=.03)
 out=seals(sup,m)
 # What stands between the cockpit camera and a door mirror: the body, the windows' rubber, the cage.
 V,F=[],[];dg=bpy.context.evaluated_depsgraph_get()
 for o in [body]+out+[o for o in bpy.data.objects if o.name.startswith('Gaiola_coluna_A')]:
  me=o.evaluated_get(dg).to_mesh();W=o.matrix_world;base=len(V);V+=[W@v.co for v in me.vertices];F+=[[base+i for i in p.vertices] for p in me.polygons];o.evaluated_get(dg).to_mesh_clear()
 bvh=BVHTree.FromPolygons(V,F)
 for s in (1,-1):out+=door_mirror(sup,bvh,s,m,glass)
 out+=engine_lid(sup,m)
 headlamps(m);plate()
 return out

def engine_lid(sup,m):
 """The lid's panel gap (criar_fusca_v2 draws the hood's only) and, in place of the studio's twenty lines across
 the tail, two banks of nine louvres on the lid's top, each a dark slot under a raised lip of paint."""
 for o in [o for o in bpy.data.objects if STUDIO_LOUVRES.match(o.name)]:bpy.data.objects.remove(o)
 out=[];pts=[]
 for x,y in V2.densificar(MED.PLANTA_TAMPA_MOTOR,.02,True):
  loc,nor=sup.topo(x,y)
  if loc is not None:pts.append(loc+nor*.0008)
 out.append(C.pipe('Junta_tampa_motor',pts,.0024,m['linha'],6,closed=True))
 for s in (1,-1):
  for k in range(9):
   y=1.548+k*.0118;slot,lip=[],[]
   for x in np.linspace(s*.075,s*.30,12):
    a,n=sup.topo(float(x),y);b,_=sup.topo(float(x),y-.0045)
    if a is None or b is None:continue
    slot.append(a+n*.0004);lip.append(b+n*.0016)
   if len(slot)>3:
    out.append(C.pipe(f'Veneziana_fenda_{s}_{k}',slot,.0021,m['linha'],6))
    out.append(C.pipe(f'Veneziana_aba_{s}_{k}',lip,.0032,m['tinta'],6))
 return out

def headlamps(m):
 """The studio lights the scene with its headlamps; in the game's daylight they are off: the disc behind the
 lens is the reflector's chrome, not a glowing cream face (exportar_fusca_jogo.py EMISSION keeps the bulb dim)."""
 b=bpy.data.materials['Farol_Disco'].node_tree.nodes['Principled BSDF']
 b.inputs['Base Color'].default_value=(.82,.83,.84,1);b.inputs['Metallic'].default_value=1.;b.inputs['Roughness'].default_value=.12

def plate():
 """UVs on the rear plate's face (the game paints its letters, fusca.js): u to the right seen from behind, v up."""
 o=bpy.data.objects.get('Placa')
 if o is None:return
 bpy.context.view_layer.update();R=o.matrix_world.to_3x3();right=(R@Vector((-1,0,0))).normalized();up=(R@Vector((0,0,1))).normalized()
 if right.x>0:right=-right
 C.disc_uv(o,o.matrix_world.translation.copy(),right,up,.34,.13)

def door_mirror(sup,bvh,s,m,glass):
 side='E' if s>0 else 'D'
 # The base on the door's front corner that brings the head nearest the middle of the cockpit camera's view with
 # all of its glass in sight through the window (past the rubber and the cage), a margin round it.
 chosen=None;w,h,_=HEAD
 for y in np.arange(-.575,-.38,.005):
  for up in (.06,.075,.09):
   base,n=sup.lado(float(y),.99,s)
   if base is None:continue
   head=base+Vector((s*OUT,-.01,up));normal=glass_normal(head,s);R=C.frame_from(normal)
   ring=[head]+[head+R@Vector((w/2*1.1*math.cos(a),h/2*1.1*math.sin(a),0)) for a in np.linspace(0,2*math.pi,12,endpoint=False)]
   clear=all(bvh.ray_cast(C.EYE,(q-C.EYE).normalized(),(q-C.EYE).length-.002)[0] is None for q in ring)
   angle=math.atan2(abs(head.x-C.EYE.x),C.EYE.y-head.y)
   if clear and (chosen is None or angle<chosen[3]):chosen=(base,n,head,angle)
 assert chosen,'retrovisor sem visada'
 base,n,head,_=chosen
 angle=math.degrees(math.atan2(abs(head.x-C.EYE.x),C.EYE.y-head.y))
 print(f'RETROVISOR_{side} base y {base.y:.3f} cabeca {tuple(round(v,3) for v in head)} angulo {angle:.1f} graus',flush=True)
 normal=glass_normal(head,s)
 out=[]
 # Base plate on the door skin, the arm curving out and up, the head's chrome shell open toward the glass.
 out.append(C.box('Retrovisor_base_'+side,base+n*.004,(.05,.028,.008),m['cromo'],.004,z_axis=n,up=Vector((0,0,1))))
 # The arm rises into the head from under it, behind the glass (to its middle it crossed the glass the driver sees).
 w,h,dpt=HEAD;under=head+C.frame_from(normal)@Vector((0,-h*.36,-dpt*.55))
 arm=[base+n*.006,base+n*.04+Vector((0,0,.012)),under-Vector((0,0,.03)),under]
 out.append(C.pipe('Retrovisor_braco_'+side,arm,.0075,m['cromo'],10,smooth=True,step=.012))
 V,F=[],[];seg,rings=40,8
 for i in range(rings+1):
  a=(i/rings)*math.pi/2;depth=-dpt*math.cos(a)**.6;scale=math.sin(a)**.55 if i else 0
  for k in range(seg):
   t=2*math.pi*k/seg;V.append(Vector((w/2*scale*math.cos(t),h/2*scale*math.sin(t),depth)))
 for i in range(rings):
  for k in range(seg):F.append((i*seg+k,i*seg+(k+1)%seg,(i+1)*seg+(k+1)%seg,(i+1)*seg+k))
 # The rim: a lip turned in round the glass.
 lip=len(V)
 for k in range(seg):t=2*math.pi*k/seg;V.append(Vector((w/2*.93*math.cos(t),h/2*.9*math.sin(t),.002)))
 for k in range(seg):F.append((rings*seg+k,rings*seg+(k+1)%seg,lip+(k+1)%seg,lip+k))
 shell=C.obj('Retrovisor_'+side,V,F,m['cromo'],True,70)
 C.place(shell,head,normal,Vector((0,0,1)));out.append(shell)
 g=V2.novo_objeto('Retrovisor_vidro_'+side,[(w/2*.92*math.cos(2*math.pi*k/seg),h/2*.89*math.sin(2*math.pi*k/seg),-.002) for k in range(seg)],[tuple(range(seg))],[glass])
 C.place(g,head,normal,Vector((0,0,1)));out.append(g)
 # Their own nodes in the GLB (exportar_fusca_jogo.py): they stand out of the body's outline (testar_colisao_fusca.mjs).
 for o in out:o['grupo']='Retrovisores'
 return out

def glass_normal(head,s):
 """Set as a driver sets it: the cockpit camera sees the road straight back, OUTWARD past the flank, in its middle."""
 ray=(Vector((0,1,0))+Vector((s*OUTWARD,0,0))).normalized();return (ray+(C.EYE-head).normalized()).normalized()

def seals(sup,m):
 """Black rubber round each window's opening, in the middle of its cut edge (exportar_fusca_jogo.py cuts the side
 windows straight across the car, the windscreen and the rear window straight down): it hides the edge's steps."""
 out=[]
 for s in (1,-1):
  for name,poly in (('porta',MED.JAN_PORTA),('quarto',MED.JAN_QUARTO)):
   pts=[]
   for y,z in V2.densificar(poly,.02,True):
    loc,n=sup.lado(y,z,s)
    if loc:pts.append(loc-Vector((s*min(.03,.5*C.SKIN/max(abs(n.x),.2)),0,0)))
   out.append(C.pipe(f'Borracha_{name}_{"E" if s>0 else "D"}',pts,.013,m['borracha'],8,closed=True))
 for name,poly in (('parabrisa',MED.PLANTA_PARABRISA),('traseiro',MED.PLANTA_VIDRO_TRAS)):
  pts=[]
  for x,y in V2.densificar(poly,.02,True):
   loc,n=sup.topo(x,y)
   if loc:pts.append(loc-Vector((0,0,min(.03,.5*C.SKIN/max(abs(n.z),.2)))))
  out.append(C.pipe('Borracha_'+name,pts,.014,m['borracha'],8,closed=True))
 return out
