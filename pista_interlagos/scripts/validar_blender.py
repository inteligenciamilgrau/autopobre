import bpy,json,math
from pathlib import Path
from collections import Counter
import numpy as np
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'interlagos_opala99.blend'))
ob=bpy.data.objects['Circuito_4309m_colisao'];me=ob.data
edges=Counter(tuple(sorted(e)) for p in me.polygons for e in p.edge_keys)
boundary=sum(v==1 for v in edges.values());nonmanifold=sum(v>2 for v in edges.values())
A=np.load(R/'dados/pista_processada.npz')['samples'];N=len(A)
v=np.array([v.co[:] for v in me.vertices]);centers=(v[::2]+v[1::2])/2
length=np.linalg.norm(np.roll(centers,-1,axis=0)-centers,axis=1).sum()
report={'road_vertices':len(me.vertices),'road_quads':len(me.polygons),'boundary_edges':boundary,'expected_boundary_edges':2*N,'nonmanifold_edges':nonmanifold,'positive_z_normals':all(p.normal.z>0 for p in me.polygons),'length_3d_mesh_m':float(length),'max_center_error_m':float(np.abs(centers-(A[:,1:4]+np.array([0,0,.04]))).max()),'packed_images':all(im.packed_file is not None for im in bpy.data.images if im.source=='FILE' and im.users),'car_present':'OPALA_TESTE_ROOT' in bpy.data.objects,'units':bpy.context.scene.unit_settings.system,'collections':[c.name for c in bpy.data.collections]}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(R/'exports/interlagos_colisao.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
report['collision_glb_meshes']=len(meshes);report['collision_triangles']=sum(len(o.data.polygons) for o in meshes)
report['passed']=nonmanifold==0 and boundary==2*N and abs(length-4309)<.02 and report['max_center_error_m']<.001 and report['positive_z_normals'] and report['packed_images'] and report['car_present'] and len(meshes)==1
(R/'dados/validacao_blender.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
assert report['passed'],report
