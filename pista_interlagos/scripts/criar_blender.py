"""Blender 5.1, executar em background. Modelo em metros, X leste Y norte Z cima."""
import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[1]
D=np.load(R/'dados/pista_processada.npz');A=D['samples'];N=len(A)
META=json.loads((R/'dados/validacao_geometria.json').read_text())
K=META['horizontal_scale_to_fia_length']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection':bpy.data.collections.remove(c)
base=bpy.data.collections.get('Collection');base.name='INTERLAGOS'
def collection(name):
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c);return c
roadcol=collection('01_PISTA_LIDAR');landcol=collection('02_TERRENO_ORTOFOTO');detailcol=collection('03_CENARIO_APROXIMADO');carcol=collection('04_OPALA_99');camcol=collection('05_CAMERAS_LUZ')
def move(obj,col):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 col.objects.link(obj);return obj
def mat(name,color,rough=.7):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=rough
 return m
asphalt=mat('Asfalto',(.11,.12,.13),.94)
white=mat('Pintura_branca',(.86,.88,.84));yellow=mat('Zebra_amarela',(.95,.7,.035));green=mat('Zebra_verde',(.035,.33,.15));concrete=mat('Concreto',(.48,.49,.47));blue=mat('Boxes_azul',(.04,.14,.24));metal=mat('Metal',(.16,.18,.2),.35);glass=mat('Vidros_boxes',(.055,.11,.13),.2)
def mesh(name,verts,faces,mats,col,indices=None,uv=None):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 ob=bpy.data.objects.new(name,me);col.objects.link(ob)
 for m in mats:me.materials.append(m)
 if indices is not None:
  for p,i in zip(me.polygons,indices):p.material_index=int(i)
 if uv is not None:
  layer=me.uv_layers.new(name='UVMap')
  flat=np.array([uv[v] for p in me.polygons for v in p.vertices],dtype=np.float32).ravel()
  layer.data.foreach_set('uv',flat)
 return ob
def pos(i,offset=0,height=0):
 a=A[i%N];return (a[1]+a[9]*offset,a[2]+a[10]*offset,a[3]+a[5]*offset+height)
def ribbon(name,offset1,offset2,mats,col=roadcol,mask=None,height=.04):
 verts=[];faces=[];mi=[]
 for i in range(N):
  o1=offset1(i);o2=offset2(i)
  verts.extend([pos(i,o1,height),pos(i,o2,height)])
 for i in range(N):
  if mask is not None and not mask(i):continue
  j=(i+1)%N;face=(2*i,2*j,2*j+1,2*i+1)
  if offset1(i)>offset2(i):face=face[::-1]
  faces.append(face);mi.append((i//2)%len(mats))
 return mesh(name,verts,faces,mats,col,mi)
road=ribbon('Circuito_4309m_colisao',lambda i:-A[i,4]/2,lambda i:A[i,4]/2,[asphalt])
road['surface']='LiDAR PMSP 2017, planos locais, perfil suavizado';road['nominal_length_m']=4309
for side in [-1,1]:
 ribbon('Linha_limite_'+str(side),lambda i:side*(A[i,4]/2-.30),lambda i:side*(A[i,4]/2-.15),[white],height=.055)
turn=np.arctan2(A[:,8],A[:,7]);curv=np.angle(np.exp(1j*(np.roll(turn,-4)-np.roll(turn,4))))/16
for side in [-1,1]:
 ribbon('Zebras_'+str(side),lambda i:side*A[i,4]/2,lambda i:side*(A[i,4]/2+1.05),[yellow,green],mask=lambda i,side=side:side*curv[i]>.0027,height=.075)
# Malha de terreno com ortofoto municipal georreferenciada.
T=np.load(R/'dados/terreno.npz');xx,yy=np.meshgrid(T['x'],T['y']);zz=T['visual_z'];ny,nx=zz.shape
verts=np.column_stack([xx.ravel(),yy.ravel(),zz.ravel()]).tolist()
faces=[(j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i) for j in range(ny-1) for i in range(nx-1)]
uv=np.column_stack([(xx.ravel()/K+800)/1600,(yy.ravel()/K+925)/1850])
groundmat=mat('GeoSampa_Ortofoto_2020',(.4,.4,.4),1)
tex=groundmat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(R/'fontes/ortofoto_2020.jpg'));tex.image.pack()
groundmat.node_tree.links.new(tex.outputs['Color'],groundmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
terrain=mesh('Terreno_LiDAR_grade_4m',verts,faces,[groundmat],landcol,uv=uv)
for p in terrain.data.polygons:p.use_smooth=True
def cube(name,loc,size,material,col=detailcol,angle=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);ob=bpy.context.object;ob.name=name;ob.dimensions=size;ob.rotation_euler[2]=angle
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(material);move(ob,col);return ob
def trackcube(name,i,lateral,along,width,depth,height,material,zlift=0):
 a=A[i%N];p=Vector(pos(i,lateral,zlift+height/2));p.x+=a[7]*along;p.y+=a[8]*along
 return cube(name,p,(depth,width,height),material,angle=math.atan2(a[8],a[7]))
# Linha de largada/checker alinhada com o plano da pista.
for row in range(2):
 for c in range(20):
  if (row+c)%2:continue
  a=A[0];lat=-a[4]/2+(c+.5)*a[4]/20
  tangent=np.array([a[7],a[8],a[6]])
  v=[]
  for f,l in [(-.25,-a[4]/40),(.25,-a[4]/40),(.25,a[4]/40),(-.25,a[4]/40)]:
   p=np.array(pos(0,lat+l,.06))+tangent*(f+(row-.5)*.5);v.append(tuple(p))
  mesh('Largada_quadricula',v,[(0,1,2,3)],[white],roadcol)
# Muros e boxes sao volumes de contexto, nao levantamento arquitetonico.
for i in range(0,N,4):
 s=A[i,0]
 if s<250 or s>3820 or 750<s<1570:
  j=(i+4)%N
  for side in [-1,1]:
   off=side*(A[i,4]/2+(2.5 if s<250 else 5))
   p=Vector(pos(i,off,.6));q=Vector(pos(j,off,.6));mid=(p+q)/2
   ob=cube('Muro_protecao',mid,((q-p).length+.06,.30,1.1),concrete,angle=math.atan2(q.y-p.y,q.x-p.x))
   ob.rotation_euler=(q-p).to_track_quat('X','Z').to_euler()
for i in range(5,112,8):
 trackcube('Box_garagem',i,27,0,12,15.4,6,concrete)
 trackcube('Box_cobertura',i,27,0,14,16,0.3,blue,zlift=6)
 trackcube('Box_porta',i,20.8,0,.12,11,3.8,metal,zlift=.2)
 trackcube('Box_janela',i,20.7,0,.15,12,1,glass,zlift=4.5)
for i in range(2060,2135,14):
 for level in range(5):trackcube('Arquibancada',i,-21-level*1.2,0,1.3,26,.65,concrete,zlift=level*.65)
# Portico de largada simples, sem marcas inventadas.
for side in [-1,1]:trackcube('Portico_coluna',0,side*10,0,.4,.4,7,metal)
trackcube('Portico_travessa',0,0,0,20,.5,.5,metal,zlift=6.6)
def text_obj(body,location,size=1):
 cu=bpy.data.curves.new(body,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';ob=bpy.data.objects.new(body,cu);detailcol.objects.link(ob);ob.location=location;cu.materials.append(white);return ob
# Marco no arquivo, util ao abrir sem render.
empty=bpy.data.objects.new('ORIGEM_UTM_327050_7377625_Z720',None);base.objects.link(empty);empty['sources']=json.dumps(META)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.world.color=(.18,.18,.18);scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.63,.79,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
bpy.ops.object.light_add(type='SUN',location=(200,-300,1000));sun=bpy.context.object;sun.name='Sol';sun.rotation_euler=(.45,-.5,-.4);sun.data.energy=2.5;sun.data.angle=.05;move(sun,camcol)
def camera(name,loc,target,lens=40,ortho=None):
 bpy.ops.object.camera_add(location=loc);ob=bpy.context.object;ob.name=name;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler();ob.data.lens=lens;ob.data.clip_end=10000
 if ortho:ob.data.type='ORTHO';ob.data.ortho_scale=ortho
 move(ob,camcol);return ob
overview=camera('01_Visao_geral',(-1300,-1650,1600),(0,30,25),45)
top=camera('02_Planta', (0,0,2100),(0,0,0),ortho=1940)
carpoint=Vector(pos(0,0,.07));forward=Vector((A[0,7],A[0,8],A[0,6])).normalized()
chase=camera('03_Camera_carro',carpoint-forward*11+Vector((0,0,4)),carpoint+forward*18+Vector((0,0,1)),32)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
# Exporta a pista antes de adicionar o carro, luz e cameras excluidas.
bpy.ops.object.select_all(action='DESELECT')
for col in [roadcol,landcol,detailcol]:
 for ob in col.objects:
  if ob.type=='MESH':ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(R/'exports/interlagos_pista.glb'),use_selection=True,export_format='GLB',export_apply=True)
print('TRACK_EXPORTED',flush=True)
# Colisao limpa para importacao em engines: apenas faixa do asfalto.
bpy.ops.object.select_all(action='DESELECT');road.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(R/'exports/interlagos_colisao.glb'),use_selection=True,export_format='GLB')
bpy.ops.object.select_all(action='DESELECT')
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(R.parent/'modelo_3d/v03_lateral/exports/opala99_assinaturas_omp.glb'))
new=set(bpy.data.objects)-before
root=bpy.data.objects.new('OPALA_TESTE_ROOT',None);carcol.objects.link(root)
for ob in new:
 move(ob,carcol)
 if ob.parent not in new:ob.parent=root
left=Vector((A[0,9],A[0,10],A[0,5])).normalized();up=forward.cross(left).normalized();left=up.cross(forward).normalized()
root.rotation_mode='QUATERNION';root.rotation_quaternion=Matrix((forward,left,up)).transposed().to_quaternion();root.location=carpoint
scene.camera=chase
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_distance=35;area.spaces.active.region_3d.view_location=carpoint;area.spaces.active.clip_end=10000
# Documentacao embutida e referencias de origem.
doc=bpy.data.texts.new('LEIA_ME_INTERLAGOS.txt');doc.write('INTERLAGOS - pista de testes Opala 99\n\n'+json.dumps(META,indent=2,ensure_ascii=False)+'\n\nFontes completas no README.md e pasta fontes. Asfalto LiDAR 2017, ortofoto 2020, traçado FIA 2025. Cenário/boxes/zebras simplificados. Para dirigir: INICIAR_TESTE.cmd na pasta pista_interlagos.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'interlagos_opala99.blend'))
for cam,name in [(overview,'visao_geral'),(chase,'carro_na_largada')]:
 scene.camera=cam;scene.render.filepath=str(R/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
scene.camera=chase;bpy.ops.wm.save_as_mainfile(filepath=str(R/'interlagos_opala99.blend'))
print('BLENDER_COMPLETE',flush=True)
