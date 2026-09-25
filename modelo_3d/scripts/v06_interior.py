"""V06 interior: the game's cockpit (pista_interlagos/teste/cockpit*.js, rebuilt from photos carro_8, 14, 24-36) brought
into the car. exportar_interior_jogo.py exports it to a GLB (each mesh named after the source line that built it) exactly
as the game shows it inside this body (cockpit.js setView): lowered onto the V06 cabin floor, the dash top at the
windscreen base, the Luizao switch bank and the mirror under the windscreen cage tube, the relay board and the battery
brought inboard, and without the game's classic box interior and cabin shell (this body's structure takes their place).
So the game's cockpit view and this scene show the same interior. Here it is sorted by material, the V05 cage gets the
windscreen tube the bank hangs from, and what reaches past the V06 firewall is laid flat on it."""
import bpy,os,subprocess,sys,tempfile
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
from v06_comum import *

R=Path(__file__).resolve().parents[2]
V06_FLOOR,GAME_DROP=.217,-.093           # V06 cabin floor; how far the game lowers its cockpit into this body (cockpit.js)
BANK_TUBE_BOTTOM=1.166                   # underside of the windscreen tube: cockpit.js hangs the switch bank there
CROSS_TUBE_X=.29                         # windscreen cross tube of the game cage (switch bank hanger)
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

def build(mats):
 O=bpy.data.objects
 for o in [o for o in root().children_recursive if o.name.startswith(CRUDE_V05)]:remove(o)
 # The game's rear cabin is open up to the roof (cage X, battery, extinguisher: carro_34, 36); the V04 sheet over
 # the rear seat would hide it, from the cockpit view (the game shows this structure there) and through the windows.
 if 'Tampao_atras_banco_V04' in O:remove(O['Tampao_atras_banco_V04'])
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
 # The switch bank arrives hanging where cockpit.js puts it: under this windscreen tube, which must be there.
 tube_z,tube_y=cross_tube(mats)
 assert abs(tube_z-.021-BANK_TUBE_BOTTOM)<.005,f'tubo do para-brisa em {tube_z-.021:.3f}; cockpit.js pendura o painel em {BANK_TUBE_BOTTOM}'
 for m in {m for o in meshes for m in o.data.materials if m}:principled_only(m)
 if os.environ.get('OPALA_V06_DEBUG'):report(meshes,detailed=True)
 anchor=pivot('Interior_do_jogo',(0,0,V06_FLOOR),'interior','',0.,
  f'Interior do jogo (cockpit.js) montado no carro como o jogo o mostra: equipamento descido {-GAME_DROP:.3f} m ate o piso V06.',collection='07_Interior_do_jogo')
 anchor['deslocamento_z']=GAME_DROP
 groups={}
 for o in meshes:
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
