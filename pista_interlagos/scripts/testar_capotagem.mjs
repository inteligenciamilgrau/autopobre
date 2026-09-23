// Limite de aderencia, rodadas, saltos, capotagens e resgate pelos fiscais.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar,wrap,guardrailPresent,recognitionInput,RIGHTING_DELAY,CG_HEIGHT} from '../teste/physics.js';
import {SkidMarks} from '../teste/skid-marks.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
const checks={},metrics={};
const check=(name,value)=>{checks[name]=!!value;assert(value,name);};
// Flat or shaped ground under the car, with a matching slope, independent of the circuit.
function ground(height=()=>0,road=true){
 const c=new TestCar(data);
 c.sample=(x=0,y=0)=>{const e=.05,gx=(height(x+e,y)-height(x-e,y))/(2*e),gy=(height(x,y+e)-height(x,y-e))/(2*e);
  return {i:0,u:0,s:500,d:y,z:height(x,y),width:1000,bank:0,grade:0,gx,gy,tx:1,ty:0,lx:0,ly:1,onRoad:road};};
 c.reset();c.x=c.y=c.heading=0;c.settle();return c;
}
const slip=c=>wrap(Math.atan2(c.vy,c.vx)-c.heading)*180/Math.PI;
function drive(c,seconds,input,dt=1/120,each){
 const out={maxSlip:0,minUpright:1,air:0,longestAir:0,maxImpact:0,finite:true};
 for(let i=0;i<Math.round(seconds/dt);i++){
  const command=typeof input==='function'?input(c,i*dt):input;c.step({...idle,...command},dt);each?.(c,command);
  if(!Number.isFinite(c.x+c.y+c.z+c.vx+c.vy+c.vz)){out.finite=false;break;}
  if(Math.hypot(c.vx,c.vy)>3)out.maxSlip=Math.max(out.maxSlip,Math.abs(slip(c)));
  out.minUpright=Math.min(out.minUpright,c.upright);out.maxImpact=Math.max(out.maxImpact,c.crashImpactSpeed);
  if(c.wheelsDown===0&&!c.hullContact){out.air+=dt;out.longestAir=Math.max(out.longestAir,out.air);}else out.air=0;
 }
 return {...out,kmh:Math.hypot(c.vx,c.vy)*3.6,upright:c.upright,heading:c.heading*180/Math.PI,forward:c.vx*Math.cos(c.heading)+c.vy*Math.sin(c.heading),rightings:c.rightings};
}
const moving=(kmh,c=ground())=>{c.vx=kmh/3.6;return c;};

// --- Beyond the grip limit on asphalt.
const flick=(c,t)=>t<.7?{left:1,handbrake:1}:{};
const counter=(c,t)=>{if(t<.7)return {left:1,handbrake:1};const s=slip(c);return {left:s>8?1:0,right:s<-8?1:0,throttle:.3};};
metrics.handbrakeSpin=drive(moving(90),4,flick);
metrics.handbrakeCaught=drive(moving(90),4,counter);
check('handbrake_flick_at_90_spins_the_car_round',Math.abs(metrics.handbrakeSpin.heading)>150&&metrics.handbrakeSpin.maxSlip>120);
check('counter_steer_catches_the_same_slide',metrics.handbrakeCaught.maxSlip<60&&metrics.handbrakeCaught.forward>12);
metrics.powerOversteer=drive(moving(25),3,{throttle:1,left:1});
check('first_gear_power_and_lock_step_the_tail_out',metrics.powerOversteer.maxSlip>90);
metrics.brakingInTurn=drive(moving(100),4,(c,t)=>t<1.2?{left:1,throttle:.5}:t<2.2?{left:1,brake:1}:{});
check('hard_braking_in_a_turn_pushes_wide_instead_of_spinning',metrics.brakingInTurn.maxSlip<10);
metrics.limitCorner=drive(moving(140),4,(c,t)=>({left:1,throttle:Math.hypot(c.vx,c.vy)<140/3.6?.6:0}));
check('full_lock_at_the_limit_stays_planted',metrics.limitCorner.maxSlip<5&&metrics.limitCorner.minUpright>.95);

// --- Grass grips less than asphalt but is not ice: power and steering together don't spin it.
const onGrass=kmh=>{const c=ground(()=>0,false);c.vx=kmh/3.6;return c;};
const holdSpeed=kmh=>c=>({throttle:Math.max(0,Math.min(1,(kmh/3.6-Math.hypot(c.vx,c.vy))*2)),left:1});
metrics.grassCorner=drive(onGrass(70),5,holdSpeed(70));
metrics.grassPowerExit=drive(onGrass(50),4,{throttle:1,left:1});
metrics.grassLift=drive(onGrass(80),3,{left:1});
check('grass_corner_on_the_throttle_holds_its_line',metrics.grassCorner.maxSlip<6);
check('full_throttle_and_lock_on_grass_does_not_spin',metrics.grassPowerExit.maxSlip<6);
check('lifting_mid_corner_on_grass_stays_tidy',metrics.grassLift.maxSlip<8);

// --- Crests, ramps and landings.
const kicker=x=>x<30?0:x<36?(x-30)*.3:x<38?1.8:x<44?1.8-(x-38)*.3:0;
metrics.kicker=drive(moving(100,ground(kicker)),4,{throttle:.2});
check('ramp_at_100_launches_and_lands_on_the_wheels',metrics.kicker.longestAir>1&&metrics.kicker.upright>.95&&metrics.kicker.rightings===0);
check('hard_landing_is_reported_as_an_impact',metrics.kicker.maxImpact>4);
metrics.kickerTimestep=[1/60,1/120,1/240].map(dt=>drive(moving(100,ground(kicker)),4,{throttle:.2},dt).longestAir);
check('jump_consistent_across_timesteps',Math.max(...metrics.kickerTimestep)-Math.min(...metrics.kickerTimestep)<.12);
// Smooth hump, 110 m radius over the top: weightless above about 118 km/h.
const crest=x=>x<20?0:x<40?(x-20)**2/220:x<80?400/220+(x-40)*.18-(x-40)**2/220:400/220+40*.18-1600/220+(x-80)*(.18-40/110);
metrics.crestSlow=drive(moving(60,ground(crest)),5,{throttle:.3});
metrics.crestFast=drive(moving(150,ground(crest)),3,{throttle:.3});
check('crest_keeps_a_slow_car_down_but_lifts_a_fast_one',metrics.crestSlow.longestAir===0&&metrics.crestFast.longestAir>.15);
const oneSide=(x,y)=>y>0?(x<30?0:x<36?(x-30)*.3:Math.max(0,1.8-(x-36)*.6)):0;
metrics.oneSidedRamp=drive(moving(80,ground(oneSide)),5,{throttle:.2});
check('ramp_under_one_side_rolls_the_car',metrics.oneSidedRamp.minUpright<0&&metrics.oneSidedRamp.finite);

// --- Sliding sideways off the road: soil trips a fast car over, not a slow one.
const sideways=v=>{const c=ground(()=>0,false);c.vx=5;c.vy=v;return drive(c,6,{});};
metrics.grassSlow=sideways(12);metrics.grassFast=sideways(26);
check('slow_sideways_slide_on_grass_stays_upright',metrics.grassSlow.minUpright>.8);
check('fast_sideways_slide_on_grass_trips_a_rollover',metrics.grassFast.minUpright<0);

// --- Marshals put an overturned car back on its wheels once it stops.
const rolled=ground(()=>0,false);rolled.vx=5;rolled.vy=26;
let restedOverturned=0;metrics.righting=drive(rolled,6+RIGHTING_DELAY+2,{},1/120,c=>{if(c.overturned>0)restedOverturned=Math.max(restedOverturned,c.overturned);});
check('overturned_car_is_righted_after_it_rests',metrics.righting.rightings>=1&&restedOverturned>RIGHTING_DELAY-.05&&metrics.righting.upright>.99);

// --- In the air there is no rubber on the road.
const air=moving(100,ground(kicker)),marks=new SkidMarks(512);let airborneMarks=0;
drive(air,4,{handbrake:1,throttle:.2},1/120,(c,command)=>{const before=marks.total;marks.update(c,command,1/120);if(c.wheelsDown===0&&marks.total>before)airborneMarks++;});
check('no_skid_marks_from_wheels_in_the_air',airborneMarks===0);marks.dispose();

// --- Real Interlagos terrain: off the road at speed the car can fly and roll, and the numbers stay finite.
const excursions=[];
for(let i=0;i<data.samples.length;i+=48)for(const side of [-1,1]){
 if(guardrailPresent(data,data.samples[i][0],side))continue;
 const c=new TestCar(data);c.reset(i);const p=c.surface;c.heading=Math.atan2(p.ty,p.tx)+side*.45;c.x+=p.lx*side*3;c.y+=p.ly*side*3;
 c.vx=Math.cos(c.heading)*160/3.6;c.vy=Math.sin(c.heading)*160/3.6;c.settle();
 const r=drive(c,6,{throttle:.6},1/120);excursions.push(r);
}
metrics.terrain={runs:excursions.length,airborne:excursions.filter(r=>r.longestAir>.3).length,rolled:excursions.filter(r=>r.minUpright<0).length,longestAir:Math.max(...excursions.map(r=>r.longestAir))};
check('real_terrain_launches_fast_cars',metrics.terrain.airborne>=metrics.terrain.runs*.25);
check('real_terrain_can_roll_a_car',metrics.terrain.rolled>=1);
check('real_terrain_stays_finite',excursions.every(r=>r.finite));

// --- Uphill from rest in first gear, on the real slopes beside the circuit (walls and
// near-vertical banks excluded): the engine has the grunt, only traction and terrain limit it.
const hills=[],scout=new TestCar(data);
for(let i=0;i<data.samples.length;i+=14)for(const side of [-1,1])for(const off of [8,14,20]){
 scout.reset(i);const p=scout.surface,x=scout.x+p.lx*side*(p.width/2+off),y=scout.y+p.ly*side*(p.width/2+off),q=scout.sample(x,y),g=Math.hypot(q.gx,q.gy);
 if(q.onRoad||q.pit||g<.1||g>.5)continue;const h=Math.atan2(q.gy,q.gx);let steepest=0;
 for(let d=-3;d<18;d+=.5)steepest=Math.max(steepest,scout.sample(x+Math.cos(h)*(d+1),y+Math.sin(h)*(d+1)).z-scout.sample(x+Math.cos(h)*d,y+Math.sin(h)*d).z);
 if(steepest<.7&&scout.sample(x+Math.cos(h)*15,y+Math.sin(h)*15).z-q.z>=1.5)hills.push({i,x,y,h});
}
const climbTimes=[];let blocked=0,walled=0;
for(const s of hills){const c=new TestCar(data);c.reset(s.i);c.x=s.x;c.y=s.y;c.heading=s.h;c.settle();let time=null;
 for(let k=0;k<120*8;k++){c.step({...idle,throttle:1},1/120);if(c.wallImpactSpeed>0)break;if((c.x-s.x)*Math.cos(s.h)+(c.y-s.y)*Math.sin(s.h)>=15){time=k/120;break;}}
 if(c.wallImpactSpeed>0)walled++;else if(time===null)blocked++;else climbTimes.push(time);}
climbTimes.sort((a,b)=>a-b);
metrics.hills={count:hills.length,climbed:climbTimes.length,blocked,walled,medianSeconds:climbTimes[Math.floor(climbTimes.length/2)]};
check('first_gear_climbs_real_hills_from_rest',hills.length>80&&metrics.hills.climbed>=(hills.length-walled)*.93&&metrics.hills.medianSeconds<3);

// --- A car at rest off the road stays put, without creeping or jittering.
const parked=new TestCar(data);parked.reset(900);{const p=parked.surface;parked.x+=p.lx*(p.width/2+12);parked.y+=p.ly*(p.width/2+12);parked.settle();}
const start=[parked.x,parked.y];let jitter=0;
// The first second lets the body settle onto the uneven ground under its four wheels.
drive(parked,10,{brake:1},1/120,c=>{if(c.clock>1)jitter=Math.max(jitter,Math.abs(c.vz));});
metrics.parked={moved:Math.hypot(parked.x-start[0],parked.y-start[1]),jitter,height:parked.z-CG_HEIGHT-parked.surface.z};
check('parked_on_terrain_holds_still',metrics.parked.moved<.02&&metrics.parked.jitter<.01);

// --- The automatic driver turns round after a spin instead of driving the wrong way.
const lost=new TestCar(data);lost.reset(400);lost.heading+=Math.PI;lost.settle();
const startS=lost.surface.s;drive(lost,12,c=>recognitionInput(c));
const alpha=(()=>{const t=data.samples[(lost.index+8)%lost.n];return Math.abs(wrap(Math.atan2(t[2]-lost.y,t[1]-lost.x)-lost.heading));})();
let progress=lost.surface.s-startS;if(progress<-2000)progress+=data.meta.reconstructed_xy_m;
metrics.turnRound={alpha,progress};
check('automatic_driver_turns_round_after_a_spin',alpha<Math.PI/2&&progress>20);

const report={passed:true,checks,metrics};
fs.writeFileSync(new URL('../dados/validacao_capotagem.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks,terrain:metrics.terrain,kickerTimestep:metrics.kickerTimestep},null,1));
