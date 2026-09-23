"""Export the open Opala 99 .blend to the game GLB, without changing the .blend.

Usage, from the project root (the output defaults to pista_interlagos/teste/assets/):
 blender --background modelo_3d/v04_fechamentos/opala99_seiva_danilo.blend --python-exit-code 2 --python modelo_3d/scripts/exportar_glb_jogo.py [-- output.glb]
"""
import bpy,sys
from pathlib import Path
R=Path(__file__).resolve().parents[2]
source=Path(bpy.data.filepath);assert source.name.startswith('opala99_'),'open opala99_<livery>.blend before running'
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
output=Path(args[0]).resolve() if args else R/'pista_interlagos/teste/assets'/(source.stem+'.glb')

def grouped_export(root,path):
 # Same grouping as corrigir_fechamentos_v04.py: one mesh per parent and material set.
 temporary=bpy.data.collections.new('EXPORT_TEMP_V04');bpy.context.scene.collection.children.link(temporary);clones={}
 for original in [root]+list(root.children_recursive):
  clone=original.copy()
  if original.type=='MESH':clone.data=original.data.copy()
  temporary.objects.link(clone);clones[original]=clone
 for original,clone in clones.items():clone.parent=clones.get(original.parent);clone.matrix_world=original.matrix_world.copy()
 groups={}
 for o in clones.values():
  if o.type=='MESH':groups.setdefault((o.parent.name if o.parent else '',tuple(m.name for m in o.data.materials)),[]).append(o)
 for (parent,mats),objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
  bpy.context.object.name='GLB_'+parent+'_'+'_'.join(mats)
 bpy.ops.object.select_all(action='DESELECT')
 for o in temporary.objects:o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
 for o in list(temporary.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.data.collections.remove(temporary)

output.parent.mkdir(parents=True,exist_ok=True)
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
print('GLB_EXPORTED',output,flush=True)
