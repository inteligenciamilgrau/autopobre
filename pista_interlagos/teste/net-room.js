// Multiplayer room, test version (multiplayer.js). Windows of the same site on one machine talk
// through a BroadcastChannel: no server and no network, so a race can be tried in two windows side
// by side. A WebRTC transport would take the channel's place and keep these messages.
// The first window in a room hosts it: it gives out the seats (the host races the Opala 99, each
// guest a rival's car), announces each race and holds its start until the host gives it: whoever
// joins meanwhile is seated too, and whoever is still loading then races the next one. During the
// race the host relays the whole field. Everything received is checked before use, and a sender
// that floods is cut off. No DOM here: testar_multiplayer.mjs runs two rooms in Node.
import {RIVAL_ROSTER} from './race-roster.js';
import {readCar} from './net-cars.js';
export const HOST_NUMBER='99';
export const SEATS=Object.freeze([HOST_NUMBER,...RIVAL_ROSTER.map(e=>e.number)]);
// Seconds: a silent player (or host) is gone after SILENT; a window hosts once ELECTION passes
// with no host heard; a guest loading a race it was seated in may stay silent up to READY_WAIT; a gap
// longer than FROZEN between two ticks is this window's own freeze; two hosts whose ages differ
// by less than TIE began together.
const SILENT=3,ELECTION=.9,READY_WAIT=60,FROZEN=.25,TIE=.5,BEACON=1,PING=1,HELLO=2,RATE=240;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isId=v=>typeof v==='string'&&/^[0-9a-f]{8}$/.test(v);
const isInt=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
const isNum=(v,lo,hi)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const isCar=v=>readCar(v)!==null;
const seatKey=seats=>seats.map(s=>s.number+':'+s.name).join('|');
const randomId=random=>Array.from({length:8},()=>Math.floor(random()*16).toString(16)).join('');
// Room names: lowercase letters, digits and dashes; the address carries the whole key.
export function roomName(value){
 const name=String(value??'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9-]/g,'').slice(0,24);
 return name||null;
}
// A pilot's name as the others see it: plain text without control or format characters (bidi
// overrides, zero-width), at most 24 characters. It is only ever shown as text.
export function playerName(value){return String(value??'').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,24);}
// index.html#sala=NOME[&carro=73][&auto=1][&lag=150][&perda=5]; null without a room.
export function roomParams(hash){
 const q=new URLSearchParams(String(hash??'').replace(/^#/,'')),room=roomName(q.get('sala'));if(!room)return null;
 const num=(key,hi)=>{const v=Number(q.get(key));return Number.isFinite(v)?clamp(v,0,hi):0;},car=q.get('carro');
 return {room,car:SEATS.includes(car)&&car!==HOST_NUMBER?car:null,auto:q.get('auto')==='1',lag:num('lag',1000),loss:num('perda',50)/100};
}
const validSeat=s=>s&&typeof s==='object'&&isId(s.id)&&typeof s.name==='string'&&s.name.length<=64&&SEATS.includes(s.number);
const validSeats=v=>Array.isArray(v)&&v.length<=SEATS.length&&v.every(validSeat);
function validRace(r){
 return r===null||r&&typeof r==='object'&&isId(r.id)&&typeof r.circuit==='string'&&/^[a-z0-9_-]{1,32}$/.test(r.circuit)&&isInt(r.laps,1,50)&&isInt(r.seed,0,4294967295)
  &&typeof r.ace==='boolean'&&typeof r.retirements==='boolean'&&(r.level===null||typeof r.level==='string'&&/^[a-z]{1,16}$/.test(r.level))&&validSeats(r.seats)&&['waiting','racing'].includes(r.state);
}
export function validMessage(m){
 if(!m||typeof m!=='object'||typeof m.t!=='string'||!isId(m.from))return false;
 switch(m.t){
  case 'hello':return typeof m.name==='string'&&m.name.length<=64&&(m.want===null||SEATS.includes(m.want));
  case 'bye':return true;
  case 'lobby':return typeof m.name==='string'&&m.name.length<=64&&isNum(m.age,0,1e7)&&Array.isArray(m.players)&&m.players.length<=32&&m.players.every(p=>p&&isId(p.id)&&typeof p.name==='string'&&p.name.length<=64&&(p.number===null||SEATS.includes(p.number)))&&validRace(m.race);
  case 'ready':return isId(m.race);
  case 'go':return isId(m.race)&&validSeats(m.seats);
  case 'ping':return isInt(m.n,0,1e9);
  case 'pong':return isId(m.to)&&isInt(m.n,0,1e9);
  case 'state':return isId(m.race)&&isInt(m.seq,0,1e9)&&isNum(m.lat,0,5)&&isCar(m.car);
  case 'snap':return isId(m.race)&&isInt(m.seq,0,1e9)&&Array.isArray(m.cars)&&m.cars.length<=SEATS.length&&m.cars.every(c=>Array.isArray(c)&&c.length===3&&SEATS.includes(c[0])&&isNum(c[1],0,5)&&isCar(c[2]));
  default:return false;
 }
}
export class Room {
 // clock: seconds; random: ids and seeds (both replaceable in tests); lag (ms) and loss (share of
 // car messages dropped) simulate a network on the receiving side.
 constructor({room,name='',want=null,lag=0,loss=0,channel=null,clock=()=>performance.now()/1000,random=Math.random}={}){
  Object.assign(this,{room,want,lag,loss,clock,random});this.id=randomId(random);this.name=playerName(name)||'Piloto';
  this.role=null;this.hostId=null;
  this.players=new Map();  // host: everyone in the room, the host too: id -> {id,name,number,seen}
  this.lobby=null;         // guest: the host's last word on the room
  this.race=null;          // host: the race announced; guest: the race joined (or waiting to start)
  this.ready=new Set();this.latency=0;this.pings=new Map();this.pingN=0;
  this.nextPing=0;this.nextBeacon=0;this.nextHello=0;this.hostSeen=0;this.electUntil=0;this.rates=new Map();this.events={};
  this.channel=channel??new BroadcastChannel('autopobre-sala-'+room);
  this.channel.onmessage=e=>this.arrive(e.data);
 }
 on(name,fn){this.events[name]=fn;return this;}
 emit(name,...args){return this.events[name]?.(...args);}
 // This window's seat: the host always races the 99; a guest's comes from the host (null: none free).
 get number(){return this.role==='host'?HOST_NUMBER:this.lobby?.players.find(p=>p.id===this.id)?.number??null;}
 get members(){return this.role==='host'?[...this.players.values()]:this.lobby?.players??[];}
 start(){this.elect();}
 leave(){this.send({t:'bye'});this.channel.close();}
 setName(value){const name=playerName(value)||'Piloto';if(name===this.name)return;this.name=name;if(this.role==='host'){this.players.get(this.id).name=name;this.beacon();}else this.hello();}
 send(m){m.from=this.id;try{this.channel.postMessage(m);}catch{}}
 hello(){this.nextHello=this.clock()+HELLO;this.send({t:'hello',name:this.name,want:this.want});}
 elect(){this.role=null;this.hostId=null;this.lobby=null;this.electUntil=this.clock()+ELECTION+this.lag/500;this.hello();this.emit('change');}
 arrive(m){
  if(this.loss&&(m?.t==='state'||m?.t==='snap')&&this.random()<this.loss)return;
  if(this.lag)setTimeout(()=>this.receive(m),this.lag*(.85+.3*this.random()));else this.receive(m);
 }
 // No more than RATE messages a second from anyone.
 allow(id,now){const r=this.rates.get(id);if(!r||now-r.since>=1){this.rates.set(id,{since:now,count:1});return true;}return ++r.count<=RATE;}
 receive(m){
  if(!validMessage(m)||m.from===this.id)return;
  const now=this.clock();if(!this.allow(m.from,now))return;
  const host=this.role==='host',fromHost=this.role==='guest'&&m.from===this.hostId;
  switch(m.t){
   case 'hello':if(host)this.join(m.from,m.name,m.want,now);break;
   case 'bye':if(host)this.drop(m.from);else if(fromHost)this.hostSeen=-Infinity;break;
   case 'lobby':this.heardHost(m,now);break;
   case 'ready':if(host&&this.race?.id===m.race&&this.race.state==='waiting'&&this.race.seats.some(s=>s.id===m.from)&&!this.ready.has(m.from)){this.touch(m.from,now);this.ready.add(m.from);this.emit('change');}break;
   case 'go':if(fromHost&&this.race?.id===m.race&&this.race.state==='waiting'){this.hostSeen=now;this.race={...this.race,state:'racing',seats:m.seats};this.emit('go',this.race);this.emit('change');}break;
   case 'ping':if(host){this.touch(m.from,now);this.send({t:'pong',to:m.from,n:m.n});}break;
   case 'pong':if(m.to===this.id&&this.pings.has(m.n)){const half=(now-this.pings.get(m.n))/2;this.pings.delete(m.n);this.latency=this.latency?this.latency*.8+half*.2:half;}break;
   case 'state':if(host){this.touch(m.from,now);if(this.race?.id===m.race)this.emit('state',m.from,m);}break;
   case 'snap':if(fromHost&&this.race?.id===m.race){this.hostSeen=now;this.emit('snap',m);}break;
  }
 }
 // A host's lobby: a guest follows it. Of two hosts in one room (one too busy to answer a new
 // window in time, or two windows electing at once), the older host keeps it; the smaller id if
 // they began together.
 heardHost(m,now){
  if(this.role==='host'){
   const mine=now-this.hostSince;
   if(Math.abs(m.age-mine)>TIE?m.age>mine:m.from<this.id)this.becomeGuest(m,now);return;
  }
  // A guest keeps its host; if that host steps down, its silence starts a new election.
  if(this.role==='guest'&&m.from!==this.hostId)return;
  this.becomeGuest(m,now);
 }
 becomeGuest(m,now){
  const joined=this.role!=='guest'||this.hostId!==m.from;
  if(joined){this.race=null;this.players.clear();this.ready.clear();}
  this.role='guest';this.hostId=m.from;this.hostSeen=now;this.lobby=m;
  if(!m.players.some(p=>p.id===this.id)&&(joined||now>=this.nextHello))this.hello();
  const race=m.race,seated=race?.seats.some(s=>s.id===this.id);
  // A new race with a seat for us: the game loads it (false: not now, asked again next lobby).
  if(race&&seated&&race.state==='waiting'&&this.race?.id!==race.id){const previous=this.race;this.race=race;if(this.emit('race',race)===false)this.race=previous;}
  else if(race&&this.race?.id===race.id){
   // The lobby also carries the start, in case the go itself went missing, and the seats taken
   // while the start waits.
   const went=this.race.state==='waiting'&&race.state==='racing',moved=seatKey(this.race.seats)!==seatKey(race.seats);
   this.race={...this.race,state:race.state,seats:race.seats};if(moved)this.emit('seats',this.race);if(went)this.emit('go',this.race);
  }
  this.emit('change');
 }
 becomeHost(now){
  this.role='host';this.hostId=this.id;this.hostSince=now;this.lobby=null;this.race=null;this.ready.clear();this.players.clear();
  this.players.set(this.id,{id:this.id,name:this.name,number:HOST_NUMBER,seen:now});this.beacon(now);this.emit('change');
 }
 join(id,name,want,now){
  const p=this.players.get(id);
  if(p){p.name=playerName(name)||p.name;p.seen=now;}
  else this.players.set(id,{id,name:playerName(name)||'Piloto',number:this.freeSeat(want),seen:now});
  this.seatEveryone();this.beacon(now);this.emit('change');
 }
 // While a race waits for its start, everyone in the room has a seat in it, under their current name.
 seatEveryone(){
  const r=this.race;if(this.role!=='host'||r?.state!=='waiting')return;
  const before=seatKey(r.seats);
  for(const p of this.players.values()){if(!p.number)continue;const seat=r.seats.find(s=>s.id===p.id);if(seat)seat.name=p.name;else r.seats.push({id:p.id,name:p.name,number:p.number});}
  if(seatKey(r.seats)!==before)this.emit('seats',r);
 }
 // The seat asked for when free, else the first free rival's car; null when all 15 are taken.
 freeSeat(want){const taken=new Set([...this.players.values()].map(p=>p.number));return want&&!taken.has(want)?want:SEATS.find(n=>!taken.has(n))??null;}
 drop(id){
  const p=this.players.get(id);if(!p||id===this.id)return;
  this.players.delete(id);this.ready.delete(id);
  if(this.race)this.race.seats=this.race.seats.filter(s=>s.id!==id);
  this.emit('leave',p);this.beacon();this.emit('change');
 }
 touch(id,now){const p=this.players.get(id);if(p)p.seen=now;}
 beacon(now=this.clock()){
  if(this.role!=='host')return;this.nextBeacon=now+BEACON;const r=this.race;
  this.send({t:'lobby',name:this.name,age:Math.round((now-this.hostSince)*100)/100,players:[...this.players.values()].map(({id,name,number})=>({id,name,number})),race:r&&{id:r.id,circuit:r.circuit,laps:r.laps,seed:r.seed,ace:r.ace,level:r.level,retirements:r.retirements,seats:r.seats,state:r.state}});
 }
 // Host: the next race with everyone seated now; announced only when its countdown begins. The
 // seed and RaceField's settings (the ace, the rivals' level, breakdowns) give every window the
 // same grid and field.
 planRace({circuit,laps,ace=false,level=null,retirements=true}){
  const seats=[...this.players.values()].filter(p=>p.number).map(({id,name,number})=>({id,name,number}));
  return {id:randomId(this.random),circuit,laps,ace:!!ace,level:level??null,retirements:!!retirements,seed:Math.floor(this.random()*4294967296),seats,state:'waiting'};
 }
 openRace(race){if(this.role!=='host')return;this.race=race;this.ready=new Set([this.id]);this.seatEveryone();this.beacon();this.emit('change');}
 closeRace(){if(this.role!=='host'||!this.race)return;this.race=null;this.beacon();this.emit('change');}
 // Host: lights out. Whoever has not loaded the race yet leaves it (and races the next one).
 lightsOut(){
  const r=this.race;if(this.role!=='host'||r?.state!=='waiting')return;
  r.seats=r.seats.filter(s=>this.ready.has(s.id));r.state='racing';
  this.send({t:'go',race:r.id,seats:r.seats});this.beacon();this.emit('go',r);this.emit('change');
 }
 sendReady(){if(this.role==='guest'&&this.race)this.send({t:'ready',race:this.race.id});}
 sendState(car,seq){if(this.role==='guest'&&this.race)this.send({t:'state',race:this.race.id,seq,lat:clamp(this.latency,0,5),car});}
 sendSnapshot(cars,seq){if(this.role==='host'&&this.race)this.send({t:'snap',race:this.race.id,seq,cars});}
 // Beacons, pings, the election and the silent players: once per frame.
 tick(){
  const now=this.clock(),silent=SILENT+this.lag/500;
  // A long gap between ticks is this window frozen (building a track takes seconds): nobody
  // could be heard meanwhile, so that time counts for no one's silence.
  const frozen=this.lastTick===undefined?0:Math.max(0,now-this.lastTick-FROZEN);this.lastTick=now;
  if(frozen){this.hostSeen+=frozen;for(const p of this.players.values())p.seen+=frozen;}
  if(this.role===null){if(now>=this.electUntil)this.becomeHost(now);return;}
  if(this.role==='host'){
   if(now>=this.nextBeacon)this.beacon(now);
   // A guest still loading the race it was seated in freezes too: it has until READY_WAIT.
   const loading=p=>this.race?.state==='waiting'&&!this.ready.has(p.id)&&this.race.seats.some(s=>s.id===p.id);
   for(const p of [...this.players.values()])if(p.id!==this.id&&now-p.seen>(loading(p)?READY_WAIT:silent))this.drop(p.id);
   return;
  }
  if(now-this.hostSeen>silent){this.elect();return;}
  if(now>=this.nextPing){this.nextPing=now+PING;this.pings.set(++this.pingN,now);if(this.pings.size>8)this.pings.delete(this.pings.keys().next().value);this.send({t:'ping',n:this.pingN});}
  if(now>=this.nextHello)this.hello();
 }
 info(){return {room:this.room,id:this.id,role:this.role,number:this.number,name:this.name,latency:this.latency,ready:[...this.ready],members:this.members.map(({id,name,number})=>({id,name,number})),race:this.race&&{...this.race,seats:this.race.seats.map(s=>({...s}))}};}
}
