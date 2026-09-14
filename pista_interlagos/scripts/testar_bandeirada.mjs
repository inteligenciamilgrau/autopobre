import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ImmersiveMode} from '../teste/immersive-mode.js';
import {ImmersiveState} from '../teste/immersive-state.js';
import {RaceField} from '../teste/race-field.js';
import {TestCar} from '../teste/physics.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const input=()=>({throttle:1,brake:0,left:1,right:0,handbrake:1,reverse:1});
const report=[];
for(const immersive of [false,true]){
 const m=Object.create(ImmersiveMode.prototype);m.data=data;m.car=new TestCar(data);m.state=new ImmersiveState();m.field=new RaceField(data);m.rivals=m.field.rivals;
 m.contacts=m.sync=m.wallImpact=()=>{};m.parts={reset(){}};m.freeTotalLaps=3;m.resetField();
 const c=m.car;c.vx=Math.cos(c.heading)*40;c.vy=Math.sin(c.heading)*40;c.clock=250;c.laps=immersive?1:3;
 if(immersive){m.state.active=true;m.state.phase='race';m.state.fuel=8;m.state.cash=37;m.state.profile.fund=100;m.raceProgress=0;m.previousS=c.surface.s;m.step(input(),1/120);}
 else m.stepFree(1/120,input());
 assert(m.finishing&&!m.freeResultReady,'crossing starts a moving transition, not the result');
 const start=[c.x,c.y],time=m.finishTime,position=m.finishPosition,raceTime=m.state.raceTime,order=m.freeOrder.map(e=>e.number);
 assert.equal(m.finishOpacity,0);
 assert(!m.state.paid&&m.state.phase!=='podium');
 // Neither overtakes nor a held handbrake/reverse can rewrite the finish.
 m.rivals.forEach(r=>{r.finished=true;r.progress+=10000;});
 for(let i=0;i<300;i++)m.step(input(),1/120);
 assert(Math.abs(m.finishOpacity-.5)<.001&&m.finishing);
 const midpoint=m.finishElapsed;m.step(input(),0);assert.equal(m.finishElapsed,midpoint,'paused simulation does not advance the fade');
 for(let i=300;i<599;i++)m.step(input(),1/120);
 assert(m.finishing&&m.finishOpacity>.99&&!m.freeResultReady&&m.state.phase!=='podium');
 assert(Math.hypot(c.x-start[0],c.y-start[1])>50,'car keeps moving after the stripe');
 m.step(input(),1/120);
 assert(!m.finishing);assert.equal(c.clock,time);assert.equal(m.state.raceTime,raceTime);assert.deepEqual(m.freeOrder.map(e=>e.number),order);
 if(immersive){assert.equal(m.state.phase,'podium');assert.equal(m.state.result.position,position);assert.equal(m.state.podiumPlace,6);assert(m.state.paid);}
 else {assert(m.freeResultReady);assert.equal(m.freePosition,position);}
 const sounds=m.state.takeSounds();assert.equal(sounds.filter(e=>e.name==='finish').length,1,'one finish announcement');
 report.push({immersive,distance:Math.hypot(c.x-start[0],c.y-start[1]),time,position});
 m.resetField();assert(!m.finishing&&!m.freeResultReady&&m.finishOpacity===0,'restart clears the transition');
}
console.log(JSON.stringify({passed:true,report},null,2));
