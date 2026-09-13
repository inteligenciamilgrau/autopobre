import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,wrap} from '../teste/physics.js';
import {SkidMarks} from '../teste/skid-marks.js';
import {TyreSmoke} from '../teste/tyre-smoke.js';
import {CarAudio} from '../teste/car-audio.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
const checks={},metrics={};
const check=(name,value)=>{checks[name]=!!value;assert(value,name);};
function flat(){const c=new TestCar(data);c.sample=()=>({i:0,s:500,d:0,z:.055,width:1000,gx:0,gy:0,onRoad:true});c.reset();c.x=c.y=c.heading=0;return c;}
const car=flat(),marks=new SkidMarks(512),smoke=new TyreSmoke(),audio=new CarAudio();
function run(seconds,input){for(let i=0;i<seconds*120;i++){car.step({...idle,...input},1/120);marks.update(car,input,1/120);smoke.update(car,marks.wheels,1/120,900);}marks.flush();}
run(2,{handbrake:1});check('handbrake_alone_no_smoke',smoke.total===0&&car.rearSpin===0);
run(3,{handbrake:1,throttle:1});
metrics.heldDisplacement=Math.hypot(car.x,car.y);metrics.rearSlipSpeed=car.rearSlipSpeed;
check('held_burnout_stays_in_place',metrics.heldDisplacement<.05);
check('rear_wheels_spin_fronts_still',car.rearSpin>100&&Math.abs(car.spin)<.1);
check('rear_contact_patches',marks.total>0&&marks.wheels.slice(0,2).every(w=>!w.segments));
check('smoke_from_spinning_tyres',smoke.info().active>30&&smoke.info().active<=256);
audio.update(car,{throttle:1,handbrake:1},1,false,'chase');check('stationary_squeal_and_engine_revs',audio.state.skid>.8&&audio.state.rpm>5000&&audio.state.gear===1);
run(.4,{throttle:1});check('release_launches_with_wheelspin',Math.hypot(car.vx,car.vy)>1&&car.rearSlipSpeed>3);
run(4,{throttle:1});check('grip_recovers_after_launch',car.rearSlipSpeed<.01);
for(const direction of [1,-1]){
 const c=flat();let angle=0,maxRadius=0;
 for(let i=0;i<1440;i++){const old=c.heading;c.step({...idle,throttle:1,handbrake:1,left:direction>0?1:0,right:direction<0?1:0},1/120);angle+=wrap(c.heading-old);maxRadius=Math.max(maxRadius,Math.hypot(c.x,c.y));}
 metrics[direction>0?'leftDonut':'rightDonut']={angle,maxRadius,speed:Math.hypot(c.vx,c.vy)};
 check('full_donut_'+direction,angle*direction>Math.PI*2&&maxRadius<10);
 const trackCar=new TestCar(data);trackCar.reset(600);let trackAngle=0,offRoad=0;
 for(let i=0;i<1440;i++){const old=trackCar.heading;trackCar.step({...idle,throttle:1,handbrake:1,left:direction>0?1:0,right:direction<0?1:0},1/120);trackAngle+=wrap(trackCar.heading-old);offRoad+=!trackCar.surface.onRoad;}
 metrics[direction>0?'leftInterlagos':'rightInterlagos']={angle:trackAngle,offRoad};
 check('full_donut_on_interlagos_asphalt_'+direction,trackAngle*direction>Math.PI*2&&offRoad===0);
}
const previous=smoke.total;smoke.update(car,marks.wheels,0,900);check('pause_freezes_particles',smoke.total===previous);
for(let i=0;i<600;i++)smoke.update(car,marks.wheels.map(w=>({...w,strength:0})),1/120,900);
check('smoke_dissipates',smoke.info().active===0);
car.reset();smoke.reset();check('reset_clears_wheelspin_and_smoke',car.burnout===0&&car.rearSpin===0&&car.rearSlipSpeed===0&&smoke.info().active===0);
const grass=flat();grass.sample=()=>({i:0,s:500,d:0,z:.055,width:1000,gx:0,gy:0,onRoad:false});grass.surface=grass.sample();
for(let i=0;i<120;i++)grass.step({...idle,throttle:1,handbrake:1},1/120);
check('no_asphalt_burnout_on_grass',grass.rearSlipSpeed===0);
marks.dispose();smoke.dispose();
const report={checks,metrics,passed:true};fs.writeFileSync(new URL('../dados/validacao_burnout.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
