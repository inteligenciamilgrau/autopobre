import assert from 'node:assert/strict';
import {LookBack,turnHead,neckTwist,NECK_TWIST,HEAD_YAW_COCKPIT,HEAD_YAW_HOOD,HEAD_PITCH} from '../teste/camera-return.js';
const close=(a,b,msg,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${msg}: ${a} != ${b}`);
let n=0;const check=(...a)=>{close(...a);n++;};const ok=(v,msg)=>{assert.ok(v,msg);n++;};

// Mouse look: the cockpit reaches straight back and stops there; the hood keeps its limit.
const look={yaw:0,pitch:0};
for(let i=0;i<40;i++)turnHead(look,100,0,HEAD_YAW_COCKPIT);
check(look.yaw,Math.PI,'cockpit mouse stops at +pi');
for(let i=0;i<80;i++)turnHead(look,-100,0,HEAD_YAW_COCKPIT);
check(look.yaw,-Math.PI,'cockpit mouse stops at -pi');
const hood={yaw:0,pitch:0};for(let i=0;i<40;i++)turnHead(hood,100,-100,HEAD_YAW_HOOD);
check(hood.yaw,1.45,'hood keeps +-1.45');check(hood.pitch,HEAD_PITCH[1],'pitch limit up');
turnHead(hood,0,10000,HEAD_YAW_HOOD);check(hood.pitch,HEAD_PITCH[0],'pitch limit down');
// Continuous: one pixel of mouse is one small step all the way round, no jump near the stop.
const sweep={yaw:0,pitch:0};let last=0,worst=0;for(let i=0;i<1300;i++){turnHead(sweep,1,0,HEAD_YAW_COCKPIT);worst=Math.max(worst,Math.abs(sweep.yaw-last));last=sweep.yaw;}
ok(worst<=.0025+1e-12,'no jump while turning round');

// Neck and torso twist: exactly zero ahead (verificar_cockpit.py checks the default eye),
// grows smoothly past ~70 degrees, the same both ways, toward the car centre (+Z), forward and up.
assert.deepEqual(neckTwist(0),[0,0,0]);n++;
assert.deepEqual(neckTwist(1.0),[0,0,0]);n++;
const back=neckTwist(Math.PI);for(let i=0;i<3;i++)check(back[i],NECK_TWIST[i],'full twist '+i);
ok(back[0]>0&&back[1]>0&&back[2]>0,'forward, up and toward +Z');
ok(back[2]<=.1&&back[0]<=.1&&back[1]<=.05,'a few centimetres only');
assert.deepEqual(neckTwist(-2.3),neckTwist(2.3));n++;
let prev=0,maxStep=0,monotonic=true;for(let i=0;i<=1000;i++){const z=neckTwist(i/1000*Math.PI)[2];monotonic&&=z>=prev-1e-15;maxStep=Math.max(maxStep,z-prev);prev=z;}
ok(monotonic,'the eye only moves further in as the head turns');
ok(maxStep<.001,'continuous eye shift');

// Held look-back: eases round in ~0.18 s, holds, and returns to the look it left.
const view={yaw:.3,pitch:.1},lb=new LookBack();
let out=lb.update(0,false,view);check(out.yaw,.3,'idle keeps the mouse look');check(out.pitch,.1,'idle pitch');
out=lb.update(.09,true,view);ok(out.yaw>.3&&out.yaw<Math.PI,'half way round after 0.09 s');ok(lb.held,'held flag');
out=lb.update(.09,true,view);check(lb.amount,1,'fully round after 0.18 s');check(out.yaw,Math.PI,'straight back over the centre');check(out.pitch,lb.pitch,'slightly down');
ok(lb.pitch<0&&lb.pitch>-.4,'look-back pitch is a gentle downward tilt');
for(let i=0;i<30;i++)out=lb.update(1/60,true,view);check(out.yaw,Math.PI,'holds while the key is down');
out=lb.update(.05,false,view);ok(out.yaw<Math.PI&&out.yaw>.3,'easing back');ok(!lb.held,'released');
out=lb.update(.2,false,view);check(lb.amount,0,'back');check(out.yaw,.3,'returns to the previous yaw');check(out.pitch,.1,'returns to the previous pitch');
// Ease timing: 0.15-0.2 s, smooth start and finish (no snap).
ok(lb.time>=.15&&lb.time<=.2,'ease time');
const s=new LookBack();s.update(.01,true,{yaw:0,pitch:0});const early=s.amount;ok(early>0&&early<.02,'soft start');
// Side: over the passenger side (+Z) unless already looking back over the left shoulder.
const left=new LookBack();out=left.update(1,true,{yaw:-2.5,pitch:0});check(out.yaw,-Math.PI,'keeps the left shoulder');
const ahead=new LookBack();out=ahead.update(1,true,{yaw:-.4,pitch:0});check(out.yaw,Math.PI,'turns over the car centre');
// Re-pressing while easing back keeps turning the same way (no swing through the front).
const again=new LookBack();again.update(1,true,{yaw:-2.5,pitch:0});again.update(.05,false,{yaw:-2.5,pitch:0});again.update(.01,true,{yaw:0,pitch:0});check(again.side,-1,'same side on re-press');
again.reset();check(again.amount,0,'reset');ok(!again.held,'reset releases');
// The eye follows the drawn yaw: fully back means the full twist, yaw 0 means the fixed mount.
assert.deepEqual(neckTwist(new LookBack().update(0,false,{yaw:0,pitch:0}).yaw),[0,0,0]);n++;
console.log(`Look back: ${n} assertions passed.`);
