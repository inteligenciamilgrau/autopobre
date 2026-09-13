import fs from 'node:fs';
import {TestCar,recognitionInput} from '../teste/physics.js';
const root=new URL('../',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('dados/pista.json',root),'utf8'));
const c=new TestCar(data),idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
let maxOffset=0,offroad=0,minZ=Infinity,maxZ=-Infinity,maxSpeed=0;
for(let i=0;i<120*600&&c.laps<2;i++){
 c.step(recognitionInput(c),1/120);maxOffset=Math.max(maxOffset,Math.abs(c.surface.d));if(!c.surface.onRoad)offroad++;
 minZ=Math.min(minZ,c.surface.z);maxZ=Math.max(maxZ,c.surface.z);maxSpeed=Math.max(maxSpeed,Math.hypot(c.vx,c.vy)*3.6);
 if(!Number.isFinite(c.x))throw Error('Estado nao finito');
}
const downhill=data.samples.reduce((best,a,i)=>a[6]<data.samples[best][6]?i:best,0),uphill=data.samples.reduce((best,a,i)=>a[6]>data.samples[best][6]?i:best,0);
function coast(index){const car=new TestCar(data);car.reset(index);car.vx=Math.cos(car.heading)*15;car.vy=Math.sin(car.heading)*15;for(let i=0;i<60;i++)car.step(idle,1/120);return Math.hypot(car.vx,car.vy);}
const report={two_laps:c.laps===2,laps:c.laps,best_lap_s:c.best,elapsed_s:c.clock,max_offset_m:maxOffset,offroad_steps:offroad,elevation_seen_m:maxZ-minZ,max_speed_kmh:maxSpeed,downhill_coast_mps:coast(downhill),uphill_coast_mps:coast(uphill)};
report.passed=report.two_laps&&offroad===0&&report.downhill_coast_mps>15&&report.uphill_coast_mps<15&&report.elevation_seen_m>40;
fs.writeFileSync(new URL('dados/validacao_fisica.json',root),JSON.stringify(report,null,2));console.log(report);if(!report.passed)process.exitCode=1;
