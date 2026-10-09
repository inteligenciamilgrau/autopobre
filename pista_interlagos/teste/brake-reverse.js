// The brake backs up (a player asked for it, on every control: S, a pad's trigger, the touch pedal, a
// wheel's pedal), with the automatic gearbox. Held through a stop it first waits a moment at rest, so a
// stop at the box (which opens after .65 s still) or on the grid stays a stop; pressed with the car
// already still it backs up almost at once. From then on the pedal is the reverse, dosed by its travel,
// until it is let go. With the throttle on as well it stays a brake. Q and the manual's R are unchanged.
export const STILL_SPEED=.3; // m/s: physics holds a braked car still below this
export const BRAKE_WAIT=Object.freeze({rest:.1,stop:.75});
const PRESSED=.1,THROTTLE_OFF=.05;
export class BrakeReverse {
 constructor(){this.reset();}
 reset(){this.backing=false;this.held=false;this.fromRest=false;this.wait=0;}
 // Only a physics step (dt > 0) moves it on; the other reads of the same command (sound, hands) just
 // see the brake turned into reverse. allowed: in the car, automatic gearbox, fuel to drive.
 apply(command,car,{allowed=true,dt=0}={}){
  const held=allowed&&command.brake>PRESSED&&!(command.throttle>THROTTLE_OFF),still=Math.hypot(car.vx,car.vy)<STILL_SPEED;
  if(dt>0){
   if(held&&!this.held)this.fromRest=still;
   if(!still&&!this.backing)this.fromRest=false;
   this.held=held;this.wait=held&&still&&!this.backing?this.wait+dt:0;
   this.backing=held&&(this.backing||this.wait>=(this.fromRest?BRAKE_WAIT.rest:BRAKE_WAIT.stop)-1e-9);
  }
  if(this.backing&&held){command.reverse=Math.max(command.reverse||0,command.brake);command.brake=0;}
  return command;
 }
}
