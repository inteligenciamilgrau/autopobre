import assert from 'node:assert/strict';
import {CarAudio} from '../teste/car-audio.js';
const audio=new CarAudio(),car={vx:0,vy:0,surface:{onRoad:true}};
function update(speed,command={},skid=0,paused=false){car.vx=speed/3.6;return audio.update(car,command,skid,paused,'chase');}
update(30);assert.equal(audio.shifts,0);assert.equal(audio.state.gear,1);
update(44);assert.equal(audio.shifts,1);assert.equal(audio.state.gear,2);
for(let i=0;i<100;i++)update(i%2?41:43);
assert.equal(audio.shifts,1,'Threshold jitter must not cause repeated shift sounds');
update(39);assert.equal(audio.shifts,2);assert.equal(audio.state.gear,1);
update(0,{},1);assert.equal(audio.state.skid,0,'No tyre squeal while parked');
car.surface.onRoad=false;update(60,{},1);assert.equal(audio.state.skid,0,'No asphalt squeal on grass');
car.surface.onRoad=true;update(60,{},.8);assert.equal(audio.state.skid,.8);
const rpm=audio.state.rpm,shifts=audio.shifts;update(150,{},0,true);assert.equal(audio.state.rpm,rpm);assert.equal(audio.shifts,shifts);
audio.reset();update(120);assert.equal(audio.shifts,shifts,'Reset must not produce a phantom shift');
update(10,{reverse:1});assert.equal(audio.state.gear,'R');assert(Number.isFinite(audio.state.rpm));
update(0,{throttle:1});assert.equal(audio.state.gear,'N');assert(audio.state.rpm>3000);
console.log('Audio state passed: shifts, hysteresis, stationary/grass tyres, pause, reset, reverse and revving.');
