import {TestCar,clamp,wrap,recognitionInput,MAX_STEER} from './physics.js?v=20260913-burnout';
import {RIVAL_ROSTER,GRID_ROW_SPACING} from './race-roster.js';
const HALF_LENGTH=2.38,HALF_WIDTH=.93,MASS=1250,INERTIA=MASS*(4.76**2+1.86**2)/12;
const axes=c=>[[Math.cos(c.heading),Math.sin(c.heading)],[-Math.sin(c.heading),Math.cos(c.heading)]];
const center=c=>[c.x+.08*Math.cos(c.heading),c.y+.08*Math.sin(c.heading)];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
// Stable personalities: different braking envelopes, corner pace and passing habits.
export const DRIVER_STYLES=Object.freeze([
 {name:'Freia tarde',maxSpeed:53,cornerGrip:7.6,braking:8.5,brakeResponse:.95,throttleResponse:.65,lookAhead:.53,engineScale:1.08,passDistance:37,passSide:-1,laneRate:1.9,passCooldown:2.4},
 {name:'Rei das curvas',maxSpeed:51,cornerGrip:8.3,braking:7.2,brakeResponse:.7,throttleResponse:.8,lookAhead:.49,engineScale:1.05,passDistance:33,passSide:1,laneRate:1.6,passCooldown:3.3},
 {name:'Constante',maxSpeed:52,cornerGrip:7.5,braking:6.9,brakeResponse:.48,throttleResponse:.42,lookAhead:.65,engineScale:1.07,passDistance:43,passSide:1,laneRate:1.1,passCooldown:4.8},
 {name:'Atacante',maxSpeed:54,cornerGrip:8,braking:8,brakeResponse:.82,throttleResponse:.9,lookAhead:.54,engineScale:1.1,passDistance:40,passSide:-1,laneRate:2.2,passCooldown:1.9},
 {name:'Foguete de reta',maxSpeed:56,cornerGrip:7.2,braking:7.5,brakeResponse:.75,throttleResponse:.72,lookAhead:.61,engineScale:1.14,passDistance:46,passSide:1,laneRate:1.4,passCooldown:3.7},
].map(Object.freeze));
export function styleForDriver(entry){
 const base=DRIVER_STYLES[entry.styleIndex],r=entry.rating;
 return {...base,maxSpeed:base.maxSpeed*(.96+.06*r),cornerGrip:base.cornerGrip*(.92+.1*r),braking:base.braking*(.95+.06*r),engineScale:1+(base.engineScale-1)*(.7+.5*r),passCooldown:base.passCooldown+(1-r)*.5};
}
// Four separating axes describe the full, rotated body, including side contacts.
export function bodyContact(a,b){
 const aa=axes(a),bb=axes(b),ac=center(a),bc=center(b),delta=[bc[0]-ac[0],bc[1]-ac[1]];
 if(Math.hypot(...delta)>5.2)return null;
 let depth=Infinity,normal;
 for(const axis of [...aa,...bb]){
  const radius=x=>HALF_LENGTH*Math.abs(dot(axis,x[0]))+HALF_WIDTH*Math.abs(dot(axis,x[1]));
  const overlap=radius(aa)+radius(bb)-Math.abs(dot(delta,axis));if(overlap<=0)return null;
  if(overlap<depth){depth=overlap;const sign=dot(delta,axis)>=0?1:-1;normal=axis.map(v=>v*sign);}
 }
 // Average clipped corners gives a stable face contact, or a corner for glancing blows.
 const corners=(c,ax)=>[-1,1].flatMap(l=>[-1,1].map(w=>c.map((v,i)=>v+l*HALF_LENGTH*ax[0][i]+w*HALF_WIDTH*ax[1][i])));
 const inside=(p,c,ax)=>Math.abs(dot([p[0]-c[0],p[1]-c[1]],ax[0]))<=HALF_LENGTH+.001&&Math.abs(dot([p[0]-c[0],p[1]-c[1]],ax[1]))<=HALF_WIDTH+.001;
 const points=[...corners(ac,aa).filter(p=>inside(p,bc,bb)),...corners(bc,bb).filter(p=>inside(p,ac,aa))];
 const point=points.length?[0,1].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length):ac.map((v,i)=>(v+bc[i])/2);
 return {depth,normal,point};
}
export function resolveContact(a,b){
 const hit=bodyContact(a,b);if(!hit)return null;
 const {normal:n,point:p}=hit,ra=[p[0]-a.x,p[1]-a.y],rb=[p[0]-b.x,p[1]-b.y];
 const velocity=(c,r)=>[c.vx-c.yaw*r[1],c.vy+c.yaw*r[0]];
 const va=velocity(a,ra),vb=velocity(b,rb),rv=vb.map((v,i)=>v-va[i]),closing=-dot(rv,n);
 const impulse=(j,axis)=>{a.vx-=axis[0]*j/MASS;a.vy-=axis[1]*j/MASS;b.vx+=axis[0]*j/MASS;b.vy+=axis[1]*j/MASS;a.yaw=clamp(a.yaw-cross(ra,axis)*j/INERTIA,-3,3);b.yaw=clamp(b.yaw+cross(rb,axis)*j/INERTIA,-3,3);};
 if(closing>0){const j=1.12*closing/(2/MASS+cross(ra,n)**2/INERTIA+cross(rb,n)**2/INERTIA);impulse(j,n);const tangent=[-n[1],n[0]],friction=clamp(-dot(rv,tangent)/(2/MASS+cross(ra,tangent)**2/INERTIA+cross(rb,tangent)**2/INERTIA),-j*.3,j*.3);impulse(friction,tangent);}
 const correction=(hit.depth+.002)/2;a.x-=n[0]*correction;a.y-=n[1]*correction;b.x+=n[0]*correction;b.y+=n[1]*correction;
 return {...hit,speed:Math.max(0,closing)};
}
export class RaceField {
 constructor(data,{onStep,onReset}={}){this.data=data;this.onStep=onStep;this.onReset=onReset;this.time=0;this.collisions=0;this.cooldowns=new Map();this.reset();}
 reset(startS=0,{grid=false}={}){
  this.time=0;this.collisions=0;this.cooldowns.clear();
  this.gridLeadIn=grid?(this.data.meta.reconstructed_xy_m-startS)%this.data.meta.reconstructed_xy_m:0;
  this.rivals=RIVAL_ROSTER.map((entry,i)=>{
   const style=styleForDriver(entry),progress=(Math.ceil(RIVAL_ROSTER.length/2)-Math.floor(i/2))*GRID_ROW_SPACING+8-(i%2)*2;
   const L=this.data.meta.reconstructed_xy_m,s=((startS+progress)%L+L)%L;let index=this.data.samples.findIndex(p=>p[0]>=s);if(index<0)index=0;
   const car=new TestCar(this.data);car.reset(index);car.awaitingStart=grid;car.engineScale=style.engineScale;
   const lane=i%2?2.2:-2.2;car.x+=car.surface.lx*lane;car.y+=car.surface.ly*lane;car.surface=car.sample(car.x,car.y);
   return {car,entry,style,pace:style.maxSpeed,lane,targetLane:lane,maneuverCooldown:0,progress,lastS:car.surface.s,finished:false,finishTime:null,stun:0};
  });
  this.onReset?.();
 }
 step(player,dt,totalLaps=0){
  this.time+=dt;const impacts=[],commands=[],L=this.data.meta.reconstructed_xy_m;
  for(const r of this.rivals){
   const c=r.car,style=r.style,input=recognitionInput(c,style),speed=Math.hypot(c.vx,c.vy),look=9+speed*style.lookAhead,p=this.data.samples[(c.index+Math.round(look/2))%c.n];
   // Absorb sample-to-sample curvature noise. Traffic braking below stays immediate.
   r.brakePedal=(r.brakePedal??0)+(input.brake-(r.brakePedal??0))*(1-Math.exp(-dt*(5+style.brakeResponse*10)));
   input.brake=r.brakePedal;if(input.brake>.08)input.throttle=0;
   r.maneuverCooldown=Math.max(0,r.maneuverCooldown-dt);r.lane+=clamp(r.targetLane-r.lane,-dt*style.laneRate,dt*style.laneRate);
   const dx=p[1]-p[8]*r.lane-c.x,dy=p[2]+p[7]*r.lane-c.y;
   const steer=Math.atan2(2*2.667*Math.sin(wrap(Math.atan2(dy,dx)-c.heading)),Math.hypot(dx,dy));
   const turn=clamp(steer/(MAX_STEER/(1+speed/28)),-1,1);input.left=Math.max(0,turn);input.right=Math.max(0,-turn);
   if(speed>r.pace){input.throttle=0;input.brake=Math.max(input.brake,.2);}
   // Brake before a slower car; contact response still handles late and side impacts.
   const traffic=[player,...this.rivals.filter(x=>x!==r).map(x=>x.car)];
   for(const other of traffic){
    const dx=other.x-c.x,dy=other.y-c.y,forward=dx*Math.cos(c.heading)+dy*Math.sin(c.heading),side=-dx*Math.sin(c.heading)+dy*Math.cos(c.heading),relative=speed-(other.vx*Math.cos(c.heading)+other.vy*Math.sin(c.heading));
    if(relative>1&&forward>5&&forward<style.passDistance&&Math.abs(side)<2.4&&r.maneuverCooldown===0){const limit=Math.min(3,c.surface.width/2-1.5),candidates=[limit*style.passSide,-limit*style.passSide,0].filter(lane=>Math.abs(lane-r.lane)>2);const clear=candidates.find(lane=>traffic.every(o=>Math.hypot(o.x-c.x,o.y-c.y)>22||Math.abs(o.surface.d-lane)>2.2));if(clear!==undefined){r.targetLane=clear;r.maneuverCooldown=style.passCooldown;}}
    if(forward>0&&forward<6+Math.max(0,relative)*.8&&Math.abs(side)<2){input.throttle=0;input.brake=Math.max(input.brake,clamp((7+relative-forward)/7,.2,1));}
   }
   r.stun=Math.max(0,r.stun-dt);if(r.stun>0){input.throttle=0;input.brake=Math.max(input.brake,.2);}
   if(r.finished&&totalLaps){input.throttle=0;input.brake=1;}
   c.step(input,dt);commands.push(input);let travel=c.surface.s-r.lastS;if(travel<-L/2)travel+=L;if(travel>L/2)travel-=L;r.progress+=travel;r.lastS=c.surface.s;if(totalLaps&&!r.finished&&r.progress>=L*totalLaps+this.gridLeadIn){r.finished=true;r.finishTime=this.time;}
  }
  const bodies=[player,...this.rivals.map(r=>r.car)];
  for(let iteration=0;iteration<4;iteration++)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   if(Math.abs(bodies[i].surface.z-bodies[j].surface.z)>2)continue;
   const hit=resolveContact(bodies[i],bodies[j]);if(!hit)continue;
   if(hit.speed>1.6&&this.time-(this.cooldowns.get(`${i}:${j}`)??-10)>.35){this.cooldowns.set(`${i}:${j}`,this.time);this.collisions++;impacts.push({...hit,player:i===0});for(const k of [i,j])if(k>0)this.rivals[k-1].stun=Math.min(1.5,hit.speed*.06);}
  }
  for(const c of bodies){c.surface=c.sample(c.x,c.y);c.index=c.surface.i;}
  if(this.onStep)this.rivals.forEach((r,i)=>this.onStep(r,i,commands[i],dt));
  return impacts;
 }
 info(){return {collisions:this.collisions,rivals:this.rivals.map(r=>({number:r.entry.number,name:r.entry.name,level:r.entry.level,style:r.style.name,x:r.car.x,y:r.car.y,heading:r.car.heading,speed:Math.hypot(r.car.vx,r.car.vy),progress:r.progress,finished:r.finished}))};}
}
