import {GEAR_RPM_PER_KMH,REDLINE_RPM} from './physics.js';
// Câmbio manual (the Controles tab): the gear the player asks for, which physics.js engages (input.gear).
// The keyboard (X up, Z down), the controller's D-pad (→ ←) and a wheel's paddles or sequential lever
// step through R, 1st to 5th; an H shifter puts in the gear its lever is in, neutral between slots.
export const TOP_GEAR=5;
// A paddle never throws the engine past this on a downshift (it stays in gear); an H lever can.
const DOWNSHIFT_RPM=REDLINE_RPM+150,REVERSE_KMH=5;
const kmhOf=car=>Math.hypot(car?.vx??0,car?.vy??0)*3.6;
export class ManualGearbox {
 constructor(){this.gear=1;this.lever=undefined;}
 // The player takes the car over (a race start, the recon lap's autopilot, the cool-down after the
 // flag): the gear it is in, or the H lever's when there is one.
 sync(car,lever){this.lever=lever;this.gear=lever!==undefined?lever??0:Number.isInteger(car?.gear)&&car.gear>=-1&&car.gear<=TOP_GEAR?car.gear:1;}
 up(){if(this.gear<TOP_GEAR)this.gear=this.gear<1?1:this.gear+1;return this.gear;}
 // Down a gear unless the engine would over-rev; from 1st (or neutral) to reverse only nearly stopped.
 down(car){
  if(this.gear>1){if(kmhOf(car)*GEAR_RPM_PER_KMH[this.gear-1]<=DOWNSHIFT_RPM)this.gear--;}
  else if(this.gear>=0&&kmhOf(car)<REVERSE_KMH)this.gear=-1;
  return this.gear;
 }
 // An H shifter's slot (1-5, -1 reverse, null between slots, undefined when there is none): moving
 // the lever engages its gear; a lever left where it is lets the paddles or keys shift too.
 setLever(slot){if(slot===this.lever)return;this.lever=slot;if(slot!==undefined)this.gear=slot??0;}
}
