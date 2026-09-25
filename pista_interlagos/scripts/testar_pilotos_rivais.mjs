import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {createRivalDriver,rivalKit,CABIN_DROP} from '../teste/rival-driver.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';

// The rivals' drivers sit on the same V06 floor as the player's cockpit.
const cockpit=readFileSync(new URL('../teste/cockpit.js',import.meta.url),'utf8');
assert.equal(Number(cockpit.match(/const V06=\{drop:(-?[\d.]+)/)[1]),CABIN_DROP,'CABIN_DROP follows cockpit.js V06.drop');

const drivers=RIVAL_ROSTER.map(entry=>createRivalDriver(entry));
for(const d of drivers){
 const info=d.info();
 assert(d.mesh.isSkinnedMesh&&d.mesh.skeleton.bones.length===7,'one skinned mesh, seven bones');
 assert.equal(d.mesh.geometry.groups.length,2,'cloth and helmet materials');
 assert(info.triangles<12000,`light enough for the whole grid (${info.triangles} triangles)`);
 assert.equal(d.root.position.y,CABIN_DROP);
}
// Both gloves stay on the rim through the whole steering travel: the arms reach and close up.
const d=drivers[0];
for(let steer=-.6;steer<=.6;steer+=.05){
 d.update({vx:20,vy:0,heading:0,yaw:0,steerVisual:steer},1/60);
 for(const arm of d.info().arms){assert(arm.reachable,`arm ${arm.side} reaches the rim at steer ${steer.toFixed(2)}`);assert(Math.abs(arm.gap)<1e-6,'forearm ends at the glove');}
}
d.update({vx:20,vy:0,heading:0,yaw:0,steerVisual:.3},0);assert(d.info().wheel>.8,'the wheel turns with the steering');
// The skinned hands follow the rim: the left glove's vertices move when the wheel turns.
function centre(driver,test){
 driver.root.updateMatrixWorld(true);driver.mesh.skeleton.update();
 const g=driver.mesh.geometry,index=g.attributes.skinIndex,p=new THREE.Vector3(),sum=new THREE.Vector3();let n=0;
 for(let i=0;i<index.count;i++)if(index.getX(i)===2&&g.attributes.color.getX(i)<.02&&test(g.attributes.position.getX(i))){driver.mesh.getVertexPosition(i,p);sum.add(p);n++;}
 return sum.divideScalar(n);
}
d.update({vx:0,vy:0,heading:0,yaw:0,steerVisual:0},0);const rim=centre(d,()=>true),left=centre(d,x=>x<-.15);
assert(rim.distanceTo(new THREE.Vector3(.22,.88,-.34))<.02,`rim at the cockpit's wheel (${rim.toArray().map(v=>v.toFixed(3))})`);
assert(left.z<-.45&&Math.abs(left.y-.88)<.03,'left glove at 9 o\'clock, toward the door');
d.update({vx:0,vy:0,heading:0,yaw:0,steerVisual:.4},0);const turned=centre(d,x=>x<-.15);
assert(left.distanceTo(turned)>.1&&centre(d,()=>true).distanceTo(rim)<.02,'the left glove goes round with the rim');
// Left turn at speed (positive yaw rate): the head tilts into the corner, as driver-rig.js.
for(let i=0;i<60;i++)d.update({vx:30,vy:0,heading:0,yaw:.4,steerInput:.5,steerVisual:.1},1/60);
assert(d.info().head.roll<-.05&&d.info().head.yaw>.1,'head leans and looks into a left-hander');
for(let i=0;i<60;i++)d.update({vx:30,vy:0,heading:0,yaw:0,longAccel:-9,steerVisual:0},1/60);
assert(d.info().head.pitch<-.03,'head nods under braking');
// Head inside the cabin: helmet top well under the V06 roof (~1.33 m).
d.update({vx:0,vy:0,heading:0,yaw:0,steerVisual:0},0);d.root.updateMatrixWorld(true);
const box=new THREE.Box3();d.mesh.computeBoundingBox();box.copy(d.mesh.boundingBox).applyMatrix4(d.root.matrix);
assert(box.max.y<1.25&&box.max.y>1.1,`helmet top ${box.max.y.toFixed(3)} m`);
// Every team gets its suit; helmets vary across the grid and always show two tones.
const kits=RIVAL_ROSTER.map(e=>rivalKit(e.color,e.number));
assert(kits.every((k,i)=>k.suit===RIVAL_ROSTER[i].color&&(k.base!==k.pin||k.base!==k.crown)));
assert(new Set(kits.map(k=>[k.base===k.suit,k.crown===k.suit].join())).size>=2,'several paint schemes');
assert(new Set(kits.map(k=>k.visor)).size>=2,'several visors');
console.log(`OK testar_pilotos_rivais: ${drivers.length} pilotos, ${drivers[0].info().triangles} triângulos cada`);
