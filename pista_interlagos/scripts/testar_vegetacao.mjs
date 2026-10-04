import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {buildTrackField} from '../teste/landscape.js';
import {createVergeVegetation} from '../teste/verge-vegetation.js';
import {sceneryBands,bandClearance,fitGround,groundHeight} from '../teste/track-clearance.js';

const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const field=buildTrackField(data),fit=fitGround(data),ground=(x,y)=>groundHeight(data.terrain,fit.heights,x,y);
// A dry exclusion and an artificial paved patch verify the two independent masks.
const excluded=data.samples[Math.floor(data.samples.length*.25)],dry=(x,y)=>Math.hypot(x-excluded[1],y-excluded[2])>40;
const vegetated=(x,y)=>x<excluded[1]-20||x>excluded[1]+20;
const build=density=>createVergeVegetation({data,field,ground,dry,vegetated,density,lod:density>1?220:130});
const high=build(1),ultra=build(1.3),matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),rot=new THREE.Quaternion(),scale=new THREE.Vector3();
assert(high.count>1000,'real circuit receives visible roadside grass');
assert(ultra.count>high.count,'ultra increases ground vegetation density');
assert(ultra.reach>high.reach&&ultra.reach<=145,'view distance is bounded by the quality level');
const bands=sceneryBands(data).map(b=>({...b,margin:0}));let checked=0,minClearance=Infinity;
for(const mesh of high.root.children){
 assert(mesh.isInstancedMesh&&!mesh.castShadow&&mesh.receiveShadow,'grass batches receive light without extra shadow draws');
 for(let i=0;i<mesh.count;i++){
  mesh.getMatrixAt(i,matrix);matrix.decompose(pos,rot,scale);
  const x=pos.x,y=-pos.z;
  assert(dry(x,y)&&vegetated(x,y),'grass obeys dry and cover masks');
  assert(Math.abs(pos.y-(ground(x,y)-.035))<.0001,'roots follow the fitted visible terrain');
  const clearance=bandClearance(bands,x,y).distance;minClearance=Math.min(minClearance,clearance);
  assert(clearance>1,'blades do not protrude into a road, garage or grandstand');checked++;
 }
}
const camera=new THREE.PerspectiveCamera();camera.position.set(1e6,1e6,1e6);high.update(camera);
assert(high.root.children.every(mesh=>!mesh.visible),'distant blocks stop rendering');
const p=data.samples[0];camera.position.set(p[1],p[3]+2,-p[2]);high.update(camera);
const visible=high.root.children.filter(mesh=>mesh.visible).length;
assert(visible>0&&visible<high.root.children.length/3,'only nearby blocks render from the start');
const first=high.root.children[0];first.getMatrixAt(0,matrix);matrix.decompose(pos,rot,scale);
high.clearAround([{x:pos.x,y:-pos.z,r:3}]);first.getMatrixAt(0,matrix);
assert.equal(matrix.getMaxScaleOnAxis(),0,'later trackside structures can clear the grass');
assert(high.root.children.every(mesh=>mesh.geometry===first.geometry&&mesh.material===first.material),'all grass shares one geometry and material');
high.dispose();ultra.dispose();field.texture.dispose();
console.log(JSON.stringify({checked,minClearance:+minClearance.toFixed(2),high:high.count,ultra:ultra.count,visibleBlocks:visible,totalBlocks:high.root.children.length}));
console.log('vegetacao: ok');
