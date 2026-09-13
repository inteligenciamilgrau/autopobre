import * as THREE from 'three';
import {ImmersiveState,FANS,JOKES,BLAZER_COST} from './immersive-state.js';
import {ImmersiveVisuals,trackPoint} from './immersive-visuals.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const idle={throttle:0,brake:1,left:0,right:0,handbrake:0,reverse:0};
const money=n=>`R$ ${n.toFixed(2).replace('.',',')}`;
export class ImmersiveMode {
 constructor({scene,carRoot,car,data,driver,rivalTemplate,resetVehicle,releaseMouse,onNormal}){
  Object.assign(this,{carRoot,car,data,resetVehicle,releaseMouse,onNormal});let profile={};try{profile=JSON.parse(localStorage.getItem('opala99-immersive-v1'))||{};}catch{}
  this.state=new ImmersiveState(profile);this.visual=new ImmersiveVisuals(scene,carRoot,data,driver,car,rivalTemplate);this.lastPhase='off';this.lastUI='';this.near=-1;this.rivals=[];this.projectile=null;this.towOrigin=0;this.prepLitres=6;this.prepFilm=false;
  this.brand=document.querySelector('.wordmark');this.baseBrand=this.brand.innerHTML;this.baseTitle=document.title;
  this.controls=document.querySelector('footer>div');this.baseControls=this.controls.innerHTML;
  this.panel=document.createElement('section');this.panel.id='immersivePanel';this.panel.className='hidden';this.panel.setAttribute('aria-label','Auto-Pobre Racing');document.body.append(this.panel);
  this.hud=document.createElement('section');this.hud.id='immersiveHud';this.hud.className='hidden';this.hud.innerHTML='<div class="imm-brand">AUTO-POBRE RACING <span id="immPhase"></span></div><div class="imm-meters"><span>GASOLINA <b id="immFuel"></b></span><span>CARRO <b id="immHealth"></b></span><span>VIDRO <b id="immGlass"></b></span><span>NA PISTA <b id="immPosition"></b></span></div><div id="immAlert" role="status"></div>';document.body.append(this.hud);
  this.panel.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!b.disabled)this.action(b.dataset.action);});
  this.panel.addEventListener('input',e=>{if(e.target.id==='immLitres'){this.prepLitres=Number(e.target.value);this.prepCost();}if(e.target.id==='immFilm'){this.prepFilm=e.target.checked;this.prepCost();}});
 }
 get active(){return this.state.active;}
 allowsPointer(){return ['race','tow','grid'].includes(this.state.phase);}
 blockingUI(){return this.active&&!this.allowsPointer();}
 save(){try{localStorage.setItem('opala99-immersive-v1',JSON.stringify(this.state.profile));}catch{}}
 start(){this.resetVehicle();this.state.start();this.visual.reset();this.near=-1;this.projectile=null;this.raceProgress=0;this.previousS=0;this.rivals=[22,24,21,25,23].map((pace,i)=>({pace,progress:10+i*8,lane:[-2,2,0,-2,2][i],finished:false}));this.debrisTimer=6;this.contactCooldown=0;this.sync();}
 disable(){this.state.disable();this.visual.restoreCamera();this.visual.root.visible=this.visual.damage.visible=false;this.carRoot.visible=true;this.panel.classList.add('hidden');this.hud.classList.add('hidden');document.body.classList.remove('immersive-mode','immersive-stage');this.brand.innerHTML=this.baseBrand;this.controls.innerHTML=this.baseControls;document.title=this.baseTitle;this.lastPhase='off';}
 sync(){
  const s=this.state;if(s.phase===this.lastPhase)return;this.lastPhase=s.phase;this.lastUI='';
  document.body.classList.toggle('immersive-mode',s.active);document.body.classList.toggle('immersive-stage',['crowd','podium'].includes(s.phase));
  this.brand.innerHTML='AUTO-POBRE RACING<span>STEVAN GAIPO · VERSÃO IMERSIVA</span>';document.title='Auto-Pobre Racing com Stevan Gaipo';
  this.controls.innerHTML=this.baseControls.replace('reposicionar','chamar reboque');
  if(this.blockingUI())this.releaseMouse();
  if(['crowd','prepare','starting','broken','snag','podium'].includes(s.phase))this.stop();
  if(s.phase==='grid'){this.resetVehicle();this.previousS=this.car.surface.s;}
  if(s.phase==='broken')this.towOrigin=this.car.surface.s;
  if(s.phase==='inspection'){
   this.resetVehicle();this.placeCar(trackPoint(this.data,35,-2));this.stop();
  }
  if(s.phase==='podium')this.save();
 }
 stop(){this.car.vx=this.car.vy=this.car.yaw=0;this.car.burnout=this.car.rearSlipSpeed=0;}
 placeCar(p){const c=this.car;c.x=p.x;c.y=-p.z;c.heading=p.heading;c.index=p.index;c.surface=c.sample(c.x,c.y);}
 action(action){
  const s=this.state;
  if(action==='talk'&&this.near>=0)s.talk(this.near);
  if(action.startsWith('joke:'))s.joke(Number(action.split(':')[1]));
  if(action==='close'){s.fan=null;s.feedback='';s.touch();}
  if(action==='prepare')s.prepare();
  if(action==='crowd'){s.phase='crowd';s.feedback='';s.touch();}
  if(action==='buy')s.buy(this.prepLitres,this.prepFilm);
  if(action==='ignite'&&s.phase==='starting')s.starter=true;
  if(action==='untangle')s.untangle();
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
  if(s.phase==='crowd'){if(s.fan===null)this.visual.walk(input,dt);this.near=this.visual.nearestFan();}
  else if(s.phase==='starting')s.startEngine(input,dt);
  else if(s.phase==='grid'){s.countdown-=dt;if(s.countdown<=0)s.startRace();}
  else if(s.phase==='race'){
   const before=Math.hypot(c.vx,c.vy);c.step(input,dt);const speed=Math.hypot(c.vx,c.vy),L=this.data.meta.reconstructed_xy_m;
   let travel=c.surface.s-this.previousS;if(travel<-L/2)travel+=L;if(travel>L/2)travel-=L;this.raceProgress=Math.max(0,this.raceProgress+travel);this.previousS=c.surface.s;
   for(const rival of this.rivals){if(rival.finished)continue;const p=trackPoint(this.data,rival.progress),q=trackPoint(this.data,rival.progress+35);const curve=Math.abs(Math.atan2(Math.sin(q.heading-p.heading),Math.cos(q.heading-p.heading)))/35;const pace=Math.min(rival.pace,Math.sqrt(3.8/Math.max(.001,curve)));rival.progress+=pace*dt;if(rival.progress>=L)rival.finished=true;}
   s.position=1+this.rivals.filter(r=>r.progress>this.raceProgress).length;
   s.raceStep({speed,throttle:input.throttle,wheelspin:c.rearSlipSpeed,offTrack:Math.max(0,Math.abs(c.surface.d)-c.surface.width/2),collision:before-speed>4,finished:c.laps>=1,position:s.position},dt);
   this.hazards(dt);
  }else if(s.phase==='broken'){s.rescueWait-=dt;if(s.rescueWait<=0)s.beginTow();}
  else if(s.phase==='tow'){
   s.towStep(input,dt);const p=trackPoint(this.data,this.towOrigin+s.towDistance+9-4.67-s.towGap);this.placeCar(p);
   c.vx=Math.cos(c.heading)*s.towSpeed;c.vy=Math.sin(c.heading)*s.towSpeed;c.steer=(input.left-input.right)*.2;c.spin+=s.towSpeed*dt/.31595;c.rearSpin=c.spin;c.clock+=dt;
  }else if(s.phase==='inspection'){
   if(s.judging){this.stop();s.inspectionStep(dt);}else{c.step(input,dt);if((c.surface.s<250||c.surface.s>this.data.meta.reconstructed_xy_m-120)&&c.surface.d>c.surface.width/2+.8)s.goToBox();}
  }
  this.sync();return true;
 }
 hazards(dt){
  const s=this.state,c=this.car;if(s.phase!=='race'){this.projectile=null;return;}
  this.contactCooldown-=dt;this.debrisTimer-=dt;
  for(const rival of this.rivals){
   if(rival.finished)continue;const p=trackPoint(this.data,rival.progress,rival.lane),dx=p.x-c.x,dy=-p.z-c.y,forward=dx*Math.cos(c.heading)+dy*Math.sin(c.heading),side=-dx*Math.sin(c.heading)+dy*Math.cos(c.heading);
   if(Math.abs(forward)<4.1&&Math.abs(side)<1.7&&this.contactCooldown<=0){s.hitCar();c.vx*=.7;c.vy*=.7;this.contactCooldown=2;}
   if(!this.projectile&&this.debrisTimer<=0&&forward>7&&forward<34&&Math.abs(side)<2.1&&Math.hypot(c.vx,c.vy)>9){
    this.projectile={age:0,duration:1.25,start:new THREE.Vector3(p.x-Math.cos(p.heading)*2,p.y+.8,p.z+Math.sin(p.heading)*2),end:new THREE.Vector3(c.x+c.vx*1.25+Math.cos(c.heading)*.45,c.surface.z+1.1,-c.y-c.vy*1.25-Math.sin(c.heading)*.45)};
    s.warn('Peça voando do carro da frente! Mude de linha.');this.debrisTimer=8+Math.random()*5;
   }
  }
  if(this.projectile){this.projectile.age+=dt;if(this.projectile.age>=this.projectile.duration){const target=this.projectile.end,fx=c.x+Math.cos(c.heading)*.45,fy=-c.y-Math.sin(c.heading)*.45;if(Math.hypot(target.x-fx,target.z-fy)<1.35)s.hitDebris();this.projectile=null;}}
 }
 audioCommand(input){return this.active?{...input,throttle:['race','grid'].includes(this.state.phase)?input.throttle:0,engineOff:!['race','grid','inspection'].includes(this.state.phase)||!!this.state.reason}:input;}
 update(dt,camera){if(!this.active)return;this.sync();this.visual.update(this.state,this.car,dt,this.rivals,this.projectile,this.towOrigin);this.visual.camera(camera,this.state);this.ui();}
 prepCost(){const cost=100+this.prepLitres*6.5+(this.prepFilm?30:0),price=this.panel.querySelector('#immCost');if(price)price.textContent=`${this.prepLitres} L · Total ${money(cost)} · Vaquinha ${money(this.state.cash)}`;const b=this.panel.querySelector('[data-action="buy"]');if(b)b.disabled=cost>this.state.cash;}
 button(action,label,primary=false,disabled=false){return `<button type="button" data-action="${action}" ${disabled?'disabled':''} class="${primary?'imm-primary':''}">${label}</button>`;}
 ui(){
  const s=this.state;if(!s.active)return;this.hud.classList.remove('hidden');
  const names={crowd:'VAQUINHA',prepare:'INSCRIÇÃO',starting:'PARTIDA',grid:'LARGADA',race:'1 VOLTA',broken:'SOCORRO',tow:'REBOQUE',snag:'FITA ENROSCADA',inspection:'PARQUE FECHADO',podium:'SEXTO, SEMPRE'};
  document.getElementById('immPhase').textContent=names[s.phase];document.getElementById('immFuel').textContent=s.fuel.toFixed(1)+' L';document.getElementById('immHealth').textContent=Math.ceil(s.health*100)+'%';document.getElementById('immGlass').textContent=Math.round((1-s.glass)*100)+'%';document.getElementById('immPosition').textContent=s.phase==='podium'?'6º no pódio':s.position+'º / 6';
  document.getElementById('immAlert').textContent=s.phase==='race'?(s.alertTime>0?s.alert:s.tankDetached?'Tanque solto · combustível vazando':s.fuel<1?'Reserva! A gasolina está acabando.':'Guarde distância: o carro da frente pode soltar peças.'):s.phase==='tow'?(s.towGap<3?'FREIE COM S · NÃO PASSE POR CIMA DA FITA':'Controle o freio quando o caminhão diminuir.'):'';
  const key=[s.phase,s.revision,this.near,s.fan].join(':');
  if(key!==this.lastUI){this.lastUI=key;let body='';
   if(s.phase==='crowd'){
    if(s.fan!==null){const fan=FANS[s.fan];body=`<div class="imm-eyebrow">TORCIDA · ${fan.name}</div><h2>Uma risada vale a largada.</h2><p>“${fan.hint}”</p><div class="imm-jokes">${JOKES.map((j,i)=>this.button('joke:'+i,`${i+1}. ${j.text}`)).join('')}</div><p class="imm-feedback" role="status">${s.feedback||'Escolha uma piada para esse torcedor.'}</p>${this.button('close','Continuar a vaquinha (E)',true)}`;}
    else body=`<div class="imm-eyebrow">ANTES DA CORRIDA</div><h2>Patrocínio? Só na risada.</h2><p>Vá a pé até a torcida. Descubra o gosto de cada pessoa, conte uma piada e tente arrancar uma contribuição.</p><strong class="imm-cash">${money(s.cash)}</strong><p>Inscrição: R$ 100 · gasolina: R$ 6,50/L.<br>Junte pelo menos R$ 126 para abrir a preparação.</p><p class="imm-controls">W/A/S/D: andar · E: conversar · 1/2/3: piada</p>${this.button('talk',this.near<0?'Aproxime-se de um torcedor':'Conversar com '+FANS[this.near].name+' (E)',false,this.near<0)}${this.button('prepare','Ir à inscrição',true,s.cash<126)}<small>O sonho: ganhar para tirar a Blazer da oficina.</small>`;
   }
   if(s.phase==='prepare')body=`<div class="imm-eyebrow">O ORÇAMENTO É APERTADO</div><h2>O que cabe na vaquinha?</h2><p>Uma volta em Interlagos costuma gastar 3–4 L. Burnout e vazamentos gastam mais.</p><label>Gasolina <input id="immLitres" type="range" min="2" max="12" value="${this.prepLitres}"></label><label class="imm-check"><input id="immFilm" type="checkbox" ${this.prepFilm?'checked':''}> Proteção extra do para-brisa · R$ 30</label><p id="immCost"></p><p>${s.feedback||'Combustível insuficiente termina em reboque.'}</p>${this.button('buy','Pagar e preparar a largada',true)}${this.button('crowd','Voltar à torcida')}`;
   if(s.phase==='starting')body=`<div class="imm-eyebrow">SEM AFOGAR!</div><h2>Hora de acordar o Opala.</h2><p>Dê toques em <b>W</b> para dosar o acelerador. Aperte <b>I</b> para dar partida, mantendo a agulha na faixa verde. Acelerar demais afoga; insistir sem pegar acaba com a bateria.</p><div class="imm-start-gauge"><span></span><i id="immNeedle"></i></div><p id="immStartText"></p>${this.button('ignite','Dar partida (I)',true)}`;
   if(s.phase==='grid')body='<div class="imm-eyebrow">MOTOR PEGOU</div><h2 id="immCountdown">3</h2><p>Uma volta. Cinco adversários. Um monte de contas.</p>';
   if(s.phase==='broken')body=`<div class="imm-eyebrow">DEU RUIM</div><h2>${s.reason}</h2><p>O reboque está chegando. Durante o resgate, <b>S</b> controla o freio. Não deixe a fita frouxa entrar debaixo da roda dianteira.</p>`;
   if(s.phase==='tow')body='<div class="imm-eyebrow">REBOQUE</div><h2>Olho na fita!</h2><p>A fita tem 5 m e não recolhe sozinha. Quando o caminhão diminuir, freie com <b>S</b>.</p><meter id="immTowGap" min="0" max="5" low="2.2" optimum="5"></meter><p id="immTowText"></p>';
   if(s.phase==='snag')body=`<div class="imm-eyebrow">A FITA ENTROU NA RODA</div><h2>Mais R$ 25 na conta.</h2><p>O carro avançou sobre a fita frouxa e ela enroscou na dianteira. O socorrista vai soltar; no próximo trecho, controle o freio com <b>S</b>.</p>${this.button('untangle','Desenroscar e continuar',true)}`;
   if(s.phase==='inspection')body=`<div class="imm-eyebrow">${s.result?.position===1?'VENCEU NA PISTA!':'FIM DA PARTICIPAÇÃO'}</div><h2>Primeiro, o juiz.</h2><p>O carro fica no parque fechado. Levar ao box antes da vistoria causa desclassificação, mesmo depois de uma vitória.</p>${s.judging?'<progress id="immInspection" max="8" value="0"></progress><p>O juiz está conferindo o carro…</p>':this.button('inspect','Parar e aguardar a vistoria',true)+this.button('box','Levar ao box sem vistoria · desclassifica')}`;
   if(s.phase==='podium')body=`<div class="imm-eyebrow">AUTO-POBRE RACING · PÓDIO OFICIAL DA ZOEIRA</div><h2>Sexto. Sempre sexto.</h2><p>Na pista: <b>${s.result?.position?s.result.position+'º lugar':s.result?.status}</b><br>Situação: ${s.result?.status}${s.inspected?' · vistoriado':''}<br>Na foto do pódio: <b>6º lugar</b></p><p>${s.reason||'A corrida acabou. Os boletos continuam.'}</p><p>Prêmio: <b>${money(s.prize)}</b>${s.towSnags?` · ${s.towSnags} enrosco(s) descontado(s)`:''}</p><div class="imm-dream"><b>${s.profile.released?'A BLAZER SAIU DA OFICINA!':'OPERAÇÃO: TIRAR A BLAZER DA OFICINA'}</b><progress max="900" value="${s.profile.released?900:s.profile.fund}"></progress><span>${s.profile.released?'Mecânico pago. Hoje ela volta para casa.':money(s.profile.fund)+' / '+money(BLAZER_COST)}</span></div>${!s.profile.released?this.button('blazer','Pagar o mecânico e buscar a Blazer',true,s.profile.fund<BLAZER_COST):''}${this.button('again','Outra corrida, outra vaquinha',true)}${this.button('normal','Voltar à sessão livre')}`;
   this.panel.innerHTML=body;this.panel.classList.toggle('hidden',!body);this.prepCost();
  }
  if(s.phase==='starting'){this.panel.querySelector('#immNeedle').style.left=`${s.pressure*100}%`;this.panel.querySelector('#immStartText').textContent=s.starter?'Motor de partida acionado · dose W na faixa verde':'Faixa verde: 22–65% do acelerador';}
  if(s.phase==='grid')this.panel.querySelector('#immCountdown').textContent=Math.max(1,Math.ceil(s.countdown));
  if(s.phase==='tow'){this.panel.querySelector('#immTowGap').value=s.towGap;this.panel.querySelector('#immTowText').textContent=`Folga útil: ${s.towGap.toFixed(1)} m · resgate ${Math.min(100,Math.floor(s.towDistance/105*100))}%`;}
  if(s.phase==='inspection'&&s.judging)this.panel.querySelector('#immInspection').value=s.inspection;
 }
 info(){return {...this.state.info(),nearFan:this.near,hero:this.visual.hero.position.toArray(),rivals:this.rivals.map(r=>({...r})),projectile:!!this.projectile};}
}
