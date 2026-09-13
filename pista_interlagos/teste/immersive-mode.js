import * as THREE from 'three';
import {RaceField} from './race-field.js';
import {CrashParts} from './crash-parts.js';
import {ImmersiveState,FANS,JOKES,BLAZER_COST} from './immersive-state.js';
import {ImmersiveVisuals,trackPoint} from './immersive-visuals.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const idle={throttle:0,brake:1,left:0,right:0,handbrake:0,reverse:0};
const money=n=>`R$ ${n.toFixed(2).replace('.',',')}`;
export class ImmersiveMode {
 constructor({scene,carRoot,car,data,driver,rivalTemplate,resetVehicle,releaseMouse,onNormal}){
  Object.assign(this,{carRoot,car,data,resetVehicle,releaseMouse,onNormal});let profile={};try{profile=JSON.parse(localStorage.getItem('opala99-immersive-v1'))||{};}catch{}
  this.freeFuel=12;this.freeTotalLaps=3;this.freeFinished=false;this.freePosition=6;this.freePlayerProgress=0;this.field=new RaceField(data);this.parts=new CrashParts(scene);this.state=new ImmersiveState(profile);this.visual=new ImmersiveVisuals(scene,carRoot,data,driver,car,rivalTemplate);this.lastPhase='off';this.lastUI='';this.near=-1;this.rivals=this.field.rivals;this.projectile=null;this.towOrigin=0;this.prepLitres=6;this.prepFilm=false;
  this.brand=document.querySelector('.wordmark');this.baseBrand=this.brand.innerHTML;this.baseTitle=document.title;
  this.controls=document.querySelector('footer>div');this.baseControls=this.controls.innerHTML;
  this.panel=document.createElement('section');this.panel.id='immersivePanel';this.panel.className='hidden';this.panel.setAttribute('aria-label','Auto-Pobre Racing');document.body.append(this.panel);
  this.hud=document.createElement('section');this.hud.id='immersiveHud';this.hud.className='hidden';this.hud.innerHTML='<div class="imm-brand">AUTO-POBRE RACING <span id="immPhase"></span></div><div class="imm-meters"><span>GASOLINA <b id="immFuel"></b></span><span>CARRO <b id="immHealth"></b></span><span>VIDRO <b id="immGlass"></b></span><span>NA PISTA <b id="immPosition"></b></span></div><div id="immAlert" role="status"></div>';document.body.append(this.hud);
  document.getElementById('view').addEventListener('pointerdown',e=>this.pickFan(e));
  document.getElementById('dqContinue').onclick=()=>{if(this.state.phase==='disqualified')this.start();};
  this.panel.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled)this.action(b.dataset.action);});
  this.panel.addEventListener('input',e=>{if(e.target.id==='immLitres'){this.prepLitres=Number(e.target.value);this.prepCost();}if(e.target.id==='immFilm'){this.prepFilm=e.target.checked;this.prepCost();}});
 }
 pickFan(event){
  if(event.button!==0||!this.active||this.state.phase!=='crowd'||!this.camera)return;
  const rect=event.currentTarget.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
  const hit=ray.intersectObjects(this.visual.fans.flatMap(f=>[f.person,f.label,...(f.dollar.visible?[f.dollar]:[])]),true)[0];if(!hit)return;
  const index=this.visual.fans.findIndex(f=>{let obj=hit.object;while(obj){if(obj===f.person||obj===f.label||obj===f.dollar)return true;obj=obj.parent;}return false;});if(index<0)return;
  this.state.fan=null;this.state.feedback='';this.state.touch();this.walkToFan=index;
  if(this.visual.hero.position.distanceTo(this.visual.fans[index].pos)<2.6){this.state.talk(index);this.walkToFan=null;}
  this.ui();
 }
 positionDialogue(){if(this.state.phase!=='crowd'||this.state.fan===null||!this.camera)return;const p=this.visual.fans[this.state.fan].person.getWorldPosition(new THREE.Vector3());p.y+=1.85;p.project(this.camera);const x=(p.x*.5+.5)*innerWidth,y=(-p.y*.5+.5)*innerHeight,rect=this.panel.getBoundingClientRect();this.panel.style.left=`${Math.round(clamp(x+22+rect.width>innerWidth?x-rect.width-22:x+22,12,Math.max(12,innerWidth-rect.width-12)))}px`;this.panel.style.top=`${Math.round(clamp(y-rect.height*.3,80,Math.max(80,innerHeight-rect.height-70)))}px`;this.panel.style.bottom='auto';}
 get active(){return this.state.active;}
 allowsPointer(){return ['race','tow','grid','prepare'].includes(this.state.phase);}
 blockingUI(){return this.active&&!this.allowsPointer();}
 save(){try{localStorage.setItem('opala99-immersive-v1',JSON.stringify(this.state.profile));}catch{}}
 start(){this.resetVehicle();this.state.start();this.visual.reset();this.near=-1;this.walkToFan=null;this.footDistance=0;this.projectile=null;this.raceProgress=0;this.previousS=0;this.field.reset();this.parts.reset();this.rivals=this.field.rivals;this.debrisTimer=6;this.contactCooldown=0;this.sync();}
 disable(){this.state.disable();this.visual.restoreCamera();this.visual.root.visible=this.visual.damage.visible=false;this.carRoot.visible=true;this.panel.classList.add('hidden');this.hud.classList.add('hidden');document.getElementById('dqScreen').classList.add('hidden');document.body.classList.remove('disqualified-scene','podium-scene','tow-scene');document.body.classList.remove('immersive-mode','immersive-stage');this.brand.innerHTML=this.baseBrand;this.controls.innerHTML=this.baseControls;document.title=this.baseTitle;this.lastPhase='off';}
 sync(){
  const s=this.state;if(s.phase===this.lastPhase)return;this.lastPhase=s.phase;this.lastUI='';
  document.body.classList.toggle('immersive-mode',s.active);document.body.classList.toggle('immersive-stage',['crowd','podium'].includes(s.phase));
  this.brand.innerHTML='AUTO-POBRE RACING<span>STEVAN GAIPO · VERSÃO IMERSIVA</span>';document.title='Auto-Pobre Racing com Stevan Gaipo';
  this.controls.innerHTML=this.baseControls.replace('reposicionar','chamar reboque');
  if(this.blockingUI())this.releaseMouse();
  if(['crowd','prepare','starting','broken','snag','podium'].includes(s.phase))this.stop();
  if(s.phase==='prepare'){this.resetVehicle();this.field.reset();this.rivals=this.field.rivals;}
  if(s.phase==='grid'){this.resetVehicle();this.previousS=this.car.surface.s;}
  if(s.phase==='broken')this.towOrigin=this.car.surface.s;
  if(s.phase==='inspection'){
   this.resetVehicle();this.placeCar(trackPoint(this.data,35,-2));this.stop();
  }
  document.body.classList.toggle('tow-scene',['tow','broken','snag'].includes(s.phase));document.body.classList.toggle('podium-scene',s.phase==='podium');document.body.classList.toggle('disqualified-scene',s.phase==='disqualified');if(['podium','complete','disqualified'].includes(s.phase))this.save();
 }
 stop(){this.car.vx=this.car.vy=this.car.yaw=0;this.car.burnout=this.car.rearSlipSpeed=0;}
 placeCar(p){const c=this.car;c.x=p.x;c.y=-p.z;c.heading=p.heading;c.index=p.index;c.surface=c.sample(c.x,c.y);}
 action(action){
  const s=this.state;
  if(action==='talk'&&this.near>=0){this.selectedJoke=null;s.talk(this.near);}
  if(action.startsWith('joke:')&&s.phase==='crowd'&&s.fan!==null){const fan=s.fan,cash=s.cash;s.joke(Number(action.split(':')[1]));if(s.cash>cash){this.visual.showDonation(fan);s.fan=null;s.feedback='';this.walkToFan=null;s.touch();}}
  if(action==='close'){s.fan=null;s.feedback='';s.touch();}
  if(action==='prepare')s.prepare();
  if(action==='crowd'){s.phase='crowd';s.feedback='';s.touch();}
  if(action==='buy')s.buy(this.prepLitres,this.prepFilm);
  if(action==='ignite'&&s.phase==='starting')s.starter=true;
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
  if(!this.active)return false;
  const s=this.state;
  if(code==='KeyR'){s.fail('Volta abandonada: pediu reboque');this.sync();return true;}
  if(code==='KeyE'&&s.phase==='crowd'){this.action(s.fan===null?'talk':'close');return true;}
  if(['Digit1','Digit2','Digit3'].includes(code)&&s.phase==='crowd'&&s.fan!==null){this.action('joke:'+(Number(code.at(-1))-1));return true;}
  if(code==='KeyI'&&s.phase==='starting'){this.action('ignite');return true;}
  return false;
 }
 step(input,dt){
  const s=this.state,c=this.car;if(!s.active)return false;
  if(s.phase==='crowd'){if(s.fan===null){const before=this.visual.hero.position.clone();let walking=input;if(this.walkToFan!==null&&this.walkToFan!==undefined){if(input.throttle||input.brake||input.left||input.right)this.walkToFan=null;else{const target=this.visual.fans[this.walkToFan].pos,dx=target.x-before.x,dz=target.z-before.z;if(Math.hypot(dx,dz)<2.4){s.talk(this.walkToFan);this.walkToFan=null;}else{const angle=Math.atan2(-dz,dx)-this.visual.hero.rotation.y,turn=Math.atan2(Math.sin(angle),Math.cos(angle));walking={throttle:Math.abs(turn)<.65?1:0,brake:0,left:turn>.05?1:0,right:turn<-.05?1:0};}}}this.visual.walk(walking,dt);this.footDistance+=before.distanceTo(this.visual.hero.position);if(this.footDistance>.8){this.footDistance%=.8;s.emitSound('footstep');}}this.near=this.visual.nearestFan();}
  else if(s.phase==='starting')s.startEngine(input,dt);
  else if(s.phase==='grid'){const before=Math.ceil(s.countdown);s.countdown-=dt;if(s.countdown<=0)s.startRace();else if(Math.ceil(s.countdown)<before)s.emitSound('countdown');}
  else if(s.phase==='race'){
   const before=Math.hypot(c.vx,c.vy);c.step(input,dt);const speed=Math.hypot(c.vx,c.vy),L=this.data.meta.reconstructed_xy_m;if(before-speed>4)this.wallImpact(before-speed);
   let travel=c.surface.s-this.previousS;if(travel<-L/2)travel+=L;if(travel>L/2)travel-=L;this.raceProgress=Math.max(0,this.raceProgress+travel);this.previousS=c.surface.s;
   this.contacts(this.field.step(c,dt,true));
   s.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;
   s.raceStep({speed,throttle:input.throttle,wheelspin:c.rearSlipSpeed,offTrack:Math.max(0,Math.abs(c.surface.d)-c.surface.width/2),collision:before-speed>4,finished:c.laps>=1,position:s.position},dt);
   this.hazards(dt);
  }else if(s.phase==='broken'){s.rescueWait-=dt;if(s.rescueWait<=0)s.beginTow();}
  else if(s.phase==='tow'){
   s.towStep(input,dt);const p=trackPoint(this.data,this.towOrigin+s.towDistance+9-4.67-s.towGap);this.placeCar(p);
   c.vx=Math.cos(c.heading)*s.towSpeed;c.vy=Math.sin(c.heading)*s.towSpeed;c.steer=(input.left-input.right)*.2;c.spin+=s.towSpeed*dt/.31595;c.rearSpin=c.spin;c.clock+=dt;
  }else if(s.phase==='disqualified'){s.disqualifiedTime-=dt;if(s.disqualifiedTime<=0){this.start();return true;}}else if(s.phase==='inspection'){
   if(s.judging){this.stop();s.inspectionStep(dt);}else{c.step(input,dt);if((c.surface.s<250||c.surface.s>this.data.meta.reconstructed_xy_m-120)&&c.surface.d>c.surface.width/2+.8)s.goToBox();}
  }
  this.sync();return true;
 }
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
 resetField(){this.freeFuel=12;this.freeFinished=false;this.freePosition=6;this.freePlayerProgress=0;this.freeLastS=this.car.surface.s;this.field.reset(this.car.surface.s);this.rivals=this.field.rivals;this.parts.reset();}
 wallImpact(speed){this.parts.burst({speed,point:[this.car.x+Math.cos(this.car.heading)*2,this.car.y+Math.sin(this.car.heading)*2]},this.car);}
 contacts(hits){for(const hit of hits){this.parts.burst(hit,this.car);if(hit.player&&this.active)this.state.hitCar(Math.min(1.5,hit.speed/10));else{const dx=hit.point[0]-this.car.x,dy=hit.point[1]-this.car.y,d=Math.hypot(dx,dy);if(d<65)this.state.emitSound('collision',{strength:Math.min(1.5,hit.speed/10)*(1-d/65),pan:clamp((-dx*Math.sin(this.car.heading)+dy*Math.cos(this.car.heading))/Math.max(1,d),-1,1)});}}}
 stepFree(dt,input={}){const previous=this.freeFuel;this.freeFuel=Math.max(0,this.freeFuel-dt*(.002+Math.hypot(this.car.vx,this.car.vy)*.00045+(input.throttle||0)*.005+(this.car.rearSlipSpeed||0)*.0023));if(previous>=1&&this.freeFuel<1)this.state.emitSound('reserve');if(previous>0&&this.freeFuel===0)this.state.emitSound('fuelEmpty');this.contacts(this.field.step(this.car,dt,this.freeTotalLaps));
  const L=this.data.meta.reconstructed_xy_m;let advance=this.car.surface.s-(this.freeLastS??0);if(advance<-L/2)advance+=L;if(advance>L/2)advance-=L;this.freePlayerProgress+=advance;this.freeLastS=this.car.surface.s;
  const progress=Math.min(this.freePlayerProgress,this.car.laps*L+this.car.surface.s);
  this.freePosition=1+this.rivals.filter(r=>r.progress>progress).length;
  if(this.car.laps>=this.freeTotalLaps&&!this.freeFinished){this.freeFinished=true;this.freePosition=1+this.rivals.filter(r=>r.finished).length;this.state.emitSound(this.freePosition===1?'podiumWin':'podiumLoss');}
 }
 audioScene(){const s=this.state,c=this.car;return {phase:s.active?s.phase:'free',starter:s.phase==='starting'&&s.crank>0,pressure:s.pressure,crank:s.crank,truckSpeed:s.phase==='tow'?s.truckSpeed:0,towGap:s.towGap,tankDetached:s.active&&s.tankDetached,fuel:s.fuel,won:s.result?.position===1&&s.result?.status!=='Desclassificado',driving:!s.active||s.phase==='race',rivals:!s.active||['prepare','starting','grid','race'].includes(s.phase)?this.rivals.filter(r=>!r.finished).map(r=>{const p={x:r.car.x,z:-r.car.y},dx=p.x-c.x,dy=-p.z-c.y,distance=Math.hypot(dx,dy);return {distance,speed:['prepare','starting','grid'].includes(s.phase)?10+6*Math.sin(this.visual.time*3+r.progress):Math.hypot(r.car.vx,r.car.vy),pan:clamp((-dx*Math.sin(c.heading)+dy*Math.cos(c.heading))/Math.max(1,distance),-1,1)};}).sort((a,b)=>a.distance-b.distance).slice(0,2):[]};}
 audioCommand(input){return this.active?{...input,throttle:['race','grid'].includes(this.state.phase)?input.throttle:0,engineOff:!['race','grid','inspection'].includes(this.state.phase)||!!this.state.reason}:{...input,engineOff:this.freeFuel<=0};}
 update(dt,camera){this.camera=camera;this.parts.update(dt,this.car);if(!this.active){this.visual.updateFree(this.rivals,dt);return;}this.sync();this.visual.update(this.state,this.car,dt,this.rivals,this.projectile,this.towOrigin);this.visual.camera(camera,this.state,dt);this.ui();this.positionDialogue();}
 prepCost(){const cost=100+this.prepLitres*6.5+(this.prepFilm?30:0),price=this.panel.querySelector('#immCost');if(price)price.textContent=`${this.prepLitres} L · Total ${money(cost)} · Vaquinha ${money(this.state.cash)}`;const b=this.panel.querySelector('[data-action="buy"]');if(b)b.disabled=cost>this.state.cash;}
 button(action,label,primary=false,disabled=false){return `<button type="button" data-action="${action}" ${disabled?'disabled':''} class="${primary?'imm-primary':''}">${label}</button>`;}
 ui(){
  const s=this.state;if(!s.active)return;this.panel.classList.toggle('social-dialogue',s.phase==='crowd'&&s.fan!==null);this.panel.classList.toggle('social-explore',s.phase==='crowd'&&s.fan===null);if(s.phase!=='crowd'||s.fan===null){this.panel.style.removeProperty('left');this.panel.style.removeProperty('top');this.panel.style.removeProperty('bottom');}this.hud.classList.remove('hidden');
  const names={crowd:'VAQUINHA',prepare:'INSCRIÇÃO',starting:'PARTIDA',grid:'LARGADA',race:'1 VOLTA',broken:'SOCORRO',tow:'REBOQUE',snag:'FITA ENROSCADA',inspection:'PÓS-CORRIDA',podium:'SEXTO, SEMPRE',complete:'ATÉ A PRÓXIMA',disqualified:'A FOTO FICOU'};
  document.getElementById('dqScreen').classList.toggle('hidden',s.phase!=='disqualified');document.getElementById('dqCountdown').textContent='Nova vaquinha em '+Math.max(1,Math.ceil(s.disqualifiedTime))+' s';
  document.getElementById('immPhase').textContent=names[s.phase];document.getElementById('immFuel').textContent=s.fuel.toFixed(1)+' L';document.getElementById('immHealth').textContent=Math.ceil(s.health*100)+'%';document.getElementById('immGlass').textContent=Math.round((1-s.glass)*100)+'%';document.getElementById('immPosition').textContent=s.phase==='podium'?'6º no pódio':s.position+'º / 6';
  document.getElementById('immAlert').textContent=s.phase==='race'?(s.alertTime>0?s.alert:s.tankDetached?'Tanque solto · combustível vazando':s.fuel<1?'Reserva! A gasolina está acabando.':'Guarde distância: o carro da frente pode soltar peças.'):s.phase==='tow'?(s.towGap<3?'FREIE · FITA FROUXA':'Controle o freio quando o caminhão diminuir.'):'';
  const key=[s.phase,s.revision,this.near,s.fan].join(':');
  if(key!==this.lastUI){this.lastUI=key;let body='';
   if(s.phase==='crowd'){
    if(s.fan!==null){const fan=FANS[s.fan];body=`<div class="social-person"><span class="social-avatar">${fan.name[0]}</span><div><span>CONVERSANDO COM</span><h2>${fan.name}</h2></div><b>◆</b></div><div class="speech-bubble fan-speech" role="status">${s.feedback||'“'+fan.hint+'”'}</div><div class="social-prompt">Escolha sua fala</div><div class="imm-jokes social-choices">${JOKES.map((j,i)=>`<button type="button" data-action="joke:${i}" class="speech-choice"><span>${i+1}</span><div><b>${['Família e boletos','Vida de oficina','Perrengues de piloto'][i]}</b><small>${j.text}</small></div></button>`).join('')}</div><div class="social-help">Clique em uma fala para contar a piada.</div>${this.button('close','Encerrar conversa (E)')}`;}
    else body=`<div class="imm-eyebrow">ANTES DA CORRIDA</div><h2>Patrocínio? Só na risada.</h2><p>Caminhe pelos boxes até a torcida. Clique em uma pessoa para conversar. Depois, clique na piada que quer contar.</p><strong class="imm-cash">${money(s.cash)}</strong><p>Inscrição: R$ 100 · gasolina: R$ 6,50/L.<br>Junte pelo menos R$ 126 para abrir a preparação.</p><p class="imm-controls">Clique no torcedor · clique na fala para enviar</p>${this.button('talk',this.near<0?'Aproxime-se de um torcedor':'Conversar com '+FANS[this.near].name+' (E)',false,this.near<0)}${this.button('prepare','Ir à inscrição',true,s.cash<126)}<small>O sonho: ganhar para tirar a Blazer da oficina.</small>`;
   }
   if(s.phase==='prepare')body=`<div class="imm-eyebrow">O ORÇAMENTO É APERTADO</div><h2>O que cabe na vaquinha?</h2><p>Uma volta em Interlagos costuma gastar 3–4 L. Burnout e vazamentos gastam mais.</p><label>Gasolina <input id="immLitres" type="range" min="2" max="12" value="${this.prepLitres}"></label><label class="imm-check"><input id="immFilm" type="checkbox" ${this.prepFilm?'checked':''}> Proteção extra do para-brisa · R$ 30</label><p id="immCost"></p><p>${s.feedback||'Combustível insuficiente termina em reboque.'}</p>${this.button('buy','Pagar e preparar a largada',true)}${this.button('crowd','Voltar à torcida')}`;
   if(s.phase==='starting')body=`<div class="imm-eyebrow">SEM AFOGAR!</div><h2>Hora de acordar o Opala.</h2><p>Dê toques em <b>W</b> para dosar o acelerador. Aperte <b>I</b> para dar partida, mantendo a agulha na faixa verde. Acelerar demais afoga; insistir sem pegar acaba com a bateria.</p><div class="imm-start-gauge"><span></span><i id="immNeedle"></i></div><p id="immStartText"></p>${this.button('ignite','Dar partida (I)',true)}`;
   if(s.phase==='grid')body='<div class="imm-eyebrow">MOTOR PEGOU</div><h2 id="immCountdown">3</h2><p>Uma volta. Cinco adversários. Um monte de contas.</p>';
   if(s.phase==='broken')body=`<div class="imm-eyebrow">DEU RUIM</div><h2>${s.reason}</h2><p>O reboque está chegando. Durante o resgate, <b>S</b> controla o freio. Não deixe a fita frouxa entrar debaixo da roda dianteira.</p>`;
   if(s.phase==='tow')body='<div class="imm-eyebrow">REBOQUE</div><h2>Olho na fita!</h2><p>A fita tem 5 m e não recolhe sozinha. Quando o caminhão diminuir, freie com <b>S</b>.</p><meter id="immTowGap" min="0" max="5" low="2.2" optimum="5"></meter><p id="immTowText"></p>';
   if(s.phase==='snag')body=`<div class="imm-eyebrow">A FITA ENTROU NA RODA</div><h2>Mais R$ 25 na conta.</h2><p>O carro avançou sobre a fita frouxa e ela enroscou na dianteira. O socorrista vai soltar; no próximo trecho, controle o freio com <b>S</b>.</p>${this.button('untangle','Desenroscar e continuar',true)}`;
   if(s.phase==='inspection')body=`<div class="imm-eyebrow">${s.result?.position===1?'VENCEU NA PISTA!':'FIM DA PARTICIPAÇÃO'}</div><h2>Depois da foto.</h2><p>O movimento continua no paddock. O juiz está por perto e o pessoal já espera nos boxes.</p>${s.judging?'<progress id="immInspection" max="8" value="0"></progress><p>O juiz está conferindo o carro…</p>':this.button('inspect','Parar e aguardar a vistoria',true)+this.button('box','Levar o carro ao box')}`;
   if(['podium','complete'].includes(s.phase))body=`<div class="imm-eyebrow">AUTO-POBRE RACING · PÓDIO OFICIAL DA ZOEIRA</div><h2>Sexto. Sempre sexto.</h2><p>Na pista: <b>${s.result?.position?s.result.position+'º lugar':s.result?.status}</b><br>Situação: ${s.result?.status}${s.inspected?' · vistoriado':''}<br>Na foto do pódio: <b>6º lugar</b></p><p>${s.reason||'A corrida acabou. Os boletos continuam.'}</p><p>Prêmio: <b>${money(s.prize)}</b>${s.towSnags?` · ${s.towSnags} enrosco(s) descontado(s)`:''}</p><p>Sobra da vaquinha guardada: <b>${money(s.savedCash)}</b><br>Saldo acumulado: <b>${money(s.profile.fund)}</b></p><div class="imm-dream"><b>${s.profile.released?'A BLAZER SAIU DA OFICINA!':'OPERAÇÃO: TIRAR A BLAZER DA OFICINA'}</b><progress max="900" value="${s.profile.released?900:s.profile.fund}"></progress><span>${s.profile.released?'Mecânico pago. Hoje ela volta para casa.':money(s.profile.fund)+' / '+money(BLAZER_COST)}</span></div>${s.phase==='complete'&&!s.profile.released?this.button('blazer','Pagar o mecânico e buscar a Blazer',true,s.profile.fund<BLAZER_COST):''}${s.phase==='podium'?this.button('afterPodium','Continuar →',true):this.button('again','Outra corrida, outra vaquinha',true)+this.button('normal','Voltar à sessão livre')}`;
   if(document.body.classList.contains('touch-device'))body=body.replaceAll('Clique','Toque').replaceAll('clique','toque').replaceAll('<b>W</b>','<b>ACELERAR</b>').replaceAll('<b>S</b>','<b>FREAR</b>').replaceAll('<b>I</b>','<b>Dar partida</b>').replaceAll(' (E)','').replaceAll(' (I)','');
   this.panel.innerHTML=body;this.panel.classList.toggle('hidden',!body);this.prepCost();
  }
  if(s.phase==='starting'){this.panel.querySelector('#immNeedle').style.left=`${s.pressure*100}%`;this.panel.querySelector('#immStartText').textContent=s.starter?'Motor de partida acionado · dose o acelerador na faixa verde':'Faixa verde: 22–65% do acelerador';}
  if(s.phase==='grid')this.panel.querySelector('#immCountdown').textContent=Math.max(1,Math.ceil(s.countdown));
  if(s.phase==='tow'){this.panel.querySelector('#immTowGap').value=s.towGap;this.panel.querySelector('#immTowText').textContent=`Folga útil: ${s.towGap.toFixed(1)} m · resgate ${Math.min(100,Math.floor(s.towDistance/105*100))}%`;}
  if(s.phase==='inspection'&&s.judging)this.panel.querySelector('#immInspection').value=s.inspection;
 }
 info(){return {...this.state.info(),freeFuel:this.freeFuel,freeTotalLaps:this.freeTotalLaps,freeFinished:this.freeFinished,freePosition:this.freePosition,nearFan:this.near,hero:this.visual.hero.position.toArray(),rivals:this.rivals.map(({car,...r})=>({...r,x:car.x,y:car.y})),field:this.field.info(),parts:this.parts.info(),projectile:!!this.projectile};}
}
