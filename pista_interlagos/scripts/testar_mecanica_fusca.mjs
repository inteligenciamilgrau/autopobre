// The Fusca's own mechanics (physics.js FUSCA_MECHANICS) beside the Opala's, which keep their numbers: a weaker
// engine and a top gear that tops out near 170 km/h (the pilots: "atingem no máximo 170 km/h"), slower out of
// the corners, about 2:10 a lap at Interlagos with the recon lap's racecraft (the Opala: about 1:54), the tail
// calm under power, and a race of Fuscas driven by the AI on the Fusca's grip.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,OPALA_BODY,FUSCA_BODY,OPALA_MECHANICS,FUSCA_MECHANICS,GEAR_RPM_PER_KMH,engineTorque,steerLimit} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const metrics={};

// --- Each body carries its mechanics; the Opala's are the constants every car always had.
assert.equal(OPALA_BODY.mechanics,OPALA_MECHANICS);assert.equal(FUSCA_BODY.mechanics,FUSCA_MECHANICS);
assert.equal(OPALA_MECHANICS.gears,GEAR_RPM_PER_KMH);assert.equal(OPALA_MECHANICS.grip,1);
assert.equal(new TestCar(data).mechanics,OPALA_MECHANICS,'a car is an Opala unless given another body');
assert.equal(steerLimit(40),steerLimit(40,1),'the steering limit at the Opala\'s grip is as before');
const peak=m=>Math.max(...Array.from({length:75},(_,k)=>engineTorque(k*100,m.torque)*k*100/9549));
metrics.peakKw={opala:+peak(OPALA_MECHANICS).toFixed(1),fusca:+peak(FUSCA_MECHANICS).toFixed(1)};
assert(metrics.peakKw.fusca<.5*metrics.peakKw.opala,'the Fusca\'s engine has less than half the Opala\'s power');

// --- Flat out on a level road, alone and in a full tow.
function straight(body,draft=0,seconds=70){
 const c=new TestCar(data).setBody(body);c.sample=(x=0,y=0)=>({i:0,u:0,s:500,d:y,z:0,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});c.reset();c.x=c.y=c.heading=0;c.settle();
 let to100=null;
 for(let i=0;i<120*seconds;i++){c.draft=draft;c.step({throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);if(to100===null&&c.vx*3.6>=100)to100=+(i/120).toFixed(2);}
 return {top:+(c.vx*3.6).toFixed(1),gear:c.gear,to100};
}
const flat=metrics.straight={opala:straight(OPALA_BODY),fusca:straight(FUSCA_BODY),fuscaTow:straight(FUSCA_BODY,.5)};
assert(flat.opala.top>212,`the Opala's top speed as before: ${flat.opala.top}`);
assert(flat.fusca.top>160&&flat.fusca.top<170&&flat.fusca.gear===5,`the Fusca alone: ${flat.fusca.top} km/h`);
assert(flat.fuscaTow.top<=173,`in a tow the Fusca reaches its limiter, never 200: ${flat.fuscaTow.top} km/h`);
assert(flat.fusca.to100>flat.opala.to100+2,'slower off the line');

// --- A lap of Interlagos alone with the recon lap's racecraft (RaceField.heroInput): the first from the grid,
// then flying laps. The Fusca's tail never steps out on the throttle.
function laps(body){
 const car=new TestCar(data).setBody(body);car.resetGrid();
 const field=new RaceField(data,{seed:3,body});field.reset(car.surface.s,{grid:true,entrants:[]});
 let top=0,maxDrift=0;
 for(let i=0;i<120*500&&car.laps<3;i++){
  car.step(field.heroInput(car,1/120),1/120);field.step(car,1/120,3);top=Math.max(top,Math.hypot(car.vx,car.vy)*3.6);
  const c=Math.cos(car.heading),s=Math.sin(car.heading),forward=car.vx*c+car.vy*s;if(forward>5)maxDrift=Math.max(maxDrift,Math.abs(Math.atan2(-car.vx*s+car.vy*c-1.117*car.yaw,forward)));
 }
 return {laps:car.laps,best:+car.best.toFixed(2),top:+top.toFixed(1),maxDrift:+maxDrift.toFixed(3)};
}
const lap=metrics.interlagos={opala:laps(OPALA_BODY),fusca:laps(FUSCA_BODY)};
assert(lap.opala.laps===3&&lap.fusca.laps===3);
assert(Math.abs(lap.opala.best-114.5)<1,`the Opala's recon pace as before: ${lap.opala.best}`);
assert(lap.fusca.best>127&&lap.fusca.best<133,`about 2:10 for the Fusca: ${lap.fusca.best}`);
assert(lap.fusca.top<172,`no 200 km/h on the main straight: ${lap.fusca.top}`);
assert(lap.fusca.maxDrift<.5*lap.opala.maxDrift,'a calmer tail than the Opala\'s');

// --- A race of Fuscas: the AI plans on the Fusca's grip and power; nobody spins, nobody leaves the asphalt.
const player=new TestCar(data).setBody(FUSCA_BODY);player.resetGrid();
const field=new RaceField(data,{seed:1,body:FUSCA_BODY});field.reset(player.surface.s,{grid:true});
let off=0;
for(let i=0;i<120*480&&!field.rivals.every(r=>r.car.laps>=2);i++){player.step(field.heroInput(player,1/120),1/120);field.step(player,1/120,3);for(const r of field.rivals)if(!r.car.surface.onRoad)off++;}
const bests=field.rivals.map(r=>r.car.best).filter(Number.isFinite);
metrics.fuscaRace={finished:bests.length,fastest:+Math.min(...bests).toFixed(2),slowest:+Math.max(...bests).toFixed(2),offroadSteps:off};
assert(bests.length===field.rivals.length&&Math.min(...bests)>128&&Math.max(...bests)<150,'the field laps a Fusca\'s pace');
console.log(JSON.stringify(metrics,null,1));
console.log('Fusca mechanics passed: the Opala unchanged, a weaker Fusca topping out near 170 km/h, about 2:10 at Interlagos, a calm tail, a field of Fuscas.');
