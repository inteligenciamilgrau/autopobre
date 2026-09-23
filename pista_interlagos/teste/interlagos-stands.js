import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';
import {STAND,standLayout,standPoint,roofHeight} from './track-clearance.js';

// Main grandstand of Interlagos, on the outside of the main straight: stepped
// concrete blocks built into the bank, benches split by aisles, and a roof on
// back columns that shades every row. Layout from track-clearance.js, which also
// keeps the ground below it. Game art sized to the LiDAR, not a survey.
const SEAT_COLORS=[[.07,.2,.42],[.07,.2,.42],[.05,.3,.14],[.62,.5,.05],[.05,.3,.14],[.07,.2,.42]];
const SECTIONS=[-10.5,-3.5,3.5,10.5],SECTION_LENGTH=6.2;
export function createGrandstands(data,textures,ground=null){
 const blocks=standLayout(data),root=new THREE.Group();root.name='Arquibancadas_Interlagos';
 if(!blocks.length)return {root,rows:[],obstacles:[],stats:{blocks:0,rows:0}};
 const concrete=structureMaterial(new THREE.MeshStandardMaterial({name:'Concreto',color:0x8f918b,roughness:.9}),textures);
 const steel=structureMaterial(new THREE.MeshStandardMaterial({name:'Metal',color:0x9aa2a6,metalness:.5,roughness:.45}),textures);
 const roofMaterial=new THREE.MeshStandardMaterial({name:'Cobertura_arquibancada',color:0xe8eae6,roughness:.55,metalness:.2,side:THREE.DoubleSide});
 const fasciaMaterial=new THREE.MeshStandardMaterial({name:'Faixa_cobertura',color:0x12463b,roughness:.6});
 const seatMaterial=new THREE.MeshStandardMaterial({name:'Assentos_arquibancada',vertexColors:true,roughness:.5});
 const parts={body:[],seats:[],roof:[],fascia:[],steel:[]},rows=[],up=new THREE.Vector3(0,1,0);
 const tint=(g,rgb)=>{const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set(rgb,i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));return g;};
 blocks.forEach((b,index)=>{
  // Block frame: x along the track, y up, z away from it (right-handed), origin at the apron level.
  const frame=new THREE.Matrix4().makeBasis(new THREE.Vector3(b.tx,0,-b.ty),up,new THREE.Vector3(b.rx,0,-b.ry)).setPosition(b.x,b.base,-b.y);
  const local=(a,h,l)=>new THREE.Vector3(a,h,l).applyMatrix4(frame);
  const box=(list,w,h,d,a,y,l,tilt=0)=>{const g=new THREE.BoxGeometry(w,h,d);if(tilt)g.rotateX(tilt);g.translate(a,y,l);list.push(g.applyMatrix4(frame));return g;};
  // Foundations reach below the lowest ground under the block.
  let low=b.base;
  for(let a=-b.length/2;a<=b.length/2+1e-6;a+=2)for(let l=b.front;l<=b.back+STAND.wall+1e-6;l+=1){const [x,y]=standPoint(b,a,l),z=ground?.(x,y);if(Number.isFinite(z))low=Math.min(low,z);}
  const bottom=low-b.base-1.5,rel=h=>h-b.base,shape=new THREE.Shape();
  shape.moveTo(b.front,bottom);shape.lineTo(b.front,STAND.parapet);shape.lineTo(b.front+STAND.wall,STAND.parapet);
  for(const row of b.rows){shape.lineTo(row.from,rel(row.top));shape.lineTo(row.to,rel(row.top));}
  shape.lineTo(b.back,rel(b.top)+STAND.parapet);shape.lineTo(b.back+STAND.wall,rel(b.top)+STAND.parapet);shape.lineTo(b.back+STAND.wall,bottom);shape.closePath();
  // Extruded along z, then turned so z runs along the track (a = L/2 - z keeps the winding).
  const length=b.length+.2,body=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false});
  body.applyMatrix4(new THREE.Matrix4().set(0,0,-1,length/2,0,1,0,0,1,0,0,0,0,0,0,1));
  body.deleteAttribute('uv');parts.body.push(body.applyMatrix4(frame));
  // Benches at the back of each row, with aisles between the sections.
  const color=SEAT_COLORS[index%SEAT_COLORS.length];
  for(const [r,row] of b.rows.entries())for(const a of SECTIONS){
   const shade=r%2?.9:1;tint(box(parts.seats,SECTION_LENGTH,.36,.46,a,rel(row.top)+.18,row.to-.3),color.map(v=>v*shade));
   const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>local(a+u*SECTION_LENGTH/2,rel(row.top)+.36,row.to-.3+v*.23));
   rows.push({corners,face:[-b.rx,b.ry]});
  }
  // Roof: one slab per block, rising toward the track, with a fascia on its front edge.
  const {from,to}=b.roof,span=to-from,tilt=Math.atan(b.roof.slope),mid=(from+to)/2;
  box(parts.roof,b.length+.3,.22,span/Math.cos(tilt),0,rel(roofHeight(b,mid)),mid,tilt);
  box(parts.fascia,b.length+.3,.9,.12,0,rel(roofHeight(b,from))-.3,from,0);
  // Back columns and the cantilever girders under the roof.
  const columns=index===blocks.length-1?[-13.4,-6.7,0,6.7,13.4]:[-13.4,-6.7,0,6.7];
  for(const a of columns){
   const l=b.back+STAND.wall/2,top=rel(roofHeight(b,l))-.11;box(parts.steel,.45,top-bottom,.45,a,(top+bottom)/2,l);
   box(parts.steel,.28,.6,(l-from)/Math.cos(tilt),a,rel(roofHeight(b,(l+from)/2))-.41,(l+from)/2,tilt);
  }
 });
 const meshes={};
 for(const [key,material,name,shadow] of [['body',concrete,'Arquibancada_corpo',true],['seats',seatMaterial,'Arquibancada_assentos',true],['roof',roofMaterial,'Arquibancada_cobertura',true],['fascia',fasciaMaterial,'Arquibancada_faixa',true],['steel',steel,'Arquibancada_estrutura',true]]){
  const list=parts[key],g=mergeGeometries(list,false);list.forEach(x=>x.dispose());
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;root.add(mesh);meshes[key]=mesh;
 }
 return {root,rows,obstacles:[meshes.body],stats:{blocks:blocks.length,rows:rows.length}};
}
