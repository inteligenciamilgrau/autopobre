import * as THREE from 'three';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {clearView} from './on-foot.js';
import {billboardSpots} from './track-surface.js';
import {terrainHeight} from './landscape.js';

// Race broadcast camera: fixed trackside positions (the TV towers, plus low cameras
// on the verges) film the car with a long lens, cutting to the next camera as the
// car goes by. The operator follows with a little lag and a steady hand.
const LOW_SPACING=190,LOW_OFFSET=13,LOW_HEIGHT=2.4;
const hash=n=>{const v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v);};

export class TvCamera{
 constructor(data,towers=[],ground=()=>0,obstacles=[]){
  this.obstacles=obstacles;this.data=data;this.probe=new THREE.Vector3();this.subject=new THREE.Vector3();this.checkIn=0;this.blocked=0;
  const L=this.length=data.meta.reconstructed_xy_m,a=data.samples,bands=sceneryBands(data),boards=billboardSpots(data);
  this.cameras=towers.map(t=>({s:t.s,position:t.position.clone(),tower:true}));
  // Low verge cameras fill the gaps between towers, alternating sides of the track.
  for(let s=60,k=0;s<L;s+=LOW_SPACING,k++){
   if(this.cameras.some(c=>{const d=Math.abs(c.s-s);return Math.min(d,L-d)<90;}))continue;
   const i=Math.max(0,a.findIndex(q=>q[0]>=s)),p=a[i];
   for(const side of k%2?[1,-1]:[-1,1]){
    const off=side*(p[4]/2+LOW_OFFSET+hash(k)*6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
    // Clear of roads and pits, and never right behind a billboard.
    if(bandClearance(bands,x,y).distance<3||boards.some(b=>Math.hypot(b.x-x,b.y-y)<20))continue;
    this.cameras.push({s,position:new THREE.Vector3(x,ground(x,y,i)+LOW_HEIGHT+hash(k+9)*1.5,-y),tower:false});break;
   }
  }
  this.cameras.sort((u,v)=>u.s-v.s);
  this.current=null;this.aim=new THREE.Vector3();this.time=0;this.cuts=0;this.skipped=0;this.retryIn=0;
  // When no fixed camera can see the car, the broadcast helicopter follows it.
  this.heli={s:0,position:new THREE.Vector3(),tower:false,heli:true,placed:false};
 }
 // Track distance from the car forward to a camera (negative once the car has passed it).
 ahead(c,s){let d=c.s-s;const L=this.length;if(d>L/2)d-=L;if(d<-L/2)d+=L;return d;}
 // Walls, stands, boards between a camera and the car (a ray from the car's roof).
 sees(c,target){this.subject.copy(target).y+=1.1;return !this.behindHill(this.subject,c.position)&&!clearView(this.subject,this.probe.copy(c.position),this.obstacles);}
 // The ground rising above the line of sight (crests, banks, the infield hills).
 behindHill(from,to){
  for(let k=1;k<12;k++){const t=k/12,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t,z=from.z+(to.z-from.z)*t;if(terrainHeight(this.data,x,-z)>y-.25)return true;}
  return false;
 }
 pick(s,target){
  // The camera the car is approaching, or the one it just passed if none is close ahead,
  // among those with a clear view of the car; otherwise the helicopter.
  const ranked=this.cameras.map(c=>{const d=this.ahead(c,s);return {c,d,cost:(d>=-25?Math.abs(d-60):500-d)+c.position.distanceTo(target)*.2};}).filter(r=>r.d>-55&&r.c.position.distanceTo(target)<230).sort((u,v)=>u.cost-v.cost);
  for(const {c} of ranked.slice(0,8)){if(this.sees(c,target))return c;this.skipped++;}
  return this.heli;
 }
 reset(){this.current=null;this.retryIn=0;this.heli.placed=false;}
 update(camera,target,s,velocity,dt){
  this.time+=dt;this.target=target;
  const d=this.current&&!this.current.heli?this.ahead(this.current,s):0,distance=this.current?this.current.position.distanceTo(target):Infinity;
  // Cut once the car is well past, too far away to hold in frame, or hidden for a moment.
  // The helicopter keeps looking for a fixed camera to hand over to.
  this.checkIn-=dt;this.retryIn-=dt;
  if(this.current&&!this.current.heli&&this.checkIn<=0){this.checkIn=.25;this.blocked=this.sees(this.current,target)?0:this.blocked+1;}
  const wanted=!this.current||(this.current.heli?this.retryIn<=0:d<-55||distance>230||this.blocked>=2);
  if(wanted&&this.retryIn<=0){const next=this.pick(s,target);this.blocked=0;this.retryIn=.5;if(next!==this.current){if(next.heli)this.heli.placed=false;this.current=next;this.cuts++;this.aim.copy(target);}}
  const c=this.current;
  if(c.heli){
   // High and wide behind the car, drifting after it.
   const back=velocity.lengthSq()>1?velocity.clone().setY(0).normalize():new THREE.Vector3(1,0,0),goal=target.clone().addScaledVector(back,-38).add(new THREE.Vector3(-back.z*16,26,back.x*16));
   if(!c.placed){c.position.copy(goal);c.placed=true;}else c.position.lerp(goal,1-Math.exp(-dt*.8));
  }
  camera.position.copy(c.position);
  // Lead the car a little, with the lag of a hand-held pan head.
  const lead=target.clone().addScaledVector(velocity,.18);lead.y+=.7;
  this.aim.lerp(lead,1-Math.exp(-dt*7));
  const t=this.time,shake=.012*Math.min(1,distance/40);
  camera.up.set(0,1,0);camera.lookAt(this.aim.x+Math.sin(t*1.3)*shake*distance*.02,this.aim.y+Math.sin(t*1.7+1)*shake*distance*.02,this.aim.z);
  // Long lens: keep the car about a sixth of the frame tall.
  const fov=THREE.MathUtils.clamp(2*Math.atan(5.5/Math.max(distance,1))*180/Math.PI,4.5,50);
  camera.fov+=(fov-camera.fov)*(1-Math.exp(-dt*5));if(dt>=1)camera.fov=fov;camera.updateProjectionMatrix();
 }
 info(){return {cameras:this.cameras.length,towers:this.cameras.filter(c=>c.tower).length,current:this.current?{s:this.current.s,tower:this.current.tower,heli:!!this.current.heli}:null,cuts:this.cuts,skipped:this.skipped,sees:this.current&&this.target?this.sees(this.current,this.target):null,obstacles:this.obstacles.length};}
}
