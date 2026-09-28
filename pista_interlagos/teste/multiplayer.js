// Multiplayer, test version: windows of the game on one machine race each other (net-room.js,
// net-cars.js). Nothing in the menus leads here; main.js loads this module only when the address
// asks for a room:
//   index.html#sala=NOME     the first window in a room hosts it and races the Opala 99; the next
//                            ones take the first free rival's car (or the one in &carro=73)
//   &auto=1                  the automatic pilot drives this window's car from the start
//   &lag=150&perda=5         simulate 150 ms of network delay and 5% of lost car messages
// The host picks the track and presses Corrida única: every guest loads it, and the lights go out
// for everyone together. The host's game drives the bots and passes every car on; each window
// drives its own car and places the others where their owners say they are (RaceField's remote
// cars). Humans pass through each other but hit the bots. Modo Corrida only.
import {Room,roomParams,HOST_NUMBER} from './net-room.js';
import {RemoteCar,packCar,readCar} from './net-cars.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
// Car messages a second; after crossing the line, how long the results wait for the others (s).
const SEND=1/30,RESULTS_WAIT=60;
// The host's Opala 99 as the guests see it: black, the yellow stripe and its number.
const HOST_PAINT={color:0x17191b,stripe:0xf0cd1f};
const hostEntry=name=>({...PLAYER_ENTRY,mark:PLAYER_ENTRY.color,name,shortName:name,human:true});
const seatIndex=number=>RIVAL_ROSTER.findIndex(e=>e.number===number);
const clock=()=>performance.now()/1000;
// game: main.js hooks (session, immersive, template, pilotName, command, autopilot, startRace, hasCircuit).
export function startMultiplayer(game,hash=location.hash){const params=roomParams(hash);return params?new Multiplayer(game,params):null;}
class Multiplayer {
 constructor(game,params){
  this.game=game;this.params=params;this.autopilot=params.auto;this.autopilotOn=false;
  this.room=new Room({room:params.room,name:game.pilotName(),want:params.car,lag:params.lag,loss:params.loss});
  this.race=null;this.phase='lobby';this.holding=false;this.remotes=new Map();this.seq=0;this.sendClock=0;this.readyClock=0;this.finishedAt=null;this.panelClock=0;this.immersive=null;this.rows='';
  // A new race from the host: load its track and start (false: busy loading, asked again later).
  this.room.on('race',race=>this.game.hasCircuit(race.circuit)&&this.game.startRace(race.circuit)).on('go',race=>this.go(race))
   .on('state',(id,m)=>this.heardCar(id,m)).on('snap',m=>this.heardField(m)).on('leave',p=>this.left(p)).on('change',()=>this.render());
  this.buildPanel();this.room.start();
  addEventListener('pagehide',()=>this.room.leave());
  window.interlagosSala={info:()=>this.info()};
  const immersive=game.immersive();if(immersive)this.attach(immersive);
 }
 // Each circuit load makes a new ImmersiveMode: its free race learns the room's seats and start.
 attach(immersive){
  if(immersive.multiplayer===this)return;
  immersive.multiplayer=this;this.immersive=immersive;const visual=immersive.visual;this.originals=[...visual.rivals];
  // The host's car as the guests see it, cloned while the player's model still stands at rest.
  const template=this.game.template();
  this.hostObject=template?visual.rivalCar(template,HOST_PAINT.color,HOST_NUMBER,'',{driven:true,stripe:HOST_PAINT.stripe}):null;
  if(this.hostObject)visual.root.add(this.hostObject);
  const resetField=immersive.resetField.bind(immersive),beginCountdown=immersive.beginCountdown.bind(immersive),step=immersive.step.bind(immersive),stepFree=immersive.stepFree.bind(immersive);
  immersive.resetField=()=>{this.plan(immersive);resetField();this.seat(immersive);};
  immersive.beginCountdown=()=>{beginCountdown();this.countdown();};
  // Held on 3 until every guest has the race loaded.
  immersive.step=(input,dt)=>{if(this.holding&&immersive.freeCountdown>0)immersive.freeCountdown=3;return step(input,dt);};
  // Past the flag the field races on while the others finish (the result waits, holdResults).
  immersive.stepFree=(dt,input)=>{if(immersive.freeFinished&&this.phase==='racing'){immersive.contacts(immersive.field.step(immersive.car,dt,immersive.freeTotalLaps));return;}stepFree(dt,input);};
 }
 myNumber(race=this.race){return race?.seats.find(s=>s.id===this.room.id)?.number??null;}
 // Before the field resets: the race it is for. The host makes a new one each time (announced only
 // when its countdown begins); a guest takes the one the host announced for this track. A room
 // race is the full grid (seat = roster index): the host's Treino solo or 1x1 stays its own.
 plan(immersive){
  this.phase='lobby';this.holding=false;this.finishedAt=null;this.autopilotOn=false;
  const room=this.room,circuit=this.game.session().circuit,grid=immersive.lineup==null;
  const field=immersive.field;
  this.race=room.role==='host'?grid?room.planRace({circuit,laps:immersive.laps,ace:!!field.ace,level:field.level,retirements:field.retirements!==false}):null
   :room.role==='guest'&&room.race?.state==='waiting'&&room.race.circuit===circuit?room.race:null;
  field.seed=this.race?.seed;
  if(this.race){immersive.laps=this.race.laps;field.ace=this.race.ace;if(this.race.level)field.level=this.race.level;field.retirements=this.race.retirements;}
 }
 // After the field resets (same seed, same grid in every window): who drives which car.
 seat(immersive){
  const field=immersive.field,visual=immersive.visual,car=immersive.car,race=this.race;
  this.remotes.clear();car.ghost=false;immersive.playerEntry=undefined;
  visual.rivals.splice(0,visual.rivals.length,...this.originals);for(const obj of this.originals){obj.userData.entry=RIVAL_ROSTER[this.originals.indexOf(obj)];this.label(obj,null);}
  const me=this.myNumber();if(!me)return;
  const humans=new Map(race.seats.map(s=>[s.number,s]));car.ghost=true;
  const human=(i,seat)=>{const r=field.rivals[i];r.entry={...r.entry,name:seat.name,shortName:seat.name,human:true};visual.rivals[i].userData.entry=r.entry;this.label(visual.rivals[i],seat.name);};
  if(me===HOST_NUMBER){
   // The host's bots stay bots; a guest's seat is placed from that guest's messages.
   for(const seat of race.seats){const i=seatIndex(seat.number);if(i<0)continue;this.remote(field.rivals[i],seat.number,true);human(i,seat);}
   return;
  }
  const i=seatIndex(me),slot=field.rivals[i],back={x:car.x,y:car.y,heading:car.heading},name=humans.get(me).name;
  // This window's car takes its own seat on the grid...
  car.x=slot.car.x;car.y=slot.car.y;car.heading=slot.car.heading;car.settle();
  immersive.freeLastS=car.surface.s;immersive.freePlayerProgress=slot.progress;immersive.playerEntry={...slot.entry,name,shortName:name,human:true};
  // ...and that seat shows the host's Opala 99, at the back where the host's car starts.
  slot.car.x=back.x;slot.car.y=back.y;slot.car.heading=back.heading;slot.car.settle();slot.lastS=slot.car.surface.s;slot.progress=0;
  slot.entry=hostEntry(humans.get(HOST_NUMBER)?.name??'Anfitrião');
  if(this.hostObject)visual.rivals[i]=this.hostObject;visual.rivals[i].userData.entry=slot.entry;this.label(visual.rivals[i],slot.entry.name);
  // The host's game drives every other car: here all of them come over the network.
  field.rivals.forEach((r,k)=>{const number=k===i?HOST_NUMBER:r.entry.number;this.remote(r,number,humans.has(number));if(k!==i&&humans.has(number))human(k,humans.get(number));});
 }
 remote(r,number,human){
  const remote=new RemoteCar(r.car,{progress:r.progress});this.remotes.set(number,remote);r.seat=number;r.car.remote=true;r.car.ghost=human;
  r.puppet=(rival,dt)=>{
   const input=remote.drive(rival.car,dt),s=remote.state;rival.progress=s.progress;rival.lastS=rival.car.surface.s;
   if(s.finished&&!rival.finished){rival.finished=true;rival.finishTime=s.finishTime;}
   // A bot the host's field retired (a breakdown) never finishes here either.
   if(s.retired)rival.retired=true;
   return input;
  };
 }
 // Host: a guest gone (or never ready) leaves a bot in its seat, from where the car is.
 release(r){
  const i=this.immersive.field.rivals.indexOf(r),obj=this.immersive.visual.rivals[i];
  this.remotes.delete(r.seat);r.puppet=null;r.seat=null;r.car.remote=r.car.ghost=false;r.lastS=r.car.surface.s;r.entry=RIVAL_ROSTER[i];
  obj.userData.entry=r.entry;this.label(obj,null);
 }
 // Name tags: a human's name in lime over the car; null puts the driver's own tag back.
 label(obj,name){
  const u=obj.userData;
  if(u.mpLabel){u.mpLabel.removeFromParent();u.mpLabel.material.map?.dispose();u.mpLabel.material.dispose();u.mpLabel=null;}
  if('mpOriginal' in u){if(u.mpOriginal)obj.add(u.mpOriginal);u.nameLabel=u.mpOriginal;delete u.mpOriginal;}
  if(!name)return;
  u.mpOriginal=u.nameLabel??null;u.mpOriginal?.removeFromParent();
  u.mpLabel=u.nameLabel=this.immersive.visual.tag(obj,name,[0,2.08,0],2.7,.30,'#e2fb57','#172a2ddb');
 }
 // The countdown began: the host announces the race; either side holds on 3 until the start
 // (a host's race outside the room, Treino solo or 1x1, just runs).
 countdown(){
  if(this.room.role==='host'&&!this.race){this.render();return;}
  this.holding=true;this.phase='waiting';this.readyClock=0;this.sendClock=0;if(this.race&&this.room.role==='host')this.room.openRace(this.race);this.render();
 }
 go(race){
  if(!this.race||race.id!==this.race.id)return;
  this.race=race;const immersive=this.immersive;
  if(!race.seats.some(s=>s.id===this.room.id))return;
  this.phase='racing';this.holding=false;
  if(this.room.role==='host'){for(const r of immersive.field.rivals)if(r.puppet&&!race.seats.some(s=>s.number===r.seat))this.release(r);}
  // The start reached this window a network delay late: the countdown makes up for it.
  else immersive.freeCountdown=Math.max(.2,3-this.room.latency);
  this.render();
 }
 left(p){const r=this.immersive?.field.rivals.find(r=>r.puppet&&r.seat===p.number);if(r&&this.room.role==='host')this.release(r);}
 heardCar(id,m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;
  const seat=this.race.seats.find(s=>s.id===id),state=seat&&readCar(m.car);
  if(state)this.remotes.get(seat.number)?.receive(state,{age:m.lat,seq:m.seq,raw:m.car});
 }
 heardField(m){
  if(this.phase==='lobby'||m.race!==this.race?.id)return;const me=this.myNumber();
  for(const [number,age,values] of m.cars){if(number===me)continue;const state=readCar(values);if(state)this.remotes.get(number)?.receive(state,{age:age+this.room.latency,seq:m.seq,raw:values});}
 }
 // Every frame (main.js), paused or not: the room's clockwork, this window's car on the wire.
 frame(dt){
  const game=this.game,s=game.session(),room=this.room,immersive=this.immersive;
  room.setName(s.started&&immersive?.pilotName||game.pilotName());room.tick();
  // Out of the race (the way out of the menu, another track, Modo História): the room hears it.
  if(this.phase!=='lobby'&&(!s.started||immersive?.active)){this.phase='lobby';this.holding=false;if(room.role==='host')room.closeRace();}
  // A window waiting outside any race (a guest's rerun before the host starts one) sends nothing.
  if(this.phase!=='lobby'&&immersive&&this.race){
   if(this.holding&&room.role==='guest'&&room.race?.id===this.race.id&&(this.readyClock-=dt)<=0){this.readyClock=1;room.sendReady();}
   this.sendClock+=dt;if(this.sendClock>=SEND){this.sendClock=Math.min(this.sendClock-SEND,SEND);this.send(s.paused);}
   if(this.phase==='racing'){
    if(this.autopilot&&!this.autopilotOn){game.autopilot(true);this.autopilotOn=true;}
    // Driving keys take the wheel back (main.js takeWheel): the box follows.
    else if(this.autopilotOn&&!game.autopilot()){this.autopilot=this.autopilotOn=false;this.panel.auto.checked=false;}
   }
  }
  if((this.panelClock-=dt)<=0){this.panelClock=.25;this.render();}
 }
 send(paused){
  const immersive=this.immersive,car=immersive.car,room=this.room,command=this.game.command()??{},L=immersive.data.meta.reconstructed_xy_m,still=paused||this.holding;
  const progress=Math.min(immersive.freePlayerProgress,car.laps*L+car.surface.s+immersive.field.gridLeadIn);
  const mine=packCar(car,{progress,finished:immersive.freeFinished,finishTime:immersive.finishTime,brake:command.brake??0,throttle:command.throttle??0,still});this.seq++;
  if(room.role==='guest'){room.sendState(mine,this.seq);return;}
  // The host passes a guest's car on as that guest sent it, with its age; the rest it drives.
  const cars=[[HOST_NUMBER,0,mine]];
  for(const r of immersive.field.rivals){
   const remote=r.puppet?this.remotes.get(r.seat):null;
   cars.push(remote?.raw?[r.seat,Math.min(remote.age,5),remote.raw]:[r.entry.number,0,packCar(r.car,{progress:r.progress,finished:r.finished,retired:!!r.retired,finishTime:r.finishTime,brake:r.input?.brake??0,throttle:r.input?.throttle??0,still})]);
  }
  room.sendSnapshot(cars,this.seq);
 }
 // main.js asks before showing the result: not while other humans still race (up to RESULTS_WAIT).
 holdResults(){
  const immersive=this.immersive;if(this.phase!=='racing'||!immersive?.freeFinished||immersive.finishing)return false;
  const now=clock();this.finishedAt??=now;
  if(this.stillRacing()&&now-this.finishedAt<RESULTS_WAIT)return true;
  // Everyone is in, or the wait ran out: the order as it stands now.
  this.phase='finished';
  immersive.freeOrder=[...immersive.rivals].sort((a,b)=>!!a.retired-!!b.retired||(a.finishTime??Infinity)-(b.finishTime??Infinity)||b.progress-a.progress).map(r=>({...r.entry,bestLap:r.car.best,totalTime:r.finished?r.finishTime:null,finished:r.finished,laps:r.car.laps,...(r.retired?{dnf:true,breakdown:r.broken?.kind}:{})}));
  this.render();return false;
 }
 stillRacing(){const me=this.myNumber();return this.race?.seats.filter(s=>s.number!==me&&!this.remotes.get(s.number)?.state?.finished).length??0;}
 buildPanel(){
  const link=document.createElement('link');link.rel='stylesheet';link.href='./multiplayer.css';document.head.append(link);
  const root=document.createElement('section');root.id='mpRoom';root.setAttribute('aria-label','Sala multiplayer');
  const add=(tag,className,parent=root)=>{const e=document.createElement(tag);if(className)e.className=className;parent.append(e);return e;};
  const head=add('div','mp-head');add('b','',head).textContent='SALA';
  this.panel={root,room:add('span','mp-name',head),role:add('small','mp-role',head),status:add('p','mp-status'),list:add('ol','mp-players')};
  this.panel.status.setAttribute('role','status');
  const label=add('label','mp-auto'),box=add('input','',label);box.type='checkbox';box.id='mpAuto';box.checked=this.autopilot;label.append(' Piloto automático neste carro');
  // The box gives the focus back at once: typed driving keys are ignored while an input has it.
  box.onchange=()=>{this.autopilot=box.checked;if(!box.checked&&this.autopilotOn){this.game.autopilot(false);this.autopilotOn=false;}box.blur();};
  this.panel.auto=box;this.panel.net=add('small','mp-net');
  document.body.append(root);
 }
 statusText(s){
  const room=this.room,me=room.number;
  if(!room.role)return 'Procurando a sala…';
  if(this.immersive?.active)return 'A sala corre só no Modo Corrida.';
  if(room.role==='guest'&&!me)return 'Sala cheia: os 15 carros estão ocupados.';
  if(this.phase==='waiting'){
   if(room.role==='host'&&room.race){const r=room.race,ready=r.seats.filter(x=>room.ready.has(x.id)).length;return `Esperando os pilotos carregarem a pista (${ready}/${r.seats.length})…`;}
   return this.race?'Pronto. Esperando a largada…':'Esperando o anfitrião largar…';
  }
  if(this.phase==='racing'){
   if(this.immersive?.freeFinished){const left=this.stillRacing(),wait=Math.max(0,Math.ceil(RESULTS_WAIT-(clock()-(this.finishedAt??clock()))));return `Você terminou! Esperando ${left} piloto${left>1?'s':''} · ${wait} s`;}
   if(room.role==='guest'&&room.race?.id!==this.race?.id)return 'O anfitrião saiu desta corrida.';
   const humans=this.race?.seats.length??1;return `Corrida com ${humans} piloto${humans>1?'s':''} ${humans>1?'humanos':'humano'}.`;
  }
  if(this.phase==='finished')return 'Fim de corrida.';
  if(room.role==='host'){
   if(s.started)return 'Esta corrida é só sua: a sala larga junto na Corrida única.';
   const guests=room.members.length-1;return `Você hospeda · ${guests} convidado${guests===1?'':'s'} · escolha a pista e clique em Corrida única: todos largam juntos.`;
  }
  const race=room.race;
  return race?.state==='racing'&&!race.seats.some(x=>x.id===room.id)?'Corrida em andamento: você entra na próxima largada.':'Esperando o anfitrião escolher a pista e largar…';
 }
 render(){
  const p=this.panel;if(!p)return;const room=this.room,s=this.game.session(),me=room.number;
  // Out of the way of the result sheet; under the circuits on the track screen; one line on track.
  const results=document.getElementById('raceResults');p.root.hidden=!!results&&!results.hidden;
  p.root.classList.toggle('mp-racing',s.started&&!s.paused);p.root.classList.toggle('mp-tracks',!document.getElementById('tracks')?.classList.contains('hidden'));
  p.room.textContent=room.room;
  p.role.textContent=room.role==='host'?'anfitrião · #99':room.role==='guest'?(me?`convidado · #${me}`:'assistindo'):'…';
  p.status.textContent=this.statusText(s);
  const rows=room.members.map(m=>`#${m.number??'—'} ${m.name}${m.number===HOST_NUMBER?' (anfitrião)':''}${m.id===room.id?' · você':''}`);
  if(rows.join('\n')!==this.rows){this.rows=rows.join('\n');p.list.replaceChildren(...rows.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));}
  p.net.textContent=[room.role==='guest'?`ping ${Math.round(room.latency*2000)} ms`:room.role==='host'?`${Math.max(0,room.members.length-1)} convidado(s)`:'',
   this.params.lag?`atraso simulado ${this.params.lag} ms`:'',this.params.loss?`perda simulada ${Math.round(this.params.loss*100)}%`:''].filter(Boolean).join(' · ');
 }
 // For the checks (verificar_multiplayer.py): this window's car and every other car as it shows them.
 info(){
  const immersive=this.immersive,car=immersive?.car;
  return {...this.room.info(),phase:this.phase,holding:this.holding,autopilot:this.autopilot,raceId:this.race?.id??null,
   remotes:[...this.remotes].map(([number,r])=>({number,seq:r.seq,age:r.age,finished:!!r.state?.finished})),
   me:car?{x:car.x,y:car.y,vx:car.vx,vy:car.vy,ghost:!!car.ghost}:null,
   cars:immersive?immersive.field.rivals.map(r=>({number:r.seat??r.entry.number,name:r.entry.shortName,x:r.car.x,y:r.car.y,remote:!!r.car.remote,ghost:!!r.car.ghost})):[]};
 }
}
