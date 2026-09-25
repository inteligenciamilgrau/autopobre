import assert from 'node:assert/strict';
import {createCurveloData} from '../teste/curvelo-data.js';
import {CIRCUITS,selectedCircuit,mapProjection} from '../teste/circuits.js';
import {TestCar,recognitionInput,guardrailClearance} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {createCurveloScene} from '../teste/curvelo-scene.js';
import {createGuardrails} from '../teste/track-surface.js';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
const data=createCurveloData(),a=data.samples,L=data.meta.reconstructed_xy_m;
assert.equal(L,1250);assert.equal(CIRCUITS.curvelo.length,L);
let length=0,totalTurn=0;
for(let i=0;i<a.length;i++){
 const p=a[i],q=a[(i+1)%a.length];assert(p.every(Number.isFinite));
 const span=Math.hypot(q[1]-p[1],q[2]-p[2]);assert(span>1.95&&span<2.05);length+=span;
 totalTurn+=Math.atan2(p[7]*q[8]-p[8]*q[7],p[7]*q[7]+p[8]*q[8]);
}
assert(Math.abs(length-1250)<1e-7);assert(Math.abs(totalTurn-Math.PI*2)<1e-7,'counterclockwise closed oval');
assert(Math.abs(Math.min(...a.map(p=>p[5]))+.16)<1e-8);assert.equal(a.find(p=>p[0]>980)[5],0);
const c=new TestCar(data),i=a.findIndex(p=>p[0]>350);c.reset(i);const p=a[i];
assert(c.sample(p[1]-p[9]*6,p[2]-p[10]*6).z>c.sample(p[1]+p[9]*6,p[2]+p[10]*6).z,'outside of banked left turn is higher');
assert(guardrailClearance(data,980,-1)>30);assert.equal(guardrailClearance(data,980,1),5);
const guardrails=createGuardrails(data),railPoints=guardrails.rails.geometry.attributes.position,railHalf=railPoints.count/2;
assert.equal(guardrails.stats.closed,true);assert.equal(guardrails.stats.coverageRatio,1,'Curvelo keeps its complete protection');
for(const base of [0,railHalf])for(let j=0;j<6;j++)for(let axis=0;axis<3;axis++)assert.equal(railPoints.array[(base+j)*3+axis],railPoints.array[(base+railHalf-6+j)*3+axis],'Curvelo rail still closes at the timing line');
const project=mapProjection(a);assert(a.every(p=>{const [x,y]=project(p[1],p[2]);return x>=15&&x<=245&&y>=17&&y<=283;}));
assert.equal(selectedCircuit('curvelo').id,'curvelo');assert.equal(selectedCircuit('interlagos','?circuito=curvelo').id,'curvelo');assert.equal(selectedCircuit('curvelo','?circuito=../../private').id,'interlagos');
globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
const scene=createCurveloScene(data,{material:new THREE.MeshStandardMaterial(),geometry:g=>g});
delete globalThis.document;scene.updateMatrixWorld(true);
const ground=scene.getObjectByName('Terreno_Cerrado_aproximado'),ray=new THREE.Raycaster();
for(let i=80;i<300;i+=11)for(const d of [-7.6,7.6]){
 const p=a[i],x=p[1]+p[9]*d,y=p[2]+p[10]*d;c.index=i;
 ray.set(new THREE.Vector3(x,50,-y),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(ground,false);
 assert(hits.length&&hits[0].point.y<c.sample(x,y).z+.02,'landscape must not cover the banked kerbs');
}
scene.traverse(o=>{o.geometry?.dispose();});
const report=[];
for(const active of [false,true]){
 const m=Object.create(ImmersiveMode.prototype);Object.assign(m,{data,car:new TestCar(data),state:new ImmersiveState(),field:new RaceField(data,{seed:1}),parts:{reset(){}},contacts(){},sync(){},wallImpact(){},laps:3,storyLaps:3});
 m.car.resetGrid();m.resetField();if(active){m.state.active=true;m.state.phase='race';m.state.fuel=12;m.state.health=1;m.raceProgress=0;m.previousS=m.car.surface.s;m.debrisTimer=1e9;m.contactCooldown=0;}
 const initial=m.car.surface.s;assert(initial>1100&&m.rivals.every(r=>r.car.surface.s>initial&&r.car.surface.s<L),'all cars behind the stripe');
 let steps=0,offroad=0;
 const flagAt=new Map();while(!m.finishing&&steps<120*250){const input=recognitionInput(m.car);if(active)m.step(input,1/120);else{m.car.step(input,1/120);m.stepFree(1/120,input);}if(!m.car.surface.onRoad)offroad++;steps++;for(const r of m.rivals)if(r.finished&&!flagAt.has(r))flagAt.set(r,r.progress);}
 // The rivals race the same three laps as the player: each takes the flag after three laps.
 assert(flagAt.size>0&&[...flagAt.values()].every(p=>p>=3*L),'rivals race the chosen laps too');
 assert(m.finishing,'actual full laps must reach the finish transition');assert.equal(m.car.laps,3,'both modes race the standard three laps');assert(m.finishBest>20&&m.finishBest<100);assert(offroad/steps<.01,'recognition lap remains on road');
 const finishTime=m.finishTime;for(let j=0;j<600;j++)m.step({},1/120);
 assert(active?m.state.phase==='podium':m.freeResultReady);assert.equal(m.finishTime,finishTime);assert.equal(m.freeOrder.length,14);
 report.push({immersive:active,laps:m.car.laps,time:finishTime,best:m.finishBest,offroad});
}
// The actual AI driver styles must also navigate both unlike turns for three laps.
const field=new RaceField(data,{seed:1}),parked=new TestCar(data);parked.resetGrid();field.reset(parked.surface.s,{grid:true});parked.x=600;parked.y=450;parked.surface=parked.sample(parked.x,parked.y);
let steps=0,offroad=0;while(field.rivals.some(r=>!r.finished)&&steps<120*250){field.step(parked,1/120,3);for(const r of field.rivals)if(!r.car.surface.onRoad)offroad++;steps++;}
assert(field.rivals.every(r=>r.finished&&r.car.best>20),'all 14 AI finish with measured lap times');assert(offroad/(steps*14)<.03);
console.log(JSON.stringify({passed:true,length,bankPercent:16,report,rivalFinishTimes:field.rivals.map(r=>({number:r.entry.number,time:r.finishTime}))},null,2));
