// Wall-clock delay: a slow rendering frame must not turn 3 seconds into 15.
export class CameraReturn {
 constructor(delayMs=3000,minSpeed=2){this.delayMs=delayMs;this.minSpeed=minSpeed;this.reset(0);}
 reset(now){this.lastInput=now;this.movingSince=null;this.active=false;}
 manual(now){this.lastInput=now;this.active=false;}
 update(now,speed,paused){
  if(paused||speed<this.minSpeed){this.movingSince=null;this.active=false;return false;}
  if(this.movingSince===null)this.movingSince=now;
  this.active=now-this.movingSince>=this.delayMs&&now-this.lastInput>=this.delayMs;
  return this.active;
 }
}
