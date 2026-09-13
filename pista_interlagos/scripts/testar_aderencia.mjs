import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar,clamp} from '../teste/physics.js';
import {SkidMarks} from '../teste/skid-marks.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function flatCar(bank=0){
 const c=new TestCar(data);c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank,grade:0,gx:0,gy:bank,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 c.reset();c.x=c.y=c.heading=0;c.surface=c.sample();return c;
}
function circle(kmh,side=1,dt=1/120,handbrake=false){
 const c=flatCar(),marks=new SkidMarks(512);c.vx=kmh/3.6;
 let sum=0,angle=0,n=0;
 for(let t=0;t<6;t+=dt){
  const speed=Math.hypot(c.vx,c.vy),input={...idle,throttle:clamp((kmh/3.6-speed)*2,0,1),left:side>0?(kmh>20?.55:1):0,right:side<0?(kmh>20?.55:1):0,handbrake:handbrake?1:0};
  c.step(input,dt);marks.update(c,input,dt);
  if(t>3){const v=c.vx*Math.cos(c.heading)+c.vy*Math.sin(c.heading),lat=-c.vx*Math.sin(c.heading)+c.vy*Math.cos(c.heading),rear=lat-c.yaw*1.117;
   sum+=Math.abs(rear);angle+=Math.abs(Math.atan2(rear,Math.abs(v)))*180/Math.PI;n++;}
 }
 const out={kmh,side,dt,rearSlipMps:sum/n,slipAngleDegrees:angle/n,marks:marks.total,speedKmh:Math.hypot(c.vx,c.vy)*3.6};marks.dispose();return out;
}
const circles=[10,20,30].flatMap(kmh=>[circle(kmh,1),circle(kmh,-1)]);
const banked=flatCar(.12);for(let i=0;i<600;i++)banked.step(idle,1/120);
const braking=flatCar(),marks=new SkidMarks(512);braking.vx=20/3.6;
for(let i=0;i<120;i++){const input={...idle,brake:1};braking.step(input,1/120);marks.update(braking,input,1/120);}
const drift=circle(50,1,1/120,true);
const timestep=[1/60,1/120,1/240].map(dt=>circle(20,1,dt));
const coasting=flatCar();coasting.vx=20/3.6;
for(let i=0;i<720;i++)coasting.step({...idle,left:1},1/120);
const reverse=flatCar();reverse.vx=-10/3.6;
for(let i=0;i<480;i++)reverse.step({...idle,left:1,reverse:Math.hypot(reverse.vx,reverse.vy)<10/3.6?1:0},1/120);
const reverseSlip=Math.abs(-reverse.vx*Math.sin(reverse.heading)+reverse.vy*Math.cos(reverse.heading)-reverse.yaw*1.117);
const report={circles,bankedRestDriftM:Math.hypot(banked.x,banked.y),lowSpeedBrakeMarks:marks.total,handbrake:drift,timestep,coastingTurnFinalKmh:Math.hypot(coasting.vx,coasting.vy)*3.6,reverseSlipMps:reverseSlip};marks.dispose();
report.checks={normal_low_speed_no_sideways_slip:circles.every(c=>c.rearSlipMps<.25&&c.slipAngleDegrees<2.5),normal_turns_no_skid_marks:circles.every(c=>c.marks===0),rest_on_crossfall_stays_planted:report.bankedRestDriftM<.01,low_speed_braking_no_false_skid:report.lowSpeedBrakeMarks===0,handbrake_still_drifts:drift.rearSlipMps>.5&&drift.marks>0,stable_across_timesteps:timestep.every(c=>c.slipAngleDegrees<2.5)};
report.checks.turning_does_not_accelerate_coasting_car=report.coastingTurnFinalKmh<20;
report.checks.reverse_keeps_rear_grip=reverseSlip<.2&&reverse.yaw<0;
report.passed=Object.values(report.checks).every(Boolean);
const baseline=process.argv.includes('--baseline');fs.writeFileSync(new URL(`../dados/aderencia_${baseline?'antes':'depois'}.json`,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!baseline)assert(report.passed,'Grip regression checks failed');
