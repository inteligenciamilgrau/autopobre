"""Export the Fusca V2 (modelo_3d/fusca_v2, modelled from measurements by criar_fusca_v2.py) to the game GLB.

Usage, from the project root (the output defaults to pista_interlagos/teste/assets/fusca_v2.glb):
 blender --background --factory-startup --python-exit-code 2 --python modelo_3d/scripts/exportar_fusca_jogo.py [-- output.glb]

The car is built again by criar_fusca_v2.py's own functions, at a game resolution: the body's sections and the
lathed parts are coarser, the thin trims lose bevel steps; nothing is decimated. No .blend is opened or changed.
The GLB is in the Opala's frame (main.js): +X forward, +Y up, -Z the driver's (left) side, the tyres on y=0. The
Fusca's 2.40 m wheelbase is centred on the Opala's (physics axles at +1.55 and -1.117 m), so each axle sits about
13 cm inside the physics' contact points. What the game (fusca.js) finds by name:
 - Roda_{Dianteira,Traseira}_{Esquerda,Direita}_PIVO: an unrotated empty at each wheel centre (axle along Z) holding
   tyre, wheel, drum, hubcap and trim ring, turned and spun by main.js as the Opala's.
 - Pintura_fusca: the body paint (the team's colour). Fusca_painel: the dash's face toward the driver, painted like
   the body as a Fusca's metal dash is (the team's colour in the game).
 - Lanterna_fusca: the tail lamps' red lens (lit while braking). Volante_Fusca: the steering wheel's rim and spoke,
   hidden in a driven car (the driver brings the race wheel he turns); its column stays.
 - Vidro_fusca: the windows.
Changed from the studio model: a dash up to the windscreen with a speedometer, the windscreen and rear window cut
open whole, a yellow plate; the headlamps and indicators glow less (in the studio the 30 W bulbs light the scene,
on track they are off in daylight). Left out: its driver (the game seats its own), scenery, cameras and lights.
"""
import bpy,sys,math,re
from pathlib import Path
from mathutils import Matrix,Vector
R=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(R/'modelo_3d/fusca_v2'))
import criar_fusca_v2 as V2,medidas_fusca as MED
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
output=Path(args[0]).resolve() if args else R/'pista_interlagos/teste/assets/fusca_v2.glb'
# criar_fusca_v2.py: front -Y, Z up, origin at the wheelbase's middle on the ground. Turned +90 degrees about Z (front to
# +X, left to +Y, which glTF makes -Z) and moved forward to the middle of the Opala's wheelbase: axles at x +1.417, -0.983.
OFFSET_X=.2165
TO_GAME=Matrix.Translation((OFFSET_X,0,0))@Matrix.Rotation(math.radians(90),4,'Z')
# Game resolution: body sections along and round the car (the studio model has 300 x 192), lathed parts' segments
# (up to 96), the step between the points of the trims round the windows (1.5 cm) and the trims' bevel steps (none
# for the hair-thin panel gaps and louvres).
SECTIONS,RING=170,112
LATHE=36
TRIM_STEP=.03
TRIM_BEVEL,THIN=1,.005
EMISSION={'Farol_Luz':1.5,'Farol_Disco':.3,'Seta_Ambar':.4}
RENAME={'Tinta_Azul':'Pintura_fusca','Lanterna':'Lanterna_fusca','Vidro':'Vidro_fusca'}
WHEEL=re.compile(r'^(Pneu|Roda|Tambor|Calota|Aro_roda)_([ED])_([+-]1\.2)$')
STEERING=('Volante','Volante_raio')

lathe,dense=V2.revolucao,V2.densificar
V2.revolucao=lambda nome,perfil,cx,cy,cz,seg,mat,sinal=1,suave=True:lathe(nome,perfil,cx,cy,cz,min(seg,LATHE),mat,sinal,suave)
V2.densificar=lambda pts,passo=.02,fechar=True:dense(pts,max(passo,TRIM_STEP),fechar)
bpy.ops.wm.read_factory_settings(use_empty=True)
mats=V2.criar_materiais()
V2.usar_colecao('Fusca_v2')
car,body=V2.construir_carroceria(mats,SECTIONS,RING)
sup=V2.construir_tudo(car,body,mats)['sup']

# criar_fusca_v2.py cuts the windscreen and the rear window with a slab between their outlines' points only: the
# roof's dome rises out of it across the rear window, and 40% of that opening (its middle) stays shut behind the
# glass (the studio renders hide it under reflections; in the game the paint shows through the glass). A prism
# straight down through each measured outline, from above the roof to 8 cm under the glass, opens them whole.
def open_window(outline,depth=.08):
 ring=V2.densificar(outline,.02,True);low=min(sup.topo(x,y)[0].z for x,y in ring)-depth;n=len(ring);V,F=[],[]
 V.extend((x,y,low) for x,y in ring);V.extend((x,y,2.5) for x,y in ring)
 for a,b,c in V2.triangular(ring):F.append((a,c,b));F.append((n+a,n+b,n+c))
 F.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
 V2.subtrair(body,V,F)
for outline in (MED.PLANTA_PARABRISA,MED.PLANTA_VIDRO_TRAS):open_window(outline)
# The body's 4th slot (the floor's inner faces, the dark interior in criar_fusca_v2.py) comes out of its booleans
# empty, and an empty slot exports without a material (three.js draws it white): the dark interior again.
for i,m in enumerate(body.data.materials):
 if m is None:body.data.materials[i]=mats['interior']
# Every window open: rays through points inside each outline (85%) must pass the uncut body's surface.
def shut(outline,side):
 import numpy as np
 from mathutils.bvhtree import BVHTree
 me=body.data;bvh=BVHTree.FromPolygons([v.co for v in me.vertices],[p.vertices for p in me.polygons]);P=np.array(outline);lo,hi=P.min(0),P.max(0)
 pts=[(a,b) for a in np.linspace(lo[0],hi[0],25) for b in np.linspace(lo[1],hi[1],25)];pts=[p for p,k in zip(pts,V2.dentro_poligono(np.array(pts),V2.escalar_poligono(outline,.85))) if k];closed=0
 for a,b in pts:
  s,_=sup.lado(a,b,1.0) if side else sup.topo(a,b);h,*_=bvh.ray_cast(Vector((3,a,b)),Vector((-1,0,0)),6) if side else bvh.ray_cast(Vector((a,b,3.5)),Vector((0,0,-1)),7)
  closed+=bool(s and h and (s-h).length<.03)
 return closed/len(pts)
for name,outline,side in (('para-brisa',MED.PLANTA_PARABRISA,False),('vidro traseiro',MED.PLANTA_VIDRO_TRAS,False),('porta',MED.JAN_PORTA,True),('lateral traseira',MED.JAN_QUARTO,True)):
 left=shut(outline,side);print('JANELA_FECHADA',name,round(left,3),flush=True);assert left<.02,(name,left)

# The dash. The .blend's box under the windscreen leaves a 16 cm gap through which the driver's camera sees into
# the empty front trunk (the body is a hollow shell) and the backs of the headlamps. In its place, a panel from the
# driver's knees up to the windscreen's base with its ends on the body's inner skin: the face toward the driver
# painted (Fusca_painel), the padded top and the rest dark, the speedometer in the face behind the steering wheel.
# Profile (y, z) round the panel: the face, the padded top up to the glass, the front and the bottom.
DASH=((-.32,.74),(-.32,.95),(-.35,.99),(-.42,1.025),(-.58,1.075),(-.66,1.0),(-.66,.74))
SPEEDO=(.34,.855) # x, z: in front of the steering wheel's hub (V2: .34, -.26, .90)
bpy.data.objects.remove(bpy.data.objects['Painel'])
painted=mats['tinta'].copy();painted.name='Fusca_painel'
def inner(y,z):
 loc,_=sup.lado(y,z,1.0);return (loc.x if loc else .66)-.035
n=len(DASH);half=[inner(y,z) for y,z in DASH]
verts=[(h,y,z) for h,(y,z) in zip(half,DASH)]+[(-h,y,z) for h,(y,z) in zip(half,DASH)]
faces=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]+[tuple(range(n)),tuple(range(2*n-1,n-1,-1))]
dash=V2.novo_objeto('Painel_jogo',verts,faces,[mats['interior'],painted],suave=False);V2.recalcular_normais(dash);dash.data.polygons[0].material_index=1
dial=V2.material('Mostrador',(.008,.008,.009),rug=.3);ink=V2.material('Ponteiro',(.85,.84,.8),rug=.5);needle=V2.material('Ponteiro_laranja',(1,.3,.03),rug=.4)
def disc(name,radius,depth,y,mat,seg=32):
 import bmesh
 bm=bmesh.new();bmesh.ops.create_cone(bm,cap_ends=True,segments=seg,radius1=radius,radius2=radius,depth=depth)
 bmesh.ops.rotate(bm,verts=bm.verts,cent=(0,0,0),matrix=Matrix.Rotation(math.radians(90),3,'X'))
 bmesh.ops.translate(bm,verts=bm.verts,vec=(SPEEDO[0],y,SPEEDO[1]))
 me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free();me.materials.append(mat);return V2.linkar(bpy.data.objects.new(name,me))
disc('Velocimetro_aro',.068,.016,-.312,mats['cromo']);disc('Velocimetro',.06,.001,-.3035,dial)
# Seen from the seat (looking along -y, +z up) the driver's right is -x: a mark every 33.75 degrees from the
# lower left round to the lower right, the needle near the start.
def mark(name,radius,angle,size,mat):
 a=math.radians(angle);V2.caixa(name,(SPEEDO[0]-radius*math.cos(a),-.3025,SPEEDO[1]+radius*math.sin(a)),size,mat,rot=(0,-math.atan2(math.sin(a),-math.cos(a)),0))
for k in range(9):mark(f'Velocimetro_marca_{k}',.048,225-k*33.75,(.012,.002,.0035),ink)
mark('Velocimetro_ponteiro',.02,195,(.042,.0015,.003),needle)
# A dull yellow plate, as Brazil's were (the .blend's light grey glares in the game's sun).
mats['placa'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.3,.26,.07,1)
scene=bpy.context.scene;bpy.context.view_layer.update()
parts=[o for o in bpy.data.collections['Fusca_v2'].objects if o.type in ('MESH','CURVE') and not o.name.startswith('Piloto_')]

# Materials: names the game knows.
for m in bpy.data.materials:
 if m.name in RENAME:m.name=RENAME[m.name]
 b=m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
 if b and m.name in EMISSION:b.inputs['Emission Strength'].default_value=EMISSION[m.name]

def evaluated(o):
 """The object's mesh as shown, in game coordinates."""
 if o.type=='CURVE':o.data.bevel_resolution=0 if o.data.bevel_depth<THIN else min(o.data.bevel_resolution,TRIM_BEVEL)
 dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),depsgraph=dg);me.validate()
 for uv in list(me.uv_layers):me.uv_layers.remove(uv)
 # A material in two slots (the body's inner faces, criar_fusca_v2.py) goes in one: one primitive per material.
 first={}
 for i,m in enumerate(me.materials):first.setdefault(m,i)
 for p in me.polygons:p.material_index=first[me.materials[p.material_index]]
 me.transform(TO_GAME@o.matrix_world);return me

temporary=bpy.data.collections.new('EXPORTAR_FUSCA');scene.collection.children.link(temporary)
def place(name,me,parent=None,offset=Vector()):
 me.transform(Matrix.Translation(-offset));o=bpy.data.objects.new(name,me);temporary.objects.link(o);o.parent=parent;return o
root=bpy.data.objects.new('FUSCA_ROOT',None);temporary.objects.link(root)
root['entre_eixos_m']=2.4;root['deslocamento_x_m']=OFFSET_X;root['origem']='Fusca V2: modelado do zero a partir de medidas (modelo_3d/fusca_v2)'

# Wheels: each one's parts on an empty at its centre (V2.BITOLA across, V2.EIXO_F/T along, V2.RAIO_RODA up).
pivots={}
for side,name in (('E','Esquerda'),('D','Direita')):
 for axle,front in (('-1.2',True),('+1.2',False)):
  s=1 if side=='E' else -1;at=TO_GAME@Vector((s*V2.BITOLA,float(axle),V2.RAIO_RODA))
  p=bpy.data.objects.new(f'Roda_{"Dianteira" if front else "Traseira"}_{name}_PIVO',None);temporary.objects.link(p);p.parent=root;p.location=at;pivots[(side,axle)]=p
steering=[]
for o in parts:
 w=WHEEL.match(o.name)
 if w:place('roda_'+w.group(1),evaluated(o),pivots[(w.group(2),w.group(3))],pivots[(w.group(2),w.group(3))].location);continue
 if o.name in STEERING:steering.append(evaluated(o));continue
 place(o.name,evaluated(o),root)
assert all(len(p.children)==5 for p in pivots.values()),{p.name:len(p.children) for p in pivots.values()}
assert len(steering)==2,len(steering)
wheel=place('Volante_Fusca',steering[0],root);extra=place('volante_raio',steering[1],root)
bpy.ops.object.select_all(action='DESELECT');wheel.select_set(True);extra.select_set(True);bpy.context.view_layer.objects.active=wheel;bpy.ops.object.join()

# One mesh per parent and material set (the wheel pivots keep theirs; the steering wheel stays apart).
groups={}
for o in list(temporary.objects):
 if o.type=='MESH' and o.name!='Volante_Fusca':groups.setdefault((o.parent.name,tuple(m.name if m else '' for m in o.data.materials)),[]).append(o)
for (parent,names),objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 bpy.context.object.name='GLB_'+parent+'_'+'_'.join(names)
bpy.ops.object.select_all(action='DESELECT')
for o in temporary.objects:o.select_set(True)
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,
 export_cameras=False,export_lights=False,export_texcoords=False,export_tangents=False)

# The game finds wheels, paint, dash, lamps and the steering wheel by these names.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(output))
imported=next(o for o in bpy.data.objects if o.name.startswith('FUSCA_ROOT'))
found=[o for o in imported.children_recursive if o.type=='EMPTY' and o.name.startswith('Roda_') and '_PIVO' in o.name]
assert len(found)==4 and sum('Dianteira' in o.name for o in found)==2,[o.name for o in found]
assert all(o.rotation_quaternion.angle<1e-6 for o in found),'pivos girados'
assert all(m for o in imported.children_recursive if o.type=='MESH' for m in o.data.materials),'malha sem material'
materials={m.name for o in imported.children_recursive if o.type=='MESH' for m in o.data.materials if m}
missing={'Pintura_fusca','Fusca_painel','Lanterna_fusca','Vidro_fusca'}-materials;assert not missing,missing
assert any(o.name.startswith('Volante_Fusca') for o in imported.children_recursive),'volante'
triangles=sum(len(p.vertices)-2 for o in imported.children_recursive if o.type=='MESH' for p in o.data.polygons)
dims=[max(v)-min(v) for v in zip(*[o.matrix_world@Vector(c) for o in imported.children_recursive if o.type=='MESH' for c in o.bound_box])]
print('FUSCA_PIVOS',', '.join(f'{o.name} {tuple(round(v,3) for v in o.matrix_world.translation)}' for o in sorted(found,key=lambda o:o.name)),flush=True)
print('FUSCA_MEDIDAS_BLENDER_XYZ',[round(d,3) for d in dims],'triangulos',triangles,'materiais',len(materials),flush=True)
print('GLB_EXPORTED',output,round(output.stat().st_size/2**20,2),'MiB',flush=True)
