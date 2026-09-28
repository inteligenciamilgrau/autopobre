// Multiplayer: players on different machines race each other through the room server
// (net-link.js, sala-cloudflare), or windows of one browser through a BroadcastChannel (&local=1)
// (net-room.js, net-cars.js). Nothing in the menus leads here; main.js loads this module only when
// the address asks for a room:
//   index.html#sala=NOME     the first in a room hosts it and races the Opala 99; the next ones
//                            take the first free rival's car (or the one in &carro=73). Online, the
//                            group key opens the door and the host lets each guest in
//   &local=1                 this browser's windows only, no server; &servidor=local: wrangler dev
//   &auto=1                  the automatic pilot drives this window's car from the start
//   &fantasmas=1             (host) humans pass through each other instead of colliding
//   &lag=150&perda=5         simulate 150 ms of network delay and 5% of lost car messages
// The host picks the track and presses Corrida única: the grid waits on 3, every guest in the room
// (and whoever joins meanwhile) loads it, and the lights go out for everyone when the host presses
// Largar. The host's game drives the bots and passes every car on; each window
// drives its own car and places the others where their owners say they are (RaceField's remote
// cars). Every window resolves a contact for its own car only, against where it shows the other
// one; the other window does the same from its side. Modo Corrida only.
import {Room,roomParams,HOST_NUMBER} from './net-room.js';
import {ServerLink,ROOM_SERVER,LOCAL_SERVER} from './net-link.js';
import {RemoteCar,packCar,readCar} from './net-cars.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
// Car messages a second; after crossing the line, how long the results wait for the others (s).
const SEND=1/30,RESULTS_WAIT=60;
// The host's Opala 99 as the guests see it: black, the yellow stripe and its number.
const HOST_PAINT={color:0x17191b,stripe:0xf0cd1f};
const hostEntry=name=>({...PLAYER_ENTRY,mark:PLAYER_ENTRY.color,name,shortName:name,human:true});
const seatIndex=number=>RIVAL_ROSTER.findIndex(e=>e.number===number);
const clock=()=>performance.now()/1000;
// The group key, typed once on this browser (the server keeps the real one as a secret).
const KEY_STORE='autopobre-chave-grupo';
const readKey=()=>{try{return localStorage.getItem(KEY_STORE)??'';}catch{return '';}};
const saveKey=key=>{try{localStorage.setItem(KEY_STORE,key);}catch{}};
// What the card says when the server closed the door (net-link.js CLOSED) or the line dropped.
const PROBLEMS={conectando:'Conectando ao servidor da sala…',reconectando:'Conexão caiu · tentando de novo…',chave:'Digite a chave do grupo para entrar na sala.',
 cheia:'Sala cheia.',recusado:'O anfitrião recusou sua entrada.',expulso:'Você foi removido da sala.',excesso:'Conexão encerrada: mensagens demais.',
 ocupada:'Muitas tentativas com a chave errada · tente de novo em um minuto.','outra-aba':'Esta sala foi aberta em outra aba.',origem:'Endereço não autorizado.',
 fora:'Sem conexão com o servidor da sala (internet, ou o limite do dia do servidor).',saiu:'Você saiu da sala.'};
// game: main.js hooks (session, immersive, template, pilotName, command, autopilot, startRace, hasCircuit).
export function startMultiplayer(game,hash=location.hash){const params=roomParams(hash);return params?new Multiplayer(game,params):null;}
class Multiplayer {
 constructor(game,params){
  this.game=game;this.params=params;this.autopilot=params.auto;this.autopilotOn=false;
  const link=params.local?null:new ServerLink({url:params.server==='local'?LOCAL_SERVER:ROOM_SERVER,room:params.room,key:readKey,name:()=>this.room?.name??game.pilotName()});
  this.room=new Room({room:params.room,name:game.pilotName(),want:params.car,lag:params.lag,loss:params.loss,link});
  this.race=null;this.phase='lobby';this.holding=false;this.remotes=new Map();this.seq=0;this.sendClock=0;this.readyClock=0;this.finishedAt=null;this.panelClock=0;this.immersive=null;this.rows='';
  // A new race from the host: load its track and start (false: busy loading, asked again later).
  this.room.on('race',race=>this.game.hasCircuit(race.circuit)&&this.game.startRace(race.circuit)).on('go',race=>this.go(race))
   .on('state',(id,m)=>this.heardCar(id,m)).on('snap',m=>this.heardField(m)).on('leave',p=>this.left(p)).on('change',()=>this.render())
   // Someone took (or left) a seat, or renamed, while the start waits: the cars and their name tags follow.
   .on('seats',race=>{if(this.race&&race.id===this.race.id&&this.phase==='waiting'){this.race=race;this.seatHumans();}});
  this.buildPanel();this.room.start();
  // Enter gives the start too (the mouse may be captured by the track).
  addEventListener('keydown',e=>{if(e.code==='Enter'&&this.canStart()&&!e.target.closest?.('input,select,textarea,dialog')){e.preventDefault();this.room.lightsOut();}});
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
  // Held on 3 until the host gives the start (Largar, or Enter).
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
  this.race=room.role==='host'?grid?room.planRace({circuit,laps:immersive.laps,ace:!!field.ace,level:field.level,retirements:field.retirements!==false,ghosts:this.params.ghosts}):null
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
  car.ghost=!!race.ghosts;
  if(me===HOST_NUMBER){this.seatHumans();return;}
  const i=seatIndex(me),slot=field.rivals[i],back={x:car.x,y:car.y,heading:car.heading},name=race.seats.find(s=>s.number===me).name;
  // This window's car takes its own seat on the grid...
  car.x=slot.car.x;car.y=slot.car.y;car.heading=slot.car.heading;car.settle();
  immersive.freeLastS=car.surface.s;immersive.freePlayerProgress=slot.progress;immersive.playerEntry={...slot.entry,name,shortName:name,human:true};
  // ...and that seat shows the host's Opala 99, at the back where the host's car starts.
  slot.car.x=back.x;slot.car.y=back.y;slot.car.heading=back.heading;slot.car.settle();slot.lastS=slot.car.surface.s;slot.progress=0;
  if(this.hostObject)visual.rivals[i]=this.hostObject;
  // The host's game drives every other car: here all of them come over the network.
  field.rivals.forEach((r,k)=>this.remote(r,k===i?HOST_NUMBER:r.entry.number,false));
  this.seatHumans();
 }
 // Which of the other cars humans drive, and their names: at the reset, and again whenever a seat
 // is taken or left while the start waits. The host turns a guest's seat into a remote car (and a
 // seat left back into a bot); every window names the humans (ghosts in a race without contact).
 seatHumans(){
  const immersive=this.immersive,field=immersive.field,visual=immersive.visual,race=this.race,me=this.myNumber();if(!race||!me)return;
  const humans=new Map(race.seats.map(s=>[s.number,s])),mine=me===HOST_NUMBER?-1:seatIndex(me);
  field.rivals.forEach((r,k)=>{
   const number=k===mine?HOST_NUMBER:RIVAL_ROSTER[k].number,seat=humans.get(number),obj=visual.rivals[k];
   if(me===HOST_NUMBER){if(seat&&!r.puppet)this.remote(r,number,true);else if(!seat&&r.puppet)this.release(r);}
   r.car.ghost=!!seat&&!!race.ghosts;
   r.entry=!seat?RIVAL_ROSTER[k]:number===HOST_NUMBER?hostEntry(seat.name):{...RIVAL_ROSTER[k],name:seat.name,shortName:seat.name,human:true};
   obj.userData.entry=r.entry;this.label(obj,seat?.name??null);
  });
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
 // Host: a guest gone (or never ready) leaves a bot in its seat, from where the car is. The human's
 // best lap goes with them: only the bot's own full laps may reach the AI records (ai-records.js).
 release(r){
  const i=this.immersive.field.rivals.indexOf(r),obj=this.immersive.visual.rivals[i];
  this.remotes.delete(r.seat);r.puppet=null;r.seat=null;r.car.remote=r.car.ghost=false;r.car.best=null;r.lastS=r.car.surface.s;r.entry=RIVAL_ROSTER[i];
  obj.userData.entry=r.entry;this.label(obj,null);
 }
 // Name tags: a human's name in lime over the car; null puts the driver's own tag back.
 label(obj,name){
  const u=obj.userData;if((u.mpName??null)===(name??null))return;u.mpName=name??null;
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
 // The host may give the start while its race waits (the Largar button, or Enter).
 canStart(){return this.room.role==='host'&&this.phase==='waiting'&&this.room.race?.state==='waiting';}
 go(race){
  if(!this.race||race.id!==this.race.id)return;
  this.race=race;const immersive=this.immersive;
  if(!race.seats.some(s=>s.id===this.room.id))return;
  this.phase='racing';this.holding=false;
  // Whoever had not loaded the race yet was left out of it: that seat is a bot again.
  this.seatHumans();
  // The start reached a guest a network delay late: its countdown makes up for it.
  if(this.room.role==='guest')immersive.freeCountdown=Math.max(.2,3-this.room.latency);
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
  // The host's start, shown while its race waits (Enter does the same).
  const start=this.panel.start=add('button','mp-start');start.type='button';start.id='mpStart';start.hidden=true;
  start.onclick=()=>{this.room.lightsOut();start.blur();};
  root.insertBefore(start,this.panel.list);
  // Online: the group key (asked when the server wants it), and the host's doorman.
  const form=this.panel.key=add('form','mp-key');form.hidden=true;
  const field=add('input','',form);field.type='password';field.id='mpKey';field.placeholder='Chave do grupo';field.autocomplete='off';field.maxLength=128;
  const enter=add('button','',form);enter.type='submit';enter.textContent='Entrar';
  form.onsubmit=e=>{e.preventDefault();const key=field.value.trim();if(!key)return;saveKey(key);field.value='';field.blur();this.room.retry();};
  root.insertBefore(form,this.panel.list);
  this.panel.knocks=add('ul','mp-knocks');root.insertBefore(this.panel.knocks,this.panel.list);
  const label=add('label','mp-auto'),box=add('input','',label);box.type='checkbox';box.id='mpAuto';box.checked=this.autopilot;label.append(' Piloto automático neste carro');
  // The box gives the focus back at once: typed driving keys are ignored while an input has it.
  box.onchange=()=>{this.autopilot=box.checked;if(!box.checked&&this.autopilotOn){this.game.autopilot(false);this.autopilotOn=false;}box.blur();};
  this.panel.auto=box;this.panel.net=add('small','mp-net');
  document.body.append(root);
 }
 statusText(s){
  const room=this.room,me=room.number;
  if(room.problem&&PROBLEMS[room.problem])return PROBLEMS[room.problem];
  if(!room.role)return 'Procurando a sala…';
  if(room.pending)return 'Esperando o anfitrião aceitar você…';
  // The host said goodbye (a reload, most likely): its guests wait for it before electing another.
  if(room.hostAway)return 'O anfitrião saiu · esperando ele voltar…';
  if(this.immersive?.active)return 'A sala corre só no Modo Corrida.';
  if(room.role==='guest'&&!me)return 'Sala cheia: os 15 carros estão ocupados.';
  if(this.phase==='waiting'){
   if(room.role==='host'&&room.race){
    const {guests,ready}=this.readiness();
    return guests?`${ready} de ${guests} convidado${guests>1?'s':''} pronto${ready===1?'':'s'} · quem entrar agora também larga`:'Ninguém na sala ainda · quem entrar agora larga junto';
   }
   return this.race?'Pronto · o anfitrião dá a largada':'Esperando o anfitrião largar…';
  }
  if(this.phase==='racing'){
   if(this.immersive?.freeFinished){const left=this.stillRacing(),wait=Math.max(0,Math.ceil(RESULTS_WAIT-(clock()-(this.finishedAt??clock()))));return `Você terminou! Esperando ${left} piloto${left>1?'s':''} · ${wait} s`;}
   if(room.role==='guest'&&room.lobby?.race?.id!==this.race?.id)return 'O anfitrião saiu desta corrida.';
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
 // Host, while its race waits: guests seated in it, and how many of them have it loaded.
 readiness(){const r=this.room.race,guests=r?r.seats.filter(x=>x.number!==HOST_NUMBER):[];return {guests:guests.length,ready:guests.filter(x=>this.room.ready.has(x.id)).length};}
 render(){
  const p=this.panel;if(!p)return;const room=this.room,s=this.game.session(),me=room.number;
  p.start.hidden=!this.canStart();
  if(!p.start.hidden){const {guests,ready}=this.readiness(),loading=guests-ready;p.start.textContent=!guests?'Largar sozinho ↵':loading?`Largar já · ${loading} carregando ↵`:'Largar ↵';p.start.classList.toggle('mp-go',!!guests&&!loading);}
  // The held 3 says what it waits for.
  if(this.holding){const caption=document.getElementById('countdownCaption');if(caption&&caption.textContent!=='AGUARDANDO A LARGADA')caption.textContent='AGUARDANDO A LARGADA';}
  // Out of the way of the result sheet; under the circuits on the track screen; one line on track.
  const results=document.getElementById('raceResults');p.root.hidden=!!results&&!results.hidden;
  p.root.classList.toggle('mp-racing',s.started&&!s.paused);p.root.classList.toggle('mp-tracks',!document.getElementById('tracks')?.classList.contains('hidden'));
  p.room.textContent=room.room;
  p.role.textContent=room.role==='host'?'anfitrião · #99':room.pending?'na porta':room.role==='guest'?(me?`convidado · #${me}`:'assistindo'):'…';
  p.status.textContent=this.statusText(s);
  // The key form when the server asks for it; knocks and kicks for an online host. Names only ever
  // reach the page as text.
  p.key.hidden=!(room.online&&room.problem==='chave');
  const knocks=room.role==='host'?[...room.knocks.values()]:[],kickable=room.online&&room.role==='host'&&!(s.started&&!s.paused);
  const rows=room.members.map(m=>({id:m.id,text:`#${m.number??'—'} ${m.name}${m.number===HOST_NUMBER?' (anfitrião)':''}${m.id===room.id?' · você':''}`,kick:kickable&&m.id!==room.id}));
  const key=JSON.stringify([rows,knocks]);
  if(key!==this.rows){
   this.rows=key;
   const button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{action();b.blur();};return b;};
   p.list.replaceChildren(...rows.map(r=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=r.text;li.append(name);if(r.kick)li.append(button('Expulsar',()=>this.room.kick(r.id)));return li;}));
   p.knocks.replaceChildren(...knocks.map(k=>{const li=document.createElement('li'),name=document.createElement('span');name.textContent=`${k.name} quer entrar`;li.append(name,button('Aceitar',()=>this.room.admit(k.id)),button('Recusar',()=>this.room.deny(k.id)));return li;}));
  }
  p.knocks.hidden=!knocks.length;
  p.net.textContent=[room.online?'servidor':'mesmo PC',room.role==='guest'?`ping ${Math.round(room.latency*2000)} ms`:room.role==='host'?`${Math.max(0,room.members.length-1)} convidado(s)`:'',
   this.params.lag?`atraso simulado ${this.params.lag} ms`:'',this.params.loss?`perda simulada ${Math.round(this.params.loss*100)}%`:''].filter(Boolean).join(' · ');
 }
 // For the checks (verificar_multiplayer.py): this window's car and every other car as it shows them.
 info(){
  const immersive=this.immersive,car=immersive?.car;
  return {...this.room.info(),phase:this.phase,holding:this.holding,autopilot:this.autopilot,raceId:this.race?.id??null,
   remotes:[...this.remotes].map(([number,r])=>({number,seq:r.seq,age:r.age,finished:!!r.state?.finished})),
   me:car?{x:car.x,y:car.y,vx:car.vx,vy:car.vy,ghost:!!car.ghost}:null,
   cars:immersive?immersive.field.rivals.map((r,i)=>{const obj=immersive.visual.rivals[i];return {number:r.seat??r.entry.number,name:r.entry.shortName,x:r.car.x,y:r.car.y,remote:!!r.car.remote,ghost:!!r.car.ghost,
    shown:!!obj?.visible&&!!obj.parent,drawn:obj?[obj.position.x,-obj.position.z]:null};}):[]};
 }
}
