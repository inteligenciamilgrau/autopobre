"""Export the open Opala 99 .blend to the game GLB, without changing the .blend.

Usage, from the project root (the output defaults to pista_interlagos/teste/assets/):
 blender --background modelo_3d/v05_opala_real/opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d/scripts/exportar_glb_jogo.py [-- output.glb] [--sem-interior]

--sem-interior (V06): leaves out Interior_do_jogo and everything under it. The game builds the cockpit at runtime
(cockpit.js), so the port of it carried by the V06 blend is only needed for renders and other tools.
"""
import bpy,sys
from pathlib import Path
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open opala99_<livery>.blend before running'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
flags={a for a in args if a.startswith('--')};paths=[a for a in args if not a.startswith('--')]
assert flags<={'--sem-interior'},f'opcoes desconhecidas: {flags}'
output=Path(paths[0]).resolve() if paths else R/'pista_interlagos/teste/assets'/(source.stem+'.glb')
left_out=set()
if '--sem-interior' in flags and 'Interior_do_jogo' in bpy.data.objects:
 o=bpy.data.objects['Interior_do_jogo'];left_out={o,*o.children_recursive}

# V06: meshes nobody sees on a shut car (engine bay, trunk, the game's interior, hinges and the inner frames of
# hood and lid). Their GLB nodes carry the extra "interno", so the game can leave them out of rival copies and
# skip their shadows on the player's car. The radiator stays: it shows through the grille.
INTERNAL_COLLECTIONS={'07_Interior_do_jogo','08_Cofre_do_motor','09_Motor','10_Porta_malas'}
def internal(o):
 if o.name.startswith('Radiador'):return False
 return any(c.name in INTERNAL_COLLECTIONS for c in o.users_collection) or o.name.endswith(('_dobradicas','_estrutura_interna','_porta_malas_estrutura'))

def grouped_export(root,path):
 # Same grouping as corrigir_fechamentos_v04.py: one mesh per parent and material set.
 temporary=bpy.data.collections.new('EXPORT_TEMP_V04');bpy.context.scene.collection.children.link(temporary);clones={}
 for original in [root]+[o for o in root.children_recursive if o not in left_out]:
  clone=original.copy()
  if original.type=='MESH':clone.data=original.data.copy()
  temporary.objects.link(clone);clones[original]=clone
 inside={clone:internal(original) for original,clone in clones.items()}
 for original,clone in clones.items():clone.parent=clones.get(original.parent);clone.matrix_world=original.matrix_world.copy()
 # The clones take the exact names (pivot names are the game's API); the originals are renamed during the export.
 renamed={}
 for original,clone in clones.items():
  if original.type!='MESH':n=original.name;original.name=n+'__exportando';clone.name=n;renamed[original]=n
 groups={}
 for o in clones.values():
  if o.type=='MESH':groups.setdefault((o.parent.name if o.parent else '',tuple(m.name for m in o.data.materials)),[]).append(o)
 for (parent,mats),objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  hidden=all(inside[o] for o in objects)
  if len(objects)>1:bpy.ops.object.join()
  bpy.context.object.name='GLB_'+parent+'_'+'_'.join(mats)
  if hidden:bpy.context.object['interno']=True
 bpy.ops.object.select_all(action='DESELECT')
 for o in temporary.objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 for o in list(temporary.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(temporary)
 for original,n in renamed.items():original.name=n

output.parent.mkdir(parents=True,exist_ok=True)
# V06 and later: separable parts hang from empties carrying these custom properties (glTF extras).
hinges={o.name:{k:(v.to_list() if hasattr(v,'to_list') else v) for k,v in o.items()} for o in bpy.data.objects['OPALA_99_ROOT'].children_recursive if o.type=='EMPTY' and 'peca' in o and o not in left_out}
grouped_export(bpy.data.objects['OPALA_99_ROOT'],output)
# The game finds wheels, glass and the cockpit structure by these names.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(output))
imported=next(o for o in bpy.data.objects if o.name.startswith('OPALA_99_ROOT'))
pivots=[o for o in imported.children_recursive if o.type=='EMPTY' and o.name.startswith('Roda_') and '_PIVO' in o.name]
materials={m.name for o in imported.children_recursive if o.type=='MESH' for m in o.data.materials if m}
structure=[o for o in imported.children_recursive if o.type=='MESH' and any(m and m.name=='Chapa_fechamento_V04' for m in o.data.materials)]
assert len(pivots)==4 and sum('Dianteira' in o.name for o in pivots)==2,[o.name for o in pivots]
assert len(structure)==1,len(structure)
missing={'Policarbonato_fume','Pintura_preta','Faixa_amarela','Branco'}-materials;assert not missing,missing
for name,props in hinges.items():
 node=bpy.data.objects.get(name);assert node is not None and node.type=='EMPTY',('pivo ausente no GLB',name)
 assert all(k in node and node[k]==v for k,v in props.items() if k in ('peca','eixo_local','angulo_aberto_graus','angulo_gltf_graus')),('extras do pivo',name)
 assert 'eixo_gltf' not in props or [round(a,6) for a in node['eixo_gltf']]==[round(a,6) for a in props['eixo_gltf']],('eixo_gltf do pivo',name)
 assert props.get('peca') in ('interior',) or any(c.type=='MESH' for c in node.children_recursive),('pivo sem pecas',name)
if hinges:print('GLB_PIVOTS',len(hinges),', '.join(sorted(hinges)),flush=True)
hidden=[o for o in imported.children_recursive if o.type=='MESH' and o.get('interno')]
assert not any(m and m.name in ('Policarbonato_fume','Faixa_amarela') for o in hidden for m in o.data.materials),'peca externa marcada como interna'
if hidden:print('GLB_INTERNAS',len(hidden),'malhas marcadas "interno"',flush=True)
print('GLB_EXPORTED',output,'sem interior' if left_out else '',round(output.stat().st_size/2**20,2),'MiB',flush=True)
