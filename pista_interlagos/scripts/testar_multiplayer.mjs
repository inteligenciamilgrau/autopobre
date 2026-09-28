// Multiplayer test version (teste/multiplayer.js): the room protocol, message checks, remote-car
// prediction under network delay, and RaceField's remote and ghost cars.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room,roomParams,roomName,playerName,validMessage,SEATS,HOST_NUMBER} from '../teste/net-room.js';
import {RemoteCar,packCar,readCar,CAR_FIELDS} from '../teste/net-cars.js';
import {RaceField} from '../teste/race-field.js';
import {AutomaticAIRecords,readAIRecords} from '../teste/ai-records.js';
import {TestCar,recognitionInput} from '../teste/physics.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const wait=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const report={};

// --- The address: #sala=NOME and its options.
{
 const p=roomParams('#sala=Teste Óla&carro=73&auto=1&lag=150&perda=5');
 assert.deepEqual(p,{room:'testeola',car:'73',auto:true,ghosts:false,lag:150,loss:.05});
 assert.equal(roomParams('#sala=a&fantasmas=1').ghosts,true,'humans pass through each other only when asked');
 assert.equal(roomParams('#carro=73'),null,'no room without sala');
 assert.equal(roomParams('#sala=%20%20'),null);
 assert.equal(roomParams('#sala=a&carro=99').car,null,'the 99 is always the host');
 assert.equal(roomParams('#sala=a&carro=1234').car,null);
 assert.equal(roomParams('#sala=a&lag=-50').lag,0);assert.equal(roomParams('#sala=a&lag=1e9').lag,1000);assert.equal(roomParams('#sala=a&perda=90').loss,.5);
 assert.equal(roomName('x'.repeat(40)).length,24);
 assert.equal(playerName('  Bia‮​ <b>oi</b>\n\t  '),'Bia <b>oi</b>','control and format characters go, text stays text');
 assert.equal(playerName('a'.repeat(80)).length,24);
 assert.equal(SEATS.length,15);assert.equal(SEATS[0],HOST_NUMBER);
}

// --- A car on the wire: packed, read back, anything malformed refused.
{
 const car=new TestCar(data);car.reset(300);car.vx=30;car.spin=1234.5;car.heading=9;
 const packed=packCar(car,{progress:812.3456,finished:true,finishTime:95.5,brake:.4,throttle:1});
 assert.equal(packed.length,CAR_FIELDS.length);
 const s=readCar(packed);assert(s);assert.equal(s.vx,30);assert.equal(s.progress,812.346);assert.equal(s.finished,true);assert.equal(s.retired,false);assert.equal(s.finishTime,95.5);
 const out=readCar(packCar(car,{retired:true}));assert(out.retired&&!out.finished,'a retired bot never counts as finished');
 assert(Math.abs(s.heading)<=Math.PI&&s.spin>=0&&s.spin<2*Math.PI,'angles wrapped');
 assert.equal(readCar(packCar(car)).finishTime,null);
 assert.equal(packCar(car,{still:true})[CAR_FIELDS.indexOf('vx')],0,'a held car is sent at rest');
 for(const bad of [null,'x',[],packed.slice(1),[...packed,0],packed.map((v,i)=>i===0?NaN:v),packed.map((v,i)=>i===1?Infinity:v),packed.map((v,i)=>i===2?'1':v),packed.map((v,i)=>i===6?1e6:v)])assert.equal(readCar(bad),null);
}

// --- Prediction: a remote car 100 ms behind its owner, 30 states a second, on Interlagos.
{
 // Each physics step drives the remote car to the end of that step, as RaceField does, and
 // compares it with the owner's car there; "as sent" shows the last state where it was sent.
 const stats=list=>{list.sort((a,b)=>a-b);return {mean:+(list.reduce((a,b)=>a+b,0)/list.length).toFixed(3),p95:+list[Math.floor(list.length*.95)].toFixed(3),max:+list.at(-1).toFixed(3)};};
 const run=latency=>{
  const truth=new TestCar(data),shadow=new TestCar(data);truth.reset(40);shadow.reset(40);const remote=new RemoteCar(truth);
  const dt=1/120,queue=[],errors=[],asSent=[];let t=0,seq=0,last=null,top=0;
  for(let step=0;step<120*40;step++){
   while(queue.length&&queue[0].at<=t+1e-9){last=queue.shift();remote.receive(last.state,{age:t-last.sent,seq:last.seq});}
   remote.drive(shadow,dt);truth.step(recognitionInput(truth,{maxSpeed:48,cornerGrip:9,braking:9}),dt);t+=dt;top=Math.max(top,Math.hypot(truth.vx,truth.vy));
   if(step%4===0)queue.push({sent:t,at:t+latency,seq:++seq,state:readCar(packCar(truth))});
   if(t>4&&last){errors.push(Math.hypot(shadow.x-truth.x,shadow.y-truth.y));asSent.push(Math.hypot(last.state.x-truth.x,last.state.y-truth.y));}
  }
  return {predicted:stats(errors),asSent:stats(asSent),topSpeedKmh:Math.round(top*3.6)};
 };
 const near=run(.03),far=run(.1);
 report.prediction={lag30ms:near,lag100ms:far};
 assert(near.predicted.mean<.15&&near.predicted.p95<.3,`30 ms: ${JSON.stringify(near)}`);
 assert(far.predicted.mean<.4&&far.predicted.p95<.8,`100 ms: ${JSON.stringify(far)}`);
 assert(far.asSent.mean>far.predicted.mean*3,'carrying the state on beats showing it where it was sent');
}

// --- The room: two windows (two Room objects on one BroadcastChannel name), a fake clock.
{
 // Time moves in frame-sized ticks: a long gap between two ticks is a frozen window (net-room.js).
 let now=0;const clock=()=>now,name='verif-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const events=[],A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia‮',want:'19',clock});
 A.on('race',()=>events.push('A race'));B.on('race',race=>{events.push('B race '+race.circuit);return true;}).on('go',race=>events.push('B go '+race.seats.length));
 A.on('state',(id,m)=>events.push(`A state ${id===B.id} ${m.seq}`)).on('leave',p=>events.push('A leave '+p.number));B.on('snap',m=>events.push(`B snap ${m.cars.length}`));
 A.start();await wait();advance([A],1);assert.equal(A.role,'host','alone in the room: hosts it');assert.equal(A.number,HOST_NUMBER);
 B.start();await wait();await wait();
 assert.equal(B.role,'guest');assert.equal(B.hostId,A.id);assert.equal(B.number,'19','the car asked for');assert.equal(B.name,'Bia');
 assert.deepEqual(A.members.map(m=>m.number),['99','19']);
 const race=A.planRace({circuit:'interlagos',laps:2,ace:true,level:'medio'});
 assert.deepEqual(race.seats.map(s=>s.number),['99','19']);assert(Number.isInteger(race.seed));
 A.openRace(race);await wait();
 assert.equal(race.state,'waiting','the start waits for the guest');assert.deepEqual(events,['B race interlagos']);assert.equal(B.race.id,race.id);assert.equal(B.race.level,'medio');
 B.sendReady();await wait();await wait();
 assert.equal(race.state,'waiting','ready is not the start: the host gives it');assert(A.ready.has(B.id));
 // A third window arrives while the start waits: it is seated and gets the race too.
 const C=new Room({room:name,name:'Caio',clock}),late=[];let seatsA=0,seatsB=0;
 A.on('seats',()=>seatsA++);B.on('seats',()=>seatsB++);C.on('race',race=>{late.push('race '+race.id);return true;}).on('go',race=>late.push('go '+race.seats.length));
 C.start();await wait();await wait();await wait();
 assert.deepEqual(race.seats.map(s=>s.number),['99','19','73']);assert(seatsA>0&&seatsB>0,'host and guests hear the new seat');
 assert.deepEqual(late,['race '+race.id]);assert.deepEqual(B.race.seats.map(s=>s.number),['99','19','73']);
 // Lights out before Caio has the track loaded: he races the next one; Bia and the host go.
 A.lightsOut();await wait();await wait();
 assert.equal(race.state,'racing');assert(events.includes('B go 2'));assert.deepEqual(race.seats.map(s=>s.number),['99','19']);
 assert.deepEqual(late,['race '+race.id,'go 2'],'Caio hears the start without a seat in it');
 const car=new TestCar(data);car.reset(10);
 B.sendState(packCar(car),1);A.sendSnapshot([[HOST_NUMBER,0,packCar(car)],['19',.05,packCar(car)]],1);await wait();
 assert(events.includes('A state true 1')&&events.includes('B snap 2'));
 // A forged or broken message changes nothing and reaches no one.
 const raw=new BroadcastChannel('autopobre-sala-'+name),before=events.length;
 raw.postMessage({t:'state',from:B.id,race:race.id,seq:2,lat:0,car:packCar(car).map((v,i)=>i?v:NaN)});
 raw.postMessage({t:'state',from:B.id,race:race.id,seq:3,lat:0,car:[1,2,3]});
 raw.postMessage({t:'lobby',from:'00000000',name:'x',players:Array.from({length:99},()=>({id:'00000001',name:'x',number:'73'})),race:null});
 raw.postMessage({t:'snap',from:A.id,race:race.id,seq:9,cars:[['666',0,packCar(car)]]});
 raw.postMessage({t:'go',from:'zz',race:race.id,seats:[]});
 raw.postMessage({t:'eval',from:A.id,code:'alert(1)'});
 await wait(30);assert.equal(events.length,before,'forged messages are dropped');assert.equal(B.hostId,A.id);
 // A flood of valid states is cut at 240 messages a second per sender.
 const valid=packCar(car);let seen=0;A.on('state',()=>seen++);
 for(let i=0;i<400;i++)raw.postMessage({t:'state',from:B.id,race:race.id,seq:100+i,lat:0,car:valid});
 await wait(60);assert(seen>0&&seen<=240,`rate limit: ${seen}`);raw.close();
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42'}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'999'}),false);
 // A frozen host (a track loading) holds nobody's silence against them...
 now=3.5;A.tick();assert.equal(A.members.length,3,'a freeze is not silence');
 // ...but a guest silent for longer than 3 s is let go (its car becomes a bot in the game).
 advance([A],7);assert(events.includes('A leave 19'));assert.equal(A.members.length,1);assert.deepEqual(race.seats.map(s=>s.number),['99']);
 // The host leaves: the guest finds no host and hosts the room itself.
 // The host says goodbye: the guest waits for it (a reload says goodbye too), then elects.
 A.leave();C.leave();await wait();B.tick();assert(B.hostAway&&B.role==='guest','host gone: the guest waits for it first');
 const heard=B.hostSeen;advance([B],heard+10.5);assert.equal(B.role,null,'10 s after the goodbye: a new election');advance([B],heard+11.5);assert.equal(B.role,'host','nobody came back: the guest hosts');B.leave();
 report.room=events.slice(0,6);
}
// Two windows opened at once: both host for a moment, then the smaller id keeps the room.
{
 let now=0;const clock=()=>now,name='dupla-'+Math.random().toString(36).slice(2,8),C=new Room({room:name,name:'C',clock}),D=new Room({room:name,name:'D',clock});
 C.start();D.start();now=1;C.tick();D.tick();await wait();await wait();
 assert.deepEqual([C.role,D.role].sort(),['guest','host']);
 const host=C.role==='host'?C:D;assert(host.id<(host===C?D:C).id);assert.equal(host.members.length,2);
 C.leave();D.leave();
}
// A second window that elects itself before hearing the first (a busy host): the older host keeps
// the room, whatever the ids.
for(let trial=0;trial<6;trial++){
 let now=0;const clock=()=>now,name='tarde-'+Math.random().toString(36).slice(2,8),G=new Room({room:name,name:'G',clock}),H=new Room({room:name,name:'H',clock});
 G.start();now=1;G.tick();assert.equal(G.role,'host');
 H.start();now=3;H.tick();assert.equal(H.role,'host','H elected before hearing anyone');
 await wait();await wait();await wait();
 assert.equal(G.role,'host',`the first host keeps the room (trial ${trial})`);assert.equal(H.role,'guest');assert.equal(H.hostId,G.id);
 G.leave();H.leave();
}
// A lying host: names with bidi overrides and zero-width characters reach a guest cleaned all the same.
{
 let now=0;const clock=()=>now,name='nomes-'+Math.random().toString(36).slice(2,8),H=new Room({room:name,name:'H',clock}),G=new Room({room:name,name:'G',clock});
 G.on('race',()=>true);H.start();now=1;H.tick();G.start();await wait();await wait();assert.equal(G.role,'guest');
 const raw=new BroadcastChannel('autopobre-sala-'+name),dirty='A​na‮ ',seats=[{id:H.id,name:dirty,number:'99'},{id:G.id,name:'G⁦',number:'73'}];
 raw.postMessage({t:'lobby',from:H.id,name:'Ho‮st',age:9,players:seats,race:{id:'0000abcd',circuit:'interlagos',laps:1,seed:1,ace:false,retirements:true,ghosts:false,level:null,seats,state:'waiting'}});
 await wait(30);
 assert.equal(G.lobby.name,'Host');assert.deepEqual(G.lobby.players.map(p=>p.name),['Ana','G']);assert.deepEqual(G.race.seats.map(s=>s.name),['Ana','G']);
 raw.postMessage({t:'go',from:H.id,race:'0000abcd',seats});await wait(30);assert.deepEqual(G.race.seats.map(s=>s.name),['Ana','G']);
 raw.close();H.leave();G.leave();
}
// F5 on the host: its tab keeps the identity, it takes the room back at once and the guest keeps its car.
// A duplicated tab (sessionStorage copied) notices the live twin and takes an identity of its own.
{
 let now=0;const clock=()=>now,name='f5-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),copy(){const t=tab();for(const [k,v] of store)t.setItem(k,v);return t;}};};
 const hostTab=tab(),A=new Room({room:name,name:'Ana',clock,storage:hostTab}),B=new Room({room:name,name:'Bia',want:'19',clock,storage:tab()});
 A.start();advance([A],1);B.start();await wait();await wait();assert.equal(B.number,'19');
 advance([A,B],5);const id=A.id,epoch=A.hostEpoch;
 A.leave();await wait();B.tick();assert(B.hostAway);
 const A2=new Room({room:name,name:'Ana',clock,storage:hostTab});A2.start();
 assert.equal(A2.id,id,'the reloaded tab is the same host');assert.equal(A2.role,'host','it hosts again without an election');
 for(let i=0;i<8;i++){await wait();advance([A2,B],now+.25);}
 assert.equal(B.role,'guest');assert.equal(B.hostId,id);assert(!B.hostAway);assert.equal(B.number,'19','the guest keeps its car');
 assert.equal(A2.hostEpoch,epoch,'the room is as old as before the reload (its age decides a clash of hosts)');
 advance([A2,B],now+4);
 const T=new Room({room:name,name:'Tia',clock,storage:hostTab.copy()});T.start();assert.equal(T.id,id);
 for(let i=0;i<6;i++){await wait();advance([A2,B,T],now+.3);}
 assert.notEqual(T.id,id,'the copy took a new identity');assert.equal(T.role,'guest');assert.equal(A2.role,'host');assert.equal(A2.id,id);assert.equal(B.hostId,id);
 A2.leave();B.leave();T.leave();
}
// A simulated delay only postpones delivery.
{
 const name='lag-'+Math.random().toString(36).slice(2,8),E=new Room({room:name,name:'E',lag:40}),F=new Room({room:name,name:'F'});
 let got=0;E.on('change',()=>got++);F.becomeHost(performance.now()/1000);await wait(10);assert.equal(E.role,null,'not yet');await wait(80);assert.equal(E.role,'guest');assert(got>0);E.leave();F.leave();
}

// --- RaceField: the same seed builds the same grid in every window; remote cars are placed, not
// driven; two remote cars never touch, and neither do two humans (ghost), but a human hits a bot.
{
 const grid=seed=>{const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed});field.ace=true;field.reset(car.surface.s,{grid:true});return {car,field};};
 const a=grid(11),b=grid(11),c=grid(12);
 const pose=f=>f.rivals.map(r=>[r.entry.number,r.car.x,r.car.y,r.car.heading,r.progress]);
 assert.deepEqual(pose(a.field),pose(b.field),'same seed and ace: the same grid');assert.notDeepEqual(pose(a.field),pose(c.field));
 const {car:player,field}=a,r=field.rivals[3],remote=new RemoteCar(r.car,{progress:r.progress});
 let calls=0;r.puppet=(rival,dt)=>{calls++;return remote.drive(rival.car,dt);};r.car.remote=true;
 // Its owner says it rolls forward at 20 m/s: it goes exactly there, not where a bot would steer.
 const s=readCar(packCar(r.car,{progress:r.progress}));s.vx=Math.cos(s.heading)*20;s.vy=Math.sin(s.heading)*20;remote.receive(s,{seq:1});
 const x0=r.car.x,y0=r.car.y;for(let i=0;i<12;i++)field.step(player,1/120);
 assert.equal(calls,12);assert(Math.abs(Math.hypot(r.car.x-x0,r.car.y-y0)-2)<.05,'placed along its own velocity');
 // The player's car runs into the back of another at 8 m/s: a human (ghost) through a remote
 // human car, no contact; into a remote bot or a host's bot, a hit.
 const ram=target=>{const h=target.car.heading;player.x=target.car.x-Math.cos(h)*3.9;player.y=target.car.y-Math.sin(h)*3.9;player.heading=h;player.settle();player.vx=Math.cos(h)*8;player.vy=Math.sin(h)*8;player.yaw=0;};
 remote.receive({...s,vx:0,vy:0},{seq:2});player.ghost=true;r.car.ghost=true;ram(r);
 let hits=field.step(player,1/120).filter(h=>h.player);assert.equal(hits.length,0,'humans pass through each other');
 r.car.ghost=false;ram(r);hits=field.step(player,1/120).filter(h=>h.player);assert(hits.length>0,'a human hits a car driven over the network');
 const bot=field.rivals[5];ram(bot);const speed=Math.hypot(bot.car.vx,bot.car.vy);hits=field.step(player,1/120).filter(h=>h.player);
 assert(hits.length>0&&Math.hypot(bot.car.vx,bot.car.vy)>speed,'a bot is pushed');
 // Two remote cars laid over each other stay exactly where their owners put them.
 player.resetGrid();
 const q=field.rivals[4],other=new RemoteCar(q.car),X=r.car.x+.3;q.puppet=(rival,dt)=>other.drive(rival.car,dt);q.car.remote=true;other.receive({...s,vx:0,vy:0,x:X,y:r.car.y},{seq:1});
 field.step(player,1/120);assert(Math.abs(q.car.x-X)<1e-9,'no contact between two remote cars');
 report.field={collisions:field.collisions};
}
// The AI records (ai-records.js) never take a lap from a car driven over the network: a human in a
// rival's seat, or times relayed by the host. A car this window drives still counts.
{
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 const records=new AutomaticAIRecords(storage),reference=n=>readAIRecords(storage).find(r=>r.circuit==='interlagos'&&r.mode==='normal'&&r.number===n).bestLap;
 const before73=reference('73'),before00=reference('00');
 const rival=(number,best,remote)=>({entry:{number},car:{best,remote},finished:false,style:{}});
 records.update({data:{meta:{id:'interlagos'}},active:false,freeTotalLaps:3,fullGrid:true,rivals:[rival('73',60,true),rival('00',61,false)]});
 assert.equal(reference('73'),before73,'a remote car is no AI record');assert.equal(reference('00'),61,'a bot this window drives is');assert(before00>61);
}
console.log(JSON.stringify(report,null,1));
console.log('testar_multiplayer: ok');
