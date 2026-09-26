// Arvores como obstaculo (teste/tree-contact.js): o Opala para no tronco sem atravessar,
// uma batida de quina faz o carro girar, de re tambem bate, o impacto chega a
// wallImpactSpeed (som e danos), a arvore balanca e solta folhas, e longe das arvores
// nada muda.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestCar} from '../teste/physics.js';
import {TreeField} from '../teste/tree-contact.js';

const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const START=700;   // Reta Oposta: long and straight
const idle={throttle:0,brake:0,left:0,right:0,handbrake:false,reverse:0};
// A mock instanced mesh: records the matrices the shaking tree writes.
const mesh={writes:0,setMatrixAt(){this.writes++;},instanceMatrix:{needsUpdate:false}};
function run({ahead=9,side=0,speed=15,reverse=false,seconds=2.5}={}){
 const car=new TestCar(data);car.reset(START);
 const c=Math.cos(car.heading),s=Math.sin(car.heading),dir=reverse?-1:1;
 const tree={x:car.x+c*ahead*dir-s*side,y:car.y+s*ahead*dir+c*side,z:car.z-.5,height:9,width:8,kind:'round',color:[.08,.15,.04],turn:0,instance:{mesh,index:0}};
 const field=new TreeField([tree]);car.posts=field;
 car.vx=c*speed*dir;car.vy=s*speed*dir;
 const post=field.trees[0];let peak=0,yaw=0,overlap=0;
 for(let t=0;t<seconds;t+=1/120){
  car.step(reverse?{...idle,reverse:1}:idle,1/120);peak=Math.max(peak,car.wallImpactSpeed);yaw=Math.max(yaw,Math.abs(car.yaw));
  // How far the trunk's circle reaches into the body's plan.
  const dx=post.x-car.x,dy=post.y-car.y,ch=Math.cos(car.heading),sh=Math.sin(car.heading),bx=dx*ch+dy*sh,by=-dx*sh+dy*ch;
  const qx=Math.max(-2.35,Math.min(2.42,bx)),qy=Math.max(-.93,Math.min(.93,by));overlap=Math.max(overlap,post.r-Math.hypot(bx-qx,by-qy));
  field.update(1/60,720);
 }
 return {car,field,peak,yaw,overlap,speed:Math.hypot(car.vx,car.vy)};
}

// Head on at 54 km/h: the trunk stops the car and never gets inside it.
{
 const r=run();
 assert.ok(r.speed<3,`stopped by the trunk: ${r.speed.toFixed(2)} m/s`);
 assert.ok(r.peak>12,`the blow reaches wallImpactSpeed (collision sound, damage): ${r.peak.toFixed(1)}`);
 assert.ok(r.overlap<.08,`the car stays outside the trunk: ${r.overlap.toFixed(3)} m`);
 assert.ok(r.field.stats.hits>=1&&r.field.stats.leaves>10,'the tree shakes and sheds leaves');
 console.log('head on:',{speed:+r.speed.toFixed(2),peak:+r.peak.toFixed(1),overlap:+r.overlap.toFixed(3),...r.field.info()});
}
// Clipping the trunk with the front corner spins the car and it carries on past.
{
 const r=run({side:.85});
 assert.ok(r.yaw>.5,`a glancing blow spins the car: ${r.yaw.toFixed(2)} rad/s`);
 assert.ok(r.overlap<.08,`still outside the trunk: ${r.overlap.toFixed(3)} m`);
 console.log('corner:',{yaw:+r.yaw.toFixed(2),speed:+r.speed.toFixed(2)});
}
// Backing into a tree at 11 km/h.
{
 const r=run({reverse:true,speed:3,ahead:5});
 assert.ok(r.peak>2&&r.overlap<.05,`reversing into a tree: ${r.peak.toFixed(2)} m/s, ${r.overlap.toFixed(3)} m`);
}
// The shaking crown writes its instance matrix, then settles.
{
 const before=mesh.writes;run();
 assert.ok(mesh.writes>before+10,'the hit tree sways');
}
// Far from any tree the field does nothing.
{
 const car=new TestCar(data);car.reset(START);const far=new TreeField([{x:car.x+500,y:car.y,z:0,height:9,width:8,kind:'round',color:[.1,.1,.1],turn:0}]);
 assert.equal(far.collide(car),0);
}
console.log('arvores: ok');
