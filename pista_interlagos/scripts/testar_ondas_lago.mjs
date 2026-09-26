// Ondas do lago (teste/lake-waves.js): o casco empurra a agua como um carro, nao como
// uma gota. Num lago retangular de 0,85 m: agua parada fica parada; um carro rapido
// deixa uma esteira em V com o angulo de Mach da onda rasa, sem nada a frente do
// para-choque; um carro lento empurra a agua a frente; a proa acumula agua e segura o
// carro, e o refluxo o empurra depois que ele para; espuma e lama ficam no rastro; a
// grade anda com o carro sem perder as ondas; a margem nao recebe agua.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {LakeWaves} from '../teste/lake-waves.js';

const G=9.81,DEPTH=.85,LEVEL=0;
// Lake: x in [-150, 150], y in [-45, 45]; the bank rises 0.1 m per metre like lakeBedDepth.
const inside=(x,y)=>Math.min(150-Math.abs(x),45-Math.abs(y));
const water={
 at(x,y){const s=inside(x,y);return s<-1.5?null:{level:LEVEL,shore:s,depth:Math.min(DEPTH,.2+.1*s)};},
 near(x,y){return {level:LEVEL,shore:inside(x,y)};}
};
const SHAPE={front:2.4,rear:2.33,half:.88,soft:.5,bottom:-.33};
// A car sitting on the bed with its floor 0.6 m under the surface, moving along +x.
function car(x,y,vx,vy=0){const h=Math.atan2(vy,vx||1e-9);return {x,y,z:LEVEL-.6+.33,vx,vy,heading:h};}
const axes=c=>{const ch=Math.cos(c.heading),sh=Math.sin(c.heading);return {f:[ch,sh,0],l:[-sh,ch,0],u:[0,0,1]};};
function run(field,c,seconds,{move=true,dt=1/120,onStep=null}={}){
 for(let t=0;t<seconds;t+=dt){
  if(move){c.x+=c.vx*dt;c.y+=c.vy*dt;}
  field.follow(c.x,c.y,c.vx,c.vy);
  field.step(dt,f=>f.pressHull(c,axes(c),SHAPE));
  onStep?.(t);
 }
}
const maxAbs=a=>a.reduce((m,v)=>Math.max(m,Math.abs(v)),0);

// Still water stays still.
{
 const field=new LakeWaves(water);field.follow(0,0,0,0);field.step(5,null);
 assert.ok(field.active&&field.stats.steps>=299,field.stats);
 assert.equal(maxAbs(field.h),0);
}
// A car parked in the lake: the dent it makes is filled back in the shown surface once the water settles.
{
 const field=new LakeWaves(water),c=car(0,0,0);run(field,c,25,{move:false});field.sync();
 let shown=0;for(let i=0;i<field.n*field.n;i++)shown=Math.max(shown,Math.abs(field.data[i*4]));
 assert.ok(shown<.03,`surface settles level through a parked car: ${shown}`);
 assert.ok(field.push.some(p=>p>.5),'the hull still presses under the surface');
}
// A fast car (8 m/s, three times the 2.9 m/s wave speed): a V wake at the Mach angle, nothing ahead.
{
 const v=8,c=car(-20,0,v),field=new LakeWaves(water);run(field,c,5);
 const ahead=Math.abs(field.heightAt(c.x+SHAPE.front+3,c.y)),bow=field.heightAt(c.x+SHAPE.front+.5,c.y);
 assert.ok(ahead<.02,`supercritical: no wave runs ahead of the car (${ahead})`);
 assert.ok(bow>.05,`water piles up at the bumper (${bow})`);
 // The outer crest of each arm, 8 and 16 m behind the tail: its spread gives the half-angle of the V.
 const angle=Math.asin(Math.sqrt(G*DEPTH)/v),arms=[];
 for(const side of [-1,1]){
  const crest=behind=>{const x=c.x-SHAPE.rear-behind;let best=0,at=0;for(let y=1;y<16;y+=.05){const h=field.heightAt(x,c.y+side*y);if(h>best){best=h;at=y;}}
   assert.ok(best>.03,`wake arm ${behind} m behind, side ${side}: ${best}`);return at;};
  const a=Math.atan((crest(16)-crest(8))/8);arms.push(a);
  assert.ok(Math.abs(a-angle)<4*Math.PI/180,`wake arm at the Mach angle: ${(a*180/Math.PI).toFixed(1)}° vs ${(angle*180/Math.PI).toFixed(1)}°`);
 }
 // The churned trail: whitewater and mud behind the car, clear water ahead.
 const foamAt=(x,y)=>field.foam[field.cellAt(x,y)];
 assert.ok(foamAt(c.x-6,c.y)>.25,`whitewater in the trail: ${foamAt(c.x-6,c.y)}`);
 assert.ok(foamAt(c.x+6,c.y)<.01,'no foam ahead of the car');
 assert.ok(field.stats.spilled>0,'the bow wave breaks into spray at this speed');
 console.log('fast car:',{bow:+bow.toFixed(3),mach:+(angle*180/Math.PI).toFixed(1),arms:arms.map(a=>+(a*180/Math.PI).toFixed(1)),stats:field.info()});
}
// A slow car (1.5 m/s, half the wave speed) shoves a mound ahead of the bumper.
{
 const c=car(-20,0,1.5),field=new LakeWaves(water);run(field,c,8);
 const ahead=Math.max(...[3,5,7].map(d=>field.heightAt(c.x+SHAPE.front+d,c.y)));
 assert.ok(ahead>.004,`subcritical: the pushed water runs ahead (${ahead})`);
}
// The bow wave holds the car back; after a sudden stop the water sloshes back against it.
{
 const c=car(-20,0,6),field=new LakeWaves(water),A=axes(c);let resist=0,surge=0;
 run(field,c,3,{onStep:()=>{resist=Math.min(resist,field.hullPush(c,A,SHAPE,.6,1250)[0]);}});
 c.vx=0;run(field,c,4,{move:false,onStep:()=>{surge=Math.max(surge,field.hullPush(c,A,SHAPE,.6,1250)[0]);}});
 assert.ok(resist<-.5,`pushing the bow wave costs force: ${resist} m/s²`);
 assert.ok(surge>.3,`the wake catches up and nudges the stopped car: ${surge} m/s²`);
 console.log('wave push:',{resist:+resist.toFixed(2),surge:+surge.toFixed(2)});
}
// The grid slides in whole cells and keeps the waves where they were made.
{
 const c=car(0,0,5),field=new LakeWaves(water);run(field,c,2);
 const probes=[[-4,2],[-8,-3],[-2,5],[1,-1]].map(([dx,dy])=>[c.x+dx,c.y+dy]),before=probes.map(p=>field.heightAt(...p));
 assert.ok(before.some(h=>Math.abs(h)>.01));
 field.shift(7,-4);
 probes.forEach((p,i)=>assert.ok(Math.abs(field.heightAt(...p)-before[i])<1e-6,'shifted waves stay put'));
 const shifts=field.stats.shifts;run(field,c,6);
 assert.ok(field.stats.shifts>shifts,'the grid follows a car crossing the lake');
}
// The bank: dry cells never hold water, and a zig-zag at 15 m/s stays bounded for a minute.
{
 const c=car(100,30,15),field=new LakeWaves(water);let t=0;
 run(field,c,60,{onStep:dt=>{t+=1/120;const a=Math.sin(t*.8)*.9+Math.PI;c.vx=15*Math.cos(a);c.vy=15*Math.sin(a)*.4;c.heading=Math.atan2(c.vy,c.vx);
  if(Math.abs(c.x)>140)c.x=Math.sign(c.x)*140;if(Math.abs(c.y)>38)c.y=Math.sign(c.y)*38;}});
 for(let i=0;i<field.n*field.n;i++){
  assert.ok(Number.isFinite(field.h[i])&&Math.abs(field.h[i])<=.9,'bounded');
  if(!field.depth[i])assert.equal(field.h[i],0,'no water on land');
 }
 assert.ok(field.depth.some(d=>d===0),'the test reached the bank');
}
// Calm water far from the car goes to sleep.
{
 const field=new LakeWaves(water),c=car(0,0,0);run(field,c,1,{move:false});
 const away={...water,near:()=>({level:0,shore:-60})},sleepy=Object.assign(field,{water:away});
 for(let t=0;t<40&&sleepy.active;t+=1/60){sleepy.follow(500,500,0,0);sleepy.step(1/60,null);}
 assert.ok(!sleepy.active,'the field sleeps once the water is calm and the car gone');
}
// Cost: one tick of the desktop grid.
{
 const field=new LakeWaves(water),c=car(0,0,8);run(field,c,1);
 const t0=performance.now();run(field,c,2);const perTick=(performance.now()-t0)/120;
 const mobile=new LakeWaves(water,{mobile:true});run(mobile,car(0,0,8),1);
 assert.ok(perTick<4,`desktop tick ${perTick.toFixed(2)} ms`);
 console.log('tick cost:',{desktop:+perTick.toFixed(3)+' ms',cells:field.n*field.n,mobileCells:mobile.n*mobile.n});
}
console.log('ondas do lago: ok');
