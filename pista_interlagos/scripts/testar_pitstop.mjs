import assert from 'node:assert/strict';
import {CarCondition,CAR_PARTS,PitService} from '../teste/car-condition.js';
import {TestCar,MAX_STEER,clamp,wrap} from '../teste/physics.js';
import {createCurveloData} from '../teste/curvelo-data.js';
import {pitLane,inPitBox} from '../teste/pit-lane.js';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {RaceField} from '../teste/race-field.js';
import {PitStop} from '../teste/pitstop.js';
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
condition.reset();for(const p of CAR_PARTS){condition.damage(p.id,.65);const quote=condition.quote(p.id,'proper');condition.applyRepair(quote,1);}assert.equal(condition.health,1);assert.equal(condition.factors.power,1);

function speedAfter(condition){const car=new TestCar(data);car.condition=condition;car.reset(data.samples.findIndex(p=>p[0]>=1150));for(let i=0;i<360;i++)car.step({throttle:1,brake:0,left:0,right:0},1/120);return Math.hypot(car.vx,car.vy);}
const full=speedAfter(new CarCondition()),broken=new CarCondition();broken.damage('motor',.8);broken.damage('cambio',.8);const slow=speedAfter(broken);assert(slow<full*.6,'damage actually reduces acceleration');
for(const p of CAR_PARTS){const q=broken.quote(p.id,'proper');if(q)broken.applyRepair(q,1);}assert(Math.abs(speedAfter(broken)-full)<.001,'full repairs restore original performance');
const car=new TestCar(data),row=data.samples.find(p=>p[0]>=20);car.index=data.samples.indexOf(row);car.x=row[1]+row[9]*20;car.y=row[2]+row[10]*20;car.surface=car.sample(car.x,car.y);assert(car.surface.pit&&car.surface.onRoad&&inPitBox(car.surface));
const m=Object.create(ImmersiveMode.prototype);Object.assign(m,{car,data,state:new ImmersiveState(),field:new RaceField(data),contacts(){},freeTotalLaps:3,freePlayerProgress:0});m.rivals=m.field.rivals;
const before=car.clock,progress=m.rivals[0].progress;for(let i=0;i<600;i++)m.stepPit(1/120);assert(Math.abs(car.clock-before-5)<1e-7);assert(m.rivals[0].progress>progress+10,'rivals and clock keep running at the pit');

// Drive a complete valid lap through the actual lane, including its timing-line crossing.
const route=new TestCar(data);route.reset(data.samples.findIndex(p=>p[0]>=1050));route.awaitingStart=true;let laneFrames=0,wallHits=0;
for(let i=0;i<120*160&&route.laps<1;i++){
 const speed=Math.hypot(route.vx,route.vy),q=route.a[(route.index+Math.round((7+speed*.4)/2))%route.n],lane=pitLane(data,q[0]),d=lane?.offset??0;
 const dx=q[1]-q[8]*d-route.x,dy=q[2]+q[7]*d-route.y,steer=Math.atan2(2*2.667*Math.sin(wrap(Math.atan2(dy,dx)-route.heading)),Math.hypot(dx,dy)),turn=clamp(steer/(MAX_STEER/(1+speed/28)),-1,1);
 route.step({throttle:speed<13?1:0,brake:speed>14?.3:0,left:Math.max(0,turn),right:Math.max(0,-turn)},1/120);
 if(route.surface.pit)laneFrames++;if(route.wallImpactSpeed>1)wallHits++;
}
assert(route.laps===1&&route.lastLapValid,'pit lane remains a legal lap');assert(laneFrames>500&&wallHits===0,'entry and exit can be driven without rail collision');
console.log(JSON.stringify({passed:true,fullSpeed:full,damagedSpeed:slow,validPitLap:route.best,laneFrames,wallHits,charges,refunds},null,2));
