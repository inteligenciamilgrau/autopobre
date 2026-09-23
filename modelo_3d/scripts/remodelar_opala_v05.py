"""Rebuild an Opala 99 V4 scene as V5: measured Opala coupe proportions, round headlights, rear panel without
bumper, fewer and wider window-net straps and, for the OMP livery, the current hood (RDO DO OLEO / OMP / nextlane).

Usage, from the project root (the output defaults to modelo_3d/v05_opala_real/<same name>.blend):
 blender --background modelo_3d/v04_fechamentos/opala99_assinaturas_omp.blend --python-exit-code 2 --python modelo_3d/scripts/remodelar_opala_v05.py [-- out.blend]

Measurements (metres, +X front, +Z up, tyre contact at z=0). Wheels, pivots and track stay where physics.js expects
them (wheelbase 2.667, half track .804). Chevrolet Opala coupe 1979: 1758 wide, 1359 high, 2667 wheelbase. The
roofline, beltline and overhangs were read from carro/carro_5_lateral_completa_longe.jpg, scaled on both wheel
centres (the 17 inch rims measure the same scale).
"""
import bpy,bmesh,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open opala99_<livery>.blend before running'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
output=Path(args[0]).resolve() if args else R/'modelo_3d/v05_opala_real'/source.name
LIVERY=source.stem[len('opala99_'):]
FONTS=Path('C:/Windows/Fonts')
root=bpy.data.objects['OPALA_99_ROOT']
col=lambda n:bpy.data.collections[n]

# ---------------------------------------------------------------- proportions
REAR_START,REAR_SPAN,REAR_GROW=-1.50,.45,.17  # longer tail, behind the rear arch
Z_HOLD=.30                                     # body height kept below this (floor, sills)
BELT_X=np.array([-2.40,-1.50,-.60,0,.50,.95,1.55,1.90,2.45])
BELT_D=np.array([-.015,-.015,-.012,-.012,-.018,-.025,-.035,-.040,-.040])
# Top silhouette from the photo, driver side, already in final X. The camera looks slightly down, so centreline
# points are lowered by ROOF_TILT.
ROOF=np.array([(.536,1.292),(.379,1.317),(.222,1.325),(.065,1.327),(-.091,1.324),(-.248,1.317),(-.404,1.303),
 (-.561,1.285),(-.717,1.263),(-.873,1.227),(-1.029,1.179),(-1.185,1.133),(-1.341,1.086),(-1.496,1.036),
 (-1.652,1.002),(-1.809,.965),(-1.965,.928),(-2.121,.900),(-2.199,.877)])
ROOF_TILT,COWL_X,ROOF_FRONT_X=-.015,.95,.536
NOSE_EDGE,NOSE_DROP=2.263,.067  # V4 hood front edge; drop brings it to the grille top
# Parts moved as a whole (their shape must not stretch): lamps, mirrors, pins, seat and controls.
RIGID=('Carcaca_espelho','Haste_espelho','Vidro_espelho','Argola_trava','Base_trava','Pino_trava','Bocal_combustivel',
 'Tampa_bocal','Lanterna_redonda','Aro_lanterna','Miolo_lanterna','Tampa_central_traseira','Farol_circular','Aro_farol',
 'Ranhura_lente','Seta_lateral','Rebite_vidro_traseiro','Volante','Raio_volante','Coluna_direcao','Alavanca_cambio',
 'Manopla','Banco_','Cinto_','Abertura_ventilacao','Boca_escape','Painel_instrumentos')
smoothstep=lambda t:(lambda c:c*c*(3-2*c))(np.clip(t,0,1))

def stretch_x(x):return x-REAR_GROW*smoothstep((REAR_START-x)/REAR_SPAN)
def world_verts(o):
 co=np.empty(len(o.data.vertices)*3);o.data.vertices.foreach_get('co',co);M=np.array(o.matrix_world)
 return co.reshape(-1,3)@M[:3,:3].T+M[:3,3]
def set_world_verts(o,W):
 Mi=np.linalg.inv(np.array(o.matrix_world));o.data.vertices.foreach_set('co',(W@Mi[:3,:3].T+Mi[:3,3]).astype(np.float32).ravel());o.data.update()
def wheel_part(o):
 while o is not None:
  if o.name.endswith('_PIVO'):return True
  o=o.parent
 return False

class Field:
 """Smooth map of the V4 body onto the measured silhouette. Profiles are sampled every 1 cm along X."""
 def __init__(self,objs):
  V={o.name:world_verts(o) for o in objs}
  cat=lambda *p:np.concatenate([v for n,v in V.items() if n.startswith(p)])
  self.bx=np.arange(-2.45,2.46,.01)
  self.B=self.profile(cat('Lateral_'),3)
  self.T=np.maximum(self.profile(cat('Teto_cupe','Coluna_','Tampa_porta_malas','Capo','Para_brisa','Vidro_traseiro',
   'Borracha_','Calha_teto','Cabecalho_janelas','Moldura_janela','Lateral_'),4),self.B+.01)
  rx,rz=ROOF[::-1,0],ROOF[::-1,1]+ROOF_TILT;dB=np.interp(self.bx,BELT_X,BELT_D)
  tgt=np.interp(self.bx,rx,rz);cur=self.T+dB
  ws=(self.bx>ROOF_FRONT_X)&(self.bx<COWL_X);s=(self.bx-ROOF_FRONT_X)/(COWL_X-ROOF_FRONT_X)
  tgt[ws]=np.interp(ROOF_FRONT_X,rx,rz)+s[ws]*(np.interp(COWL_X,self.bx,cur)-np.interp(ROOF_FRONT_X,rx,rz))
  tgt[self.bx>=COWL_X]=cur[self.bx>=COWL_X]
  self.Tn=np.maximum(tgt,self.B+dB+.01)
 def profile(self,pts,sig):
  idx=np.clip(np.round((stretch_x(pts[:,0])-self.bx[0])/.01).astype(int),0,len(self.bx)-1)
  o=np.full(len(self.bx),-np.inf);np.maximum.at(o,idx,pts[:,2]);ok=np.isfinite(o);o=np.interp(self.bx,self.bx[ok],o[ok])
  p=np.pad(o,4,mode='edge');o=np.max([p[i:i+len(o)] for i in range(9)],0)  # sparse vertex columns
  k=np.arange(-3*sig,3*sig+1);w=np.exp(-.5*(k/sig)**2);return np.convolve(np.pad(o,3*sig,mode='edge'),w/w.sum(),'valid')
 def __call__(self,P):
  x=stretch_x(P[:,0]);y=P[:,1].copy();z=P[:,2]
  B,T,Tn=(np.interp(x,self.bx,a) for a in (self.B,self.T,self.Tn));dB=np.interp(x,BELT_X,BELT_D)
  zb=z+dB*np.clip((z-Z_HOLD)/np.maximum(B-Z_HOLD,.05),0,1)
  # Cabin: scale between beltline and roof. Deck: keep the lid shape and bend it (the rear window base and the
  # C-pillar ends sit at different heights at the same X).
  zg=B+dB+(z-B)/np.maximum(T-B,.01)*(Tn-B-dB);zg=np.where(z>T,Tn+z-T,zg)
  zd=z+dB+(Tn-T-dB)*np.clip((z-B)/.03,0,1)
  a=smoothstep((-1.35-x)/.25);z2=np.where(z>B,(1-a)*zg+a*zd,zb)
  # Hood: raised centre panel between two creases, and a nose that dips to the grille (the eletric band).
  inner=1-smoothstep((np.abs(y)-.46)/.04)
  z2+=.012*inner*smoothstep((x-.98)/.06)*(1-smoothstep((x-2.00)/.10))*smoothstep((z-.74)/.04)
  # The last 10 cm of the hood roll down to the grille top, steepest at the edge (about 60 degrees there).
  d=np.clip(1-(NOSE_EDGE-x)/.10,0,1)**2*(1-smoothstep((np.abs(y)-.50)/.14))*smoothstep((z-.755)/.015)
  z2-=NOSE_DROP*d;x=x+.03*d
  return np.stack([x,y,z2],1)

def subdivide(o,cuts=1):
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.subdivide_edges(bm,edges=bm.edges[:],cuts=cuts,use_grid_fill=True)
 bm.to_mesh(o.data);bm.free()

def reshape():
 objs=[o for o in root.children_recursive if o.type=='MESH' and not wheel_part(o)]
 F=Field(objs)
 subdivide(bpy.data.objects['Capo'])  # enough vertices for the hood creases and nose
 for o in objs:
  if o.name.startswith(RIGID):
   c=world_verts(o).mean(0);o.matrix_world=Matrix.Translation(Vector(F(c[None])[0]-c))@o.matrix_world
  else:set_world_verts(o,F(world_verts(o)))
 return F

# ---------------------------------------------------------------- mesh helpers
def new_mesh(name,verts,faces,material,collection,uv=None,smooth=False,parent=root,outward=None):
 """outward: a direction (or a function of the face centre) the faces must look at; None recalculates normals
 of a closed shell."""
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 me=bpy.data.meshes.new(name);me.from_pydata([tuple(v) for v in verts],[],[tuple(f) for f in faces]);me.materials.append(material)
 if uv is not None:
  layer=me.uv_layers.new(name='UVMap');layer.data.foreach_set('uv',np.array([uv[v] for p in me.polygons for v in p.vertices],np.float32).ravel())
 bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
 if outward is None:bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
 else:
  flip=[f for f in bm.faces if f.normal.dot(Vector(outward(f.calc_center_median()) if callable(outward) else outward))<0]
  bmesh.ops.reverse_faces(bm,faces=flip,flip_multires=False)
 bm.to_mesh(me);bm.free()
 me.polygons.foreach_set('use_smooth',[smooth]*len(me.polygons));me.update()
 o=bpy.data.objects.new(name,me);col(collection).objects.link(o);o.parent=parent;return o
def remove(prefixes):
 for o in [o for o in root.children_recursive if o.name.startswith(prefixes)]:bpy.data.objects.remove(o,do_unlink=True)
def grid_faces(nu,nv,flip=False):
 f=[]
 for i in range(nu-1):
  for j in range(nv-1):
   a,b,c,d=i*nv+j,(i+1)*nv+j,(i+1)*nv+j+1,i*nv+j+1;f.append((a,d,c,b) if flip else (a,b,c,d))
 return f
def bvh(o):
 W=world_verts(o);return BVHTree.FromPolygons([tuple(v) for v in W],[tuple(p.vertices) for p in o.data.polygons])
def revolve(profile,center,segments=48):
 """Lathe (r, x) pairs around the +X axis at center; returns verts and quad faces."""
 cx,cy,cz=center;V=[];F=[];n=len(profile)
 for s in range(segments):
  a=2*math.pi*s/segments
  for r,dx in profile:V.append((cx+dx,cy+r*math.cos(a),cz+r*math.sin(a)))
 for s in range(segments):
  t=(s+1)%segments
  for k in range(n-1):F.append((s*n+k,t*n+k,t*n+k+1,s*n+k+1))
 return V,F
def strap(line,normal,width,thick):
 """Flat webbing strap along a polyline, as a thin closed box strip lying in the net plane."""
 V=[];F=[];line=np.asarray(line);m=len(line)
 for k in range(m):
  t=line[min(k+1,m-1)]-line[max(k-1,0)];t/=np.linalg.norm(t);ac=np.cross(normal,t)
  for sw,st in ((-1,-1),(1,-1),(1,1),(-1,1)):V.append(line[k]+ac*(sw*width/2)+normal*(st*thick/2))
 for k in range(m-1):
  a,b=4*k,4*(k+1)
  for e in range(4):F.append((a+e,a+(e+1)%4,b+(e+1)%4,b+e))
 F+=[(3,2,1,0),(4*m-4,4*m-3,4*m-2,4*m-1)];return V,F

# ---------------------------------------------------------------- rear: panel and valance, no bumper
# Centreline profile (z, x) under the lid lip: flat lamp band, small step, rounded valance tucking under.
REAR_PROFILE=[(.852,-2.170),(.80,-2.168),(.70,-2.165),(.625,-2.162),(.612,-2.170),(.600,-2.176),(.56,-2.177),
 (.48,-2.173),(.40,-2.163),(.34,-2.148),(.30,-2.122),(.275,-2.085),(.262,-2.045)]
def rear_x(y,z):
 zs=[p[0] for p in REAR_PROFILE][::-1];xs=[p[1] for p in REAR_PROFILE][::-1]
 return float(np.interp(z,zs,xs))+.045*smoothstep((abs(y)-.56)/.22)
def rebuild_rear():
 remove(('Para_choque_traseiro','Painel_traseiro'))
 ys=np.linspace(-.785,.785,41);V=[];UV=[]
 for y in ys:
  for z,_ in REAR_PROFILE:V.append((rear_x(y,z),y,z))
 new_mesh('Painel_traseiro',V,grid_faces(len(ys),len(REAR_PROFILE),True),bpy.data.materials['Pintura_preta'],'01_Carroceria',smooth=True,outward=(-1,0,0))
 # Lamps and the number sit on the band instead of floating in front of it.
 for i in ['','.001','.002','.003']:
  parts=[bpy.data.objects[n+i] for n in ('Aro_lanterna','Lanterna_redonda','Miolo_lanterna')]
  W=np.concatenate([world_verts(o) for o in parts]);c=W.mean(0);dx=rear_x(c[1],c[2])+.014-W[:,0].max()
  for o in parts:o.matrix_world=Matrix.Translation((dx,0,0))@o.matrix_world
 for n,sink in (('Tampa_central_traseira',.004),('Numero_traseiro',-.001)):
  o=bpy.data.objects[n];W=world_verts(o);c=W.mean(0)
  o.matrix_world=Matrix.Translation((rear_x(c[1],c[2])+sink-W[:,0].max(),0,0))@o.matrix_world
 # The floor and sill returns used to show below the old bumper: keep them inside the new valance.
 for o in root.children_recursive:
  if o.type=='MESH' and o.data.materials and o.data.materials[0] and o.data.materials[0].name=='Chapa_fechamento_V04':
   W=world_verts(o);m=W[:,0]<-1.95
   if m.any():
    lim=np.array([rear_x(y,z)+.018 for y,z in W[m][:,1:]]);W[m,0]=np.maximum(W[m,0],lim);set_world_verts(o,W)

# ---------------------------------------------------------------- front: 7 inch round sealed beams
def rebuild_headlights():
 remove(('Farol_circular','Aro_farol','Ranhura_lente'))
 lens=bpy.data.materials['Lente_farol'];chrome=bpy.data.materials['Aros_polidos']
 for side,suffix in ((-1,''),(1,'.001')):
  housing=bpy.data.objects['Alojamento_farol'+suffix];H=world_verts(housing)
  c=(H[:,0].max()-.018,side*.6355,(H[:,2].min()+H[:,2].max())/2)  # set back into the bezel
  # Chrome retaining ring, then a stepped glass dome (the fluted sealed-beam look).
  ring=[(.084,-.004),(.084,.010),(.090,.016),(.099,.013),(.101,.004),(.101,-.004)]
  away=lambda q,c=c:q-Vector((c[0]-.05,c[1],c[2]))
  V,F=revolve(ring,c);new_mesh('Aro_farol'+suffix,V,F,chrome,'04_Farois_Lanternas_Detalhes',smooth=True,outward=away)
  dome=[(0,.028),(.020,.0275),(.021,.0255),(.042,.024),(.043,.021),(.062,.0175),(.063,.0145),(.078,.010),(.086,.004),(.086,0)]
  V,F=revolve(dome,c);new_mesh('Farol_circular'+suffix,V,F,lens,'04_Farois_Lanternas_Detalhes',smooth=True,outward=away)

# ---------------------------------------------------------------- window nets: 6 x 4 straps, 40 mm webbing
NET_COLUMNS,NET_ROWS,NET_STRAP,NET_THICK=6,4,.040,.004
def rebuild_nets():
 """One net per door window, framed by the old straps once they follow the new greenhouse."""
 mat=bpy.data.materials['Rede_tecido_preto']
 for side in ('Motorista','Passageiro'):
  s=1 if side=='Motorista' else -1
  lo=world_verts(bpy.data.objects['Rede_horizontal_'+side])
  ends=lambda W,front:W[np.abs(W[:,0]-(W[:,0].max() if front else W[:,0].min()))<.02].mean(0)
  br,bf0=ends(lo,False),ends(lo,True)
  # Top edge follows the window head: the upper ends of the old vertical straps.
  tops=[]
  for o in root.children_recursive:
   if o.name.startswith('Rede_vertical_'+side):
    W=world_verts(o);tops.append(W[W[:,2]>W[:,2].max()-.01].mean(0))
  tops=np.array(sorted(tops,key=lambda p:p[0]));tops=tops[tops[:,2]>1.1]
  x_rear,x_front=br[0],tops[-1][0]
  top=lambda x:np.array([x,np.interp(x,tops[:,0],tops[:,1]),np.interp(x,tops[:,0],tops[:,2])-.012])
  # Front edge nearly upright, leaving the open triangle by the A-pillar seen in carro_3 and carro_12.
  bottom=lambda x:br+(bf0-br)*(x-br[0])/(bf0[0]-br[0])
  x_bot_front=.62
  def P(a,b):
   return (1-b)*bottom(x_rear+a*(x_bot_front-x_rear))+b*top(x_rear+a*(x_front-x_rear))
  n=np.cross(P(1,0)-P(0,1),P(1,1)-P(0,0));n/=np.linalg.norm(n)
  if n[1]*s<0:n=-n
  V=[];F=[]
  def add(vf):
   o=len(V);V.extend(vf[0]);F.extend([tuple(i+o for i in f) for f in vf[1]])
  for i in range(NET_COLUMNS):
   a=i/(NET_COLUMNS-1);add(strap([P(a,b) for b in np.linspace(0,1,7)],n,NET_STRAP,NET_THICK))
  for j in range(NET_ROWS):
   b=j/(NET_ROWS-1);line=[P(a,b)+n*.003 for a in np.linspace(0,1,13)]
   d0=(line[1]-line[0])/np.linalg.norm(line[1]-line[0]);d1=(line[-1]-line[-2])/np.linalg.norm(line[-1]-line[-2])
   line[0]=line[0]-d0*NET_STRAP/2;line[-1]=line[-1]+d1*NET_STRAP/2;add(strap(line,n,NET_STRAP,NET_THICK))
  remove(('Rede_horizontal_'+side,'Rede_vertical_'+side))
  new_mesh('Rede_janela_'+side,V,F,mat,'02_Vidros_Redes_Interior')

# ---------------------------------------------------------------- decals conformed to the hood
def conform(target,xs,ys,offset=.003):
 """Grid on target's top surface (rays straight down); returns world verts, normals and a hit mask."""
 T=bvh(target);V=[];N=[]
 for x in xs:
  for y in ys:
   hit=T.ray_cast(Vector((x,y,2.5)),Vector((0,0,-1)))
   if hit[0] is None:V.append((x,y,0));N.append((0,0,1));continue
   n=hit[1] if hit[1].z>0 else -hit[1];V.append(tuple(hit[0]+n*offset));N.append(tuple(n))
 return np.array(V),np.array(N)

def emission(name,rgb):
 m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;nt.nodes.clear()
 e=nt.nodes.new('ShaderNodeEmission')
 # sRGB input colour -> linear so the rendered PNG shows the intended paint colour.
 e.inputs['Color'].default_value=(*[((c/255+.055)/1.055)**2.4 if c/255>.04045 else c/255/12.92 for c in rgb],1)
 out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(e.outputs[0],out.inputs[0]);return m

def render_livery(path,width,length,items,px_per_m=1200):
 """Draws text/bars in a throwaway scene, top view, u=+Y (car left), v=towards the windshield."""
 sc=bpy.data.scenes.new('TEX_LIVERY');objs=[]
 cam=bpy.data.cameras.new('TEX_CAM');cam.type='ORTHO';cam.ortho_scale=max(width,length)
 co=bpy.data.objects.new('TEX_CAM',cam);co.location=(0,0,5);sc.collection.objects.link(co);sc.camera=co;objs.append(co)
 for kind,data in items:
  if kind=='text':
   # size: ('w',width) or ('h',height) keep the font proportions, ('wh',width,height) stretches it.
   # color: one material, or (material, material, first index of the second colour).
   txt,font,size,center,shear,color,spacing=data
   cu=bpy.data.curves.new('TEX_TXT','FONT');cu.body=txt;cu.font=bpy.data.fonts.load(str(FONTS/font),check_existing=True)
   cu.align_x='CENTER';cu.align_y='CENTER';cu.shear=shear;cu.space_character=spacing
   o=bpy.data.objects.new('TEX_TXT',cu);objs.append(o)
   if isinstance(color,tuple):
    cu.materials.append(color[0]);cu.materials.append(color[1])
    for i in range(color[2],len(txt)):cu.body_format[i].material_index=1
   else:cu.materials.append(color)
   # Measured in the active scene (an inactive scene has no depsgraph in background mode).
   bpy.context.scene.collection.objects.link(o);dg=bpy.context.evaluated_depsgraph_get();dg.update()
   ev=o.evaluated_get(dg);bb=[Vector(b) for b in ev.bound_box]
   bpy.context.scene.collection.objects.unlink(o);sc.collection.objects.link(o);w=max(b.x for b in bb)-min(b.x for b in bb);h=max(b.y for b in bb)-min(b.y for b in bb)
   kx=ky=size[1]/w if size[0]=='w' else size[1]/h
   if size[0]=='wh':kx,ky=size[1]/w,size[2]/h
   o.scale=(kx,ky,1)
   cx=(max(b.x for b in bb)+min(b.x for b in bb))/2*kx;cy=(max(b.y for b in bb)+min(b.y for b in bb))/2*ky
   o.location=(center[0]-cx,center[1]-cy,0)
  else:
   verts,color=data;me=bpy.data.meshes.new('TEX_SHAPE');me.from_pydata([(*v,0) for v in verts],[],[list(range(len(verts)))])
   me.materials.append(color);o=bpy.data.objects.new('TEX_SHAPE',me);sc.collection.objects.link(o);objs.append(o)
 r=sc.render;r.engine='BLENDER_EEVEE';r.film_transparent=True;r.resolution_x=int(width*px_per_m);r.resolution_y=int(length*px_per_m)
 r.resolution_percentage=100;r.image_settings.file_format='PNG';r.image_settings.color_mode='RGBA';r.filepath=str(path)
 sc.view_settings.view_transform='Standard';sc.view_settings.look='None'
 try:sc.eevee.taa_render_samples=32
 except AttributeError:pass
 bpy.ops.render.render(write_still=True,scene=sc.name)
 for o in objs:
  d=o.data;bpy.data.objects.remove(o,do_unlink=True)
  if isinstance(d,bpy.types.Curve):bpy.data.curves.remove(d)
  elif isinstance(d,bpy.types.Mesh):bpy.data.meshes.remove(d)
  elif isinstance(d,bpy.types.Camera):bpy.data.cameras.remove(d)
 bpy.data.scenes.remove(sc)
 for f in [f for f in bpy.data.fonts if Path(bpy.path.abspath(f.filepath)).parent==FONTS]:bpy.data.fonts.remove(f)
 for m in [m for m in bpy.data.materials if m.name.startswith('TEX_')]:bpy.data.materials.remove(m)

def rect(y0,y1,v0,v1):return [(y0,v0),(y1,v0),(y1,v1),(y0,v1)]
def shield(cy,cv,s):
 pts=[(-.5,.5),(.5,.5),(.5,.05),(.35,-.25),(0,-.55),(-.35,-.25),(-.5,.05)];return [(cy+a*s,cv+b*s) for a,b in pts]

# Hood livery, car X ranges (windshield side first). Layout measured on the hood pins in capo_omp/05_topo_omp.png.
HOOD_X0,HOOD_X1,HOOD_W=1.00,2.00,1.00
def build_omp_hood(tmp):
 yellow,white,dark=emission('TEX_amarelo',(246,212,0)),emission('TEX_branco',(238,238,236)),emission('TEX_escuro',(10,10,10))
 L=HOOD_X1-HOOD_X0;v=lambda x:(HOOD_X0+L/2)-x  # texture Y (up = windshield) for a car X
 # From the windshield: RDO DO OLEO by the rear hood pins, OMP between two bars, nextlane by the front pins.
 items=[('text',('RDO DO ÓLEO','ariblk.ttf',('w',.50),(.035,v(1.085)),0,yellow,1.12)),
  ('shape',(shield(-.262,v(1.085),.062),yellow)),
  ('shape',([(-.285,v(1.066)),(-.272,v(1.066)),(-.238,v(1.104)),(-.251,v(1.104))],dark)),
  ('shape',(rect(-.445,.445,v(1.285),v(1.250)),yellow)),
  ('text',('OMP','ariblk.ttf',('wh',.87,.25),(0,v(1.448)),.20,yellow,.92)),
  ('shape',(rect(-.445,.445,v(1.650),v(1.618)),yellow)),
  ('text',('nextlane','GOTHICB.TTF',('w',.86),(0,v(1.84)),0,(white,yellow,4),.96))]
 path=tmp/'capo_omp_v05.png';render_livery(path,HOOD_W,L,items)
 img=bpy.data.images.load(str(path));img.name='capo_omp_v05.png';img.pack();img.filepath_raw='//../texturas/capo_omp_v05.png'
 mat=bpy.data.materials['Decal_capo'];next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image=img
 old=bpy.data.images.get('assinaturas_omp_capo.png')
 if old and old.users==0:bpy.data.images.remove(old)
 xs=np.linspace(HOOD_X0,HOOD_X1,56);ys=np.linspace(-HOOD_W/2,HOOD_W/2,56)
 V,N=conform(bpy.data.objects['Capo'],xs,ys)
 UV=[((y+HOOD_W/2)/HOOD_W,(HOOD_X1-x)/L) for x in xs for y in ys]
 new_mesh('Decal_capo',V,grid_faces(len(xs),len(ys),True),mat,'05_Pintura_Adesivos',UV,smooth=True,outward=(0,0,1))

def build_eletric():
 """eletric logo on the dipped nose, sized from carro_23 (about 0.75 m wide) with its texture aspect kept."""
 mat=bpy.data.materials['Logo_frontal'];img=next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image
 w=.74;h=w*img.size[1]/img.size[0];capo=bpy.data.objects['Capo'];T=bvh(capo)
 ys=np.linspace(-w/2,w/2,41);V=[];UV=[];rows=16
 for y in ys:
  # Walk up the nose from the front edge along the surface, so the letters keep their height.
  x=2.31
  while T.ray_cast(Vector((x,y,2.5)),Vector((0,0,-1)))[0] is None and x>2.0:x-=.002
  pts=[];x0=x
  for xx in np.arange(x0,1.9,-.002):
   hit=T.ray_cast(Vector((xx,y,2.5)),Vector((0,0,-1)))
   if hit[0] is not None:pts.append((hit[0],hit[1] if hit[1].z>0 else -hit[1]))
  P=np.array([tuple(p) for p,_ in pts]);s=np.concatenate([[0],np.cumsum(np.linalg.norm(np.diff(P,axis=0),axis=1))])
  base=.012
  for r in range(rows):
   t=base+h*r/(rows-1);k=np.searchsorted(s,t);k=min(max(k,1),len(P)-1)
   f=(t-s[k-1])/max(s[k]-s[k-1],1e-6);p=P[k-1]+(P[k]-P[k-1])*f;n=np.array(tuple(pts[k][1]))
   V.append(tuple(p+n*.003));UV.append(((y+w/2)/w,r/(rows-1)))
 new_mesh('Logo_borda_capo',V,grid_faces(len(ys),rows),mat,'05_Pintura_Adesivos',UV,smooth=True,outward=(1,0,1))

# ---------------------------------------------------------------- parts that sit on reshaped surfaces
def seat_down(names,target):
 T=bvh(bpy.data.objects[target]);group=[bpy.data.objects[n] for n in names]
 W=np.concatenate([world_verts(o) for o in group]);c=W.mean(0)
 hit=T.ray_cast(Vector((c[0],c[1],2.5)),Vector((0,0,-1)))
 if hit[0] is None:return
 dz=hit[0].z+.001-W[:,2].min()
 for o in group:o.matrix_world=Matrix.Translation((0,0,dz))@o.matrix_world
def seat_on_glass():
 glass=bpy.data.objects['Vidro_traseiro'];T=bvh(glass)
 # Their origins sit away from the geometry, so they are placed by the centre of their vertices.
 for o in [o for o in root.children_recursive if o.name.startswith('Abertura_ventilacao')]:
  c=world_verts(o).mean(0);hit=T.ray_cast(Vector((c[0],c[1],2.5)),Vector((0,0,-1)))
  if hit[0] is None:continue
  n=hit[1] if hit[1].z>0 else -hit[1];o.rotation_euler=(0,math.atan2(n.x,n.z),0);bpy.context.view_layer.update()
  o.matrix_world=Matrix.Translation(hit[0]+n*.002-Vector(world_verts(o).mean(0)))@o.matrix_world
 for o in [o for o in root.children_recursive if o.name.startswith('Rebite_vidro_traseiro')]:
  c=Vector(world_verts(o).mean(0));near=T.find_nearest(c)
  if near[0] is not None:o.matrix_world=Matrix.Translation(near[0]+near[1].normalized()*.002*(1 if near[1].z>0 else -1)-c)@o.matrix_world

def main():
 reshape()
 rebuild_rear();rebuild_headlights();rebuild_nets()
 import tempfile;tmp=Path(tempfile.mkdtemp(prefix='opala_v05_'))
 if LIVERY=='assinaturas_omp':build_omp_hood(tmp)
 build_eletric()
 for i,target in ((0,'Capo'),(2,'Capo'),(4,'Tampa_porta_malas')):
  for j in (i,i+1):
   sfx='' if j==0 else f'.{j:03d}';seat_down(['Base_trava'+sfx,'Pino_trava'+sfx,'Argola_trava'+sfx],target)
 seat_on_glass()
 output.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(output),copy=True,compress=True)
 print('V05_SAVED',output,flush=True)
main()
