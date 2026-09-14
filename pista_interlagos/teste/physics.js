// Modelo de teste: bicicleta, aderencia limitada, gravidade no plano medido.
// Nao e simulacao homologada de pneus/suspensao do Old Stock.
import {GRID_START_BACK} from './race-roster.js';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const MAX_STEER=.72;
export const GUARDRAIL_CLEARANCE=5;
export class TestCar {
 constructor(data){this.data=data;this.a=data.samples;this.n=this.a.length;this.reset();}
 resetGrid(){const target=this.data.meta.reconstructed_xy_m-GRID_START_BACK;this.reset(Math.max(0,this.a.findIndex(p=>p[0]>=target)));this.awaitingStart=true;}
 reset(index=0){this.awaitingStart=false;const p=this.a[index%this.n];this.x=p[1];this.y=p[2];this.heading=Math.atan2(p[8],p[7]);this.vx=0;this.vy=0;this.yaw=0;this.steer=0;this.index=index;this.distance=0;this.clock=0;this.lapStart=0;this.laps=0;this.best=null;this.lastLap=null;this.checkpoints=new Set();this.nextCheckpoint=1;this.lapValid=true;this.lastLapValid=null;this.excursion=null;this.spin=0;this.rearSpin=0;this.burnout=0;this.rearSlipSpeed=0;this.surface=this.sample(this.x,this.y);}
 nearest(x,y,global=false){
  let best=Infinity,out;
  const count=global?this.n:81,start=global?0:this.index-40;
  for(let k=0;k<count;k++){
   const i=(start+k+this.n)%this.n,a=this.a[i],b=this.a[(i+1)%this.n];
   const dx=b[1]-a[1],dy=b[2]-a[2],u=clamp(((x-a[1])*dx+(y-a[2])*dy)/(dx*dx+dy*dy),0,1);
   const ex=x-a[1]-u*dx,ey=y-a[2]-u*dy,d2=ex*ex+ey*ey;
   if(d2<best){best=d2;out={i,u,ex,ey};}
  }
  if(best>10000&&!global)return this.nearest(x,y,true);
  return out;
 }
 terrain(x,y){const t=this.data.terrain,fx=clamp((x-t.x0)/t.step,0,t.nx-1.001),fy=clamp((y-t.y0)/t.step,0,t.ny-1.001),ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,k=iy*t.nx+ix;
  return (t.z[k]*(1-u)+t.z[k+1]*u)*(1-v)+(t.z[k+t.nx]*(1-u)+t.z[k+t.nx+1]*u)*v;
 }
 sample(x,y){
  const q=this.nearest(x,y),a=this.a[q.i],b=this.a[(q.i+1)%this.n],mix=k=>a[k]+(b[k]-a[k])*q.u;
  const tx=mix(7),ty=mix(8),lx=-ty,ly=tx,d=q.ex*lx+q.ey*ly,bank=mix(5),grade=mix(6),width=mix(4);
  const gx=tx*grade+lx*bank,gy=ty*grade+ly*bank;
  const roadz=mix(3)+bank*d,blend=clamp((Math.abs(d)-width/2)/3,0,1);
  const z=roadz*(1-blend)+this.terrain(x,y)*blend+.055;
  const s=(a[0]+q.u*Math.hypot(b[1]-a[1],b[2]-a[2]))%this.data.meta.reconstructed_xy_m;
  return {i:q.i,u:q.u,s:s>this.data.meta.reconstructed_xy_m-.01?0:s,d,z,width,bank,grade,gx,gy,tx,ty,lx,ly,onRoad:Math.abs(d)<width/2};
 }
 step(input,dt){
  this.wallImpactSpeed=0;
  const p=this.surface,oldX=this.x,oldY=this.y;
  const c=Math.cos(this.heading),s=Math.sin(this.heading),v=this.vx*c+this.vy*s,lat=-this.vx*s+this.vy*c,speed=Math.hypot(this.vx,this.vy);
  const mu=p.onRoad?(input.handbrake?.99:1.24):.62,steerTarget=(input.left-input.right)*MAX_STEER/(1+speed/28);
  // Remove the long change-of-direction delay without amplifying small inputs.
  const steerResponse=steerTarget*this.steer<0?18:12;
  this.steer+=(steerTarget-this.steer)*(1-Math.exp(-dt*steerResponse));
  // Deliberate low-speed stunt assist: hold + throttle spins the driven rear
  // tyres; steering allows a tight powered circle. Ordinary driving is unchanged.
  const burning=!!(input.handbrake&&input.throttle&&!input.reverse&&p.onRoad&&speed<12);
  this.burnout=(this.burnout??0)+((burning?input.throttle:0)-(this.burnout??0))*(1-Math.exp(-dt*(burning?3:input.throttle?2:7)));
  this.rearSlipSpeed=this.burnout*20;
  const turn=clamp(this.steer/MAX_STEER,-1,1);
  let targetYaw=v/2.667*Math.tan(this.steer);
  // Reserve some tyre force for correcting sideways motion on corner entry.
  // Handbrake stunts retain their previous grip budget.
  const yawLimit=mu*9.81*(p.onRoad&&!input.handbrake?.94:1)/Math.max(speed,3);
  targetYaw=clamp(targetYaw,-yawLimit,yawLimit);
  if(burning)targetYaw=input.brake?0:turn*1.35*this.burnout;
  const yawResponse=burning?6:targetYaw*this.yaw<0?16:12;
  this.yaw+=(targetYaw-this.yaw)*(1-Math.exp(-dt*yawResponse));
  this.heading=wrap(this.heading+this.yaw*dt);
  let drive=input.throttle*(this.engineScale??1)*Math.min(5.8,190/Math.max(Math.abs(v),7));
  if(input.reverse)drive-=3;
  // Grass grips the tyres more firmly but costs speed through rolling resistance.
  const rolling=p.onRoad?.16:1.9+.085*Math.abs(v);
  const drag=.00145*v*Math.abs(v)+Math.sign(v)*Math.min(rolling,Math.abs(v)/dt);
  const braking=Math.max(input.brake*11,input.handbrake&&!burning?7:0)*Math.min(1,Math.abs(v)/Math.max(dt*11,.001))*Math.sign(v);
  const gx=-9.81*p.gx,gy=-9.81*p.gy;
  // The car origin is 1.117 m ahead of the rear axle. In a gripping turn its
  // lateral velocity is yaw * rearOffset; damping it toward zero made the rear slide.
  const lateralLimit=mu*9.81*(input.handbrake?.45:1);
  const turnAcross=clamp(v*this.yaw,-lateralLimit,lateralLimit);
  const rollingLateral=this.yaw*1.117,gravityAcross=-gx*s+gy*c;
  const across=clamp(turnAcross+(rollingLateral-lat)*(input.handbrake?1.5:12)-gravityAcross,-lateralLimit,lateralLimit);
  // The turning force is perpendicular to travel, rather than adding free speed.
  const along=drive-drag-braking-(Math.abs(v)>.5?turnAcross*lat/v:0);
  this.vx+=(along*c-across*s+gx)*dt;this.vy+=(along*s+across*c+gy)*dt;
  if(burning){
   // Bracing at rest, then a tight powered circle that fits the asphalt width.
   const crawl=input.brake?0:Math.abs(turn)*2*this.burnout;
   // Let the rear swing outward around the gripping front end.
   const side=input.brake?0:-this.yaw*1.1;
   const blend=1-Math.exp(-dt*8);
   this.vx+=(crawl*c-side*s-this.vx)*blend;
   this.vy+=(crawl*s+side*c-this.vy)*blend;
   if(Math.abs(turn)<.02&&speed<.8){this.vx=0;this.vy=0;}
  }
  if(input.brake&&speed<.3){this.vx=0;this.vy=0;}
  if(input.handbrake&&!burning&&speed<.3){this.vx=0;this.vy=0;}
  this.x+=this.vx*dt;this.y+=this.vy*dt;
  this.surface=this.sample(this.x,this.y);this.index=this.surface.i;
  // The continuous rendered rail and contact share the same shoulder clearance.
  const r=this.surface,side=Math.sign(r.d),angle=wrap(this.heading-Math.atan2(r.ty,r.tx));
  const extent=.93*Math.abs(Math.cos(angle))+2.38*Math.abs(Math.sin(angle));
  const wall=r.width/2+GUARDRAIL_CLEARANCE-.12-extent;
  const crossed=Math.abs(p.d)<=p.width/2+GUARDRAIL_CLEARANCE-.12-extent;
  if(Math.abs(r.d)>wall&&(crossed||Math.abs(r.d)<wall+5)){
   const correction=r.d-side*wall;this.x-=r.lx*correction;this.y-=r.ly*correction;
   const outward=(this.vx*r.lx+this.vy*r.ly)*side,tangent=this.vx*r.tx+this.vy*r.ty;
   if(outward>0){
    this.wallImpactSpeed=outward;
    const rebound=-outward*.22,slide=tangent*(1-Math.min(.18,outward*.006));
    this.vx=r.tx*slide+r.lx*side*rebound;this.vy=r.ty*slide+r.ly*side*rebound;
    this.yaw*=.65;
   }
   this.surface=this.sample(this.x,this.y);
  }
  this.distance+=speed*dt;this.clock+=dt;this.spin+=v*dt/.31595;
  this.rearSpin=(this.rearSpin??0)+(input.handbrake&&!burning?0:v+this.rearSlipSpeed)*dt/.31595;
  this.trackLap(p,this.surface,Math.hypot(this.x-oldX,this.y-oldY),v);
 }
 trackLap(previous,current,distance,forwardSpeed){
  const L=this.data.meta.reconstructed_xy_m;
  let advance=current.s-previous.s;if(advance<-L/2)advance+=L;if(advance>L/2)advance-=L;
  if(this.awaitingStart){
   if(previous.s>L-16&&current.s<16&&advance>0&&forwardSpeed>1){this.awaitingStart=false;this.checkpoints=new Set([0]);this.nextCheckpoint=1;this.excursion=null;}
   return;
  }
  const outside=p=>Math.abs(p.d)>p.width/2+1;
  if(!this.excursion&&(outside(previous)||outside(current)))this.excursion={advance:0,distance:0};
  if(this.excursion){this.excursion.advance+=advance;this.excursion.distance+=distance;}
  const finish=previous.s>L-16&&current.s<16&&advance>0&&forwardSpeed>1;
  // A runoff alone is allowed. Reject only a meaningful gain from cutting the route.
  if(this.excursion&&(!outside(current)||finish)){
   if(this.excursion.advance>40&&this.excursion.advance-this.excursion.distance>18)this.lapValid=false;
   this.excursion=null;
  }
  const checkpoint=Math.floor(current.s/L*20);
  this.checkpoints.add(checkpoint);
  if(advance>0&&checkpoint===this.nextCheckpoint)this.nextCheckpoint++;
  if(finish){
   this.lastLapValid=this.lapValid&&this.nextCheckpoint===20;
   this.lastLap=this.clock-this.lapStart;
   if(this.lastLapValid){this.laps++;if(this.best===null||this.lastLap<this.best)this.best=this.lastLap;}
   this.lapStart=this.clock;this.lapValid=true;this.checkpoints=new Set([0]);this.nextCheckpoint=1;
  }
 }
 telemetry(){return {x:this.x,y:this.y,z:this.surface.z,speed:Math.hypot(this.vx,this.vy)*3.6,index:this.index,s:this.surface.s,grade:this.surface.grade*100,bank:this.surface.bank*100,onRoad:this.surface.onRoad,laps:this.laps,best:this.best,clock:this.clock};}
}
export function recognitionInput(car,{maxSpeed=33,cornerGrip=3.3,braking=3.5,throttleResponse=.5,brakeResponse=.6}={}){
 const data=car.data,speed=Math.hypot(car.vx,car.vy),la=9+speed*.6,target=data.samples[(car.index+Math.round(la/2))%car.n],dx=target[1]-car.x,dy=target[2]-car.y;
 const alpha=wrap(Math.atan2(dy,dx)-car.heading),steer=Math.atan2(2*2.667*Math.sin(alpha),Math.hypot(dx,dy));
 const command=clamp(steer/(MAX_STEER/(1+speed/28)),-1,1);
 let desiredSpeed=maxSpeed;
 for(let j=0;j<(maxSpeed>35?85:40);j+=5){const a=data.samples[(car.index+j+car.n-3)%car.n],b=data.samples[(car.index+j+3)%car.n];const curvature=Math.abs(wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7])))/12;const corner=Math.sqrt(cornerGrip/Math.max(curvature,.0001));desiredSpeed=Math.min(desiredSpeed,Math.sqrt(corner*corner+2*braking*j*2));}
 return {left:Math.max(0,command),right:Math.max(0,-command),throttle:clamp((desiredSpeed-speed)*throttleResponse,0,1),brake:clamp((speed-desiredSpeed)*brakeResponse,0,1),reverse:0,handbrake:0};
}
