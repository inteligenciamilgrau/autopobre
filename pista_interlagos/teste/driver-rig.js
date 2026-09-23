import {clamp} from './physics.js';

// Visual steering travel suitable for a fixed 9/3 grip; physics is unchanged.
export const steeringWheelAngle=steer=>clamp(steer*3,-1.45,1.45);

// Two-bone limb (arm or leg): the joint bends toward the pole.
export function solveArm(shoulder,wrist,pole,upper=.275,lower=.265){
 const axis=wrist.clone().sub(shoulder),distance=axis.length();axis.normalize();
 const d=clamp(distance,Math.abs(upper-lower)+.0001,upper+lower-.0001);
 const along=(upper*upper-lower*lower+d*d)/(2*d);
 const bend=pole.clone().sub(shoulder);bend.addScaledVector(axis,-bend.dot(axis));
 if(bend.lengthSq()<1e-8)bend.set(0,-1,0).addScaledVector(axis,axis.y);
 bend.normalize();
 const elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
 return {elbow,reachable:distance<=upper+lower,distance};
}

// Exact damped-spring step toward a target held for dt, so the body moves the
// same at 30 or 144 fps. zeta<1 overshoots a little, like a relaxed neck.
export function spring(state,target,dt,omega,zeta){
 if(!(dt>0))return state.x;
 const y=state.x-target,v=state.v,a=zeta*omega,e=Math.exp(-a*dt);
 if(zeta<1){
  const wd=omega*Math.sqrt(1-zeta*zeta),c=Math.cos(wd*dt),s=Math.sin(wd*dt);
  state.x=target+e*(y*c+(v+a*y)/wd*s);state.v=e*(v*c-(a*v+omega*omega*y)/wd*s);
 } else {const b=v+omega*y;state.x=target+e*(y+b*dt);state.v=e*(v-omega*b*dt);}
 return state.x;
}

// Head yaw/pitch for each glance; the eyes cover the rest of the angle.
export const GLANCES=Object.freeze({mirror:[-.36,.13],leftMirror:[.5,-.04],gauges:[-.1,-.2],phone:[-.04,-.34]});
const G=9.81;

export class DriverMotion{
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){
  this.lean=0;this.pitch=0;this.lastSpeed=null;this.time=0;this.breath=0;
  this.springs=Object.fromEntries(['lean','pitch','twist','headRoll','headPitch','look','glanceYaw','glancePitch'].map(k=>[k,{x:0,v:0}]));
  this.glance=null;this.nextGlance=3+this.random()*4;this.phoneDue=-1;this.phoneWait=0;
  this.pose={lean:0,pitch:0,twist:0,headRoll:0,headPitch:0,headYaw:0,lateral:0,breath:0,glance:null};
 }
 // cue: look (rad to the road ahead, + left), wheel (rim angle), reach (0-1 right hand
 // away from the rim), rough (0-1 loose ground), impact (m/s lost), phoneArrived.
 update(car,dt,cue={}){
  dt=Math.max(0,dt||0);const s=this.springs;
  const speed=car.vx*Math.cos(car.heading)+car.vy*Math.sin(car.heading),lateral=speed*car.yaw;
  const acceleration=Number.isFinite(car.longAccel)?car.longAccel:this.lastSpeed===null||dt<=0?0:(speed-this.lastSpeed)/dt;
  this.lastSpeed=speed;
  const g=clamp(lateral/G,-1.2,1.2),surge=clamp(acceleration,-10,7),reach=clamp(cue.reach??0,0,1);
  if(dt>0){
   // Loose ground shakes the helmet; a hit throws the body forward against the belts.
   const rough=(cue.rough??0)*clamp(Math.abs(speed)/20,0,1.5)*Math.sqrt(dt)*12;
   if(rough>0){s.headPitch.v+=(this.random()-.5)*rough*1.3;s.headRoll.v+=(this.random()-.5)*rough;s.pitch.v+=(this.random()-.5)*rough*.3;}
   const hit=clamp(((cue.impact??0)-4)/12,0,1);
   if(hit>0){s.pitch.v-=hit*1.2;s.headPitch.v-=hit*3.5;s.headRoll.v+=(this.random()-.5)*hit*3;}
  }
  // Torso: active bracing into the turn (negative X roll moves shoulders to -Z,
  // the left), with a little lag and overshoot; inertia under brakes and power.
  this.lean=spring(s.lean,-g*.115+reach*.035,dt,11,.55);
  this.pitch=spring(s.pitch,surge*.004-reach*.03,dt,10,.6);
  // Shoulders follow the rim a touch; reaching for a lever brings the right one forward.
  const twist=spring(s.twist,(cue.wheel??0)*.05+reach*.11,dt,9,.75);
  // Head: tilts further into the corner to keep the horizon level, nods with the brakes.
  const headRoll=spring(s.headRoll,-g*.10,dt,13,.45);
  const headPitch=spring(s.headPitch,surge*.006,dt,9,.4);
  // Eyes lead: look at the road ahead into the corner before the wheel turns;
  // off the asphalt the gaze follows the steering instead.
  const steerLook=(car.steerInput??0)*.3,onRoad=car.surface?.onRoad!==false;
  const look=clamp(Number.isFinite(cue.look)?cue.look*(onRoad?.45:.15)+steerLook*(onRoad?.4:1):steerLook,-.55,.55);
  spring(s.look,look,dt,7,.85);
  this.time+=dt;this.breath+=dt*(1.6+clamp(Math.abs(g)+Math.abs(surge)/G,0,1.5)*1.4);
  if(cue.phoneArrived){this.phoneDue=.45;this.phoneWait=4;}
  // Calm moments (straights, waiting on the grid) leave time for a glance around.
  const calm=Math.abs(g)<.2&&Math.abs(look)<.15&&reach<.05;
  if(this.phoneDue>=0&&dt>0){
   this.phoneDue-=dt;this.phoneWait-=dt;
   if(this.phoneDue<0){if(Math.abs(g)<.45&&reach<.05){this.glance={name:'phone',t:0,hold:1.1};}else if(this.phoneWait>0)this.phoneDue=.3;}
  }
  if(this.glance){this.glance.t+=dt;if(this.glance.t>this.glance.hold||reach>.3||this.glance.name!=='phone'&&!calm)this.glance=null;}
  else if(calm&&dt>0){
   this.nextGlance-=dt;
   if(this.nextGlance<=0){const r=this.random();this.glance={name:r<.5?'mirror':r<.75?'leftMirror':'gauges',t:0,hold:.35+this.random()*.35};this.nextGlance=3.5+this.random()*5;}
  }
  const [gy,gp]=this.glance?GLANCES[this.glance.name]:[0,0];
  const headYaw=s.look.x+spring(s.glanceYaw,gy,dt,16,.9),glancePitch=spring(s.glancePitch,gp,dt,16,.9);
  this.pose={lean:this.lean,pitch:this.pitch,twist,headRoll,headPitch:headPitch+glancePitch,headYaw,lateral,breath:Math.sin(this.breath),glance:this.glance?.name??null};
  return this.pose;
 }
}
