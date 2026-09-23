import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {solveArm,DriverMotion,steeringWheelAngle,spring} from '../teste/driver-rig.js';
import {DriverControls,GATE,gatePath,pointOnPath} from '../teste/driver-controls.js';
import {TestCar} from '../teste/physics.js';
let poses=0;
for(let i=0;i<=20;i++)for(const lean of [-.138,-.07,0,.07,.138])for(const pitch of [-.04,0,.028]){
 const body=new THREE.Object3D();body.position.set(-.20,.54,-.34);body.rotation.set(lean,0,pitch);body.updateMatrixWorld();
 const wheel=new THREE.Object3D();wheel.position.set(.22,.88,-.34);wheel.rotation.set(0,-Math.PI/2,.035);
 const turn=new THREE.Object3D();turn.rotation.z=steeringWheelAngle(-.52+i*.052);wheel.add(turn);wheel.updateMatrixWorld(true);
 for(const side of [-1,1]){
  const shoulder=body.localToWorld(new THREE.Vector3(.004,.355,side*.18));
  const wrist=turn.localToWorld(new THREE.Vector3(side*.173,0,.029));
  const pole=shoulder.clone().add(new THREE.Vector3(-.02,-.25,side*.22));
  const pose=solveArm(shoulder,wrist,pole);assert(pose.reachable);
  assert(Math.abs(shoulder.distanceTo(pose.elbow)-.275)<1e-9);
  assert(Math.abs(wrist.distanceTo(pose.elbow)-.265)<1e-9);poses++;
 }
}
function motionAt(hz){const m=new DriverMotion(),car={vx:20,vy:0,heading:0,yaw:.4};for(let i=0;i<hz;i++)m.update(car,1/hz);return m;}
assert(Math.abs(motionAt(30).lean-motionAt(120).lean)<1e-9);
const m=new DriverMotion();for(let i=0;i<120;i++)m.update({vx:0,vy:0,heading:0,yaw:1},1/60);assert.equal(m.lean,0);
for(const yaw of [.4,-.4]){
 for(let i=0;i<120;i++)m.update({vx:20,vy:0,heading:0,yaw},1/60);
 const shoulders=new THREE.Vector3(0,.355,0).applyAxisAngle(new THREE.Vector3(1,0,0),m.lean);
 // Car left is -Z: torso must move toward the inside of each actual turn.
 assert(shoulders.z*yaw<0,'driver braces into the turn');
 // The head tilts further in than the torso, keeping the eyes level.
 assert(m.pose.headRoll*yaw<0&&Math.abs(m.pose.headRoll)>.05,'head tilts into the turn');
}
for(let i=0;i<120;i++)m.update({vx:20,vy:0,heading:0,yaw:0},1/60);assert(Math.abs(m.lean)<1e-5);
m.reset();assert.equal(m.lean,0);assert.equal(m.pitch,0);
// Exact spring: one long step equals many short ones for a held target.
const a={x:0,v:0},b={x:0,v:0};spring(a,1,.5,9,.4);for(let i=0;i<500;i++)spring(b,1,.001,9,.4);
assert(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.v-b.v)<1e-9);
// Gaze: looks toward the road ahead, a glance only on a calm straight.
const gaze=new DriverMotion(()=>.5);
for(let i=0;i<60;i++)gaze.update({vx:25,vy:0,heading:0,yaw:0},1/60,{look:.5});
assert(gaze.pose.headYaw>.15,'looks left into a left-hand bend');
const straight=new DriverMotion(()=>0);let glanced=false;
for(let i=0;i<60*8;i++){straight.update({vx:30,vy:0,heading:0,yaw:0},1/60,{look:0});glanced||=straight.pose.glance!==null;}
assert(glanced,'glances at mirrors on a straight');
const cornering=new DriverMotion(()=>0);
for(let i=0;i<60*8;i++){cornering.update({vx:30,vy:0,heading:0,yaw:.35},1/60,{look:.4});assert.equal(cornering.pose.glance,null);}
const phone=new DriverMotion(()=>.9);phone.update({vx:30,vy:0,heading:0,yaw:0},1/60,{phoneArrived:true});
for(let i=0;i<40;i++)phone.update({vx:30,vy:0,heading:0,yaw:0},1/60);assert.equal(phone.pose.glance,'phone');
const hit=new DriverMotion();hit.update({vx:20,vy:0,heading:0,yaw:0},1/60,{impact:14});for(let i=0;i<6;i++)hit.update({vx:20,vy:0,heading:0,yaw:0},1/60);
assert(hit.pose.headPitch<-.05,'a wall hit throws the head forward');

// H gate: lanes are crossed only in neutral, every point stays in the slots.
assert.equal(gatePath(1,2).length,2);assert.equal(gatePath(2,3).length,3);assert.equal(gatePath(4,-1).length,3);
for(const [from,to] of [[1,2],[2,3],[3,4],[4,5],[5,4],[3,2],[2,1],[1,-1]]){
 const path=gatePath(from,to);
 for(let u=0;u<=1;u+=.01){const [lane,t]=pointOnPath(path,u);assert(Math.abs(t)<1e-9||Math.abs(lane-Math.round(lane))<1e-9,`${from}-${to} leaves the gate`);}
 assert.deepEqual(pointOnPath(path,1),GATE[to]);
}

// Full-throttle run on the real car: each automatic upshift is taken by hand.
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url),'utf8'));
function drive(steps,fps=60){
 const car=new TestCar(data),controls=new DriverControls();car.reset(600);
 const frames=[];let t=0;
 for(const [seconds,command] of steps)for(let f=0;f<Math.round(seconds*fps);f++){
  for(let i=0;i<120/fps;i++)car.step({throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0,...command},1/120);
  t+=1/fps;const kmh=Math.hypot(car.vx,car.vy)*3.6;
  frames.push({t,gear:car.gear,kmh,...controls.update({...command,gear:car.gear,kmh},1/fps)});
 }
 return frames;
}
const run=drive([[7,{throttle:1}]]);
const shifts=run.filter((f,i)=>i&&f.gear!==run[i-1].gear);
assert(shifts.length>=3,'reaches fourth gear');
for(const s of shifts){
 const at=run.indexOf(s),before=run[at-1];
 assert(before.anticipating||before.hand.to==='knob','hand heads to the lever before the change');
 const caught=run.slice(at).find(f=>f.visualGear===s.gear);
 assert(caught&&caught.t-s.t<.3,`lever reaches ${s.gear} within 0.3 s`);
}
let lastLever=run[0].lever,travelOk=true;
for(const f of run){if(f.lever[0]!==lastLever[0]||f.lever[1]!==lastLever[1])travelOk&&=f.hand.to==='knob'&&f.hand.t>=1&&f.clutch>.5;lastLever=f.lever;}
assert(travelOk,'lever moves only in a hand, with the clutch down');
assert(run.some(f=>f.shifting&&f.throttle<.3),'right foot lifts during a change');
const settled=run.filter(f=>f.t>shifts[0].t+.8&&f.t<shifts[1].t-.5);
assert(settled.length&&settled.every(f=>f.hand.to==='wheel'&&f.hand.t>=1),'hand back on the rim between changes');
const run30=drive([[7,{throttle:1}]],30);
assert.equal(run30.at(-1).visualGear,run.at(-1).visualGear,'same choreography at 30 fps');
// Standstill in gear: clutch held; launch releases it gradually.
const idle=drive([[.6,{}]]);assert(idle.at(-1).clutch>.95&&idle.at(-1).leftFoot===1);
const launch=drive([[.6,{}],[.15,{throttle:1}]]);assert(launch.at(-1).clutch>.2&&launch.at(-1).clutch<.9,'progressive launch');
// Brakes: right foot pivots across in under 0.2 s, never on both pedals.
const braking=drive([[3,{throttle:1}],[.5,{brake:1}]]),press=braking.findIndex(f=>f.t>3);
const onBrake=braking.slice(press).find(f=>f.footOnBrake===1);
assert(onBrake&&onBrake.t-braking[press].t<.2);
assert(braking.every(f=>f.throttle<.05||f.brake<.05),'one foot, one pedal');
assert(braking.at(-1).brake>.9);
// Downshifts under braking are taken by hand too, and the lever ends in the gear.
const slowing=drive([[4.6,{throttle:1}],[3.4,{brake:1}]]),down=slowing.filter((f,i)=>i&&f.gear<slowing[i-1].gear);
assert(down.length>=2,'downshifts while braking');
for(const s of down){const caught=slowing.slice(slowing.indexOf(s)).find(f=>f.visualGear===s.gear);assert(caught&&caught.t-s.t<.35,`lever back to ${s.gear}`);}
assert.equal(slowing.at(-1).visualGear,slowing.at(-1).gear);
// Handbrake: pulled while held, a quick tap still shows, then back to the wheel.
const pull=drive([[1.2,{throttle:1}],[.45,{handbrake:1}]]);assert(pull.at(-1).hand.to==='handbrake'&&pull.at(-1).handbrake>.9);
const tap=drive([[1.2,{throttle:1}],[1/60,{handbrake:1}],[1,{}]]);
assert(Math.max(...tap.map(f=>f.handbrake))>.5,'a tap is still a visible pull');
assert(tap.at(-1).handbrake===0&&tap.at(-1).hand.to==='wheel'&&tap.at(-1).hand.t===1);
// Reverse: into R through the gate, and back to first on release.
const reverse=drive([[.5,{}],[.8,{reverse:1}]]);assert.equal(reverse.at(-1).visualGear,-1);
const forward=drive([[.5,{}],[.8,{reverse:1}],[.8,{}]]);assert.equal(forward.at(-1).visualGear,1);
console.log(`${poses} reachable arm poses; body, gaze, gate, ${shifts.length} hand shifts, pedals, handbrake and reverse passed.`);
