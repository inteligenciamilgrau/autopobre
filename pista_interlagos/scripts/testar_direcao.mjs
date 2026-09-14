import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar,clamp,wrap} from '../teste/physics.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function flatCar(kmh){
 const c=new TestCar(data);
 c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 c.reset();c.x=c.y=c.heading=0;c.vx=kmh/3.6;c.surface=c.sample();return c;
}
function manoeuvre(kmh,side=1,dt=1/120){
 const c=flatCar(kmh);let wheelReverse=null,yawReverse=null,pathReverse=null,maxSlip=0,lateSlip=0,entryHeading=0,entryPath=0;
 for(let frame=0;frame<Math.round(6/dt);frame++){
  const t=frame*dt,command=(t<3?side:-side),speed=Math.hypot(c.vx,c.vy),oldPath=Math.atan2(c.vy,c.vx);
  c.step({...idle,left:Math.max(0,command),right:Math.max(0,-command),throttle:clamp((kmh/3.6-speed)*2,0,1)},dt);
  const path=Math.atan2(c.vy,c.vx),slip=Math.abs(wrap(path-c.heading))*180/Math.PI;
  maxSlip=Math.max(maxSlip,slip);if(t>5)lateSlip=Math.max(lateSlip,slip);
  if(t>=3){if(wheelReverse===null&&c.steer*side<0)wheelReverse=t-3;if(yawReverse===null&&c.yaw*side<0)yawReverse=t-3;if(pathReverse===null&&wrap(path-oldPath)*side<0)pathReverse=t-3;}
  if(frame===Math.round(.5/dt)){entryHeading=c.heading*side;entryPath=path*side;}
 }
 return {kmh,side,dt,wheelReverse,yawReverse,pathReverse,maxSlip,lateSlip,entryHeading,entryPath,finalKmh:Math.hypot(c.vx,c.vy)*3.6};
}
const results=[100,140,180].flatMap(kmh=>[manoeuvre(kmh,1),manoeuvre(kmh,-1)]);
const timestep=[1/60,1/120,1/240].map(dt=>manoeuvre(160,1,dt));
const report={results,timestep};
console.log(JSON.stringify(report,null,2));
if(!process.argv.includes('--baseline')){
 assert(results.every(r=>r.wheelReverse<=.09&&r.yawReverse<=.12&&r.pathReverse<=.12),'steering, body and trajectory respond promptly to reversing direction');
 assert(results.every(r=>r.lateSlip<3&&r.maxSlip<5),'fast turns recover grip without persistent sideways sliding');
 assert(results.every(r=>r.entryPath>.09),'end-of-straight steering produces a meaningful change in trajectory');
 for(let i=0;i<results.length;i+=2)assert(Math.abs(results[i].entryPath-results[i+1].entryPath)<.001,'left and right response is symmetric');
 assert(Math.max(...timestep.map(r=>r.entryPath))-Math.min(...timestep.map(r=>r.entryPath))<.01,'turn-in is consistent across physics timesteps');
}
