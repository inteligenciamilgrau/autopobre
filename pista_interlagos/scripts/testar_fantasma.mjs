// Ghost lap (G): the recorder keeps whole laps that count, the replay follows the car on them, the
// saved laps stay small, one per pilot, circuit and mode, and the ghost's shell sits where the car does.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {TestCar} from '../teste/physics.js';
import {RaceField} from '../teste/race-field.js';
import {GhostRecorder,GhostLap,encodeGhost,decodeGhost,saveGhost,loadGhost,readGhosts,GHOST_KEY,GHOST_LIMIT,GHOST_RATE} from '../teste/ghost-lap.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url))),L=data.meta.reconstructed_xy_m;
const memory=(limit=Infinity)=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem(k,v){if(v.length>limit)throw new Error('QuotaExceededError');values.set(k,v);}};};

// Two laps alone on track with the recon lap's racecraft: the first from the grid, the second flying.
// Every step's real pose is kept to check the replay against it.
const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed:3});field.reset(car.surface.s,{grid:true,entrants:[]});
// The game asks the recorder at every step, the countdown's too: the grid lap is seen from its first instant.
const recorder=new GhostRecorder(),laps=[],truth=[];recorder.step(car,true);
for(let step=0;step<120*400&&laps.length<2;step++){
 car.step(field.heroInput(car,1/120),1/120);field.step(car,1/120,3);
 const lap=recorder.step(car,true);if(lap)laps.push(lap);
 const p=car.pose(0);truth.push({lapStart:car.lapStart,t:car.clock-car.lapStart,x:p.x,y:p.y,z:p.z,heading:car.heading,pitch:car.pitch,roll:car.roll});
}
assert.equal(laps.length,2,'both laps that counted were recorded');assert.equal(car.laps,2);
const [first,second]=laps;
assert.ok(Math.abs(first.time-(truth.find(s=>s.lapStart>0).lapStart))<1e-9,'the first lap is timed from the grid, as the game times it');
assert.ok(second.time<first.time&&Math.abs(second.time-car.lastLap)<1e-9,'the flying lap is the faster one');
for(const lap of laps){
 const n=lap.values.length/7;assert.equal(n,Math.ceil(lap.time*GHOST_RATE-1e-9)+1,'20 samples a second plus the one on the line');
 assert.ok(lap.values[(n-1)*7+6]>L-20&&lap.values[(n-1)*7+6]<L+20,'the track distance runs one lap');
}
assert.ok(first.values[6]<0&&second.values[6]>=0&&second.values[6]<16,'the grid lap starts behind the line, the flying one on it');

// The replay follows the car within a couple of centimetres between its 20 Hz samples.
const replay=new GhostLap(second),flying=truth.filter(s=>Math.abs(s.lapStart-(car.lapStart-second.time))<1e-9);
let worst=0,worstAngle=0;
for(const s of flying){const p=replay.poseAt(s.t);worst=Math.max(worst,Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z));worstAngle=Math.max(worstAngle,...['heading','pitch','roll'].map(k=>Math.abs(Math.atan2(Math.sin(p[k]-s[k]),Math.cos(p[k]-s[k])))));}
assert.ok(flying.length>second.time*119,'the flying lap was kept step by step');
assert.ok(worst<.03&&worstAngle<.01,`replay off by ${worst.toFixed(3)} m and ${worstAngle.toFixed(4)} rad`);
const end=replay.poseAt(second.time+5);assert.ok(Math.hypot(end.x-car.pose(0).x,end.y-car.pose(0).y)<1e-6,'after its line the ghost stays there');
assert.ok(Math.hypot(replay.poseAt(-2).x-flying[0].x,replay.poseAt(-2).y-flying[0].y)<.6,'before the clock runs it waits at its start');
// The gap: the lap against itself is level all the way round; ahead of it, negative.
let level=0;for(const s of flying.filter((_,i)=>i%240===0)){const k=Math.floor(s.t*GHOST_RATE),at=replay.poseAt(k/GHOST_RATE).progress;level=Math.max(level,Math.abs(replay.timeAt(at)-k/GHOST_RATE));}
assert.ok(level<1e-6,'the lap is level with itself');
assert.ok(replay.timeAt(L/2)-replay.timeAt(L/4)>0&&replay.timeAt(-50)===0&&replay.timeAt(L*2)===second.time);

// Stored as 16-bit steps: ~40 kB a lap, back within 6 mm and 1e-4 rad.
const encoded=encodeGhost(second),text=JSON.stringify(encoded),decoded=decodeGhost(JSON.parse(text));
assert.ok(text.length<60000,`saved lap is ${text.length} characters`);
assert.equal(decoded.n,replay.n);assert.equal(decoded.time,second.time);
let drift=0;for(let i=0;i<decoded.values.length;i++){const f=i%7;drift=Math.max(drift,Math.abs(decoded.values[i]-second.values[i])*(f>=3&&f<=5?100:1));}
assert.ok(drift<.006,`quantization drift ${drift}`);
for(const broken of [{...encoded,v:2},{...encoded,n:encoded.n+1},{...encoded,data:encoded.data.slice(8)},{...encoded,time:-1},{...encoded,start:[1,2]},{...encoded,data:'@@@'},null,'x'])assert.equal(decodeGhost(broken),null);
// A lap from elsewhere: data longer than its samples, or a car 10 000 km away or turned 1e6 rad, is no lap.
for(const broken of [{...encoded,data:encoded.data+'AAAA'},{...encoded,data:encoded.data+'A'.repeat(1e6)},{...encoded,start:[1e9,...encoded.start.slice(1)]},{...encoded,start:[...encoded.start.slice(0,3),1e10,...encoded.start.slice(4)]}])assert.equal(decodeGhost(broken),null);
const jump={...second,values:Float64Array.from(second.values)};jump.values[7*10]+=400;assert.equal(encodeGhost(jump),null,'a 400 m jump in 1/20 s is no lap');

// The recorder keeps only laps the pilot drove whole, and starts over when the car goes back to the grid.
function drive(options){
 const c=new TestCar(data);c.resetGrid();const f=new RaceField(data,{seed:3});f.reset(c.surface.s,{grid:true,entrants:[]});
 const r=new GhostRecorder(),got=[];let seen=c.lapStart;if(options.paddock)for(let i=0;i<240;i++)r.step(c,false);else if(!options.lateStart)r.step(c,true);else for(let i=0;i<600;i++){c.step(f.heroInput(c,1/120),1/120);f.step(c,1/120,3);}
 for(let step=0;step<120*400&&c.laps<2;step++){
  c.step(f.heroInput(c,1/120),1/120);f.step(c,1/120,3);
  // flagged: the step onto the line ends the driving (the flag), as the race's last lap does.
  const crossing=c.lapStart!==seen;seen=c.lapStart;
  const lap=r.step(c,!(options.helped&&c.laps===1&&c.clock-c.lapStart>30&&c.clock-c.lapStart<31)&&!(options.flagged&&crossing));if(lap)got.push(lap.time);
  if(options.restart&&step===120*20){c.resetGrid();f.reset(c.surface.s,{grid:true,entrants:[]});r.step(c,true);}
 }
 return {got,best:c.best,laps:c.lastLap};
}
assert.equal(drive({helped:true}).got.length,1,'a second of autopilot leaves that lap out');
assert.equal(drive({lateStart:true}).got.length,1,'a lap the recorder joined late is left out');
assert.equal(drive({flagged:true}).got.length,2,'the last lap counts though its flag ends the driving');
assert.equal(drive({paddock:true}).got.length,2,'steps with the clock stopped (the story paddock, the 3-2-1) leave the grid lap in');
{const run=drive({restart:true});assert.equal(run.got.length,2,'back on the grid, the recording starts over');}

// Saved laps: one per pilot (any case), circuit and mode; only a faster lap replaces it.
const storage=memory(),key={circuit:'interlagos',mode:'normal',pilot:'Stevan'};
assert.equal(loadGhost(storage,key),null);
assert.ok(saveGhost(storage,{...key,lap:first}),'the first lap is saved');
assert.equal(saveGhost(storage,{...key,pilot:'STEVAN',lap:{...first,time:first.time+1}}),null,'a slower lap keeps the ghost');
assert.ok(saveGhost(storage,{...key,pilot:'  stevan ',lap:second}),'a faster lap replaces it');
assert.equal(readGhosts(storage).length,1);assert.equal(loadGhost(storage,{...key,pilot:'STEVAN'}).time,second.time);
assert.ok(saveGhost(storage,{...key,mode:'immersive',lap:first})&&saveGhost(storage,{...key,pilot:'Outra',lap:first})&&saveGhost(storage,{...key,circuit:'curvelo',lap:first}));
assert.equal(readGhosts(storage).length,4,'modes, pilots and circuits stay apart');
assert.equal(loadGhost(storage,{...key,mode:'immersive'}).time,first.time);
// The Fusca (its own mechanics) keeps its own lap: a slower one beside the Opala's, which laps without a car are.
assert.ok(first.time>second.time&&saveGhost(storage,{...key,car:'fusca',lap:first}),'a Fusca lap is not measured against the Opala ghost');
assert.equal(readGhosts(storage).length,5);assert.equal(loadGhost(storage,{...key,car:'fusca'}).time,first.time);
assert.equal(loadGhost(storage,key).time,second.time);assert.equal(loadGhost(storage,{...key,car:'opala'}).time,second.time);
for(const bad of [{...key,circuit:'../x'},{...key,mode:'tour'},{...key,pilot:'  '},{...key,car:'kombi'}])assert.equal(saveGhost(storage,{...bad,lap:first}),null);
assert.equal(saveGhost(null,{...key,lap:first}),null);
// The newest GHOST_LIMIT laps stay; a full browser drops the oldest until the new one fits.
const many=memory();for(let i=0;i<GHOST_LIMIT+6;i++)saveGhost(many,{...key,pilot:`Piloto ${i}`,lap:second},new Date(Date.UTC(2026,9,1,0,i)));
const kept=readGhosts(many);assert.equal(kept.length,GHOST_LIMIT);assert.ok(kept.some(g=>g.pilot===`Piloto ${GHOST_LIMIT+5}`)&&!kept.some(g=>g.pilot==='Piloto 0'),'the oldest went first');
const size=JSON.stringify(readGhosts(many).slice(0,3)).length,small=memory(size+100);for(let i=0;i<3;i++)saveGhost(small,{...key,pilot:`P${i}`,lap:second},new Date(Date.UTC(2026,9,1,0,i)));
assert.ok(saveGhost(small,{...key,pilot:'Nova',lap:second},new Date(Date.UTC(2026,9,2))),'room made for the new lap');
assert.ok(readGhosts(small).some(g=>g.pilot==='Nova')&&!readGhosts(small).some(g=>g.pilot==='P0'));
assert.equal(saveGhost(memory(100),{...key,lap:second}),null,'no room even alone: not saved');
assert.deepEqual(readGhosts({getItem:()=>'{broken'}),[]);assert.deepEqual(readGhosts({getItem:()=>JSON.stringify([{circuit:'interlagos',mode:'normal',pilot:{},time:1,data:''}])}),[]);
{const s=memory();s.setItem(GHOST_KEY,JSON.stringify([{...encodeGhost(second),circuit:'interlagos',mode:'normal',pilot:'Stevan',data:'AAAA'}]));assert.ok(saveGhost(s,{...key,lap:{...second,time:second.time+9}}),'an unreadable ghost is replaced');}
// The name and date come out as plain text: the name cleaned, a date that is not a string empty.
{const s=memory();s.setItem(GHOST_KEY,JSON.stringify([{...encodeGhost(second),circuit:'interlagos',mode:'normal',pilot:' Stevan\u0000\u001b ',date:{toString:'x'}}]));
 const got=loadGhost(s,key);assert.equal(got.pilot,'Stevan');assert.equal(got.date,'');}

// The shell: a pose of the replay places it as main.js places the player's car from TestCar.pose.
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>null})};
const {GhostCar}=await import('../teste/ghost-car.js');
const template=new THREE.Group(),box=new THREE.Mesh(new THREE.BoxGeometry(4.6,1.4,1.8)),hidden=new THREE.Mesh(new THREE.BoxGeometry(1,1,1)),inner=new THREE.Mesh(new THREE.BoxGeometry(1,1,1).toNonIndexed());
box.position.y=.7;hidden.visible=false;inner.userData.interno=true;template.add(box,hidden,inner,new THREE.Mesh(new THREE.PlaneGeometry(1,1).toNonIndexed()));
const ghost=new GhostCar();assert.ok(ghost.build(template));assert.equal(ghost.triangles,12+2,'hidden and inside parts are left out');
car.heading=.7;car.pitch=.08;car.roll=-.12;car.z+=.3;
const pose=car.pose(0),forward=new THREE.Vector3(pose.forward[0],pose.forward[2],-pose.forward[1]),up=new THREE.Vector3(pose.up[0],pose.up[2],-pose.up[1]),side=new THREE.Vector3().crossVectors(forward,up).normalize();
const expected=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward,up,side));
ghost.place({x:pose.x,y:pose.y,z:pose.z,heading:car.heading,pitch:car.pitch,roll:car.roll});
assert.ok(ghost.body.quaternion.angleTo(expected)<1e-6&&ghost.body.position.distanceTo(new THREE.Vector3(pose.x,pose.z,-pose.y))<1e-9,'the ghost sits where the car would');
ghost.setOpacity(0);assert.equal(ghost.root.visible,false);ghost.setOpacity(.5);assert.equal(ghost.root.visible,true);
ghost.detail(200);assert.ok(ghost.near.visible&&!ghost.far,'with no distant profile the shell always shows');
const detailed=new GhostCar();detailed.build(template,new THREE.BoxGeometry(4.6,1.4,1.8).toNonIndexed());
detailed.detail(20);assert.ok(detailed.near.visible&&!detailed.far.visible);detailed.detail(80);assert.ok(!detailed.near.visible&&detailed.far.visible,'far away the distant profile takes over');
// One shell per car model: the one raced shows (the Fusca has no distant profile: always its shell).
const fusca=new THREE.Group();fusca.add(new THREE.Mesh(new THREE.BoxGeometry(4,1.5,1.6)));detailed.build(fusca,null,'fusca');
assert.equal(detailed.model,'opala','building another model keeps the one shown');detailed.use('fusca');detailed.detail(80);
assert.ok(detailed.has('fusca')&&detailed.model==='fusca'&&detailed.near.visible&&detailed.triangles===12&&!detailed.shells.get('opala').near.visible&&!detailed.shells.get('opala').far.visible);
detailed.use('kombi');assert.equal(detailed.model,'fusca','a model never built keeps the one shown');detailed.use('opala');assert.equal(detailed.triangles,14);

console.log(`Ghost lap passed: laps ${first.time.toFixed(2)} s (grid) and ${second.time.toFixed(2)} s recorded whole, replay within ${(worst*100).toFixed(1)} cm, ${(text.length/1000).toFixed(1)} kB a lap, one per pilot/circuit/mode/car, faster replaces, oldest out, autopilot and late laps left out, shell placed as the car.`);
