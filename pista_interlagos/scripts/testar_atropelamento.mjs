// Atropelamento "sem querer" (teste/pit-crew.js): quem o Opala atinge sai voando como em
// desenho animado (bem alto, girando, quicando), fica estatelado, levanta tonto, sacode o
// punho para o carro e volta andando para o mesmo lugar, virado para o mesmo lado. Carro
// devagar nao derruba ninguem; quem esta em outro nivel (arquibancada) nao e atingido.
import assert from 'node:assert/strict';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {createPeople,updatePeople,hitPeople,takePeopleEvents,tumbleInfo,PitCrew} from '../teste/pit-crew.js';

const people=createPeople(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
camera.position.set(0,5,20);camera.updateMatrixWorld();
// A crowd in a rotated, shifted group (like the garages): on the ground, and one up on a stand.
const group=new THREE.Group();group.position.set(40,2,-10);group.rotation.y=.7;scene.add(group);
const crowd=people.crowd([{outfit:{},pose:'stand',x:0,y:0,z:0,yaw:.3},{outfit:{},pose:'stand',x:6,y:0,z:0,yaw:-1},{outfit:{},pose:'stand',x:0,y:3.5,z:4,yaw:0}],{name:'Teste_atropelamento'});
group.add(crowd);scene.updateMatrixWorld(true);updatePeople(1/60,camera,[]);
const world=(x,y,z)=>new THREE.Vector3(x,y,z).applyMatrix4(group.matrixWorld);
// The car: physics frame (x, y ground plane, z up); its centre of mass .52 m above the ground.
function carAt(p,heading,speed){return {x:p.x-Math.cos(heading)*1.5,y:-p.z-Math.sin(heading)*1.5,z:p.y+.52,heading,vx:Math.cos(heading)*speed,vy:Math.sin(heading)*speed};}
const target=world(0,0,0),above=world(0,3.5,4);
// A slow car nudging someone does nothing.
assert.equal(hitPeople(carAt(target,.2,1.2)),0,'at walking pace nobody flies');
// The stand is out of reach of a car on the ground below it.
assert.equal(hitPeople(carAt(new THREE.Vector3(above.x,target.y,above.z),0,12)),0,'people on a higher level are safe');
// 36 km/h into the first person.
assert.equal(hitPeople(carAt(target,.2,10)),1,'the car hits the person in its path');
assert.equal(hitPeople(carAt(target,.2,10)),0,'someone already flying is not hit again');
let events=takePeopleEvents();assert.ok(events.some(e=>e.sound==='bonk'),'a cartoon bonk');
const seen=new Set(),order=[];let apex=-Infinity,far=0,t=0;
for(;t<40;t+=1/60){
 updatePeople(1/60,camera,[]);const info=tumbleInfo();if(!info.length)break;
 const p=info[0];if(!seen.has(p.phase)){seen.add(p.phase);order.push(p.phase);}
 apex=Math.max(apex,p.feet[1]-target.y);far=Math.max(far,Math.hypot(p.feet[0]-target.x,p.feet[2]-target.z));
 events.push(...takePeopleEvents());
}
assert.deepEqual(order,['fly','lie','rise','dizzy','fist','walk','turn'],`the whole routine, in order: ${order}`);
assert.ok(apex>2,`thrown high, like a cartoon: ${apex.toFixed(2)} m`);
assert.ok(far>4,`and far: ${far.toFixed(1)} m`);
assert.ok(events.filter(e=>e.sound==='boing').length>=2,'rubbery bounces');
assert.ok(events.some(e=>e.sound==='talk'),'grumbling at the driver');
assert.ok(t<25,`back within ${t.toFixed(1)} s`);
assert.ok(far<25,`not thrown out of sight: ${far.toFixed(1)} m`);
// Home again: same spot, same heading, standing.
const home=world(0,0,0),now=new THREE.Vector3();
let back=Infinity;scene.traverse(o=>{if(o.isBone&&o.name==='Lugar'){o.getWorldPosition(now);back=Math.min(back,now.distanceTo(home));}});
assert.ok(back<.01,`back on the spot (${back.toFixed(3)} m)`);
let yawOk=false;scene.traverse(o=>{if(o.isBone&&o.name==='Lugar'&&o.getWorldPosition(new THREE.Vector3()).distanceTo(home)<.01)yawOk=Math.abs(o.rotation.y-.3)<1e-6&&Math.abs(o.rotation.x)<1e-6&&Math.abs(o.rotation.z)<1e-6;});
assert.ok(yawOk,'facing the same way, upright');
console.log('crowd:',{apex:+apex.toFixed(2),far:+far.toFixed(1),seconds:+t.toFixed(1),bounces:events.filter(e=>e.sound==='boing').length});

// The Box 99 crew: actors in the world frame fly too and then carry on with their job.
{
 const homes=Array.from({length:6},(_,i)=>({x:i*10,y:0,yaw:0,pose:'stand'}));
 // The lollipop and the 99 on the backs are canvas textures: any 2D context will do here.
 const paint=new Proxy({},{get:(o,k)=>k==='measureText'?()=>({width:10}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
 globalThis.document={createElement:()=>({getContext:()=>paint})};
 const crew=new PitCrew(people,{homes,ground:()=>0});scene.add(crew.root);delete globalThis.document;
 const idleCar={x:100,y:100,heading:0,vx:0,vy:0};
 for(let i=0;i<30;i++)crew.update(1/60,{car:idleCar,active:false,near:true});
 const who=crew.actors[2],from=who.person.position.clone();
 assert.equal(hitPeople({x:who.x-1.5,y:who.y,z:.52,heading:0,vx:12,vy:0}),1,'the crew member is hit');
 let top=0,phases=new Set();
 for(let i=0;i<60*20&&(who.tumble||i<2);i++){crew.update(1/60,{car:idleCar,active:false,near:true});if(who.tumble)phases.add(who.tumble.phase);top=Math.max(top,who.person.position.y);}
assert.ok(!who.tumble&&top>2&&phases.has('lie'),`the mechanic flew (${top.toFixed(1)} m) and got up`);
 for(let i=0;i<60*8;i++)crew.update(1/60,{car:idleCar,active:false,near:true});
 assert.ok(who.person.position.distanceTo(from)<.1,'and walked back to his place');
 assert.ok(Math.abs(who.person.rotation.x)<1e-6&&Math.abs(who.person.rotation.z)<1e-6,'standing upright');
}
console.log('atropelamento: ok');
