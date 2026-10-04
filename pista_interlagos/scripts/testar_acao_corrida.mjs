import assert from 'node:assert/strict';
import {RaceAction} from '../teste/race-action.js';

const vehicle=(options={})=>({x:0,y:0,z:0,heading:0,vx:40,vy:0,surface:{onRoad:true,z:0},...options});
function pass(options={}){
 const action=new RaceAction(),car=vehicle(),rival=vehicle({x:15,y:2.2,vx:30,...options});
 const events=[];
 for(let step=0;step<70;step++){
  car.x+=car.vx*.05;rival.x+=rival.vx*.05;
  action.update(.05,{car,rivals:[{car:rival}]});
  if(action.event)events.push(action.event);
 }
 return {action,events};
}
assert.deepEqual(pass().events.map(e=>e.kind),['near'],'a close clean pass produces one cue');
assert.deepEqual(pass({y:1.5}).events,[],'overlapping bodies never count as a clean pass');
assert.deepEqual(pass({y:5}).events,[],'a wide ordinary pass is not a near miss');
assert.deepEqual(pass({z:5}).events,[],'cars on another elevation are ignored');
assert.deepEqual(pass({heading:Math.PI}).events,[],'opposing traffic is ignored');
assert.deepEqual(pass({surface:{onRoad:false,z:0}}).events,[],'passing a car off the track is not a clean close duel');

{
 const action=new RaceAction(),car=vehicle(),rival=vehicle({y:2.2});let duels=0;
 for(let i=0;i<100;i++){car.x+=2;rival.x+=2;action.update(.05,{car,rivals:[rival]});if(action.event?.kind==='duel')duels++;}
 assert.equal(duels,1,'sustained side-by-side racing emits once');
 action.update(.05,{car,rivals:[rival],impact:12});
 assert(action.impact>0&&action.near.size===0,'collision clears any armed clean pass');
 action.update(.05,{car,rivals:[rival],active:false});
 assert.equal(action.impact,0);assert.equal(action.surge,0);assert.equal(action.near.size,0);
}
{
 const action=new RaceAction(),car=vehicle(),rival=vehicle({x:8,y:2.2,vx:40,vy:8});
 // A lateral correction changes projection without gaining on the rival. Even with
 // a previous close sample, relative sideways speed must not trigger an overtake.
 for(const ahead of [8,2,-2,-6]){rival.x=ahead;action.update(.05,{car,rivals:[rival]});assert.equal(action.event,null);}
}
{
 const action=new RaceAction(),car=vehicle(),rival=vehicle({x:8,y:2.2,vx:30});
 for(const [ahead,side] of [[8,2.2],[2,2.2],[0,5],[-6,2.2]]){
  rival.x=ahead;rival.y=side;action.update(.05,{car,rivals:[rival]});assert.equal(action.event,null,'leaving the corridor cancels a stale near miss');
 }
 rival.x=car.x+10;action.update(.05,{car,rivals:[rival]});car.x+=100;
 action.update(.05,{car,rivals:[rival]});assert.equal(action.event,null);assert.equal(action.near.size,0,'teleport clears old proximity candidates');
}
{
 const action=new RaceAction(),car=vehicle(),rival=vehicle({x:8,y:2.2,vx:30});
 for(const [ahead,impact] of [[8,0],[3,0],[1,2],[-3,0],[-6,0]]){
  rival.x=ahead;action.update(.05,{car,rivals:[rival],impact});assert.equal(action.event,null,'a gentle body contact invalidates a clean pass');
 }
 assert.equal(action.impact,0,'a gentle contact does not create an exaggerated camera impact');
}
{
 const action=new RaceAction(),car=vehicle();
 action.update(.05,{car});car.vx-=.5;action.update(.05,{car});assert(action.braking>0,'hard deceleration provides a smooth braking signal');
 action.update(.05,{car,impact:14});assert.equal(action.event?.kind,'impact');
 action.update(.05,{car,impact:14});assert.equal(action.event,null,'impact cooldown prevents repeated notices');
}
console.log('Acao da corrida: passagem, duelo, impacto e rejeicao de falsos positivos OK.');
