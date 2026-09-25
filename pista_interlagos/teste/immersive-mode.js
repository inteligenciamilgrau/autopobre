import * as THREE from 'three';
import {CIRCUITS,circuitId} from './circuits.js';
import {RIVAL_ROSTER,GRID_SIZE} from './race-roster.js';
import {RaceField} from './race-field.js';
import {recognitionInput} from './physics.js';
import {CrashParts} from './crash-parts.js';
import {ImmersiveState,FANS,JOKES,BLAZER_COST,COSTS,START,startCost} from './immersive-state.js';
import {SWITCH_TILT} from './cockpit-instruments.js';
import {ImmersiveVisuals,trackPoint} from './immersive-visuals.js';
import {footGround} from './on-foot.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const idle={throttle:0,brake:1,left:0,right:0,handbrake:0,reverse:0},still={throttle:0,brake:0,left:0,right:0};
const touchScreen=()=>document.body.classList.contains('touch-device');
// What the action key does by the Opala in the paddock (car-openings.js carSpot); open: already open.
const CAR_ACTIONS=Object.freeze({capo:open=>open?'Fechar o capô':'Abrir o capô · ver o motor',porta_malas:open=>open?'Fechar o porta-malas':'Abrir o porta-malas',porta:()=>'Entrar no Opala 99'});
const money=n=>`R$ ${n.toFixed(2).replace('.',',')}`;
// Throttle dial for the engine start: half a circle from no throttle (left) to full (right),
// banded as START: too little, where it catches, too much, flooding. #startNeedle turns about (110, 112).
const START_DIAL=(()=>{
 const cx=110,cy=112,r=88,at=(f,rr=r)=>{const a=Math.PI*(1-f);return [cx+rr*Math.cos(a),cy-rr*Math.sin(a)].map(v=>v.toFixed(1));};
 const bands=[[0,START.low,'BAIXO'],[START.low,START.high,'NO PONTO'],[START.high,START.flood,'ALTO'],[START.flood,1,'AFOGA']];
 const arcs=bands.map(([f0,f1],i)=>{const [x0,y0]=at(f0),[x1,y1]=at(f1);return `<path class="band band-${i}" d="M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}"/>`;}).join('');
 const ticks=Array.from({length:21},(_,i)=>{const [x0,y0]=at(i/20,r-11),[x1,y1]=at(i/20,r-(i%5?15:21));return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;}).join('');
 const labels=bands.map(([f0,f1,label],i)=>{const [x,y]=at((f0+f1)/2,r+15);return `<text class="band-${i}" x="${x}" y="${y}">${label}</text>`;}).join('');
 return `<svg class="start-dial" viewBox="-12 -16 244 136" aria-hidden="true">${arcs}<g class="ticks">${ticks}</g>${labels}<g id="startNeedle"><path d="M${cx-4} ${cy}L${cx} ${cy-r+14}L${cx+4} ${cy}Z"/><circle cx="${cx}" cy="${cy}" r="8"/></g></svg>`;
})();
export class ImmersiveMode {
 // layout: the circuit's Box 99 (pit-box99.js), whose garage and café the pilot can walk
 // into before the race; obstacles: walls the walking camera must not pass through.
 constructor({scene,carRoot,car,data,driver,rivalTemplate,skidMarks,resetVehicle,releaseMouse,onNormal,layout=null,obstacles=[],setView=null,getView=null}){
  Object.assign(this,{carRoot,car,data,resetVehicle,releaseMouse,onNormal,setView,getView});let profile={};try{profile=JSON.parse(localStorage.getItem('opala99-immersive-v1'))||{};}catch{}
  this.freeCountdown=0;this.goTime=0;this.freeFuel=12;this.laps=3;this.freeTotalLaps=3;this.storyLaps=3;this.freeFinished=false;this.freePosition=GRID_SIZE;this.freePlayerProgress=0;this.rivalTrails=RIVAL_ROSTER.map(()=>skidMarks?.createTrail());this.field=new RaceField(data,{onStep:(r,i,input,dt)=>{r.input=input;this.rivalTrails[i]?.update(r.car,input,dt);},onReset:()=>this.rivalTrails.forEach(t=>t?.breakTrails())});this.parts=new CrashParts(scene);this.state=new ImmersiveState(profile);this.visual=new ImmersiveVisuals(scene,carRoot,data,driver,car,rivalTemplate);this.lastPhase='off';this.lastUI='';this.near=-1;this.rivals=this.field.rivals;this.projectile=null;this.towOrigin=0;this.prepLitres=this.fuelChoice=6;this.prepFilm=false;
  this.brand=document.querySelector('.wordmark');this.baseBrand=this.brand.innerHTML;this.baseTitle=document.title;
  this.controls=document.querySelector('footer>div');this.baseControls=this.controls.innerHTML;
  this.panel=document.createElement('section');this.panel.id='immersivePanel';this.panel.className='hidden';this.panel.setAttribute('aria-label','Auto-Pobre Racing');document.body.append(this.panel);
  this.hud=document.createElement('section');this.hud.id='immersiveHud';this.hud.className='hidden';this.hud.innerHTML='<div class="imm-brand">AUTO-POBRE RACING <span id="immPhase"></span></div><div class="imm-meters"><span>GASOLINA <b id="immFuel"></b></span><span>CARRO <b id="immHealth"></b></span><span>VIDRO <b id="immGlass"></b></span><span>NA PISTA <b id="immPosition"></b></span></div><div id="immAlert" role="status"></div>';document.body.append(this.hud);
  this.onPickFan=e=>this.pickFan(e);document.getElementById('view').addEventListener('pointerdown',this.onPickFan);
  // On foot in the paddock, as in a third-person game: the mouse is captured (no cursor)
  // from the first key or click and turns the camera; the wheel zooms, Shift runs.
  Object.assign(this.visual,{layout,obstacles,groundAt:(x,y)=>car.sample(x,y).z-.055});this.visual.addDesk(layout?.desk);
  this.walkGround=footGround({car,pit:layout?.pit??null,layout,blocked:pos=>this.visual.blocked(pos)});
  const view=document.getElementById('view');
  this.onFootMouse=e=>{if(this.onFoot()&&document.pointerLockElement===view)this.visual.turnView(e.movementX,e.movementY);};
  this.onFootWheel=e=>{if(this.onFoot())this.visual.zoomView(Math.sign(e.deltaY));};
  this.onShift=e=>{if(e.code==='ShiftLeft'||e.code==='ShiftRight')this.shift=e.type==='keydown';};this.onBlur=()=>{this.shift=false;};
  // A capture asked for on foot can arrive after the paddock is over: give it back.
  // A capture granted late, after the phase it was asked for (walk to podium), is handed back too.
  this.onLock=()=>{if(document.pointerLockElement!==view)this.footLock=false;else if(this.footLock&&!(this.active&&['crowd','podium'].includes(this.state.phase)&&this.lockFor===this.state.phase))document.exitPointerLock();};
  document.addEventListener('mousemove',this.onFootMouse);view.addEventListener('wheel',this.onFootWheel,{passive:true});document.addEventListener('keydown',this.onShift);document.addEventListener('keyup',this.onShift);window.addEventListener('blur',this.onBlur);
  document.addEventListener('pointerlockchange',this.onLock);document.addEventListener('pointerlockerror',this.onLock);
  document.getElementById('dqContinue').onclick=()=>{if(this.state.phase==='disqualified')this.start();};
  this.panel.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled)this.action(b.dataset.action);});
  // The engine start: PARTIDA is held (on screen, or the PART button in the cockpit) and the
  // IGN switch in the cockpit is clicked like the one on screen.
  this.panel.addEventListener('pointerdown',e=>{if(e.target.closest('[data-hold="crank"]')){e.preventDefault();this.holdStarter(e.pointerId);}});
  this.onStartPointer=e=>{if(e.button!==0||!this.active||this.state.phase!=='starting')return;const hit=this.switchAt(e.clientX,e.clientY);if(hit==='ign')this.action('ign');if(hit==='part')this.holdStarter(e.pointerId);};
  this.onStartHover=e=>{if(this.active&&this.state.phase==='starting')view.style.cursor=this.switchAt(e.clientX,e.clientY)?'pointer':'';else if(view.style.cursor==='pointer')view.style.cursor='';};
  this.onStartRelease=e=>this.releaseStarter(e.pointerId);this.onStartBlur=()=>this.releaseStarter();
  view.addEventListener('pointerdown',this.onStartPointer);view.addEventListener('pointermove',this.onStartHover);window.addEventListener('pointerup',this.onStartRelease);window.addEventListener('pointercancel',this.onStartRelease);window.addEventListener('blur',this.onStartBlur);
  // Enter pays at the team's desk even with the fuel slider or the film box focused (the game skips keys typed in inputs).
  this.panel.addEventListener('keydown',e=>{if(['Enter','NumpadEnter'].includes(e.code)&&this.state.desk&&e.target.matches('input')){e.preventDefault();this.action('buy');}});
  this.panel.addEventListener('input',e=>{if(e.target.id==='immLitres'){this.prepLitres=this.fuelChoice=Number(e.target.value);this.updateDeskCosts();}if(e.target.id==='immFilm'){this.prepFilm=e.target.checked;this.updateDeskCosts();}});
 }
 dispose(){this.disable();const view=document.getElementById('view');view.removeEventListener('pointerdown',this.onPickFan);view.removeEventListener('pointerdown',this.onStartPointer);view.removeEventListener('pointermove',this.onStartHover);window.removeEventListener('pointerup',this.onStartRelease);window.removeEventListener('pointercancel',this.onStartRelease);window.removeEventListener('blur',this.onStartBlur);view.removeEventListener('wheel',this.onFootWheel);document.removeEventListener('mousemove',this.onFootMouse);document.removeEventListener('keydown',this.onShift);document.removeEventListener('keyup',this.onShift);window.removeEventListener('blur',this.onBlur);document.removeEventListener('pointerlockchange',this.onLock);document.removeEventListener('pointerlockerror',this.onLock);this.panel.remove();this.hud.remove();document.getElementById('dqContinue').onclick=null;}
 pickFan(event){
  if(event.button===0&&this.active&&this.state.phase==='podium'&&event.pointerType==='mouse'){this.mouseFree=false;queueMicrotask(()=>this.captureMouse());return;}
  if(event.button!==0||!this.active||this.state.phase!=='crowd'||!this.camera)return;
  // With the mouse captured the middle of the screen aims; a free cursor points. A
  // click takes the mouse for the camera (after this one is handled).
  const view=event.currentTarget,locked=document.pointerLockElement===view,rect=view.getBoundingClientRect(),pointer=locked?new THREE.Vector2():new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
  if(event.pointerType==='mouse'){this.mouseFree=false;queueMicrotask(()=>this.captureMouse());}
  if(this.inCar||this.state.desk)return;
  const marker=this.visual.deskMarker?.marker.visible?this.visual.deskMarker:null;
  const hit=ray.intersectObjects([...this.visual.fans.flatMap(f=>[f.person,f.label,...(f.dollar.visible?[f.dollar]:[])]),...(marker?[marker.marker,marker.sign]:[])],true)[0];if(!hit)return;
  // The registration circle or its sign: he walks there by the steps.
  if(marker&&(hit.object===marker.sign||hit.object.parent===marker.marker)){this.state.fan=null;this.state.feedback='';this.walkToFan=null;this.walkToDesk=this.visual.deskRoute();this.state.touch();this.ui();return;}
  const index=this.visual.fans.findIndex(f=>{let obj=hit.object;while(obj){if(obj===f.person||obj===f.label||obj===f.dollar)return true;obj=obj.parent;}return false;});if(index<0)return;
  this.state.fan=null;this.state.feedback='';this.state.touch();this.walkToFan=index;this.walkToDesk=null;
  if(this.visual.hero.position.distanceTo(this.visual.fans[index].pos)<2.6){this.state.talk(index);this.walkToFan=null;}
  this.ui();
 }
 positionDialogue(){if(this.state.phase!=='crowd'||this.state.fan===null||!this.camera)return;const p=this.visual.fans[this.state.fan].person.getWorldPosition(new THREE.Vector3());p.y+=1.85;p.project(this.camera);const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight,rect=this.panel.getBoundingClientRect();this.panel.style.left=`${Math.round(clamp(x+22+rect.width>innerWidth?x-rect.width-22:x+22,12,Math.max(12,innerWidth-rect.width-12)))}px`;this.panel.style.top=`${Math.round(clamp(y-rect.height*.3,80,Math.max(80,innerHeight-rect.height-70)))}px`;this.panel.style.bottom='auto';}
 get active(){return this.state.active;}
 get finishing(){return this.finishElapsed!==null&&this.finishElapsed!==undefined;}
 get freeResultReady(){return this.freeFinished&&!this.finishing;}
 get finishOpacity(){const t=clamp((this.finishElapsed??0)/5,0,1);return t*t*(3-2*t);}
 beginFinish(position){
  if(this.finishing)return;
  this.finishElapsed=0;this.finishTime=this.car.clock;this.finishPosition=position;this.finishBest=this.car.best;
  this.freeOrder=[...this.rivals].sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity)||b.progress-a.progress).map(r=>({...r.entry,bestLap:r.car.best,totalTime:r.finished?r.finishTime:null,finished:r.finished,laps:r.car.laps}));
  this.projectile=null;this.state.emitSound('finish');
 }
 stepFinish(input,dt){
  const c=this.car,command=recognitionInput(c,{maxSpeed:Math.max(12,Math.hypot(c.vx,c.vy)),cornerGrip:7,braking:7});
  // Keep rolling along the circuit while easing off; racing input cannot change the result.
  command.throttle=0;command.brake=Math.max(.06,command.brake);Object.assign(input,command);
  c.step(command,dt);c.clock=this.finishTime;
  this.field.step(c,dt,this.active?this.storyLaps:this.freeTotalLaps);
  this.finishElapsed=Math.min(5,this.finishElapsed+dt);
  if(this.finishElapsed>=5-1e-8){
   this.finishElapsed=null;
   if(this.active){this.state.finish(this.finishPosition,false);this.sync();}
   else this.state.emitSound(this.freePosition===1?'podiumWin':'podiumLoss');
  }
 }
 allowsPointer(){return ['race','tow','grid'].includes(this.state.phase);}
 // While the paddock walk still holds the mouse, losing it is not a pause.
 blockingUI(){return this.active&&(!this.allowsPointer()||!!this.footLock);}
 onFoot(){return this.active&&this.state.phase==='crowd'&&!this.inCar;}
 // The mouse and wheel drive this mode's own camera: the walk, and the podium's free camera.
 ownsMouse(){return this.onFoot()||this.active&&this.state.phase==='podium';}
 // F beside the Opala in Box 99 gets in, as in GTA: the real car takes its place and
 // the cockpit view shows the interior (the mouse looks round); F again gets out.
 enterCar(){
  const pose=this.visual.ownPose();if(!pose||this.inCar)return false;
  const c=this.car;c.x=pose.x;c.y=pose.y;c.heading=pose.heading;c.vx=c.vy=c.yaw=0;c.surface=c.sample(c.x,c.y);c.index=c.surface.i;c.settle?.();
  this.inCar=this.visual.inCar=true;this.walkToFan=null;this.viewBefore=this.getView?.()??'chase';this.visual.restoreCamera();this.setView?.('cockpit');this.state.emitSound('click');return true;
 }
 // The paddock hint by the Opala: what E does where the pilot stands.
 carHint(){
  const spot=this.visual.carAction();if(spot){const text=CAR_ACTIONS[spot](this.visual.ownOpen(spot));return `E: ${text[0].toLowerCase()+text.slice(1)}`+(spot==='porta'?' (ou F)':'');}
  return this.visual.nearCar()?'F: entrar no Opala 99 · E na frente abre o capô, atrás o porta-malas':'';
 }
 // Guidance to the registration: the action key by the team stand, else the way there once the kitty is enough.
 deskHint(){
  if(!this.visual.desk)return '';if(this.visual.nearDesk())return touchScreen()?'Entre no círculo amarelo para falar com a equipe 99':'E: falar com a equipe 99 · inscrição';
  return this.state.cash>=COSTS.minimum?'Vaquinha fechada! Inscrição na barraca da equipe 99, sobre o muro: suba a escadinha ao lado dela.':'';
 }
 // The team at the computers: the kitty against the costs, with the fuel and the optional
 // windscreen film chosen right here; paying goes straight to the engine start. Back to the
 // supporters for more otherwise. updateDeskCosts follows the slider and the box.
 deskPanel(){
  const s=this.state,cash=s.cash,ready=cash>=COSTS.minimum,litres=Math.min(12,Math.floor((cash-COSTS.entry)/COSTS.litre)),least=(COSTS.minimum-COSTS.entry)/COSTS.litre;
  const line=s.feedback||(ready?`Fechou! Com ${money(cash)} dá a inscrição e até ${litres} litros de gasolina. Quanto vai no tanque?`:`Com ${money(cash)} ainda não dá: é ${money(COSTS.entry)} da inscrição e pelo menos ${least} litros de gasolina. Volta lá e pede mais um dindin pra torcida!`);
  const row=(label,value,id)=>`<dt${id?` id="${id}Label"`:''}>${label}</dt><dd${id?` id="${id}"`:''}>${value}</dd>`;
  return `<div class="social-person"><span class="social-avatar">99</span><div><span>CONVERSANDO COM</span><h2>Equipe 99 · computadores</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">“${line}”</div>`
   +`<dl class="imm-budget"><dt class="imm-budget-cash">Na vaquinha</dt><dd class="imm-budget-cash">${money(cash)}</dd>${row('Inscrição',money(COSTS.entry))}${row(`Gasolina · ${money(COSTS.litre)}/L`,'','deskFuel')}`
   +`<dd class="imm-budget-wide"><input id="immLitres" type="range" min="2" max="12" value="${this.prepLitres}" aria-label="Litros de gasolina"></dd>`
   +`<dt><label class="imm-budget-check"><input id="immFilm" type="checkbox" ${this.prepFilm?'checked':''}> Proteção do para-brisa <small>opcional</small></label></dt><dd id="deskFilm"></dd>`
   +`<dt class="imm-budget-total">Total</dt><dd class="imm-budget-total" id="deskTotal"></dd>${row('','','deskLeft')}</dl>`
   +`<p class="desk-fuel-hint">${CIRCUITS[circuitId(this.data.meta.id)].fuel} Burnout e vazamentos gastam mais.</p>`
   +`<div class="desk-choices">${this.button('buy',touchScreen()?'Pagar e ir →':'Pagar e ir pra partida → (Enter)',true,!ready)}${this.button('leaveDesk',touchScreen()?'Pedir mais dindin':'Voltar e pedir mais dindin (E)')}</div>`;
 }
 updateDeskCosts(){
  const q=id=>this.panel.querySelector('#'+id);if(!q('deskTotal'))return;
  const cash=this.state.cash,cost=startCost(this.prepLitres,this.prepFilm),short=cash<COSTS.minimum?COSTS.minimum-cash:Math.max(0,cost-cash),ok=!short;
  q('deskFuel').textContent=`${this.prepLitres} L · ${money(this.prepLitres*COSTS.litre)}`;q('deskFilm').textContent=this.prepFilm?money(COSTS.film):'—';q('deskTotal').textContent=money(cost);
  q('deskLeftLabel').textContent=ok?'Sobra na vaquinha':cash<COSTS.minimum?'Faltam para a inscrição':'Faltam';q('deskLeft').textContent=money(ok?cash-cost:short);
  for(const id of ['deskLeft','deskLeftLabel'])q(id).classList.toggle('imm-budget-short',!ok);
  const b=this.panel.querySelector('[data-action="buy"]');if(b)b.disabled=!ok;
 }
 restoreStartView(){if(this.startView){this.setView?.(this.startView);this.startView=null;}}
 // The overhead switch bank in the real cockpit (cockpit-instruments.js): during the start the
 // IGN lever follows the switch and the PART dome sinks while the starter turns, and a ring
 // pulses round the next one to use; racing: IGN on (settle snaps it there).
 startSwitches(dt,settle=false){
  const s=this.state;let sw=this.switches;
  if(!sw?.ign){const ign=this.carRoot.getObjectByName('Interruptor_IGN'),part=this.carRoot.getObjectByName('Botao_PART');sw=this.switches=ign&&part?{ign,part,partZ:part.position.z}:null;}
  if(!sw)return;
  const starting=!settle&&this.active&&s.phase==='starting',k=settle?1:Math.min(1,dt*28);
  sw.ign.rotation.x+=((starting&&!s.ignOn?-1:1)*SWITCH_TILT-sw.ign.rotation.x)*k;
  sw.part.position.z+=(sw.partZ-(starting&&s.crank>0?.003:0)-sw.part.position.z)*k;
  if(!this.startRing){
   const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.strokeStyle='#ffd23d';g.shadowColor='#ffb800';g.shadowBlur=16;g.lineWidth=9;g.beginPath();g.arc(64,64,44,0,Math.PI*2);g.stroke();
   const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;this.startRing=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,transparent:true}));this.startRing.renderOrder=95;this.visual.root.add(this.startRing);
  }
  const next=starting&&this.getView?.()==='cockpit'?(!s.ignOn?sw.ign:s.crank>0?null:sw.part):null;this.startRing.visible=!!next;
  if(next){next.getWorldPosition(this.startRing.position);const pulse=1+.18*Math.sin(performance.now()/160);this.startRing.scale.setScalar(.042*pulse);this.startRing.material.opacity=.65+.35*Math.sin(performance.now()/160);}
 }
 // The IGN switch or the PART button under a pointer (screen px), from the cockpit view.
 switchAt(x,y){
  const sw=this.switches;if(!sw||!this.camera||this.getView?.()!=='cockpit')return null;const rect=document.getElementById('view').getBoundingClientRect();
  for(const [name,obj] of [['ign',sw.ign],['part',sw.part]]){const p=obj.getWorldPosition(new THREE.Vector3()).project(this.camera);if(p.z<1&&Math.hypot(rect.left+(p.x+1)/2*rect.width-x,rect.top+(1-p.y)/2*rect.height-y)<Math.max(26,rect.width*.022))return name;}
  return null;
 }
 // Starter held from a pointer (the PART button on screen or in the cockpit) until it is let go.
 holdStarter(pointer){if(this.active&&this.state.phase==='starting'){this.state.starter=true;this.crankPointer=pointer;}}
 releaseStarter(pointer){if(this.crankPointer!==undefined&&this.crankPointer!==null&&(pointer===undefined||pointer===this.crankPointer)){this.state.starter=false;this.crankPointer=null;}}
 // Hora de acordar o Opala: the steps (IGN, PARTIDA, throttle), the throttle dial with its
 // bands and three meters (catching, flooding, battery); updateStartPanel moves them each frame.
 startPanel(){
  const touch=touchScreen(),key=k=>touch?'':`<kbd>${k}</kbd>`;
  return `<div class="imm-eyebrow">SEM AFOGAR!</div><h2>Hora de acordar o Opala.</h2>`
   +`<ol class="start-steps"><li data-step="ign">${key('L')}<span>Ligue o <b>IGN</b> no painel de cima</span></li><li data-step="part">${key('I')}<span>Segure a <b>PARTIDA</b></span></li><li data-step="gas">${key('W')}<span>${touch?'ACELERAR':'Acelerador'} <b>no ponto</b></span></li></ol>`
   +`<div class="start-gauge">${START_DIAL}<div class="start-readout"><b id="startZone"></b><span id="startPct"></span></div></div>`
   +`<div class="start-meters"><span>Pegando<i><b id="startCatch"></b></i></span><span>Afogamento<i><b id="startFlood"></b></i></span><span>Bateria<i><b id="startBattery"></b></i></span></div>`
   +`<div class="start-buttons"><button type="button" data-action="ign" class="start-ign${this.state.ignOn?' on':''}"><span class="start-led"></span>IGN <b>${this.state.ignOn?'ON':'OFF'}</b></button><button type="button" data-hold="crank" class="start-crank">PARTIDA <small>segure</small></button></div><p class="start-tip" id="startTip" role="status"></p>`;
 }
 updateStartPanel(){
  const s=this.state,q=id=>this.panel.querySelector('#'+id),needle=q('startNeedle');if(!needle)return;
  const p=s.pressure,zone=p<START.low?0:p<=START.high?1:p<=START.flood?2:3,cranking=s.crank>0,pumping=!cranking&&p>(this.lastPressure??p)+1e-4;this.lastPressure=p;
  needle.setAttribute('transform',`rotate(${((p-.5)*180).toFixed(1)} 110 112)`);this.panel.querySelector('.start-dial').dataset.zone=zone;
  q('startZone').textContent=['BAIXO','NO PONTO','ALTO','AFOGANDO'][zone];q('startZone').dataset.zone=zone;q('startPct').textContent=Math.round(p*100)+'% do acelerador';
  q('startCatch').style.width=`${Math.min(100,(s.ignitionGood||0)/s.catchTime()*100)}%`;q('startFlood').style.width=`${Math.min(100,s.flood*100)}%`;q('startBattery').style.width=`${s.battery*100}%`;
  q('startFlood').parentElement.parentElement.classList.toggle('warn',s.flood>.5);q('startBattery').parentElement.parentElement.classList.toggle('warn',s.battery<.3);
  const done={ign:s.ignOn,part:cranking,gas:cranking&&zone===1},current=!s.ignOn?'ign':!cranking?'part':'gas';
  for(const li of this.panel.querySelectorAll('[data-step]')){li.classList.toggle('done',done[li.dataset.step]);li.classList.toggle('now',li.dataset.step===current);}
  this.panel.querySelector('.start-crank')?.classList.toggle('pressed',cranking);
  // Pumping the pedal between tries only soaks the plugs; wet plugs want little throttle to dry.
  const touch=touchScreen(),wet=s.flood>.5,tip=pumping?'Pisando sem dar partida você só molha a vela!'
   :!s.ignOn?(cranking?'Sem IGN o motor gira, mas não pega! Ligue o IGN.':`Primeiro o painel de cima: IGN em ON (${touch?'toque no IGN':'L, ou clique no interruptor'}).`)
   :!cranking?(wet?'Vela molhada: dê partida com pouco acelerador para secar.':`Agora segure a PARTIDA (${touch?'botão PARTIDA':'I'}) e dose o acelerador na faixa verde.`)
   :(s.battery<.3?'Bateria arriando! ':'')+(wet&&zone<2?'Vela molhada: segura no ponto que ela seca…':['Falta acelerador: dê toques.','No ponto! Segura assim…','Alto demais: alivia um pouco.','AFOGANDO! Tira o pé do acelerador!'][zone]);
  q('startTip').textContent=tip;q('startTip').dataset.zone=pumping?3:cranking&&s.ignOn?zone:'';
 }
 leaveCar(place=true){
  if(!this.inCar)return false;this.inCar=this.visual.inCar=false;if(place)this.visual.leaveCar(this.walkGround);
  this.resetVehicle();this.setView?.(this.viewBefore??'chase');this.state.emitSound('click');return true;
 }
 // Captures the mouse for the walk (the browser needs a key or click just before). Not
 // during a conversation, whose jokes are clicked, nor after Tab freed it.
 captureMouse(){
  const view=document.getElementById('view');
  const walking=this.state.phase==='crowd'&&this.state.fan===null&&!this.state.desk,podium=this.state.phase==='podium'&&this.podiumCamera;
  if(!this.active||!(walking||podium)||this.mouseFree||touchScreen()||!view?.requestPointerLock||document.pointerLockElement===view||navigator.userActivation?.isActive===false)return;
  this.footLock=true;this.lockFor=this.state.phase;try{view.requestPointerLock()?.catch?.(()=>{this.footLock=false;});}catch{this.footLock=false;}
 }
 save(){try{localStorage.setItem('opala99-immersive-v1',JSON.stringify(this.state.profile));}catch{}}
 // laps (the player's setting, main.js) is taken at each start: storyLaps for the story,
 // freeTotalLaps (resetField) for the free race. The story's tank still buys what one lap
 // burnt (state.fuelScale), the free race's 12 L still last the race.
 start(){this.freeCountdown=0;this.goTime=0;this.car.condition?.reset();this.finishElapsed=null;this.finishTime=null;this.freeOrder=null;this.recordAssisted=false;this.resetVehicle();this.inCar=this.visual.inCar=false;this.storyLaps=this.laps;this.state.start();this.state.fuelScale=1/this.storyLaps;this.visual.reset();this.near=-1;this.walkToFan=this.walkToDesk=null;this.deskInside=false;this.projectile=null;this.raceProgress=0;this.previousS=this.car.surface.s;this.field.reset(this.car.surface.s,{grid:true});this.parts.reset();this.rivals=this.field.rivals;this.debrisTimer=6;this.contactCooldown=0;this.sync();}
 disable(){if(this.lastPhase==='starting'){this.restoreStartView();this.startSwitches(1,true);}document.body.classList.remove('start-scene');this.finishElapsed=null;this.state.disable();this.visual.restoreCamera();this.visual.root.visible=this.visual.damage.visible=false;this.carRoot.visible=true;this.panel.classList.add('hidden');this.hud.classList.add('hidden');document.getElementById('dqScreen').classList.add('hidden');document.body.classList.remove('disqualified-scene','podium-scene','tow-scene');document.body.classList.remove('immersive-mode','immersive-stage');this.brand.innerHTML=this.baseBrand;this.controls.innerHTML=this.baseControls;document.title=this.baseTitle;this.lastPhase='off';}
 sync(){
  const s=this.state;if(s.phase===this.lastPhase)return;const previous=this.lastPhase;this.lastPhase=s.phase;this.lastUI='';
  // The engine start is played in the cockpit; the view chosen before comes back after it.
  if(s.phase==='starting'){this.startView=this.getView?.()??'chase';this.setView?.('cockpit');this.switches=null;}
  else if(previous==='starting'){this.restoreStartView();this.startSwitches(1,true);this.state.starter=false;}
  document.body.classList.toggle('start-scene',s.phase==='starting');
  // With a classification the sheet comes first (it needs the cursor); its Continue frees the podium camera.
  this.podiumCamera=s.phase==='podium'&&!this.freeOrder;
  document.body.classList.toggle('immersive-mode',s.active);document.body.classList.toggle('immersive-stage',['crowd','podium'].includes(s.phase));
  this.brand.innerHTML='AUTO-POBRE RACING<span>STEVAN GAIPO · VERSÃO IMERSIVA</span>';document.title='Auto-Pobre Racing com Stevan Gaipo';
  this.controls.innerHTML=this.baseControls.replace('reposicionar','chamar reboque');
  if(this.blockingUI())this.releaseMouse();
  // On foot the walk takes the mouse at once; the podium takes it on its sheet's Continue, a click on the scene or a key.
  if(s.phase==='crowd'||s.phase==='podium')this.mouseFree=false;
  if(s.phase==='crowd')this.captureMouse();
  if(s.phase!=='crowd')this.leaveCar(false);
  if(['crowd','starting','broken','snag','podium'].includes(s.phase))this.stop();
  if(s.phase==='podium')this.visual.dressPodium(this.freeOrder,this.pilotName);
  if(s.phase==='starting'){this.resetVehicle();this.field.reset(this.car.surface.s,{grid:true});this.rivals=this.field.rivals;}
  if(s.phase==='grid'){this.resetVehicle();this.previousS=this.car.surface.s;}
  if(s.phase==='broken')this.towOrigin=this.car.surface.s;
  if(s.phase==='inspection'){
   this.resetVehicle();this.placeCar(trackPoint(this.data,35,-2));this.stop();
  }
  document.body.classList.toggle('tow-scene',['tow','broken','snag'].includes(s.phase));document.body.classList.toggle('podium-scene',s.phase==='podium');document.body.classList.toggle('disqualified-scene',s.phase==='disqualified');if(['podium','complete','disqualified'].includes(s.phase))this.save();
 }
 stop(){this.car.vx=this.car.vy=this.car.yaw=0;this.car.burnout=this.car.rearSlipSpeed=0;}
 placeCar(p){const c=this.car;c.x=p.x;c.y=-p.z;c.heading=p.heading;c.index=p.index;c.surface=c.sample(c.x,c.y);c.settle?.();}
 action(action){
  const s=this.state;
  if(action==='mainMenu'){this.onMainMenu?.();return;}
  if(action==='talk'&&this.near>=0){this.selectedJoke=null;s.talk(this.near);}
  if(action.startsWith('joke:')&&s.phase==='crowd'&&s.fan!==null){const fan=s.fan,cash=s.cash;s.joke(Number(action.split(':')[1]));if(s.cash>cash){this.visual.showDonation(fan);s.fan=null;s.feedback='';this.walkToFan=null;s.touch();}}
  if(action==='close'){s.fan=null;s.feedback='';s.touch();}
  // The fuel starts at the pilot's last choice (6 L at first), lowered to what the kitty pays for.
  if(action==='desk'&&s.fan===null&&!this.inCar&&s.openDesk()){this.walkToFan=this.walkToDesk=null;this.visual.faceDesk();this.prepLitres=clamp(Math.min(this.fuelChoice,Math.floor((s.cash-COSTS.entry-(this.prepFilm?COSTS.film:0))/COSTS.litre)),2,12);}
  if(action==='leaveDesk')s.closeDesk();
  if(action==='car'&&s.phase==='crowd'&&s.fan===null&&!this.inCar){const spot=this.visual.carAction();if(spot==='porta'){if(this.enterCar())this.captureMouse();}else if(spot)this.visual.toggleOwnOpening(spot);}
  if(action==='buy')s.buy(this.prepLitres,this.prepFilm);
  if(action==='ign')s.switchIgnition();
  if(action==='untangle')s.untangle();
  if(action==='afterPodium')s.leavePodium();
  if(action==='inspect')s.requestInspection();
  if(action==='box')s.goToBox();
  if(action==='again'){this.start();return;}
  if(action==='blazer'){s.releaseBlazer();this.save();}
  if(action==='normal'){this.disable();this.onNormal();return;}
  this.sync();this.ui();
 }
 handleKey(code){
  if(this.finishing&&code==='KeyR')return true;
  if(!this.active)return false;
  const s=this.state;
  if(code==='KeyR'){s.fail('Volta abandonada: pediu reboque');this.sync();return true;}
  if(s.phase==='crowd'){
   // Keys on foot: Space jumps, C crouches, Tab frees the mouse (and takes it back); at
   // the team's desk Enter goes to the track. Any other key takes the mouse for the camera.
   let used=false;const free=s.fan===null&&!s.desk;
   if(code==='KeyF'&&free&&(this.inCar?this.leaveCar():this.visual.nearCar()&&this.enterCar())){this.captureMouse();return true;}
   if(this.inCar)return false;
   // E is the action key, GTA style: at the team stand it opens (or leaves) the registration;
   // by the Opala it lifts the hood (at the nose), the trunk lid (at the tail) or gets in (at
   // the driver's door); elsewhere it talks to the nearest supporter.
   if(code==='KeyE'){this.action(s.desk?'leaveDesk':s.fan!==null?'close':this.visual.nearDesk()?'desk':this.visual.carAction()?'car':'talk');used=true;}
   else if(['Digit1','Digit2','Digit3'].includes(code)&&s.fan!==null){this.action('joke:'+(Number(code.at(-1))-1));used=true;}
   else if(code==='Tab'){this.mouseFree=!!document.pointerLockElement;if(this.mouseFree)document.exitPointerLock();else this.captureMouse();return true;}
   else if(free&&code==='Space'){this.visual.jump();used=true;}
   else if(free&&code==='KeyC'){this.visual.crouch();used=true;}
   else if(s.desk&&['Enter','NumpadEnter'].includes(code)){this.action('buy');return true;}
   if(!['Escape','KeyP','KeyM'].includes(code))this.captureMouse();
   if(used)return true;
  }
  if(s.phase==='podium'){
   // Space, E (the action key) or Enter: Continuar, also while the mouse turns the photo camera.
   if(this.podiumCamera&&['Space','KeyE','Enter','NumpadEnter'].includes(code)){this.action('afterPodium');return true;}
   if(code==='Tab'){this.mouseFree=!!document.pointerLockElement;if(this.mouseFree)document.exitPointerLock();else this.captureMouse();return true;}
   if(!['Escape','KeyP','KeyM','Enter','NumpadEnter'].includes(code))this.captureMouse();
  }
  // The start: L flips the IGN switch; I is held for the starter (input.ignition).
  if(s.phase==='starting'&&code==='KeyL'){this.action('ign');return true;}
  if(s.phase==='starting'&&code==='KeyI')return true;
  return false;
 }
 beginCountdown(){this.freeCountdown=3;this.goTime=0;this.stop();this.state.emitSound('countdown');}
 step(input,dt){
  const s=this.state,c=this.car;this.goTime=Math.max(0,(this.goTime||0)-dt);
  if(!s.active&&this.freeCountdown>0){this.stop();const before=Math.ceil(this.freeCountdown);this.freeCountdown=Math.max(0,this.freeCountdown-dt);if(this.freeCountdown===0){this.goTime=.85;s.emitSound('raceGo');}else if(Math.ceil(this.freeCountdown)<before)s.emitSound('countdown');return true;}
  if(this.finishing){this.stepFinish(input,dt);return true;}if(!s.active)return false;
  if(s.phase==='crowd'&&this.inCar)this.near=-1;
  else if(s.phase==='crowd'){
   // A click on a supporter (or the registration circle) walks the pilot there (any key
   // takes over); while talking he stands.
   const free=s.fan===null&&!s.desk,steering=input.throttle||input.brake||input.left||input.right;let walking=free?input:still;
   if(free&&this.walkToFan!==null&&this.walkToFan!==undefined){
    if(steering)this.walkToFan=null;
    else{const hero=this.visual.hero.position,target=this.visual.fans[this.walkToFan].pos,dx=target.x-hero.x,dz=target.z-hero.z;if(Math.hypot(dx,dz)<2.4){s.talk(this.walkToFan);this.walkToFan=null;walking=still;}else walking=this.visual.toward(Math.atan2(-dz,dx),touchScreen());}
   }
   if(free&&this.walkToDesk?.length){
    if(steering)this.walkToDesk=null;
    else{const hero=this.visual.hero.position,reached=v=>Math.hypot(v.x-hero.x,v.z-hero.z)<.3;while(this.walkToDesk.length&&reached(this.walkToDesk[0]))this.walkToDesk.shift();
     const target=this.walkToDesk[0];if(target)walking=this.visual.toward(Math.atan2(-(target.z-hero.z),target.x-hero.x),touchScreen());else{this.walkToDesk=null;walking=still;}}
   }
   if(this.visual.walk(walking,dt,{shift:!!this.shift,touch:touchScreen(),ground:this.walkGround}))s.emitSound('footstep');
   // Stepping into the circle at the team stand opens the registration (once per visit).
   const atDesk=this.visual.atDesk();if(atDesk&&!this.deskInside&&s.fan===null)this.action('desk');this.deskInside=atDesk;
   // A conversation frees the mouse for the jokes; closing it takes the mouse back.
   if((s.fan!==null||s.desk)&&this.footLock&&document.pointerLockElement)document.exitPointerLock();
   this.near=this.visual.nearestFan();}
  else if(s.phase==='starting')s.startEngine(input,dt);
  else if(s.phase==='grid'){const before=Math.ceil(s.countdown);s.countdown-=dt;if(s.countdown<=0){s.startRace();this.goTime=.85;}else if(Math.ceil(s.countdown)<before)s.emitSound('countdown');}
  else if(s.phase==='race'){
   const before=Math.hypot(c.vx,c.vy);c.step(input,dt);const speed=Math.hypot(c.vx,c.vy),L=this.data.meta.reconstructed_xy_m,impact=Math.max(c.wallImpactSpeed??0,c.crashImpactSpeed??0,before-speed);if(impact>4)this.wallImpact(impact);
   let travel=c.surface.s-this.previousS;if(travel<-L/2)travel+=L;if(travel>L/2)travel-=L;this.raceProgress=Math.max(0,this.raceProgress+travel);this.previousS=c.surface.s;
   this.contacts(this.field.step(c,dt,this.storyLaps));
   s.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;
   s.raceStep({speed,throttle:input.throttle,wheelspin:c.rearSlipSpeed,offTrack:c.surface.pit?0:Math.max(0,Math.abs(c.surface.d)-c.surface.width/2),collision:impact>4,finished:false,position:s.position},dt);
   if(s.phase==='race'&&c.laps>=this.storyLaps)this.beginFinish(s.position);
   if(!this.finishing)this.hazards(dt);
  }else if(s.phase==='broken'){s.rescueWait-=dt;if(s.rescueWait<=0)s.beginTow();}
  else if(s.phase==='tow'){
   s.towStep(input,dt);const p=trackPoint(this.data,this.towOrigin+s.towDistance+9-4.67-s.towGap);this.placeCar(p);
   c.vx=Math.cos(c.heading)*s.towSpeed;c.vy=Math.sin(c.heading)*s.towSpeed;c.steer=c.steerVisual=(input.left-input.right)*.2;c.spin+=s.towSpeed*dt/.31595;c.rearSpin=c.spin;c.clock+=dt;
  }else if(s.phase==='disqualified'){s.disqualifiedTime-=dt;if(s.disqualifiedTime<=0){this.start();return true;}}else if(s.phase==='inspection'){
   if(s.judging){this.stop();s.inspectionStep(dt);}else{c.step(input,dt);if((c.surface.s<250||c.surface.s>this.data.meta.reconstructed_xy_m-120)&&c.surface.d>c.surface.width/2+.8)s.goToBox();}
  }
  this.sync();return true;
 }
 stepPit(dt){
  this.car.clock+=dt;this.contacts(this.field.step(this.car,dt,this.active?this.storyLaps:this.freeTotalLaps));
  if(this.active){this.state.raceTime+=dt;this.state.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;this.state.alertTime=Math.max(0,this.state.alertTime-dt);}
  else this.freePosition=1+this.rivals.filter(r=>r.progress>this.freePlayerProgress).length;
 }
 damageAt(speed,point){const c=this.car,dx=point[0]-c.x,dy=point[1]-c.y;c.condition?.impact(speed,dx*Math.cos(c.heading)+dy*Math.sin(c.heading),-dx*Math.sin(c.heading)+dy*Math.cos(c.heading));}
 hazards(dt){
  const s=this.state,c=this.car;if(s.phase!=='race'){this.projectile=null;return;}
  this.contactCooldown-=dt;this.debrisTimer-=dt;
  for(const rival of this.rivals){
   if(rival.finished)continue;const p={x:rival.car.x,y:rival.car.surface.z,z:-rival.car.y,heading:rival.car.heading},dx=p.x-c.x,dy=-p.z-c.y,forward=dx*Math.cos(c.heading)+dy*Math.sin(c.heading),side=-dx*Math.sin(c.heading)+dy*Math.cos(c.heading);
   if(!this.projectile&&this.debrisTimer<=0&&forward>7&&forward<34&&Math.abs(side)<2.1&&Math.hypot(c.vx,c.vy)>9){
    s.emitSound('debrisFly',{pan:clamp(side/3,-1,1)});this.projectile={age:0,duration:1.25,start:new THREE.Vector3(p.x-Math.cos(p.heading)*2,p.y+.8,p.z+Math.sin(p.heading)*2),end:new THREE.Vector3(c.x+c.vx*1.25+Math.cos(c.heading)*.45,c.surface.z+1.1,-c.y-c.vy*1.25-Math.sin(c.heading)*.45)};
    s.warn('Peça voando do carro da frente! Mude de linha.');this.debrisTimer=8+Math.random()*5;
   }
  }
  if(this.projectile){this.projectile.age+=dt;if(this.projectile.age>=this.projectile.duration){const target=this.projectile.end,fx=c.x+Math.cos(c.heading)*.45,fy=-c.y-Math.sin(c.heading)*.45;if(Math.hypot(target.x-fx,target.z-fy)<1.35)s.hitDebris();else s.emitSound('debrisMiss');this.projectile=null;}}
 }
 resetField(){this.freeCountdown=0;this.goTime=0;this.recordAssisted=false;this.finishElapsed=null;this.finishTime=null;this.finishBest=null;this.freeOrder=null;this.freeTotalLaps=this.laps;this.freeFuel=12;this.freeFinished=false;this.freePosition=GRID_SIZE;this.freePlayerProgress=0;this.freeLastS=this.car.surface.s;this.field.reset(this.car.surface.s,{grid:!!this.car.awaitingStart});this.rivals=this.field.rivals;this.parts.reset();}
 wallImpact(speed){const c=this.car,side=Math.sign(c.surface.d);this.damageAt(speed,[c.x+c.surface.lx*side,c.y+c.surface.ly*side]);this.parts.burst({speed,point:[this.car.x+Math.cos(this.car.heading)*2,this.car.y+Math.sin(this.car.heading)*2]},this.car);}
 contacts(hits){for(const hit of hits){if(hit.player)this.damageAt(hit.speed,hit.point);this.parts.burst(hit,this.car);if(hit.player&&this.active)this.state.hitCar(Math.min(1.5,hit.speed/10));else{const dx=hit.point[0]-this.car.x,dy=hit.point[1]-this.car.y,d=Math.hypot(dx,dy);if(d<65)this.state.emitSound('collision',{strength:Math.min(1.5,hit.speed/10)*(1-d/65),pan:clamp((-dx*Math.sin(this.car.heading)+dy*Math.cos(this.car.heading))/Math.max(1,d),-1,1)});}}}
 stepFree(dt,input={}){if(this.freeFinished)return;const previous=this.freeFuel;this.freeFuel=Math.max(0,this.freeFuel-dt*((.002+Math.hypot(this.car.vx,this.car.vy)*.00045+(input.throttle||0)*.005+(this.car.rearSlipSpeed||0)*.0023)*3/this.freeTotalLaps+(this.car.condition?.factors.leak??0)));if(previous>=1&&this.freeFuel<1)this.state.emitSound('reserve');if(previous>0&&this.freeFuel===0)this.state.emitSound('fuelEmpty');this.contacts(this.field.step(this.car,dt,this.freeTotalLaps));
  const L=this.data.meta.reconstructed_xy_m;let advance=this.car.surface.s-(this.freeLastS??0);if(advance<-L/2)advance+=L;if(advance>L/2)advance-=L;this.freePlayerProgress+=advance;this.freeLastS=this.car.surface.s;
  const progress=Math.min(this.freePlayerProgress,this.car.laps*L+this.car.surface.s+this.field.gridLeadIn);
  this.freePosition=1+this.rivals.filter(r=>r.progress>progress).length;
  if(this.car.laps>=this.freeTotalLaps&&!this.freeFinished){this.freeFinished=true;this.freePosition=1+this.rivals.filter(r=>r.finished).length;this.beginFinish(this.freePosition);}
 }
 // listener: the car the sound is heard from (a rival watched in the recon lap hears the
 // player's car among the others).
 audioScene(listener=this.car){const s=this.state,c=listener;return {phase:s.active?s.phase:this.freeResultReady?'free-finish':'free',starter:s.phase==='starting'&&s.crank>0,pressure:s.pressure,crank:s.crank,battery:s.battery,truckSpeed:s.phase==='tow'?s.truckSpeed:0,towGap:s.towGap,tankDetached:s.active&&s.tankDetached,fuel:s.fuel,won:s.active?s.result?.position===1&&s.result?.status!=='Desclassificado':this.freeFinished&&this.freePosition===1,driving:!s.active?!this.freeResultReady:s.phase==='race',rivals:!s.active||['starting','grid','race'].includes(s.phase)?[...this.rivals.filter(r=>!r.finished&&r.car!==c),...(c===this.car?[]:[{car:this.car,progress:0}])].map(r=>{const p={x:r.car.x,z:-r.car.y},dx=p.x-c.x,dy=-p.z-c.y,distance=Math.hypot(dx,dy);return {distance,speed:['starting','grid'].includes(s.phase)?10+6*Math.sin(this.visual.time*3+r.progress):Math.hypot(r.car.vx,r.car.vy),pan:clamp((-dx*Math.sin(c.heading)+dy*Math.cos(c.heading))/Math.max(1,distance),-1,1)};}).sort((a,b)=>a.distance-b.distance).slice(0,2):[]};}
 // A rival's engine and tyres as heard from its own car: its driver's last input and its tyres' slide.
 rivalSound(car){const i=this.rivals.findIndex(r=>r.car===car);return {command:this.rivals[i]?.input??{},skid:(this.rivalTrails[i]?.wheels.reduce((sum,w)=>sum+w.strength,0)??0)/4};}
 audioCommand(input){if(this.finishing)return {...input,throttle:0,reverse:0,handbrake:0,engineOff:false};return this.active?{...input,throttle:['race','grid'].includes(this.state.phase)?input.throttle:0,engineOff:!['race','grid','inspection'].includes(this.state.phase)||!!this.state.reason}:{...input,engineOff:this.freeFuel<=0};}
 update(dt,camera){this.camera=camera;this.parts.update(dt,this.car);if(!this.active){this.visual.updateFree(this.rivals,dt);return;}this.sync();this.visual.update(this.state,this.car,dt,this.rivals,this.projectile,this.towOrigin);this.visual.camera(camera,this.state,dt);if(this.state.phase==='starting')this.startSwitches(dt);this.ui();this.positionDialogue();}
 button(action,label,primary=false,disabled=false){return `<button type="button" data-action="${action}" ${disabled?'disabled':''} class="${primary?'imm-primary':''}">${label}</button>`;}
 ui(){
  const s=this.state;if(!s.active)return;const talking=s.phase==='crowd'&&(s.fan!==null||s.desk);this.panel.classList.toggle('social-dialogue',talking);this.panel.classList.toggle('desk-dialogue',s.phase==='crowd'&&s.desk);this.panel.classList.toggle('start-panel',s.phase==='starting');this.panel.classList.toggle('social-explore',s.phase==='crowd'&&!talking);if(s.phase!=='crowd'||s.fan===null){this.panel.style.removeProperty('left');this.panel.style.removeProperty('top');this.panel.style.removeProperty('bottom');}this.hud.classList.remove('hidden');
  const names={crowd:'VAQUINHA',starting:'PARTIDA',grid:'LARGADA',race:`${this.storyLaps} VOLTA${this.storyLaps>1?'S':''}`,broken:'SOCORRO',tow:'REBOQUE',snag:'FITA ENROSCADA',inspection:'PÓS-CORRIDA',podium:'SEXTO, SEMPRE',complete:'ATÉ A PRÓXIMA',disqualified:'A FOTO FICOU'};
  document.getElementById('dqScreen').classList.toggle('hidden',s.phase!=='disqualified');document.getElementById('dqCountdown').textContent='Nova vaquinha em '+Math.max(1,Math.ceil(s.disqualifiedTime))+' s';
  document.getElementById('immPhase').textContent=names[s.phase];document.getElementById('immFuel').textContent=s.fuel.toFixed(1)+' L';document.getElementById('immHealth').textContent=Math.ceil(s.health*100)+'%';document.getElementById('immGlass').textContent=Math.round((1-s.glass)*100)+'%';document.getElementById('immPosition').textContent=s.phase==='podium'?'6º no pódio':s.position+'º / '+GRID_SIZE;
  document.getElementById('immAlert').textContent=s.phase==='podium'?(touchScreen()?'Arraste na cena para girar a câmera pelo pódio.':'Câmera livre: clique na cena e o mouse olha em volta · roda aproxima · W A S D passeia · Espaço ou E continua · Tab solta o mouse'):s.phase==='crowd'?(this.inCar?'F: sair do Opala · o mouse olha em volta':talking?'':this.carHint()||this.deskHint()):s.phase==='race'?(s.alertTime>0?s.alert:s.tankDetached?'Tanque solto · combustível vazando':s.fuel<1?'Reserva! A gasolina está acabando.':'Guarde distância: o carro da frente pode soltar peças.'):s.phase==='tow'?(s.towGap<3?'FREIE · FITA FROUXA':'Controle o freio quando o caminhão diminuir.'):'';
  const spot=s.phase==='crowd'?this.visual.carAction():null,nearDesk=s.phase==='crowd'&&this.visual.nearDesk(),key=[s.phase,s.revision,this.near,s.fan,s.desk,nearDesk,spot,spot&&this.visual.ownOpen(spot)].join(':');
  if(key!==this.lastUI){this.lastUI=key;let body='';
   if(s.phase==='crowd'){
    if(s.fan!==null){const fan=FANS[s.fan];body=`<div class="social-person"><span class="social-avatar">${fan.name[0]}</span><div><span>CONVERSANDO COM</span><h2>${fan.name}</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">${s.feedback||'“'+fan.hint+'”'}</div><div class="social-prompt">Escolha sua fala</div><div class="imm-jokes social-choices">${JOKES.map((j,i)=>`<button type="button" data-action="joke:${i}" class="speech-choice"><span>${i+1}</span><div><b>${['Família e boletos','Vida de oficina','Perrengues de piloto'][i]}</b><small>${j.text}</small></div></button>`).join('')}</div><div class="social-help">Clique em uma fala para contar a piada.</div>${this.button('close','Encerrar conversa (E)')}`;}
    else if(s.desk)body=this.deskPanel();
    else body=`<div class="imm-eyebrow">ANTES DA CORRIDA</div><h2>Patrocínio? Só na risada.</h2><p>${touchScreen()?'Caminhe pelos boxes até a torcida. Toque em uma pessoa para conversar. Depois, toque na piada que quer contar.':'Ande à vontade pelos boxes, pela garagem do 99 e pela lanchonete da Tia. Chegue perto de um torcedor e aperte E para conversar; depois clique na piada (ou 1, 2, 3).'}</p><strong class="imm-cash">${money(s.cash)}</strong><p>Inscrição: ${money(COSTS.entry)} · gasolina: ${money(COSTS.litre)}/L · para largar: pelo menos ${money(COSTS.minimum)}.</p><p class="imm-desk-hint"><b>Inscrição com a equipe 99</b> nos computadores da barraca sobre o muro dos boxes: suba a escadinha ao lado dela e entre no círculo amarelo${touchScreen()?' (ou toque nele e o piloto vai sozinho)':''}.</p><p class="imm-controls">${touchScreen()?'Toque no torcedor · toque na fala para enviar':'W A S D anda · mouse gira a câmera · Shift corre · Espaço pula · C agacha · E ação (conversar; na barraca: inscrição; no Opala: capô na frente, porta-malas atrás, porta para entrar) · F entra no Opala · Tab solta o mouse'}</p>${spot?this.button('car',CAR_ACTIONS[spot](this.visual.ownOpen(spot))+(touchScreen()?'':' (E)')):nearDesk?this.button('desk','Falar com a equipe 99 · inscrição'+(touchScreen()?'':' (E)'),true):this.button('talk',this.near<0?'Aproxime-se de um torcedor ou do Opala':'Conversar com '+FANS[this.near].name+(touchScreen()?'':' (E)'),false,this.near<0)}<small>O sonho: ganhar para tirar a Blazer da oficina.</small>`;
   }
   if(s.phase==='starting')body=this.startPanel();
   if(s.phase==='grid')body='';
   if(s.phase==='broken')body=`<div class="imm-eyebrow">DEU RUIM</div><h2>${s.reason}</h2><p>O reboque está chegando. Durante o resgate, <b>S</b> controla o freio. Não deixe a fita frouxa entrar debaixo da roda dianteira.</p>`;
   if(s.phase==='tow')body='<div class="imm-eyebrow">REBOQUE</div><h2>Olho na fita!</h2><p>A fita tem 5 m e não recolhe sozinha. Quando o caminhão diminuir, freie com <b>S</b>.</p><meter id="immTowGap" min="0" max="5" low="2.2" optimum="5"></meter><p id="immTowText"></p>';
   if(s.phase==='snag')body=`<div class="imm-eyebrow">A FITA ENTROU NA RODA</div><h2>Mais R$ 25 na conta.</h2><p>O carro avançou sobre a fita frouxa e ela enroscou na dianteira. O socorrista vai soltar; no próximo trecho, controle o freio com <b>S</b>.</p>${this.button('untangle','Desenroscar e continuar',true)}`;
   if(s.phase==='inspection')body=`<div class="imm-eyebrow">${s.result?.position===1?'VENCEU NA PISTA!':'FIM DA PARTICIPAÇÃO'}</div><h2>Depois da foto.</h2><p>O movimento continua no paddock. O juiz está por perto e o pessoal já espera nos boxes.</p>${s.judging?'<progress id="immInspection" max="8" value="0"></progress><p>O juiz está conferindo o carro…</p>':this.button('inspect','Parar e aguardar a vistoria',true)+this.button('box','Levar o carro ao box')}`;
   if(['podium','complete'].includes(s.phase))body=`<div class="imm-eyebrow">AUTO-POBRE RACING · PÓDIO OFICIAL DA ZOEIRA</div><h2>Sexto. Sempre sexto.</h2><p>Na pista: <b>${s.result?.position?s.result.position+'º lugar':s.result?.status}</b><br>Situação: ${s.result?.status}${s.inspected?' · vistoriado':''}<br>Na foto do pódio: <b>6º lugar</b></p><p>${s.reason||'A corrida acabou. Os boletos continuam.'}</p><p>Prêmio: <b>${money(s.prize)}</b>${s.towSnags?` · ${s.towSnags} enrosco(s) descontado(s)`:''}</p><p>Sobra da vaquinha guardada: <b>${money(s.savedCash)}</b><br>Saldo acumulado: <b>${money(s.profile.fund)}</b></p><div class="imm-dream"><b>${s.profile.released?'A BLAZER SAIU DA OFICINA!':'OPERAÇÃO: TIRAR A BLAZER DA OFICINA'}</b><progress max="900" value="${s.profile.released?900:s.profile.fund}"></progress><span>${s.profile.released?'Mecânico pago. Hoje ela volta para casa.':money(s.profile.fund)+' / '+money(BLAZER_COST)}</span></div>${s.phase==='complete'&&!s.profile.released?this.button('blazer','Pagar o mecânico e buscar a Blazer',true,s.profile.fund<BLAZER_COST):''}${s.phase==='podium'?this.button('afterPodium','Continuar →',true):this.button('again','Outra corrida, outra vaquinha',true)+this.button('normal','Voltar à sessão livre')}`;
   if(['podium','complete'].includes(s.phase))body+=this.button('mainMenu','Voltar ao menu principal');
   if(document.body.classList.contains('touch-device'))body=body.replaceAll('Clique','Toque').replaceAll('clique','toque').replaceAll('<b>W</b>','<b>ACELERAR</b>').replaceAll('<b>S</b>','<b>FREAR</b>').replaceAll('<b>I</b>','<b>Dar partida</b>').replaceAll(' (E)','').replaceAll(' (I)','');
   this.panel.innerHTML=body;this.panel.classList.toggle('hidden',!body);this.updateDeskCosts();
  }
  if(s.phase==='starting')this.updateStartPanel();

  if(s.phase==='tow'){this.panel.querySelector('#immTowGap').value=s.towGap;this.panel.querySelector('#immTowText').textContent=`Folga útil: ${s.towGap.toFixed(1)} m · resgate ${Math.min(100,Math.floor(s.towDistance/105*100))}%`;}
  if(s.phase==='inspection'&&s.judging)this.panel.querySelector('#immInspection').value=s.inspection;
 }
 info(){return {...this.state.info(),freeFuel:this.freeFuel,freeTotalLaps:this.freeTotalLaps,storyLaps:this.storyLaps,laps:this.laps,freeFinished:this.freeFinished,finishing:this.finishing,finishElapsed:this.finishElapsed,finishTime:this.finishTime,freeResultReady:this.freeResultReady,freePosition:this.freePosition,nearFan:this.near,atDesk:this.visual.atDesk(),hero:this.visual.hero.position.toArray(),rivals:this.rivals.map(({car,...r})=>({...r,x:car.x,y:car.y})),field:this.field.info(),parts:this.parts.info(),projectile:!!this.projectile};}
}
