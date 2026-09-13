import * as THREE from 'three';
import {clamp} from './physics.js';

// Visual steering travel suitable for a fixed 9/3 grip; physics is unchanged.
export const steeringWheelAngle=steer=>clamp(steer*3,-1.45,1.45);

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

export class DriverMotion{
 constructor(){this.reset();}
 reset(){this.lean=0;this.pitch=0;this.lastSpeed=null;}
 update(car,dt){
  const speed=car.vx*Math.cos(car.heading)+car.vy*Math.sin(car.heading);
  const lateral=speed*car.yaw;
  const acceleration=this.lastSpeed===null||dt<=0?0:(speed-this.lastSpeed)/dt;
  this.lastSpeed=speed;
  const blend=1-Math.exp(-Math.max(0,dt)*7);
  // Active bracing into the turn: negative X roll moves shoulders to -Z (left).
  this.lean+=(-clamp(lateral/9.81,-1.2,1.2)*.115-this.lean)*blend;
  this.pitch+=(clamp(acceleration,-10,7)*.004-this.pitch)*blend;
  return {lean:this.lean,pitch:this.pitch,lateral};
 }
}
