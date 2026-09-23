// Modelo de teste: bicicleta, aderencia limitada, gravidade no plano medido.
// Nao e simulacao homologada de pneus/suspensao do Old Stock.
import {GRID_START_BACK} from './race-roster.js';
import {pitLane} from './pit-lane.js';
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const MAX_STEER=.72;
export const WHEELBASE=2.667;
const G=9.81,ROAD_GRIP=1.24;
// Road-wheel lock follows the grip limit: full input reaches the limit at any
// speed and partial input turns proportionally, instead of saturating above ~70 km/h.
export function steerLimit(speed){
 const kinematic=MAX_STEER/(1+speed/28),v2=speed*speed;
 return v2<1?kinematic:Math.min(kinematic,Math.atan(WHEELBASE*ROAD_GRIP*G*.94/v2)*1.3);
}
// Old Stock Opala 4.1 six, prepared: gameplay estimate, not a dyno sheet.
// Engine rpm per km/h in each gear (final drive included); 5th tops out near 218 km/h.
export const GEAR_RPM_PER_KMH=[0,110,72,52,40,32.2];
export const IDLE_RPM=950,REDLINE_RPM=7000;
const TORQUE_CURVE=[[0,190],[1000,215],[2500,300],[4000,360],[5000,352],[5500,338],[6500,280],[7000,240],[7400,0]];
const SHIFT_UP_RPM=6650,SHIFT_DOWN_RPM=3100,SHIFT_TIME=.16;
// Newton-metres at the crank to m/s2 at the car: gear ratio, 90% driveline, 0.316 m tyre, 1250 kg.
const TORQUE_TO_ACCEL=.1191*.9/.316/1250;
// Opala CdA of about 0.9 m2 at sea-level air density, over 1250 kg.
const AERO_DRAG=.5*1.2*.9/1250;
export function engineTorque(rpm){
 for(let i=1;i<TORQUE_CURVE.length;i++)if(rpm<=TORQUE_CURVE[i][0]){const [r0,t0]=TORQUE_CURVE[i-1],[r1,t1]=TORQUE_CURVE[i];return t0+(t1-t0)*(rpm-r0)/(r1-r0);}
 return 0;
}
export const GUARDRAIL_CLEARANCE=5;
// Game-art selection from the GeoSampa overview, not a surveyed barrier inventory.
// Open the run-offs and infield; retain selected straight and boundary sections.
const INTERLAGOS_RAILS={
 '-1':[[0,160],[700,1300],[1780,1980],[2260,2420],[2610,2780],[3310,Infinity]],
 '1':[[0,180],[780,1200],[1950,2180],[3490,Infinity]]
};
const FULL_RAIL=[[0,Infinity]];
export function guardrailSections(data,side){return data.meta.id==='curvelo'?FULL_RAIL:INTERLAGOS_RAILS[side<0?'-1':'1'];}
export function guardrailPresent(data,s,side){const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L;return guardrailSections(data,side).some(([from,to])=>t>=from&&t<=to);}
export function guardrailClearance(data,s,side){
 if(data.meta.id!=='curvelo'){
  const L=data.meta.reconstructed_xy_m,t=((s%L)+L)%L,section=guardrailSections(data,side).find(([from,to])=>t>=from&&t<=to);
  if(!section)return GUARDRAIL_CLEARANCE;
  // Flare exposed ends away from the driving line; the timing-line seam stays joined.
  const edge=Math.min(section[0]===0?Infinity:t-section[0],section[1]>=L?Infinity:section[1]-t),u=clamp(edge/24,0,1);
  return GUARDRAIL_CLEARANCE+5*(1-u*u*(3-2*u));
 }
 if(side>=0){const lane=pitLane(data,s);return lane?Math.max(5,lane.offset*1.8+lane.halfWidth+2-7):5;}
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 return 5+30*smooth((s-770)/100)*(1-smooth((s-1110)/95));
}
export class TestCar {
 constructor(data){this.data=data;this.a=data.samples;this.n=this.a.length;this.reset();}
 resetGrid(){const target=this.data.meta.reconstructed_xy_m-GRID_START_BACK;this.reset(Math.max(0,this.a.findIndex(p=>p[0]>=target)));this.awaitingStart=true;}
 reset(index=0){this.awaitingStart=false;const p=this.a[index%this.n];this.x=p[1];this.y=p[2];this.heading=Math.atan2(p[8],p[7]);this.vx=0;this.vy=0;this.yaw=0;this.steer=0;this.index=index;this.distance=0;this.clock=0;this.lapStart=0;this.laps=0;this.best=null;this.lastLap=null;this.checkpoints=new Set();this.nextCheckpoint=1;this.lapValid=true;this.lastLapValid=null;this.excursion=null;this.spin=0;this.rearSpin=0;this.burnout=0;this.rearSlipSpeed=0;this.steerInput=0;this.steerVisual=0;this.gear=1;this.rpm=IDLE_RPM;this.shiftTimer=0;this.shifts=0;this.longAccel=0;this.latAccel=0;this.surface=this.sample(this.x,this.y);}
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
  let gx=tx*grade+lx*bank,gy=ty*grade+ly*bank;
  const roadz=mix(3)+bank*d,blend=clamp((Math.abs(d)-width/2)/3,0,1);
  // Off the asphalt the car sits on the LiDAR terrain, so it must also lean and roll with it.
  if(blend>0){const e=1.5,tx2=(this.terrain(x+e,y)-this.terrain(x-e,y))/(2*e),ty2=(this.terrain(x,y+e)-this.terrain(x,y-e))/(2*e);gx+=(tx2-gx)*blend;gy+=(ty2-gy)*blend;}
  const s=(a[0]+q.u*Math.hypot(b[1]-a[1],b[2]-a[2]))%this.data.meta.reconstructed_xy_m;
  const lane=pitLane(this.data,s),pit=!!lane&&Math.abs(d-lane.offset)<=lane.halfWidth&&d>width/2;
  const z=pit?3.055:roadz*(1-blend)+this.terrain(x,y)*blend+.055;
  return {i:q.i,u:q.u,s:s>this.data.meta.reconstructed_xy_m-.01?0:s,d,z,width,bank:pit?0:bank,grade:pit?0:grade,gx:pit?0:gx,gy:pit?0:gy,tx,ty,lx,ly,pit,onRoad:pit||Math.abs(d)<width/2};
 }
 step(input,dt){
  this.wallImpactSpeed=0;
  const p=this.surface,oldX=this.x,oldY=this.y;
  const c=Math.cos(this.heading),s=Math.sin(this.heading),v=this.vx*c+this.vy*s,lat=-this.vx*s+this.vy*c,speed=Math.hypot(this.vx,this.vy);
  const condition=this.condition?.factors;
  const mu=(p.onRoad?(input.handbrake?.99:ROAD_GRIP):.62)*(condition?.grip??1);
  // Smooth the driver's input, then scale it to the lock available at this speed.
  const command=clamp(input.left-input.right,-1,1),inputResponse=command*(this.steerInput??0)<0?20:12;
  this.steerInput=(this.steerInput??0)+(command-(this.steerInput??0))*(1-Math.exp(-dt*inputResponse));
  this.steer=this.steerInput*steerLimit(speed)*(condition?.steering??1);
  // Cockpit wheel keeps the familiar hand travel: road-wheel angle is small at speed.
  this.steerVisual=this.steerInput*MAX_STEER*(condition?.steering??1)/(1+speed/28);
  // Deliberate low-speed stunt assist: hold + throttle spins the driven rear
  // tyres; steering allows a tight powered circle. Ordinary driving is unchanged.
  const burning=!!(input.handbrake&&input.throttle&&!input.reverse&&p.onRoad&&speed<12);
  this.burnout=(this.burnout??0)+((burning?input.throttle:0)-(this.burnout??0))*(1-Math.exp(-dt*(burning?3:input.throttle?2:7)));
  const turn=clamp(this.steerInput/(1+speed/28),-1,1);
  // --- Engine and five-speed gearbox (automatic, with a short torque cut per shift).
  const kmh=Math.abs(v)*3.6,power=(this.engineScale??1)*(condition?.power??1);
  this.shiftTimer=Math.max(0,(this.shiftTimer??0)-dt);
  if(input.reverse)this.gear=-1;
  else{
   if(!(this.gear>0))this.gear=1;
   if(this.shiftTimer===0){
    if(this.gear<5&&kmh*GEAR_RPM_PER_KMH[this.gear]>SHIFT_UP_RPM){this.gear++;this.shiftTimer=SHIFT_TIME;this.shifts=(this.shifts??0)+1;}
    else if(this.gear>1&&kmh*GEAR_RPM_PER_KMH[this.gear]<SHIFT_DOWN_RPM+(input.brake>.3?700:0)&&kmh*GEAR_RPM_PER_KMH[this.gear-1]<SHIFT_UP_RPM-400){this.gear--;this.shiftTimer=SHIFT_TIME*.6;this.shifts=(this.shifts??0)+1;}
   }
  }
  const ratio=GEAR_RPM_PER_KMH[Math.max(1,this.gear)],wheelRpm=kmh*ratio;
  // The clutch slips at launch, so the engine can sit in its torque band from rest.
  const engineRpm=Math.max(wheelRpm,this.gear===1?IDLE_RPM+input.throttle*2600:IDLE_RPM);
  let drive=0;
  if(this.gear>0){
   drive=input.throttle*engineTorque(Math.min(engineRpm,REDLINE_RPM))*ratio*TORQUE_TO_ACCEL*power;
   if(wheelRpm>=REDLINE_RPM)drive=0;
   if(this.shiftTimer>0)drive*=.12;
  }
  if(input.reverse)drive-=3*(condition?.power??1);
  // Rear-wheel drive: acceleration moves load onto the rear axle, and a
  // traction limiter keeps the driven tyres just past the peak of grip.
  const rearShare=.47+clamp(drive,0,8)*.5/(G*WHEELBASE),traction=mu*G*rearShare*1.04;
  let wheelspin=0;
  // Loose ground still takes some push from spinning tyres.
  if(!burning&&drive>traction){wheelspin=drive-traction;drive=traction+(p.onRoad?0:wheelspin*.55);}
  this.rearSlipSpeed=Math.max(this.burnout*20,p.onRoad&&speed<30?clamp(wheelspin*1.4,0,7):0);
  this.rpm=this.gear<0?IDLE_RPM+Math.abs(v)*3.6*110+input.reverse*400:clamp(engineRpm+this.rearSlipSpeed*3.6*ratio*.6+(burning?input.throttle*3500:0),IDLE_RPM,REDLINE_RPM+80);
  // --- Longitudinal forces.
  // Grass grips the tyres more firmly but costs speed through rolling resistance.
  const rolling=p.onRoad?.16:1.9+.085*Math.abs(v);
  const engineBrake=this.gear>0&&input.throttle<.05&&this.shiftTimer===0&&Math.abs(v)>1?.18+.5*clamp(wheelRpm/REDLINE_RPM,0,1):0;
  const drag=AERO_DRAG*v*Math.abs(v)+Math.sign(v)*Math.min(rolling+engineBrake,Math.abs(v)/dt);
  // Brakes cannot exceed the tyres: on grass the car simply cannot stop as hard.
  const brakeDecel=Math.min(Math.max(input.brake*11*(condition?.brakes??1),input.handbrake&&!burning?7:0),mu*G*1.02);
  const braking=brakeDecel*Math.min(1,Math.abs(v)/Math.max(dt*11,.001))*Math.sign(v);
  // --- Combined grip: longitudinal work leaves less of the tyre for cornering.
  const longUse=clamp(Math.max(Math.abs(v)>2?brakeDecel:0,Math.max(0,drive))/(mu*G*1.32),0,.9),circle=Math.sqrt(1-longUse*longUse);
  // Braking loads the front tyres (sharper turn-in); a rear axle busy putting
  // power down lets the tail step out slightly on corner exit.
  const frontLoad=1+.09*clamp(brakeDecel/G,0,1)-.05*clamp(drive/G,0,1);
  const powerSlide=p.onRoad&&!input.handbrake?clamp((drive/traction-.86)/.14,0,1)*clamp((speed-4)/6,0,1):0;
  let targetYaw=v/WHEELBASE*Math.tan(this.steer);
  // Reserve some tyre force for correcting sideways motion on corner entry.
  // Handbrake stunts retain their previous grip budget.
  const yawLimit=mu*G*(p.onRoad&&!input.handbrake?.94:1)*circle*frontLoad*(1+.16*powerSlide)/Math.max(speed,3);
  targetYaw=clamp(targetYaw,-yawLimit,yawLimit);
  if(burning)targetYaw=input.brake?0:turn*1.35*this.burnout;
  const yawResponse=burning?6:targetYaw*this.yaw<0?17:12;
  this.yaw+=(targetYaw-this.yaw)*(1-Math.exp(-dt*yawResponse));
  this.heading=wrap(this.heading+this.yaw*dt);
  const gx=-G*p.gx,gy=-G*p.gy;
  // The car origin is 1.117 m ahead of the rear axle. In a gripping turn its
  // lateral velocity is yaw * rearOffset; damping it toward zero made the rear slide.
  const lateralLimit=mu*G*(input.handbrake?.45:1)*circle*(1-.18*powerSlide);
  const turnAcross=clamp(v*this.yaw,-lateralLimit,lateralLimit);
  const rollingLateral=this.yaw*1.117,gravityAcross=-gx*s+gy*c;
  const across=clamp(turnAcross+(rollingLateral-lat)*(input.handbrake?1.5:12)*(condition?.stability??1)-gravityAcross,-lateralLimit,lateralLimit);
  // The turning force is perpendicular to travel, rather than adding free speed.
  const along=drive-drag-braking-(Math.abs(v)>.5?turnAcross*lat/v:0);
  this.vx+=(along*c-across*s+gx)*dt;this.vy+=(along*s+across*c+gy)*dt;
  // Forces felt by the chassis, for suspension and camera motion.
  this.longAccel=along;this.latAccel=across;
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
  // Visible sections and collision share the same openings and shoulder clearance.
  const r=this.surface,side=Math.sign(r.d),angle=wrap(this.heading-Math.atan2(r.ty,r.tx));
  const extent=.93*Math.abs(Math.cos(angle))+2.38*Math.abs(Math.sin(angle));
  const wall=r.width/2+guardrailClearance(this.data,r.s,side)-.12-extent;
  const crossed=Math.abs(p.d)<=p.width/2+guardrailClearance(this.data,p.s,side)-.12-extent;
  if(guardrailPresent(this.data,r.s,side)&&Math.abs(r.d)>wall&&(crossed||Math.abs(r.d)<wall+5)){
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
  const outside=p=>!p.pit&&Math.abs(p.d)>p.width/2+1;
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
 const command=clamp(steer/steerLimit(speed),-1,1);
 let desiredSpeed=maxSpeed;
 for(let j=0;j<(maxSpeed>35?85:40);j+=5){const a=data.samples[(car.index+j+car.n-3)%car.n],b=data.samples[(car.index+j+3)%car.n];const curvature=Math.abs(wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7])))/12;const corner=Math.sqrt(cornerGrip/Math.max(curvature,.0001));desiredSpeed=Math.min(desiredSpeed,Math.sqrt(corner*corner+2*braking*j*2));}
 return {left:Math.max(0,command),right:Math.max(0,-command),throttle:clamp((desiredSpeed-speed)*throttleResponse,0,1),brake:clamp((speed-desiredSpeed)*brakeResponse,0,1),reverse:0,handbrake:0};
}
