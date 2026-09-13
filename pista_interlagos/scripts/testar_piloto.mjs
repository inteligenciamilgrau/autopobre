import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {solveArm,DriverMotion,steeringWheelAngle} from '../teste/driver-rig.js';
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
}
for(let i=0;i<120;i++)m.update({vx:20,vy:0,heading:0,yaw:0},1/60);assert(Math.abs(m.lean)<1e-5);
m.reset();assert.equal(m.lean,0);assert.equal(m.pitch,0);
console.log(`${poses} reachable arm poses; turn direction, rest, recovery and frame-rate independence passed.`);
