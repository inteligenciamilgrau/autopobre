import fs from 'node:fs';
import assert from 'node:assert/strict';
// The brake backs up at rest (teste/brake-reverse.js) with the real car physics: it stops first and waits
// a moment still, from rest it backs up at once, dosed by the pedal; the throttle, the manual gearbox, on
// foot or out of fuel keep it a brake; reads that are not a physics step never move it on.
const {BrakeReverse,BRAKE_WAIT}=await import('../teste/brake-reverse.js');
const {TestCar}=await import('../teste/physics.js');
const track=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0},DT=1/120;
function flatCar(kmh=0){
 const c=new TestCar(track);
 c.sample=()=>({i:0,u:0,s:500,d:0,z:.055,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});
 c.reset();c.x=c.y=c.heading=0;c.vx=kmh/3.6;c.surface=c.sample();return c;
}
const speed=c=>Math.hypot(c.vx,c.vy);
// Steps the car as main.js does: the command goes through the latch, then to physics.
function drive(c,latch,command,seconds,allowed=true,each){
 let last;for(let i=0;i<Math.round(seconds/DT);i++){last=latch.apply({...idle,...command},c,{allowed,dt:DT});c.step(last,DT);each?.(c,last);}
 return last;
}

{
 // From 60 km/h the brake stops the car and holds it still for the wait (the box opens after .65 s),
 // then backs up while it is held.
 const c=flatCar(60),latch=new BrakeReverse();let stoppedAt=null,backedAt=null,t=0;
 drive(c,latch,{brake:1},5,true,(car,command)=>{t+=DT;if(stoppedAt===null&&speed(car)<.05)stoppedAt=t;if(backedAt===null&&command.reverse>0)backedAt=t;});
 assert.ok(stoppedAt!==null&&stoppedAt<2.5,`stops first: ${stoppedAt}`);
 assert.ok(backedAt-stoppedAt>.7,`waits still before backing (box opens at .65 s): ${backedAt-stoppedAt}`);
 assert.ok(backedAt-stoppedAt<BRAKE_WAIT.stop+.2,`then backs up: ${backedAt-stoppedAt}`);
 assert.ok(c.vx<-2,`backing up: ${c.vx}`);assert.equal(c.gear,-1,'in reverse');
 // Let go: the brake is a brake again, and pressed while still rolling back it stops the car first.
 const free=drive(c,latch,{},.05);assert.equal(free.reverse,0);assert.equal(latch.backing,false);
 const rolling=drive(c,latch,{brake:1},.2);assert.equal(rolling.reverse,0,'rolling back, the brake brakes');assert.equal(rolling.brake,1);
 drive(c,latch,{brake:1},1);assert.ok(speed(c)<.05,'stopped');
}
{
 // From rest it backs up almost at once.
 const c=flatCar(),latch=new BrakeReverse();
 const first=drive(c,latch,{brake:1},BRAKE_WAIT.rest/2);assert.equal(first.reverse,0,'not on the very first touch');
 const next=drive(c,latch,{brake:1},BRAKE_WAIT.rest);assert.equal(next.reverse,1);assert.equal(next.brake,0,'the brake turned into reverse');
 drive(c,latch,{brake:1},2);assert.ok(c.vx<-2,`backs up from rest: ${c.vx}`);
}
{
 // Dosed by the pedal: half a pedal backs up slower than a full one.
 const half=flatCar(),full=flatCar();drive(half,new BrakeReverse(),{brake:.5},2.5);drive(full,new BrakeReverse(),{brake:1},2.5);
 assert.ok(half.vx<-.3&&half.vx>full.vx+.5,`half pedal slower: ${half.vx} vs ${full.vx}`);
 // A trigger barely touched stays a brake.
 const light=flatCar(),touch=drive(light,new BrakeReverse(),{brake:.08},2);assert.equal(touch.reverse,0);assert.ok(speed(light)<.05);
}
{
 // Throttle with the brake: a brake, never reverse (a launch with both pedals).
 const c=flatCar(),latch=new BrakeReverse(),both=drive(c,latch,{brake:1,throttle:1},2);
 assert.equal(both.reverse,0);assert.equal(both.brake,1);assert.ok(c.vx>-.05,'never backs up');
 // Throttle pressed while backing: the brake again, the car stops.
 const back=flatCar();drive(back,latch,{brake:1},2);assert.ok(back.vx<-1);
 drive(back,latch,{brake:1,throttle:1},.05);assert.equal(latch.backing,false);
}
{
 // Not allowed (manual gearbox, on foot, out of fuel): the brake only brakes, held as long as you like.
 const c=flatCar(),latch=new BrakeReverse(),held=drive(c,latch,{brake:1},3,false);
 assert.equal(held.reverse,0);assert.equal(held.brake,1);assert.ok(speed(c)<.05);
 // Q is untouched by the latch and backs up as ever.
 const q=flatCar(),qb=drive(q,new BrakeReverse(),{reverse:1},2);assert.equal(qb.reverse,1);assert.ok(q.vx<-2);
}
{
 // Reads that are not a physics step (the sound, the hands) never move the latch on, only show it.
 const c=flatCar(),latch=new BrakeReverse();
 for(let i=0;i<600;i++)latch.apply({...idle,brake:1},c);
 assert.equal(latch.backing,false);assert.equal(latch.wait,0);
 drive(c,latch,{brake:1},BRAKE_WAIT.rest*2);assert.equal(latch.backing,true);
 const shown=latch.apply({...idle,brake:.7},c);assert.equal(shown.reverse,.7);assert.equal(shown.brake,0);
 latch.reset();assert.equal(latch.backing,false);
}
console.log('Brake to reverse passed: stops and waits first, from rest at once, dosed, throttle/manual/on foot keep the brake, only physics steps move it.');
