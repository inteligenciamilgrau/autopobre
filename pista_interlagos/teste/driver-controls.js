import {clamp,GEAR_RPM_PER_KMH,SHIFT_UP_RPM,SHIFT_DOWN_RPM} from './physics.js';

// What the seated driver does with the car's controls. The gearbox itself is
// automatic (physics.js); this only choreographs a human hand and feet around it.

// H gate: lane -1 left, 0 centre, 1 right; throw +1 forward, -1 back.
export const GATE=Object.freeze({'-1':[1,-1],1:[-1,1],2:[-1,-1],3:[0,1],4:[0,-1],5:[1,1]});
const gate=g=>GATE[g]??[0,0];

// Seconds a hand needs between two places; a return to the wheel is a little slower.
// The car has no handbrake lever (its battery key sits there), so the right hand
// only travels between the wheel and the gear knob.
export const REACH=Object.freeze({wheel:{knob:.22},knob:{wheel:.27}});
const ANTICIPATE=REACH.wheel.knob+.06,LINGER=.16;

export const minimumJerk=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(6*t-15));};
const approach=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
const toward=(value,target,step)=>value<target?Math.min(target,value+step):Math.max(target,value-step);

// The lever only crosses between lanes in neutral, as a real H gate forces it to.
export function gatePath(from,to){
 const [a0,a1]=gate(from),[b0,b1]=gate(to),points=[[a0,a1]];
 for(const p of [[a0,0],[b0,0],[b0,b1]]){const q=points.at(-1);if(Math.hypot(p[0]-q[0],p[1]-q[1])>1e-9)points.push(p);}
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 return {points,lengths,length:lengths.at(-1)};
}
export function pointOnPath(path,u){
 const d=clamp(u,0,1)*path.length;
 for(let i=1;i<path.points.length;i++)if(d<=path.lengths[i]||i===path.points.length-1){
  const a=path.points[i-1],b=path.points[i],span=path.lengths[i]-path.lengths[i-1],k=span>0?clamp((d-path.lengths[i-1])/span,0,1):1;
  return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];
 }
 return [...path.points[0]];
}
export const shiftDuration=path=>.07+.045*path.length;

export class DriverControls{
 constructor(){this.reset();}
 reset(gear=1){
  this.visualGear=Number.isInteger(gear)&&gear!==0?gear:1;this.lever=[...gate(this.visualGear)];this.shift=null;
  this.hand={from:'wheel',to:'wheel',t:1,duration:REACH.wheel.knob,id:0};
  this.clutch=0;this.leftFoot=0;this.leftLinger=0;this.slowRelease=false;
  this.throttle=0;this.brake=0;this.footOnBrake=0;
  this.lastKmh=null;this.kmhRate=0;this.anticipate=0;this.cooldown=0;this.linger=0;this.shifts=0;
 }
 // state: throttle, brake, handbrake, gear (physics), kmh; returns the pose of controls and limbs.
 update(state,dt){
  dt=Math.max(0,dt||0);if(dt===0)return this.info();
  const kmh=Math.abs(state.kmh??0),throttle=clamp(state.throttle??0,0,1),brake=clamp(state.brake??0,0,1),pulling=(state.handbrake??0)>0;
  const g=Number.isInteger(state.gear)&&state.gear!==0?state.gear:this.visualGear;
  // A driver hears the engine climb or fall towards the change point before it arrives.
  if(this.lastKmh!==null)this.kmhRate=approach(this.kmhRate,(kmh-this.lastKmh)/dt,8,dt);
  this.lastKmh=kmh;
  let soon=Infinity;
  if(g>0&&g<5&&throttle>.3&&this.kmhRate>1)soon=(SHIFT_UP_RPM/GEAR_RPM_PER_KMH[g]-kmh)/this.kmhRate;
  if(g>1&&this.kmhRate<-1)soon=Math.min(soon,(kmh-(SHIFT_DOWN_RPM+(brake>.3?700:0))/GEAR_RPM_PER_KMH[g])/-this.kmhRate);
  this.cooldown=Math.max(0,this.cooldown-dt);
  if(soon>-.05&&soon<ANTICIPATE&&this.cooldown===0)this.anticipate=Math.max(this.anticipate,.6);
  else if(this.anticipate>0){this.anticipate=Math.max(0,this.anticipate-dt);if(this.anticipate===0)this.cooldown=.6;}
  const needShift=g!==this.visualGear;if(needShift)this.anticipate=0;
  // Hand priority: finish a throw, then a pending or expected shift.
  const want=this.shift||needShift||this.anticipate>0||this.linger>0?'knob':'wheel';
  if(want!==this.hand.to){
   const from=this.hand.t>=1?this.hand.to:'moving';
   const duration=from==='moving'?.2:REACH[from][want];
   this.hand={from,to:want,t:0,duration,id:this.hand.id+1};
  } else this.hand.t=Math.min(1,this.hand.t+dt/this.hand.duration);
  const onKnob=this.hand.to==='knob'&&this.hand.t>=1;
  // Left foot: covers the clutch while a change is expected, presses it for the throw,
  // holds it at a standstill in gear and while the rear brake locks for a slide.
  const shifting=!!this.shift||needShift&&this.hand.to==='knob';
  const standing=kmh<4&&throttle<.05,handbrakeTurn=pulling&&kmh>10;
  const pressClutch=shifting&&this.hand.t>.5||standing||handbrakeTurn;
  if(pressClutch||this.anticipate>0||this.clutch>.02)this.leftLinger=.45;else this.leftLinger=Math.max(0,this.leftLinger-dt);
  this.leftFoot=toward(this.leftFoot,this.leftLinger>0?1:0,dt/.12);
  if(pressClutch&&this.leftFoot>.85){this.clutch=approach(this.clutch,1,24,dt);this.slowRelease=standing;}
  else if(!pressClutch)this.clutch=Math.max(0,approach(this.clutch,-.02,this.slowRelease?3.5:10,dt));
  if(!this.shift&&needShift&&onKnob&&this.clutch>.55){const path=gatePath(this.visualGear,g);this.shift={path,t:0,to:g,duration:shiftDuration(path)};}
  if(this.shift){
   this.shift.t=Math.min(1,this.shift.t+dt/this.shift.duration);this.lever=pointOnPath(this.shift.path,minimumJerk(this.shift.t));
   if(this.shift.t>=1){this.visualGear=this.shift.to;this.lever=[...gate(this.visualGear)];this.shift=null;this.linger=LINGER;this.shifts++;}
  } else this.linger=Math.max(0,this.linger-dt);
  // Right foot pivots on the heel between pedals; it lifts off the throttle for a change.
  this.footOnBrake=toward(this.footOnBrake,brake>.02?1:0,dt/.16);
  const lift=shifting?1-this.clutch*.9:1;
  this.throttle=approach(this.throttle,this.footOnBrake<.02?throttle*lift:0,18,dt);
  this.brake=approach(this.brake,this.footOnBrake>.98?brake:0,16,dt);
  return this.info();
 }
 info(){
  return {hand:{from:this.hand.from,to:this.hand.to,t:this.hand.t,s:minimumJerk(this.hand.t),id:this.hand.id},lever:[...this.lever],visualGear:this.visualGear,
   shifting:!!this.shift,clutch:this.clutch,leftFoot:this.leftFoot,throttle:this.throttle,brake:this.brake,footOnBrake:this.footOnBrake,
   footLift:Math.sin(Math.PI*this.footOnBrake),anticipating:this.anticipate>0,shifts:this.shifts};
 }
}
