import assert from 'node:assert/strict';
import {ImmersiveState} from '../teste/immersive-state.js';
for(const outcome of ['loss','win','dq']){
 const s=new ImmersiveState({fund:275,races:2});s.start();s.cash=37.5;s.phase='race';
 if(outcome==='loss'){s.fail('Acabou a gasolina');s.beginTow();s.podium();s.leavePodium();s.requestInspection();s.inspectionStep(8);}else{s.finish(1);s.leavePodium();if(outcome==='dq')s.goToBox();else{s.requestInspection();s.inspectionStep(8);}}
 const expected=275+37.5+(outcome==='win'?600:outcome==='loss'?40:0);
 assert.equal(s.profile.fund,expected);assert.equal(s.savedCash,37.5);assert.equal(s.cash,0);
 s.podium();assert.equal(s.profile.fund,expected,'no duplicate transfer');s.start();assert.equal(s.profile.fund,expected,'next race preserves total');
 const reloaded=new ImmersiveState(JSON.parse(JSON.stringify(s.profile)));assert.equal(reloaded.profile.fund,expected,'saved profile preserves total');
}
console.log('Balance passed: previous fund plus unspent cash and prize survive loss, victory, disqualification, new race and reload; never credited twice.');
for(let position=7;position<=15;position++){
 const s=new ImmersiveState({fund:275,races:2});s.start();s.cash=37.5;s.phase='race';s.finish(position);
 assert.equal(s.result.position,position);assert.equal(s.podiumPlace,6,'immersive joke remains sixth');
 assert(Number.isFinite(s.profile.fund)&&s.profile.fund>=275+37.5+40,'expanded field always receives a finite prize');
}
