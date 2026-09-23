import assert from 'node:assert/strict';
import {CarCondition,CAR_PARTS,PitService} from '../teste/car-condition.js';
import {TestCar,steerLimit,clamp,wrap} from '../teste/physics.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {pitLane,inPitBox,CURVELO_PIT} from '../teste/pit-lane.js';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {RaceField} from '../teste/race-field.js';
import {PitStop,CAFE_MENU} from '../teste/pitstop.js';
const condition=new CarCondition(),data=createCurveloData();
assert.equal(CAR_PARTS.length,6);assert.equal(condition.health,1);assert.equal(condition.factors.power,1);assert.equal(condition.factors.grip,1);
condition.impact(20,2,0);assert(condition.quality.motor<condition.quality.tanque,'frontal hit primarily damages engine');
condition.reset();condition.impact(20,-2,0);assert(condition.quality.tanque<condition.quality.motor,'rear hit primarily damages tank');
condition.reset();condition.impact(20,0,1);assert(condition.quality.suspensao<condition.quality.motor,'side hit damages running gear');
condition.reset();for(const p of CAR_PARTS)condition.damage(p.id,.8);
assert(condition.factors.power<.4&&condition.factors.brakes<.5&&condition.factors.grip<.8&&condition.factors.leak>0);
const patch=condition.quote('motor','patch'),proper=condition.quote('motor','proper');assert(patch.cost<proper.cost&&patch.seconds<proper.seconds&&patch.to<proper.to);
let wallet=300,fuel=3,charges=0,refunds=0;
const service=new PitService({condition,getFuel:()=>fuel,setFuel:v=>fuel=v,pay:v=>{if(v>wallet)return false;wallet-=v;charges++;return true;},refund:v=>{wallet+=v;refunds+=v;}});
assert(service.startRepair('motor','proper'));assert(!service.startRepair('motor','proper'),'no duplicate order or charge');assert.equal(charges,1);
service.step(proper.seconds/2);assert(Math.abs(condition.quality.motor-.6)<1e-8);const refund=service.cancel();assert.equal(refund,proper.cost/2);assert.equal(condition.quality.motor,.6);assert.equal(refunds,refund);
assert(service.startRepair('motor','patch'));service.step(30);assert.equal(condition.quality.motor,.78);assert(!service.startRepair('motor','patch'),'patch cannot be stacked into a full repair');
assert(service.startRepair('motor','proper'));service.step(30);assert.equal(condition.quality.motor,1);
assert(service.startFuel(2));service.step(2.5);assert.equal(fuel,4,'refuel is gradual');service.cancel();assert.equal(fuel,4);
wallet=0;assert(!service.startFuel(2));assert(!service.startRepair('tanque','proper'));assert.equal(fuel,4);
const account=Object.create(PitStop.prototype);account.mode={active:true,state:{cash:10,profile:{fund:100}},save(){}};
assert(account.spend(50,true));assert.equal(account.mode.state.cash,0);assert.equal(account.mode.state.profile.fund,60);account.refund(20);assert.equal(account.mode.state.cash,4);assert.equal(account.mode.state.profile.fund,76);assert(!account.spend(1000));assert.equal(account.wallet,80,'service uses cash first and refunds its original funding sources');
// Different jobs are paid once, queued, and completed without another click.
const queuedCondition=new CarCondition();for(const id of ['motor','freios','suspensao'])queuedCondition.damage(id,.6);
let queueWallet=500,queueFuel=3,queueCharges=0;
const queuedService=new PitService({condition:queuedCondition,getFuel:()=>queueFuel,setFuel:v=>queueFuel=v,pay:cost=>{queueWallet-=cost;queueCharges++;return true;},refund:cost=>queueWallet+=cost});
for(const id of ['motor','freios','suspensao'])assert(queuedService.startRepair(id,'proper'));
assert.equal(queuedService.queue.length,2);assert(!queuedService.startRepair('freios','patch'));assert.equal(queueCharges,3);
queuedService.step(2);assert(queuedCondition.quality.motor>.4);assert.equal(queuedCondition.quality.freios,.4,'queued work has not started');
const removed=queuedService.cancelQueued('suspensao');assert(removed>0);assert.equal(queuedService.queue.length,1);
assert(queuedService.startFuel(2));assert(!queuedService.startFuel(2));
for(let i=0;i<60*120;i++)queuedService.step(1/120);
assert.equal(queuedCondition.quality.motor,1);assert.equal(queuedCondition.quality.freios,1);assert.equal(queuedCondition.quality.suspensao,.4);assert.equal(queueFuel,5);assert.equal(queuedService.job,null);
// Refund each order to its own original cash/fund sources, even after buying food.
account.mode.state.cash=100;account.mode.state.profile.fund=300;
const accountingCondition=new CarCondition();accountingCondition.damage('motor',.5);accountingCondition.damage('freios',.8);
const accountingService=new PitService({condition:accountingCondition,getFuel:()=>3,setFuel(){},pay:cost=>account.spend(cost,true)?{...account.payment}:false,refund:(cost,job)=>account.refund(cost,job.payment)});
assert(accountingService.startRepair('motor','proper'));assert(accountingService.startRepair('freios','proper'));assert(account.spend(4));
accountingService.step(accountingService.job.seconds/2);accountingService.cancel();
assert.equal(account.mode.state.cash,55);assert.equal(account.mode.state.profile.fund,296);assert.equal(account.wallet,351,'only installed work and food remain charged');
assert.deepEqual(CAFE_MENU.map(item=>item.id),['cafe','pao','doce']);assert(CAFE_MENU.every(item=>item.price>0));
condition.reset();for(const p of CAR_PARTS){condition.damage(p.id,.65);const quote=condition.quote(p.id,'proper');condition.applyRepair(quote,1);}assert.equal(condition.health,1);assert.equal(condition.factors.power,1);

function speedAfter(condition){const car=new TestCar(data);car.condition=condition;car.reset(data.samples.findIndex(p=>p[0]>=1150));for(let i=0;i<360;i++)car.step({throttle:1,brake:0,left:0,right:0},1/120);return Math.hypot(car.vx,car.vy);}
const full=speedAfter(new CarCondition()),broken=new CarCondition();broken.damage('motor',.8);broken.damage('cambio',.8);const slow=speedAfter(broken);assert(slow<full*.6,'damage actually reduces acceleration');
for(const p of CAR_PARTS){const q=broken.quote(p.id,'proper');if(q)broken.applyRepair(q,1);}assert(Math.abs(speedAfter(broken)-full)<.001,'full repairs restore original performance');
// Realism off (the game default): impacts and wear leave the car as new, and switching off repairs it.
const unbreakable=new CarCondition({enabled:false});unbreakable.impact(30,1,0);unbreakable.wear(10,{offRoad:true,speed:40,spin:8});assert.equal(unbreakable.health,1);assert(Math.abs(speedAfter(unbreakable)-full)<.001,'no damage without the realism setting');
const switched=new CarCondition();switched.damage('motor',.7);switched.setEnabled(false);assert.equal(switched.health,1);switched.setEnabled(true);switched.damage('motor',.5);assert.equal(switched.quality.motor,.5);
// Box 99's service box: on the working lane (garage half of the service lane), at s = 20.
const car=new TestCar(data),row=data.samples.find(p=>p[0]>=20);car.index=data.samples.indexOf(row);car.x=row[1]+row[9]*21.65;car.y=row[2]+row[10]*21.65;car.surface=car.sample(car.x,car.y);assert(car.surface.pit&&car.surface.onRoad&&inPitBox(car.surface));
{const middle=new TestCar(data);middle.x=row[1]+row[9]*20;middle.y=row[2]+row[10]*20;middle.index=car.index;assert(!inPitBox(middle.sample(middle.x,middle.y)),'the fast lane is not the service box');}
// Curvelo's garages: the doors stop a car, Box 99 is open to the back wall and its floor is pit surface.
{const P=CURVELO_PIT,push=(d,s)=>{const t=new TestCar(data),r=data.samples.find(p=>p[0]>=s);t.reset(data.samples.indexOf(r));t.x=r[1]+r[9]*d;t.y=r[2]+r[10]*d;t.heading=Math.atan2(r[10],r[9]);t.vx=Math.cos(t.heading)*4;t.vy=Math.sin(t.heading)*4;t.surface=t.sample(t.x,t.y);let hit=0;for(let i=0;i<360;i++){t.step({left:0,right:0,throttle:.35,brake:0,reverse:0,handbrake:0},1/120);hit=Math.max(hit,t.wallImpactSpeed);}return {hit,d:t.surface.d,pit:t.surface.pit};};
 const door=push(21,P.box-2*P.bay);assert(door.hit>1&&door.d<P.offset+P.halfWidth+.6,'a closed garage door stops the car: '+JSON.stringify(door));
 const open=push(21,P.box);assert(open.d>P.offset+P.halfWidth+8&&open.pit,'Box 99 is open and paved: '+JSON.stringify(open));}
const m=Object.create(ImmersiveMode.prototype);Object.assign(m,{car,data,state:new ImmersiveState(),field:new RaceField(data),contacts(){},freeTotalLaps:3,freePlayerProgress:0});m.rivals=m.field.rivals;
const before=car.clock,progress=m.rivals[0].progress;for(let i=0;i<600;i++)m.stepPit(1/120);assert(Math.abs(car.clock-before-5)<1e-7);assert(m.rivals[0].progress>progress+10,'rivals and clock keep running at the pit');

// Drive a complete valid lap through the actual lane, including its timing-line crossing.
const route=new TestCar(data);route.reset(data.samples.findIndex(p=>p[0]>=1050));route.awaitingStart=true;let laneFrames=0,wallHits=0;
for(let i=0;i<120*160&&route.laps<1;i++){
 const speed=Math.hypot(route.vx,route.vy),q=route.a[(route.index+Math.round((7+speed*.4)/2))%route.n],lane=pitLane(data,q[0]),d=lane?.offset??0;
 const dx=q[1]-q[8]*d-route.x,dy=q[2]+q[7]*d-route.y,steer=Math.atan2(2*2.667*Math.sin(wrap(Math.atan2(dy,dx)-route.heading)),Math.hypot(dx,dy)),turn=clamp(steer/steerLimit(speed),-1,1);
 route.step({throttle:speed<13?1:0,brake:speed>14?.3:0,left:Math.max(0,turn),right:Math.max(0,-turn)},1/120);
 if(route.surface.pit)laneFrames++;if(route.wallImpactSpeed>1)wallHits++;
}
assert(route.laps===1&&route.lastLapValid,'pit lane remains a legal lap');assert(laneFrames>500&&wallHits===0,'entry and exit can be driven without rail collision');
console.log(JSON.stringify({passed:true,fullSpeed:full,damagedSpeed:slow,validPitLap:route.best,laneFrames,wallHits,charges,refunds},null,2));
