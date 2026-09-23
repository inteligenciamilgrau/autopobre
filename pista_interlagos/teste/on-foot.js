// On foot in third person, shared by the stroll during a pit stop (pitstop.js) and the
// story mode's paddock (immersive-visuals.js). Desktop: the mouse turns the camera,
// W/S walk along it and A/D sideways, Shift runs, Space jumps, C crouches, and the
// pilot turns to where he goes. Touch: the steering pad turns the view and the pilot
// together, the pedals walk. The pilot may go anywhere the ground lets him stand:
// rooms with their own floors (Box 99 and the café), the pit lane, the track and the
// terrain, stopped by walls and closed garages; low walls can be jumped onto.
import * as THREE from 'three';
import {wallsNear,pitFrameAt} from './pit-lane.js';

const clamp=THREE.MathUtils.clamp,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),R=.25,ZERO=new THREE.Vector3();

export function footState(yaw,extra={}){return {yaw,pitch:.5,distance:4.8,cycle:0,steps:0,running:false,crouch:false,crouchAmount:0,lift:0,vz:0,floor:0,...extra};}
export function turnFootView(s,dx,dy){s.yaw-=dx*.0025;s.pitch=clamp(s.pitch+dy*.0025,-.15,1.2);}
export function zoomFootView(s,k){s.distance=clamp(s.distance+k*.5,2.2,7.5);}
export function footJump(s){if(s.lift>0)return false;s.crouch=false;s.vz=3.3;return true;}

// Floor height (world y) where a person can stand at a world position, or null.
// The layout's walk() knows its rooms (a height, null where blocked, undefined outside
// them); elsewhere the car's ground sampler gives the asphalt or terrain. The closed
// garages of the pit block stop him, and so do the circuit's walls, except the low
// ones he has jumped high enough to climb (not across the garage doors, where the
// wall stands for the closed door). The layout's solid(pos, from, crew) and blocked(pos,
// from) add people and parked cars; from is where he stands now.
export function footGround({car,pit=null,layout=null,blocked=null,crew=true}){
 const geo=car.pitGeo,g=pit?.garages,depth=pit?.block??21;
 const inBlock=(x,y,m)=>{if(!g)return false;const f=pitFrameAt(pit,x,y);return !!f&&f.s>g[0]-m&&f.s<g[1]+m&&f.d>f.front-m&&f.d<f.front+depth+m;};
 const climbable=new Set(geo?geo.walls.filter(w=>w.low&&!inBlock((w.x1+w.x2)/2,(w.y1+w.y2)/2,1)):[]);
 return (pos,elevation,from=null)=>{
  const x=pos.x,y=-pos.z,room=layout?.walk?.(pos);if(room===null||from&&layout?.solid?.(pos,from,crew))return null;
  if(room===undefined&&inBlock(x,y,R))return null;
  let floor=room??car.sample(x,y).z-.055;
  if(geo)for(const w of wallsNear(geo,x,y,R)){if(!climbable.has(w)||elevation<w.top-.5)return null;floor=Math.max(floor,w.top);}
  return blocked?.(pos,from)?null:floor;
 };
}

// One frame on foot. The hero is a child of the scene, or of an unturned group at
// `origin`; ground(worldPosition, elevation, from) is footGround's test (none: anywhere).
// arms(side, gait) may return [raise, bend, twist] for a busy hand. Returns true when
// a footstep should sound.
export function stepOnFoot(s,hero,input,dt,{touch=false,shift=false,ground=null,origin=null,arms=null}={}){
 const forward=input.throttle-input.brake,sideways=input.left-input.right;
 if(touch)s.yaw+=sideways*2.2*dt;
 const strafe=touch?0:sideways,fx=Math.cos(s.yaw),fy=Math.sin(s.yaw),mx=fx*forward-fy*strafe,my=fy*forward+fx*strafe,amount=Math.min(1,Math.hypot(mx,my));
 s.running=shift&&amount>.01;if(s.running)s.crouch=false;
 const previous=hero.position.clone(),o=origin??ZERO,elevation=s.floor+s.lift,from=previous.clone().add(o);
 if(amount>.01){
  hero.rotation.y+=wrap(Math.atan2(my,mx)-hero.rotation.y)*Math.min(1,dt*10);
  const n=Math.hypot(mx,my),speed=amount*(s.running?6.2:s.crouch?1.4:3)*dt,dx=mx/n*speed,dz=-my/n*speed;
  // The whole step, else along one axis, so the pilot slides along walls.
  for(const [ax,az] of [[dx,dz],[dx,0],[0,dz]]){
   const floor=ground?ground(new THREE.Vector3(previous.x+o.x+ax,elevation,previous.z+o.z+az),elevation,from):s.floor;if(floor===null)continue;
   hero.position.x=previous.x+ax;hero.position.z=previous.z+az;
   // Off a wall or a kerb he falls; up a step (or onto a wall he jumped to) he stands on it.
   const drop=elevation-floor;s.lift=drop>.3||s.lift>0?Math.max(0,drop):0;s.floor=floor;break;
  }
 }
 // A jump is a hop under gravity; a hard landing sounds a step.
 let step=false;s.vz-=9.8*dt;s.lift=Math.max(0,s.lift+s.vz*dt);if(s.lift===0){step=s.vz<-1.5;s.vz=0;}
 hero.position.y=s.floor+s.lift-o.y;s.crouchAmount+=((s.crouch?1:0)-s.crouchAmount)*Math.min(1,dt*8);
 const distance=Math.hypot(hero.position.x-previous.x,hero.position.z-previous.z),run=s.running&&distance>.0001,stride=run?1.4:.8;
 s.cycle+=distance*(run?2.3:3.3);s.steps+=distance;if(s.steps>stride){s.steps%=stride;if(s.lift===0)step=true;}
 footLimbs(hero,s,dt,distance,arms);
 return step;
}

// Legs and arms swing wider when running, knees and elbows bend; crouched, the thighs
// come forward and the knees go deep; in the air the legs tuck.
export function footLimbs(hero,s,dt,distance,arms=null){
 const k=s.crouchAmount,air=s.lift>.03?1:0,moving=distance>.0001,run=s.running&&moving,swing=moving?Math.sin(s.cycle)*(run?.85:.55)*(1-.45*k):0,rig=hero.userData.rig,blend=1-Math.exp(-dt*18);
 for(const side of [-1,1]){
  const leg=hero.getObjectByName('Membro_perna_'+side),arm=hero.getObjectByName('Membro_braco_'+side),fore=rig?.limbs[side].fore;
  leg.rotation.z+=(swing*side+1.1*k+.6*air-leg.rotation.z)*blend;
  if(rig){const shin=rig.limbs[side].shin,knee=(moving?(run?.25:.08)+(run?1.2:.45)*Math.max(0,Math.cos(s.cycle)*side):0)*(1-.4*k)+1.9*k+1.1*air;shin.rotation.z+=(-knee-shin.rotation.z)*blend;}
  const [raise,bend,twist]=arms?.(side,{swing,run,air,k,rig})??[-swing*side*(run?.85:1)+.5*air+.3*k,run?1.35:.18,0];
  arm.rotation.z+=(raise-arm.rotation.z)*blend;if(rig){fore.rotation.z+=(bend-fore.rotation.z)*blend;fore.rotation.y+=(twist-fore.rotation.y)*blend;arm.rotation.x+=(-side*.1-arm.rotation.x)*blend;}
 }
 if(rig){rig.torso.rotation.z+=((run?-.25:0)-.35*k-rig.torso.rotation.z)*(1-Math.exp(-dt*8));rig.hips.position.y=.93-.42*k;}
}

// Where the third-person camera wants to be: behind the pilot's head (hero is his
// world position) at the chosen yaw, pitch and distance, kept in the rooms by the layout.
export function footEye(s,hero,layout,target,eye){
 target.set(hero.x,hero.y+1.35-.45*s.crouchAmount,hero.z);
 eye.set(target.x-Math.cos(s.yaw)*Math.cos(s.pitch)*s.distance,target.y+Math.sin(s.pitch)*s.distance,target.z+Math.sin(s.yaw)*Math.cos(s.pitch)*s.distance);
 layout?.frameEye?.(eye,hero);
}
// Pulls the camera in front of the first wall between it and what it looks at, and
// keeps it above the ground, so it never shows the inside or the far side of a wall.
// Long obstacles (guardrails, the pit wall: one mesh for the whole circuit) are cut
// into 24 m pieces once, so the short camera ray only tests the triangles near it.
const ray=new THREE.Raycaster(),look=new THREE.Vector3(),pieceCache=new WeakMap(),listCache=new WeakMap(),bothSides=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),CHUNK=24;
function pieces(mesh){
 let list=pieceCache.get(mesh);if(list)return list;
 const g=mesh.geometry;if(!g.boundingSphere)g.computeBoundingSphere();
 if(g.boundingSphere.radius<CHUNK)list=[mesh];
 else{
  mesh.updateWorldMatrix(true,false);const pos=g.attributes.position,index=g.index,count=index?index.count:pos.count,cells=new Map(),v=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  for(let i=0;i+2<count;i+=3){
   for(let k=0;k<3;k++)v[k].fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld);
   const key=Math.floor((v[0].x+v[1].x+v[2].x)/3/CHUNK)+':'+Math.floor((v[0].z+v[1].z+v[2].z)/3/CHUNK);
   let cell=cells.get(key);if(!cell)cells.set(key,cell=[]);for(const p of v)cell.push(p.x,p.y,p.z);
  }
  list=[...cells.values()].map(cell=>{const piece=new THREE.BufferGeometry();piece.setAttribute('position',new THREE.Float32BufferAttribute(cell,3));piece.computeBoundingSphere();piece.computeBoundingBox();return new THREE.Mesh(piece,bothSides);});
 }
 pieceCache.set(mesh,list);return list;
}
export function clearView(target,position,obstacles,ground=null){
 let hit=null;look.subVectors(position,target);const far=look.length();
 if(obstacles?.length&&far>.05){
  let cut=listCache.get(obstacles);if(!cut||cut.count!==obstacles.length){cut={count:obstacles.length,list:obstacles.flatMap(pieces)};listCache.set(obstacles,cut);}
  ray.set(target,look.multiplyScalar(1/far));ray.far=far+.25;hit=ray.intersectObjects(cut.list,false)[0];if(hit)position.copy(target).addScaledVector(look,Math.max(.2,hit.distance-.3));
 }
 if(ground){const floor=ground(position.x,-position.z);if(position.y<floor+.3)position.y=floor+.3;}
 return !!hit;
}
// The walking camera: behind the pilot (hero: his world position), smoothed through
// `follow` (returned, to pass back next frame), in front of any wall. Backed against a
// wall it comes close, so it rises and looks ahead over his head instead of filling
// the view with his back; right at his head, `body` is hidden.
export function placeFootCamera(camera,s,hero,{layout=null,obstacles=null,ground=null,dt=1/60,follow=null,body=null}={}){
 const target=new THREE.Vector3(),eye=new THREE.Vector3();footEye(s,hero,layout,target,eye);
 follow??=eye.clone();follow.lerp(eye,1-Math.exp(-Math.max(dt,.016)*16));clearView(target,follow,obstacles,ground);
 const close=clamp((1.4-Math.hypot(follow.x-target.x,follow.z-target.z))/1.4,0,1),fx=Math.cos(s.yaw),fz=-Math.sin(s.yaw);
 camera.position.copy(follow);camera.position.y+=.8*close;camera.up.set(0,1,0);camera.lookAt(target.x+fx*2.5*close,target.y-.3*close,target.z+fz*2.5*close);
 if(body)body.visible=camera.position.distanceTo(target)>.55;
 return follow;
}
