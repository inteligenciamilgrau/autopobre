"""Shared helpers of the Opala 99 V06 build (construir_opala_v06.py and its modules).

Metres, +X front, +Z up, +Y driver side (Motorista), tyre contact at z=0. Geometry is written in world coordinates:
objects are created with an identity transform and parented without moving (their pivot empties carry the
motion)."""
import bpy,bmesh,math
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon

def root():return bpy.data.objects['OPALA_99_ROOT']
def col(name):
 c=bpy.data.collections.get(name)
 if c is None:c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c)
 return c

# ---------------------------------------------------------------- vertices, BVH
def world_verts(o):
 co=np.empty(len(o.data.vertices)*3);o.data.vertices.foreach_get('co',co);M=np.array(o.matrix_world)
 return co.reshape(-1,3)@M[:3,:3].T+M[:3,3]
def set_world_verts(o,W):
 Mi=np.linalg.inv(np.array(o.matrix_world));o.data.vertices.foreach_set('co',(W@Mi[:3,:3].T+Mi[:3,3]).astype(np.float32).ravel());o.data.update()
def bvh(objs):
 objs=objs if isinstance(objs,(list,tuple)) else [objs];V=[];F=[]
 for o in objs:
  W=world_verts(o);n=len(V);V.extend(map(tuple,W));F.extend(tuple(i+n for i in p.vertices) for p in o.data.polygons)
 return BVHTree.FromPolygons(V,F)
def ray_z(T,x,y,down=True,start=None):
 """Height of the first surface hit from above (down) or below."""
 h=T.ray_cast(Vector((x,y,(3 if down else -1) if start is None else start)),Vector((0,0,-1 if down else 1)))
 return None if h[0] is None else h[0].z
def ray_y(T,x,z,side,start=None):
 """y of the first surface hit coming from outside on that side (side=+1 driver, -1 passenger)."""
 h=T.ray_cast(Vector((x,side*(2 if start is None else start),z)),Vector((0,-side,0)))
 return None if h[0] is None else h[0].y

# ---------------------------------------------------------------- materials (Principled only, glTF friendly)
def srgb(c):return ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92
def material(name,rgb,metal=0.,rough=.5,coat=0.,alpha=1.,image=None,emit=0.,transmission=0.,linear=False):
 """rgb as 0-255 sRGB (or linear floats with linear=True). Reuses an existing material of that name."""
 m=bpy.data.materials.get(name)
 if m:return m
 m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED')
 col_=tuple(rgb) if linear else tuple(srgb(c/255) for c in rgb)
 p.inputs['Base Color'].default_value=(*col_,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 p.inputs['Coat Weight'].default_value=coat;p.inputs['Alpha'].default_value=alpha
 if transmission:p.inputs['Transmission Weight'].default_value=transmission
 if emit:p.inputs['Emission Color'].default_value=(*col_,1);p.inputs['Emission Strength'].default_value=emit
 if alpha<1:m.surface_render_method='BLENDED'
 if image is not None:
  t=nt.nodes.new('ShaderNodeTexImage');t.image=image;t.location=(-400,200);nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
 m.diffuse_color=(*col_,1)
 return m
def image_from_array(name,rgba):
 """Packed image from an HxWx4 float array (0..1, sRGB values), so the .blend stays self-contained."""
 old=bpy.data.images.get(name)
 if old:bpy.data.images.remove(old)
 h,w=rgba.shape[:2];img=bpy.data.images.new(name,w,h,alpha=True);img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
 img.filepath_raw='//'+name+'.png';img.file_format='PNG';img.pack();return img

# ---------------------------------------------------------------- mesh creation
def finish(me,smooth_angle=None):
 if smooth_angle is None:me.polygons.foreach_set('use_smooth',[False]*len(me.polygons))
 else:
  me.polygons.foreach_set('use_smooth',[True]*len(me.polygons));me.set_sharp_from_angle(angle=math.radians(smooth_angle))
 me.update()
def new_mesh(name,verts,faces,mat,collection,parent=None,smooth=None,outward=None,uv=None):
 """outward: a direction or a function of the face centre the faces must face; None recalculates normals."""
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 me=bpy.data.meshes.new(name);me.from_pydata([tuple(v) for v in verts],[],[tuple(f) for f in faces])
 for m in (mat if isinstance(mat,(list,tuple)) else [mat]):me.materials.append(m)
 if uv is not None:
  layer=me.uv_layers.new(name='UVMap');layer.data.foreach_set('uv',np.array([uv[v] for p in me.polygons for v in p.vertices],np.float32).ravel())
 bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
 if outward is None:bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
 elif outward!='keep':
  flip=[f for f in bm.faces if f.normal.dot(Vector(outward(f.calc_center_median()) if callable(outward) else outward))<0]
  bmesh.ops.reverse_faces(bm,faces=flip,flip_multires=False)
 bm.to_mesh(me);bm.free();finish(me,smooth)
 o=bpy.data.objects.new(name,me);col(collection).objects.link(o);o.parent=parent or root();return o
def grid_faces(nu,nv,flip=False):
 f=[]
 for i in range(nu-1):
  for j in range(nv-1):
   a,b,c,d=i*nv+j,(i+1)*nv+j,(i+1)*nv+j+1,i*nv+j+1;f.append((a,d,c,b) if flip else (a,b,c,d))
 return f
def remove(o):
 if isinstance(o,str):o=bpy.data.objects.get(o)
 if o is not None:bpy.data.objects.remove(o,do_unlink=True)
def reparent(o,parent):
 """Parent without moving the object in the world."""
 M=o.matrix_world.copy();o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted() if parent else Matrix();o.matrix_world=M
def move_to(o,collection):
 for c in list(o.users_collection):c.objects.unlink(o)
 col(collection).objects.link(o)
def face_count(objs):return sum(len(o.data.polygons) for o in objs if o.type=='MESH')

# ---------------------------------------------------------------- booleans and cutters
def prism(name,poly,axis,a0,a1):
 """Closed prism: polygon in the plane normal to axis ('X': (y,z), 'Y': (x,z), 'Z': (x,y) points), extruded a0..a1."""
 n=len(poly)
 if axis=='X':V=[(a0,p[0],p[1]) for p in poly]+[(a1,p[0],p[1]) for p in poly]
 elif axis=='Y':V=[(p[0],a0,p[1]) for p in poly]+[(p[0],a1,p[1]) for p in poly]
 else:V=[(p[0],p[1],a0) for p in poly]+[(p[0],p[1],a1) for p in poly]
 F=[tuple(range(n))[::-1],tuple(range(n,2*n))]+[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n)]
 me=bpy.data.meshes.new(name);me.from_pydata(V,[],F);bm=bmesh.new();bm.from_mesh(me)
 bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(o);return o
def box_cutter(name,lo,hi):
 x0,y0,z0=lo;x1,y1,z1=hi;return prism(name,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],'Z',z0,z1)
def boolean(o,cutter,op,solver='EXACT'):
 """Applies a boolean in place (op DIFFERENCE / INTERSECT / UNION); UVs and materials are kept. EXACT by default;
 FLOAT where the exact solver gives up on the mesh (it returns nothing at all then)."""
 m=o.modifiers.new('v06_bool','BOOLEAN');m.operation=op;m.object=cutter;m.solver=solver
 m.material_mode='INDEX'           # cut faces take the object's own material, no empty slot is added
 dg=bpy.context.evaluated_depsgraph_get();me=bpy.data.meshes.new_from_object(o.evaluated_get(dg))
 o.modifiers.remove(m);old=o.data;o.data=me;me.name=old.name
 if old.users==0:bpy.data.meshes.remove(old)
 # faces cut by an unmaterialled cutter may point at an empty slot: give them the object's first material
 empty=[i for i,m in enumerate(me.materials) if m is None]
 if empty and len(empty)<len(me.materials):
  idx=np.empty(len(me.polygons),np.int32);me.polygons.foreach_get('material_index',idx)
  first=next(i for i,m in enumerate(me.materials) if m is not None);idx[np.isin(idx,empty)]=first
  keep=[i for i in range(len(me.materials)) if i not in empty];remap={o:n for n,o in enumerate(keep)}
  me.polygons.foreach_set('material_index',np.array([remap[i] for i in idx],np.int32))
  for i in sorted(empty,reverse=True):me.materials.pop(index=i)
 bm=bmesh.new();bm.from_mesh(me);loose=[v for v in bm.verts if not v.link_faces]
 if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
 bm.to_mesh(me);bm.free();me.update();return o
def split(o,cut_in,cut_out,name_in,parent_in=None,collection_in=None):
 """o keeps what lies outside cut_out; a copy named name_in gets what lies inside cut_in. Returns (inside, o);
 an empty side is deleted and returned as None."""
 part=o.copy();part.data=o.data.copy();part.name=name_in
 for c in o.users_collection if collection_in is None else [col(collection_in)]:c.objects.link(part)
 boolean(part,cut_in,'INTERSECT');boolean(o,cut_out,'DIFFERENCE')
 if parent_in is not None:reparent(part,parent_in)
 out=[]
 for p in (part,o):
  if len(p.data.polygons)==0:remove(p);out.append(None)
  else:out.append(p)
 return tuple(out)

# ---------------------------------------------------------------- pivots
def gltf_axis(eixo_local,angulo):
 """The opening in the GLB's own frame (Y up). glTF x,y,z = Blender x,z,-y is a proper rotation, so the angle keeps
 its sign about the mapped axis; given about the positive glTF axis: Blender Y becomes glTF -Z, so the hood's -52
 about Y is +52 about glTF Z and the lid's +65 is -65; doors and caps (Blender Z) turn about glTF Y by the same angle."""
 ax,sg={'X':((1.,0.,0.),1),'Y':((0.,0.,1.),-1),'Z':((0.,1.,0.),1)}.get(eixo_local,((0.,0.,0.),0));return list(ax),float(angulo)*sg
def pivot(name,location,peca,eixo,angulo,descricao,collection='01_Carroceria',parent=None):
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 e=bpy.data.objects.new(name,None);e.empty_display_type='ARROWS';e.empty_display_size=.15
 col(collection).objects.link(e);e.parent=parent or root();e.matrix_world=Matrix.Translation(location)
 e['peca']=peca;e['eixo_local']=eixo;e['angulo_aberto_graus']=float(angulo);e['descricao']=descricao
 e['eixo_gltf'],e['angulo_gltf_graus']=gltf_axis(eixo,angulo)
 return e
def axis_rotation(eixo,deg):
 return Matrix.Rotation(math.radians(deg),4,eixo)

# ---------------------------------------------------------------- part builder: one mesh per material
class Part:
 """Accumulates primitives per material and writes one object per material (fewer draw calls in the GLB).
 M transforms everything added (e.g. the engine's tilted frame)."""
 def __init__(self,name,collection,parent=None,M=None,smooth=35):
  self.name=name;self.collection=collection;self.parent=parent;self.M=M or Matrix();self.smooth=smooth;self.bms={};self.objects=[]
 def bm(self,mat):
  if mat.name not in self.bms:self.bms[mat.name]=(mat,bmesh.new())
  return self.bms[mat.name][1]
 def _add(self,mat,tmp,M=None):
  me=bpy.data.meshes.new('tmp');tmp.transform(self.M@(M or Matrix()));tmp.to_mesh(me);tmp.free()
  self.bm(mat).from_mesh(me);bpy.data.meshes.remove(me)
 def box(self,mat,center,size,bevel=0.,segs=1,M=None):
  t=bmesh.new();bmesh.ops.create_cube(t,size=1,matrix=Matrix.Diagonal((*size,1)))
  if bevel>0:bmesh.ops.bevel(t,geom=t.edges[:],offset=min(bevel,min(size)/2.05),segments=segs,profile=.5,affect='EDGES',clamp_overlap=True)
  self._add(mat,t,Matrix.Translation(center)@(M or Matrix()))
 def cyl(self,mat,p0,p1,r,segs=16,r1=None,caps=True):
  p0=Vector(p0);p1=Vector(p1);d=p1-p0;L=d.length;t=bmesh.new()
  bmesh.ops.create_cone(t,cap_ends=caps,cap_tris=False,segments=segs,radius1=r,radius2=r if r1 is None else r1,depth=L)
  q=d.to_track_quat('Z','Y');self._add(mat,t,Matrix.Translation((p0+p1)/2)@q.to_matrix().to_4x4())
 def lathe(self,mat,profile,p0,axis,segs=24,cap=False):
  """profile: (radius, distance along axis) pairs; closed at the ends when the radius is 0."""
  axis=Vector(axis).normalized();q=axis.to_track_quat('Z','Y').to_matrix().to_4x4();t=bmesh.new();rings=[]
  for r,s in profile:
   ring=[t.verts.new((r*math.cos(2*math.pi*k/segs),r*math.sin(2*math.pi*k/segs),s)) for k in range(segs)];rings.append(ring)
  for a,b in zip(rings,rings[1:]):
   for k in range(segs):
    try:t.faces.new((a[k],a[(k+1)%segs],b[(k+1)%segs],b[k]))
    except ValueError:pass
  if cap:
   for ring,flip in ((rings[0],True),(rings[-1],False)):
    try:t.faces.new(ring[::-1] if flip else ring)
    except ValueError:pass
  bmesh.ops.remove_doubles(t,verts=t.verts[:],dist=1e-6);bmesh.ops.recalc_face_normals(t,faces=t.faces[:])
  self._add(mat,t,Matrix.Translation(p0)@q)
 def sweep(self,mat,points,r,segs=8,samples=None,caps=True,radius_fn=None):
  """Round tube along a smooth (Catmull-Rom) path through points."""
  P=catmull([Vector(p) for p in points],samples or max(8,6*len(points)));t=bmesh.new();rings=[];n=len(P);prev=None
  for i,p in enumerate(P):
   tan=(P[min(i+1,n-1)]-P[max(i-1,0)]).normalized()
   if prev is None:u=tan.orthogonal().normalized()
   else:u=(prev-tan*prev.dot(tan)).normalized()   # parallel transport keeps the tube from twisting
   prev=u;v=tan.cross(u);rr=r if radius_fn is None else radius_fn(i/(n-1))
   rings.append([t.verts.new(p+(u*math.cos(2*math.pi*k/segs)+v*math.sin(2*math.pi*k/segs))*rr) for k in range(segs)])
  for a,b in zip(rings,rings[1:]):
   for k in range(segs):t.faces.new((a[k],a[(k+1)%segs],b[(k+1)%segs],b[k]))
  if caps:t.faces.new(rings[0][::-1]);t.faces.new(rings[-1])
  bmesh.ops.recalc_face_normals(t,faces=t.faces[:]);self._add(mat,t)
 def mesh(self,mat,verts,faces,outward=None):
  """outward: direction (or function of the face centre) the faces must look at; None keeps the vertex order."""
  t=bmesh.new();vs=[t.verts.new(v) for v in verts]
  for f in faces:
   try:t.faces.new([vs[i] for i in f])
   except ValueError:pass
  if outward is not None:
   t.normal_update()
   flip=[f for f in t.faces if f.normal.dot(Vector(outward(f.calc_center_median()) if callable(outward) else outward))<0]
   bmesh.ops.reverse_faces(t,faces=flip)
  self._add(mat,t)
 def build(self,suffix_single=False):
  out=[]
  for i,(mn,(mat,b)) in enumerate(self.bms.items()):
   name=self.name if len(self.bms)==1 and not suffix_single else f'{self.name}_{mn}'
   old=bpy.data.objects.get(name)
   if old:bpy.data.objects.remove(old,do_unlink=True)
   me=bpy.data.meshes.new(name);b.to_mesh(me);b.free();me.materials.append(mat);finish(me,self.smooth)
   o=bpy.data.objects.new(name,me);col(self.collection).objects.link(o);o.parent=root()
   if self.parent is not None:reparent(o,self.parent)
   out.append(o)
  self.bms={};self.objects+=out;return out

def catmull(P,samples):
 """Centripetal-free uniform Catmull-Rom through P, resampled to about `samples` points."""
 if len(P)<3:return [P[0].lerp(P[-1],t) for t in np.linspace(0,1,max(2,samples))]
 Q=[P[0]*2-P[1]]+P+[P[-1]*2-P[-2]];out=[];seg=len(P)-1;per=max(2,samples//seg)
 for i in range(seg):
  p0,p1,p2,p3=Q[i],Q[i+1],Q[i+2],Q[i+3]
  for k in range(per):
   t=k/per;t2=t*t;t3=t2*t
   out.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3))
 out.append(P[-1]);return out

def polygon_fill(outer,holes=()):
 """Triangles of a 2D polygon with holes: returns (points, triangles) with points = outer + holes concatenated."""
 loops=[[Vector((p[0],p[1],0)) for p in outer]]+[[Vector((p[0],p[1],0)) for p in h] for h in holes]
 tris=tessellate_polygon(loops);pts=[p for l in loops for p in l];return [(p.x,p.y) for p in pts],tris
def rounded_rect(cx,cy,w,h,r,n=5):
 pts=[]
 for (qx,qy,a0) in ((cx+w/2-r,cy+h/2-r,0),(cx-w/2+r,cy+h/2-r,90),(cx-w/2+r,cy-h/2+r,180),(cx+w/2-r,cy-h/2+r,270)):
  for k in range(n+1):
   a=math.radians(a0+90*k/n);pts.append((qx+r*math.cos(a),qy+r*math.sin(a)))
 return pts
def ellipse(cx,cy,rx,ry,n=24):return [(cx+rx*math.cos(2*math.pi*k/n),cy+ry*math.sin(2*math.pi*k/n)) for k in range(n)]
