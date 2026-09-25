"""V06 interior: the game's cockpit (pista_interlagos/teste/cockpit*.js, rebuilt from photos carro_8, 14, 24-36) brought
into the car. exportar_interior_jogo.py exports it to a GLB (each mesh named after the source line that built it);
here its crude shell boxes, its own cage, nets and padding are dropped (they do not fit this body), and the equipment
is moved as ONE rigid group down onto the V06 cabin floor. Two groups keep their own placement: the dash top meets
the windscreen base, and the Luizao switch bank hangs from a new windscreen cross tube on the V05 cage."""
import bpy,os,subprocess,sys,tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from v06_comum import *

R=Path(__file__).resolve().parents[2]
GAME_FLOOR,V06_FLOOR=.31,.217            # top of the game's floor box (cockpit.js) and of the V06 cabin floor
DZ=V06_FLOOR-GAME_FLOOR
CROSS_TUBE_X=.29                         # windscreen cross tube of the game cage (switch bank hanger)
# Game parts dropped, by source line, with the material each must have (a changed game fails here, loudly).
DROP={
 'cockpit_L64':'Int_paint','cockpit_L74':'Int_bitumen','cockpit_L75':'Int_paintSatin','cockpit_L76':'Int_hood',
 'cockpit_L77':'Int_paint','cockpit_L78':'Int_body','cockpit_L80':'Int_shell','cockpit_L87':'Int_paint','cockpit_L88':'Int_body',
 'cockpit_L90':'Int_cage','cockpit_L91':'Int_cage','cockpit_L92':'Int_cage','cockpit_L93':'Int_cage','cockpit_L94':'Int_cage',
 'cockpit_L97':'Int_webbing','cockpit_L98':'Int_webbing','cockpit_L99':'Int_silver',
 'cockpit_L101':'Int_cage','cockpit_L102':'Int_cage','cockpit_L104':'Int_cage',
 'cockpit_L106':'Int_foam','cockpit_L107':'Int_foam','cockpit_L108':'Int_foam','cockpit_L109':'Int_foam',
 'cockpit_L111':'Int_standard','cockpit_L114':'Int_basic',
 'cockpit-equipment_L78':'Int_cage','cockpit-equipment_L101':'Int_basic','cockpit-equipment_L126':'Int_aluminium',
 **{f'cockpit-rear_L{n}':m for n,m in ((25,'Int_paint'),(27,'Int_paint'),(28,'Int_paint'),(29,'Int_paint'),(30,'Int_paint'),
  (32,'Int_standard'),(38,'Int_paint'),(39,'Int_paint'),(41,'Int_paint'),(42,'Int_body'),(44,'Int_paintSatin'),(46,'Int_paint'),
  (48,'Int_paintBoth'),(51,'Int_tint'),(54,'Int_standard'),(61,'Int_physical'),(64,'Int_basic'),(67,'Int_hood'),(68,'Int_standard'),
  (72,'Int_cage'),(73,'Int_cage'),(75,'Int_cage'),(76,'Int_cage'))}}
# Equipment that collides with this body where the game's shell was different: dropped, or moved as a small rigid
# sub-group (the relay board and the battery come 4 cm inboard, clear of the V05 cage leg and rear arch cover).
DROP_FIT={'cockpit-equipment_L114':'reservatorios no pe do piloto: cruzam a gaiola V05',
 'cockpit-equipment_L116':'fio do radio: termina dentro da soleira','cockpit-equipment_L122':'linha trancada: cruza a barra de porta V05',
 'cockpit-equipment_L77':'linha de freio na soleira: atravessa o arco principal e o painel traseiro',
 'cockpit-rear_L86':'caixa ao lado da bateria: dentro da caixa de roda traseira','cockpit-rear_L88':'cabo da bateria: corre dentro da soleira'}
NUDGE={**{f'cockpit-equipment_L{n}':(0,.045,0) for n in range(23,43)},**{f'cockpit-rear_L{n}':(0,.035,0) for n in range(78,90)},
 'cockpit_L267':(0,0,-.02),'Espelho_retrovisor_interno':(0,0,-.02)}
DASH={'cockpit_L82','cockpit_L83','cockpit_L84'}                      # dash top, rolled edge and rivets: fit the body
BANK=tuple(f'cockpit-instruments_L{n}' for n in range(73,95))         # Luizao switch bank and its hanger
CRUDE_V05=('Banco_apoio_cabeca','Banco_concha_assento','Banco_concha_encosto','Cinto_ombro','Coluna_direcao','Volante',
 'Raio_volante','Alavanca_cambio','Manopla','Painel_instrumentos')

def glb_path():
 env=os.environ.get('OPALA_INTERIOR_GLB')
 if env and Path(env).is_file():return Path(env)
 py=os.environ.get('OPALA_PLAYWRIGHT_PYTHON') or str(Path(os.environ.get('TEMP',tempfile.gettempdir()))/'pwv/Scripts/python.exe')
 assert Path(py).is_file(),f'no Python with Playwright at {py}: set OPALA_PLAYWRIGHT_PYTHON or OPALA_INTERIOR_GLB'
 out=Path(tempfile.mkdtemp(prefix='opala_v06_'))/'interior_jogo.glb'
 subprocess.run([py,str(R/'modelo_3d/scripts/exportar_interior_jogo.py'),str(out)],check=True,cwd=str(R))
 return out

def base(name):return name.split('.')[0]

def build(mats):
 O=bpy.data.objects
 for o in [o for o in root().children_recursive if o.name.startswith(CRUDE_V05)]:remove(o)
 straighten_hoop()
 glb=glb_path();before=set(O);bpy.ops.import_scene.gltf(filepath=str(glb))
 new=[o for o in O if o not in before];meshes=[o for o in new if o.type=='MESH']
 for o in meshes:
  M=o.matrix_world.copy();o.parent=None;o.matrix_world=M
 for o in new:
  if o.type!='MESH':remove(o)
 for img in bpy.data.images:
  if img.packed_file is None and img.source=='FILE' and img.users:img.pack()
 if glb.parent.name.startswith('opala_v06_') and not os.environ.get('OPALA_INTERIOR_GLB'):
  import shutil;shutil.rmtree(glb.parent,ignore_errors=True)     # the temporary export
 # the cockpit's mirror material came in as a second 'Espelho': the car's own one is used instead
 for o in meshes:
  for i,m in enumerate(o.data.materials):
   if m and m.name.startswith('Espelho.') and 'Espelho' in bpy.data.materials:o.data.materials[i]=bpy.data.materials['Espelho']
 dropped=[];kept=[];dash=[];bank=[]
 for o in meshes:
  n=base(o.name);mat=o.data.materials[0].name if o.data.materials else ''
  if n in DROP:
   assert mat.startswith(DROP[n]),f'interior do jogo mudou: {n} tem {mat}, esperado {DROP[n]}';dropped.append(o)
  elif n in DROP_FIT:dropped.append(o)
  elif n in DASH:dash.append(o)
  elif n.startswith(BANK):bank.append(o)
  else:kept.append(o)
 for o in dropped:remove(o)
 # One rigid move for the equipment: the game floor (0.31) onto the V06 cabin floor.
 for o in kept:o.matrix_world=Matrix.Translation((0,0,DZ))@o.matrix_world
 for o in kept:
  if base(o.name) in NUDGE:o.matrix_world=Matrix.Translation(NUDGE[base(o.name)])@o.matrix_world
 # The switch bank hangs from a new windscreen cross tube between the V05 cage roof rails.
 tube_z,tube_y=cross_tube(mats)
 hanger_top=max(world_verts(o)[:,2].max() for o in bank)
 for o in bank:o.matrix_world=Matrix.Translation((0,0,tube_z-.021-hanger_top))@o.matrix_world
 dash_filler(dash)
 for m in {m for o in kept+dash+bank for m in o.data.materials if m}:principled_only(m)
 if os.environ.get('OPALA_V06_DEBUG'):report(kept+dash+bank,detailed=True)
 anchor=pivot('Interior_do_jogo',(0,0,V06_FLOOR),'interior','',0.,
  f'Interior do jogo (cockpit.js) montado no carro: equipamento descido {-DZ:.3f} m em bloco ate o piso V06.',collection='07_Interior_do_jogo')
 anchor['deslocamento_z']=DZ
 groups={}
 for o in kept+dash+bank:
  move_to(o,'07_Interior_do_jogo');groups.setdefault(o.data.materials[0].name if o.data.materials else '-',[]).append(o)
 joined=[]
 for mn,objs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0]
  if len(objs)>1:bpy.ops.object.join()
  o=bpy.context.view_layer.objects.active;o.name='Interior_'+mn.replace('Int_','');o.data.name=o.name
  M=o.matrix_world.copy();o.parent=anchor;o.matrix_parent_inverse=anchor.matrix_world.inverted();o.matrix_world=M
  joined.append(o)
 # The game's pedal box and dash reach a few cm past the V06 firewall (it has no engine bay): those vertices are laid
 # flat on the firewall, so nothing of the cabin shows in the bay behind the brake booster.
 from v06_motor import FIREWALL_X
 prof=np.array([(FIREWALL_X,.0),(FIREWALL_X,.70),(.86,.78),(.935,.872),(.935,2.)])
 for o in joined:
  W=world_verts(o);lim=np.interp(W[:,2],prof[:,1],prof[:,0])-.003
  if (W[:,0]>lim).any():W[:,0]=np.minimum(W[:,0],lim);set_world_verts(o,W)
 report(joined)
 return joined

def principled_only(m):
 """The game draws gauge faces, needles, lamps and screens unlit (MeshBasicMaterial -> glTF unlit). Rebuilt as a
 Principled BSDF that only emits (black base, emission = the old colour or texture), so they still read as lit
 faces and stay glTF-friendly."""
 nt=m.node_tree
 if any(n.type=='BSDF_PRINCIPLED' for n in nt.nodes):return
 tex=next((n for n in nt.nodes if n.type=='TEX_IMAGE'),None);rgb=next((n for n in nt.nodes if n.type=='RGB'),None)
 col=None
 for n in nt.nodes:
  for i in n.inputs:
   if i.name in ('Color','Base Color') and i.type=='RGBA' and not i.is_linked:col=tuple(i.default_value);break
 if rgb is not None:col=tuple(rgb.outputs[0].default_value)
 keep=tex.name if tex else None
 for name in [n.name for n in nt.nodes if n.name!=keep and n.type not in ('TEX_COORD','MAPPING','UVMAP')]:nt.nodes.remove(nt.nodes[name])
 tex=nt.nodes[keep] if keep else None     # node references go stale when other nodes are removed
 p=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(p.outputs[0],out.inputs[0])
 p.inputs['Base Color'].default_value=(0,0,0,1);p.inputs['Emission Strength'].default_value=1.
 if tex is not None:
  nt.links.new(tex.outputs['Color'],p.inputs['Emission Color'])
  if getattr(m,'surface_render_method','')=='BLENDED':nt.links.new(tex.outputs['Alpha'],p.inputs['Alpha'])
 else:p.inputs['Emission Color'].default_value=col or (1,1,1,1)

def straighten_hoop():
 """The V05 main hoop bends forward at mid height (a V4->V5 deformation artifact); straighten it on x -0.63 like the
 game's hoop, so the harness bar and the shoulder straps meet it. The X brace follows at its top."""
 O=bpy.data.objects;h=O['Gaiola_arco_principal'];W=world_verts(h)
 zs=np.round(W[:,2],2);target=-.63
 for z in np.unique(zs):
  m=zs==z;cx=(W[m,0].min()+W[m,0].max())/2;W[m,0]+=target-cx
 set_world_verts(h,W)
 for n in ('Gaiola_X','Gaiola_travessa'):
  o=O[n];W=world_verts(o);w=np.clip((W[:,2]-.80)/(1.10-.80),0,1);top=W[W[:,2]>1.05,0].mean()
  W[:,0]+=w*(target-top);set_world_verts(o,W)

def cross_tube(mats):
 """Windscreen cross tube between the two V05 roof rails, at the game's cage position. The whole cage becomes gloss
 black like the real one (carro_30, 33, 36); in V05 it shared the wheels' aluminium."""
 O=bpy.data.objects;pts=[]
 black=material('Gaiola_preta',(32,35,38),metal=.3,rough=.3,coat=.9)
 for o in [o for o in O if o.name.startswith('Gaiola_') and o.type=='MESH']:o.data.materials[0]=black
 for n in ('Gaiola_longitudinal','Gaiola_longitudinal.001'):
  W=world_verts(O[n]);q=W[(np.abs(W[:,0]-CROSS_TUBE_X)<.02)&(W[:,2]>1.1)];pts.append(q.mean(0))
 z=float(np.mean([p[2] for p in pts]));y=float(np.mean([abs(p[1]) for p in pts]))
 P=Part('Gaiola_travessa_parabrisa','02_Vidros_Redes_Interior',None,smooth=40)
 P.cyl(black,(CROSS_TUBE_X,-y,z),(CROSS_TUBE_X,y,z),.021,16);P.build()
 return z,y

def dash_filler(dash):
 """The game dash top ends 10 cm short of this windscreen base: a leather-grain strip closes the gap."""
 mat=next((o.data.materials[0] for o in dash if o.data.materials and o.data.materials[0].name.startswith('Int_dash')),None)
 if mat is None:return
 T=bvh(bpy.data.objects['Borracha_parabrisa']);ys=np.linspace(-.69,.69,24);V=[]
 for y in ys:
  h=T.ray_cast(Vector((.6,y,.905)),Vector((1,0,-.02)).normalized());xg=(h[0].x-.004) if h[0] is not None else .925
  V+=[(.826,y,.904),(xg,y,.897)]
 o=new_mesh('Painel_complemento_V06',V,grid_faces(len(ys),2),mat,'07_Interior_do_jogo',outward=(0,0,1))
 dash.append(o)

def report(objs,detailed=False):
 """Overlap of the interior with the shell it must not pierce (roof, glass, doors, sides, window frames). The detailed
 (debug) report also lists the expected contacts: parts resting on the floor, tunnel and firewall, or clamped to the cage."""
 names=('Teto','Para_brisa','Vidro','Vigia','Lateral','Porta_','Coluna','Calha','Cabecalho','Moldura','Rede_janela')
 if detailed:names+=('Batente','Estrutura_cofre','Gaiola','Assoalho','Painel_interno')
 shell=[o for o in root().children_recursive if o.type=='MESH' and o.name.startswith(names)]
 bad=[]
 if detailed:
  Ts=[(s,bvh(s)) for s in shell]
  for o in objs:
   To=bvh(o)
   for s,T in Ts:
    n=len(T.overlap(To))
    if n:bad.append((o.name,s.name,n))
 else:
  T=bvh(shell)
  for o in objs:
   n=len(T.overlap(bvh(o)))
   if n:bad.append((o.name,n))
 print('V06 interior pierces roof/glass/doors/sides:' if not detailed else 'V06 interior contacts:',bad or 'none',flush=True)
 return bad
