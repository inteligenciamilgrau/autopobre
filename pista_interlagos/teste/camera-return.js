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
// Head look inside the car. The cockpit turns all the way round (±π) and stops there,
// looking straight back; the hood camera keeps its narrower view.
export const HEAD_YAW_COCKPIT=Math.PI,HEAD_YAW_HOOD=1.45,HEAD_PITCH=[-.60,.45];
export function turnHead(look,dx,dy,maxYaw){
 look.yaw=Math.max(-maxYaw,Math.min(maxYaw,look.yaw+dx*.0025));
 look.pitch=Math.max(HEAD_PITCH[0],Math.min(HEAD_PITCH[1],look.pitch-dy*.0025));
 return look;
}
const smooth=t=>t*t*(3-2*t);
// Past about 70° the neck alone runs out: the torso twists and the eye moves toward
// the car centre (+Z), a little forward and up, clear of the seat wing, the helmet and
// the cage. Cockpit-local metres at a full turn; exactly zero when looking ahead.
export const NECK_TWIST=[.05,.03,.07],TWIST_FROM=1.2;
export function neckTwist(yaw,out=[0,0,0]){
 const k=smooth(Math.min(1,Math.max(0,(Math.abs(yaw)-TWIST_FROM)/(Math.PI-TWIST_FROM))));
 for(let i=0;i<3;i++)out[i]=NECK_TWIST[i]*k;
 return out;
}
// Held look-back: swings to straight back over the centre of the car, slightly down so the
// rear window, the rear cabin and the road behind share the frame; on release it swings
// back to the look it left. Over the passenger side (+Z) unless already looking back left.
export class LookBack {
 constructor(time=.18,pitch=-.2){this.time=time;this.pitch=pitch;this.reset();}
 reset(){this.held=false;this.progress=0;this.side=1;}
 get amount(){return smooth(this.progress);}
 update(dt,held,look,out={}){
  if(held&&this.progress===0)this.side=look.yaw<-Math.PI/2?-1:1;
  this.held=held;this.progress=Math.max(0,Math.min(1,this.progress+(held?dt:-dt)/this.time));
  return this.view(look,out);
 }
 view(look,out={}){const a=this.amount;out.yaw=look.yaw+(this.side*Math.PI-look.yaw)*a;out.pitch=look.pitch+(this.pitch-look.pitch)*a;return out;}
}
