// Multiplayer test version (teste/multiplayer.js): the room protocol, message checks, remote-car
// prediction under network delay, and RaceField's remote and ghost cars.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Room,roomParams,roomName,playerName,validMessage,SEATS} from '../teste/net-room.js';
import {fieldRoster} from '../teste/race-roster.js';
import {RemoteCar,packCar,readCar,CAR_FIELDS} from '../teste/net-cars.js';
import {RaceField} from '../teste/race-field.js';
import {AutomaticAIRecords,readAIRecords} from '../teste/ai-records.js';
import {ROOM_SERVER} from '../teste/net-link.js';
import {TestCar,recognitionInput} from '../teste/physics.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const wait=(ms=15)=>new Promise(resolve=>setTimeout(resolve,ms));
const report={};

// --- The address: #sala=NOME and its options.
{
 const p=roomParams('#sala=Teste Óla&carro=73&auto=1&lag=150&perda=5');
 assert.deepEqual(p,{room:'testeola',car:'73',auto:true,ghosts:false,local:false,server:null,lag:150,loss:.05});
 assert.equal(roomParams('#sala=a&local=1').local,true);assert.equal(roomParams('#sala=a&servidor=local').server,'local');assert.equal(roomParams('#sala=a&servidor=outro').server,null);
 assert.equal(roomParams('#sala=a&fantasmas=1').ghosts,true,'humans pass through each other only when asked');
 assert.equal(roomParams('#carro=73'),null,'no room without sala');
 assert.equal(roomParams('#sala=%20%20'),null);
 assert.equal(roomParams('#sala=a&carro=99').car,'99','a guest may ask for the 99 too');
 assert.equal(roomParams('#sala=a&carro=1234').car,null);
 assert.equal(roomParams('#sala=a&lag=-50').lag,0);assert.equal(roomParams('#sala=a&lag=1e9').lag,1000);assert.equal(roomParams('#sala=a&perda=90').loss,.5);
 assert.equal(roomName('x'.repeat(40)).length,24);
 assert.equal(playerName('  Bia‮​ <b>oi</b>\n\t  '),'Bia <b>oi</b>','control and format characters go, text stays text');
 assert.equal(playerName('a'.repeat(80)).length,24);
 assert.equal(SEATS.length,15);assert.equal(SEATS[0],'99');
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
 const events=[],A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia‮',want:'19',wait:true,clock});
 A.on('race',()=>events.push('A race'));B.on('race',race=>{events.push('B race '+race.circuit);return true;}).on('go',race=>events.push('B go '+race.seats.length));
 A.on('state',(id,m)=>events.push(`A state ${id===B.id} ${m.seq}`)).on('leave',p=>events.push('A leave '+p.number));B.on('snap',m=>events.push(`B snap ${m.cars.length}`));
 A.start();await wait();advance([A],1);assert.equal(A.role,'host','alone in the room: hosts it');assert.equal(A.number,'99','asking for no car: the 99');
 B.start();await wait();await wait();
 assert.equal(B.role,'guest');assert.equal(B.hostId,A.id);assert.equal(B.number,'19','the car asked for');assert.equal(B.name,'Bia');
 assert.deepEqual(A.members.map(m=>m.number),['99','19']);
 const race=A.planRace({circuit:'interlagos',laps:2,ace:true,level:'medio'});
 assert.deepEqual(race.seats.map(s=>s.number),['99','19']);assert(Number.isInteger(race.seed));assert.equal(race.car,'99',"the host's car starts at the back");
 A.openRace(race);await wait();
 assert.equal(race.state,'waiting','the start waits for the guest');assert.deepEqual(events,['B race interlagos']);assert.equal(B.race.id,race.id);assert.equal(B.race.level,'medio');assert.equal(B.race.car,'99');
 B.sendReady();await wait();await wait();
 assert.equal(race.state,'waiting','ready is not the start: the host gives it');assert(A.ready.has(B.id));
 // A third window arrives while the start waits: it is seated and gets the race too.
 const C=new Room({room:name,name:'Caio',wait:true,clock}),late=[];let seatsA=0,seatsB=0;
 A.on('seats',()=>seatsA++);B.on('seats',()=>seatsB++);C.on('race',race=>{late.push('race '+race.id);return true;}).on('go',race=>late.push('go '+race.seats.length));
 C.start();await wait();await wait();await wait();
 assert.deepEqual(race.seats.map(s=>s.number),['99','19','73']);assert(seatsA>0&&seatsB>0,'host and guests hear the new seat');
 assert.deepEqual(late,['race '+race.id]);assert.deepEqual(B.race.seats.map(s=>s.number),['99','19','73']);
 // Lights out before Caio has the track loaded: he races the next one; Bia and the host go.
 A.lightsOut();await wait();await wait();
 assert.equal(race.state,'racing');assert(events.includes('B go 2'));assert.deepEqual(race.seats.map(s=>s.number),['99','19']);
 assert.deepEqual(late,['race '+race.id,'go 2'],'Caio hears the start without a seat in it');
 const car=new TestCar(data);car.reset(10);
 B.sendState(packCar(car),1);A.sendSnapshot([['99',0,packCar(car)],['19',.05,packCar(car)]],1);await wait();
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
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:7}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:-1}),false);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',pick:'7'}),false);
 const lobby=r=>({t:'lobby',from:A.id,name:'x',age:1,players:[],race:r});
 assert.equal(validMessage(lobby({...A.race,seats:[]})),true);assert.equal(validMessage(lobby({...A.race,seats:[],car:'999'})),false,"the host's car must be one of the grid");assert.equal(validMessage(lobby({...A.race,seats:[],car:undefined})),false);
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
// The car screen in a room: the host races the car it chose (its race's car, at the back); a guest
// gets the car it asks for when nobody has it, otherwise the first free one; a new choice is granted
// at once, refused for a car already taken, and waits while that guest races; F5 keeps every car.
{
 let now=0;const clock=()=>now,name='carros-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 const tab=()=>{const store=new Map();return {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};},hostTab=tab(),guestTab=tab();
 const A=new Room({room:name,name:'Ana',want:'73',clock,storage:hostTab}),B=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab}),C=new Room({room:name,name:'Caio',want:'99',wait:true,clock});
 B.on('race',()=>true);C.on('race',()=>true);
 A.start();advance([A],1);assert.equal(A.number,'73','the host races its choice');
 B.start();await settle([A,B]);C.start();await settle([A,B,C],4);
 assert.equal(B.number,'99',"the 73 is the host's: the first free car");assert.equal(C.number,'00','the 99 went to Bia first: the next free one');
 assert(B.settled&&C.settled);assert.equal(B.hostNumber,'73');
 // A choice on the car screen: free, granted; taken, refused (the guest keeps its car).
 C.choose('99');assert.equal(C.settled,false);await settle([A,B,C]);
 assert(C.settled,'the host answered');assert.equal(C.number,'00',"the 99 is Bia's");
 B.choose('19');await settle([A,B,C]);
 assert(B.settled);assert.equal(B.number,'19');
 C.choose('99');await settle([A,B,C]);
 assert.equal(C.number,'99','the 99 is free now');
 // The host's own choice is its at once, if free; its race's car is the one at the back.
 A.choose('19');assert.equal(A.number,'73',"the 19 is Bia's");A.choose('7');assert.equal(A.number,'7');
 await settle([A,B,C]);
 assert.equal(B.hostNumber,'7');assert.deepEqual(A.members.map(m=>m.number).sort(),['19','7','99']);
 const race=A.planRace({circuit:'interlagos',laps:1});assert.equal(race.car,'7');A.openRace(race);
 await settle([A,B,C]);
 assert.equal(B.race.car,'7');
 // Every window builds the same field: the host's car out of it, the 99 in its seat (a human here).
 const roster=fieldRoster(B.race.car);assert.equal(roster.findIndex(e=>e.number==='99'),fieldRoster().findIndex(e=>e.number==='7'));
 assert(roster.some(e=>e.number==='19')&&!roster.some(e=>e.number==='7'));
 // While the start waits a guest may still change car: its seat in the race follows.
 let seats=0;A.on('seats',()=>seats++);
 B.choose('64');await settle([A,B,C]);
 assert.equal(B.number,'64');assert.equal(race.seats.find(s=>s.id===B.id).number,'64');assert(seats>0,'the host re-seats the humans');
 // Racing: a new choice waits until that race ends; the host's car too.
 B.sendReady();C.sendReady();await settle([A,B,C],2);A.lightsOut();await settle([A,B,C],2);
 assert.equal(race.state,'racing');assert.equal(race.seats.length,3);
 B.choose('2');A.choose('42');await settle([A,B,C]);
 assert.equal(B.number,'64','racing: the car stays');assert.equal(B.settled,false,'the answer waits');assert.equal(race.seats.find(s=>s.id===B.id).number,'64');
 assert.equal(A.number,'7');
 A.closeRace();await settle([A,B,C]);
 assert.equal(B.number,'2','granted once the race is over');assert(B.settled);assert.equal(A.number,'42');
 // F5 on the host and on a guest: both keep their cars.
 A.leave();await wait();const A2=new Room({room:name,name:'Ana',want:'73',clock,storage:hostTab});A2.start();
 await settle([A2,B,C],8);
 assert.equal(A2.number,'42','the host back from F5 keeps its car');assert.equal(B.number,'2');assert.equal(C.number,'99');
 B.leave();await wait();const B2=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab});B2.start();
 await settle([A2,B2,C],8);
 assert.equal(B2.number,'2','a guest back from F5 keeps its car, not its old choice');assert(B2.settled);
 // F5 in the middle of a race, the tab gone without a word: its choice still waits at the host, and
 // the tab back has nothing to wait for (pick 0 is no new choice).
 const race2=A2.planRace({circuit:'interlagos',laps:1});A2.openRace(race2);await settle([A2,B2,C]);B2.sendReady();C.sendReady();await settle([A2,B2,C],2);A2.lightsOut();await settle([A2,B2,C],2);
 B2.choose('51');await settle([A2,B2,C]);assert.equal(B2.settled,false,'racing: the answer waits');
 B2.channel.close();const B3=new Room({room:name,name:'Bia',want:'73',wait:true,clock,storage:guestTab});B3.on('race',()=>true);B3.start();
 await settle([A2,B3,C],4);
 assert.equal(B3.number,'2','back from F5 mid-race: the same car');assert(B3.settled,'nothing asked since the reload');
 A2.closeRace();await settle([A2,B3,C]);assert.equal(B3.number,'51','the choice made before F5 is granted after the race');
 // A guest's choice still waiting when its host leaves: the guest hosts the room in the car it asked for.
 const race3=A2.planRace({circuit:'interlagos',laps:1});A2.openRace(race3);await settle([A2,B3,C]);B3.sendReady();C.sendReady();await settle([A2,B3,C],2);A2.lightsOut();await settle([A2,B3,C],2);
 B3.choose('88');await settle([A2,B3,C]);assert.equal(B3.number,'51');assert.equal(B3.settled,false);
 C.leave();A2.leave();await wait();B3.tick();const left=now;advance([B3],left+12);
 assert.equal(B3.role,'host','the guest hosts');assert.equal(B3.number,'88','in the car it had asked for');assert(B3.settled);
 B3.leave();
 report.cars={host:A2.number,guests:[B2.number,C.number],reloaded:B3.number};
}
// The way into a race: a guest let in picks its car and only then waits for the start ("Aguardar
// início da corrida"). The host seats the waiting guests in the race it holds on the grid, whoever
// says so before the start too; a guest that takes it back gives its seat up; after the start, the
// next race.
{
 let now=0;const clock=()=>now,name='espera-'+Math.random().toString(36).slice(2,8),advance=(rooms,to)=>{while(now<to-1e-9){now=Math.min(to,now+.1);for(const r of rooms)r.tick();}};
 const settle=async(rooms,n=3)=>{for(let i=0;i<n;i++){await wait();advance(rooms,now+.2);}};
 const A=new Room({room:name,name:'Ana',clock}),B=new Room({room:name,name:'Bia',want:'19',clock});
 const got={B:[],C:[]};B.on('race',race=>{got.B.push(race.id);return true;});
 A.start();advance([A],1);B.start();await settle([A,B]);
 assert.equal(B.number,'19','let in: a car, not a seat in a race yet');assert.equal(B.waiting,false);
 assert.deepEqual(A.members.map(m=>[m.number,m.wait]),[['99',true],['19',false]],'the room knows who is still picking');
 assert.deepEqual(B.members.map(m=>m.wait),[true,false],'the guests too');
 // The host holds a race on the grid: the guest still picking has no seat in it and loads nothing.
 const race=A.planRace({circuit:'interlagos',laps:1});A.openRace(race);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99']);assert.deepEqual(got.B,[]);assert.equal(B.race,null);
 // "Aguardar início da corrida": seated at once in the race that waits, and it loads it.
 B.setWaiting(true);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99','19']);assert.deepEqual(got.B,[race.id]);assert.equal(B.race.id,race.id);
 B.sendReady();await settle([A,B]);assert(A.ready.has(B.id));
 // Taken back (the guest left the grid for the car screen): no seat, not ready; waiting again, seated again.
 B.setWaiting(false);assert.equal(B.race,null);await settle([A,B]);
 assert.deepEqual(race.seats.map(s=>s.number),['99']);assert(!A.ready.has(B.id),'no longer counted as ready');assert.deepEqual(got.B,[race.id]);
 B.setWaiting(true);await settle([A,B]);assert.deepEqual(got.B,[race.id,race.id],'it loads the race again');B.sendReady();await settle([A,B]);
 // Someone arrives while the grid waits: let in, picking a car, then waiting: seated before the start.
 const C=new Room({room:name,name:'Caio',want:'64',clock});C.on('race',race=>{got.C.push(race.id);return true;});C.start();await settle([A,B,C]);assert.equal(C.number,'64');assert.deepEqual(race.seats.length,2);
 C.setWaiting(true);await settle([A,B,C]);assert.deepEqual(race.seats.map(s=>s.number),['99','19','64']);assert.deepEqual(got.C,[race.id]);
 C.sendReady();await settle([A,B,C]);A.lightsOut();await settle([A,B,C]);
 assert.equal(race.state,'racing');assert.equal(race.seats.length,3);
 // After the start nobody else gets in: a waiting guest that arrives now races the next one.
 const D=new Room({room:name,name:'Duda',wait:true,clock});let dRaces=0;D.on('race',()=>{dRaces++;return true;});D.start();await settle([A,B,C,D]);
 assert.equal(race.seats.length,3);assert.equal(dRaces,0);assert(A.members.some(m=>m.id===D.id&&m.wait));
 A.closeRace();const next=A.planRace({circuit:'interlagos',laps:1});A.openRace(next);await settle([A,B,C,D]);
 assert.equal(next.seats.length,4,'everyone still waiting races the next one');assert.equal(dRaces,1);
 assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',wait:true}),true);assert.equal(validMessage({t:'hello',from:A.id,name:'x',want:'42',wait:'1'}),false);
 A.leave();B.leave();C.leave();D.leave();
 report.waiting={seats:next.seats.map(s=>s.number)};
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
 let now=0;const clock=()=>now,name='nomes-'+Math.random().toString(36).slice(2,8),H=new Room({room:name,name:'H',clock}),G=new Room({room:name,name:'G',wait:true,clock});
 G.on('race',()=>true);H.start();now=1;H.tick();G.start();await wait();await wait();assert.equal(G.role,'guest');
 const raw=new BroadcastChannel('autopobre-sala-'+name),dirty='A​na‮ ',seats=[{id:H.id,name:dirty,number:'99'},{id:G.id,name:'G⁦',number:'73'}];
 raw.postMessage({t:'lobby',from:H.id,name:'Ho‮st',age:9,players:seats,race:{id:'0000abcd',circuit:'interlagos',laps:1,seed:1,car:'99',ace:false,retirements:true,ghosts:false,level:null,seats,state:'waiting'}});
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
// The room server's address is the one the page's content policy allows (scripts/publicacao.py).
{
 const policy=fs.readFileSync(new URL('./publicacao.py',import.meta.url),'utf8').match(/^ROOM_SERVER = '([^']+)'/m)?.[1];
 assert.equal(policy,ROOM_SERVER,'net-link.js and publicacao.py name the same room server');assert.match(ROOM_SERVER,/^wss:\/\//);
}
console.log(JSON.stringify(report,null,1));
console.log('testar_multiplayer: ok');
