import * as THREE from 'three';
import {CarCondition,CAR_PARTS,PitService} from './car-condition.js';
import {pitLane,inPitBox} from './pit-lane.js';
import {trackPoint} from './immersive-visuals.js';
const money=n=>'R$ '+n.toFixed(2).replace('.',','),pct=n=>Math.round(n*100)+'%';
const idle={throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:0};
export const CAFE_MENU=Object.freeze([{id:'cafe',name:'Café',price:4},{id:'pao',name:'Pão de queijo',price:6},{id:'doce',name:'Doce de leite',price:5}]);
const jobName=job=>job.id==='fuel'?'Gasolina':CAR_PARTS.find(p=>p.id===job.id).name;
export class PitStop {
 // layout (optional): another circuit's box. anchor {x,y,z,heading} places the station
 // (local +x toward the back of the box, -z toward the café); inBox(surface) tells
 // when the car is parked in it; obstacles extend the walking limits.
 constructor({scene,car,carRoot,driver,mode,data,roadSurface,onOpen,onClose,onSettings,layout=null}){
  Object.assign(this,{car,carRoot,driver,mode,data,roadSurface,onOpen,onClose,onSettings,layout});
  this.label=layout?.label??'CURVELO · BOX 99';this.title=layout?.title??'Cuida do Opala, uai!';
  this.condition=new CarCondition();car.condition=this.condition;mode.state.condition=this.condition;
  this.setDamage(false);
  this.bank=450;this.opened=false;this.coffee=null;this.stationary=0;this.departing=false;
  this.service=new PitService({condition:this.condition,getFuel:()=>this.fuel,setFuel:v=>{if(mode.active)mode.state.fuel=v;else mode.freeFuel=v;},pay:cost=>this.spend(cost,true)?{...this.payment}:false,refund:(cost,job)=>this.refund(cost,job.payment)});
  this.root=new THREE.Group();this.root.name='Pitstop_e_Lanchonete_da_Tia';scene.add(this.root);this.buildScene();
  this.hud=document.createElement('aside');this.hud.id='conditionHud';this.hud.hidden=true;this.hud.innerHTML='<b>OPALA · <span id="conditionPower"></span></b><div class="condition-bars">'+CAR_PARTS.map(p=>`<label>${p.name}<meter data-health="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter></label>`).join('')+'</div><small id="pitHint"></small>';document.body.append(this.hud);
  this.panel=document.createElement('section');this.panel.id='pitPanel';this.panel.hidden=true;this.panel.setAttribute('aria-label',layout?.name??'Pitstop de Curvelo');
  this.panel.innerHTML=`<header class="pit-heading"><div><small>${this.label}</small><h2 id="pitTitle">${this.title}</h2></div><button id="pitSettings" aria-label="Pausar e abrir configurações">⚙</button></header><p class="pit-budget"><span id="pitWallet"></span><b id="pitFuel"></b></p><p class="pit-message" id="pitMessage" role="status"></p><div id="pitJob" hidden><b id="pitJobLabel"></b><progress id="pitProgress" max="1" value="0"></progress><div id="pitQueue"></div></div><div class="pit-scroll"><div id="pitGarage"><div class="pit-refuel"><button id="pitFill2">Abastecer 2 L</button><button id="pitFillAll">Completar tanque</button></div><p class="pit-explain">Clique em quantas peças quiser: cada serviço é pago e entra na fila. O mecânico resolve uma por vez enquanto você passeia. Resolver pra valer: 100%. Gambiarra: reparo parcial, até 78%.</p><div class="pit-parts">${CAR_PARTS.map((p,i)=>`<article><div class="pit-part-title"><b>${i+1}. ${p.name}</b><strong data-quality="${p.id}"></strong></div><small>${p.effect}</small><meter data-quality-bar="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter><div class="pit-repair-options"><button data-repair="${p.id}" data-kind="proper"></button><button data-repair="${p.id}" data-kind="patch"></button></div></article>`).join('')}</div></div><div id="pitCafe" hidden><small>CARDÁPIO DA TIA</small><h3>Uma prosa é de graça.</h3><p>O cafezinho e os quitutes são por sua conta, uai!</p><div class="pit-food-options">${CAFE_MENU.map(item=>`<button data-snack="${item.id}"><span>${item.name}</span><b>${money(item.price)}</b></button>`).join('')}</div><p id="pitCafeStatus" role="status"></p><button id="pitCloseCafe">Continuar o passeio</button></div></div><footer class="pit-actions"><button id="pitCoffee">Passear / Café da Tia · grátis</button><button id="pitLeave">Voltar à pista →</button></footer>`;
  document.body.append(this.panel);const $=id=>this.panel.querySelector('#'+id);
  this.walkHud=document.createElement('aside');this.walkHud.id='pitWalkHud';this.walkHud.hidden=true;this.walkHud.innerHTML='<div><b>UMA PROSA NOS BOXES</b><button id="pitWalkSettings" aria-label="Pausar e abrir configurações">⚙</button></div><span id="pitWalkJob"></span><small id="pitWalkHint"></small><button id="pitInteract" hidden></button>';document.body.append(this.walkHud);
  $('pitSettings').onclick=onSettings;this.walkHud.querySelector('#pitWalkSettings').onclick=onSettings;
  $('pitLeave').onclick=()=>this.leave();$('pitCoffee').onclick=()=>this.visitCafe();$('pitCloseCafe').onclick=()=>{this.coffee.menu=false;this.onClose?.();this.render();};this.walkHud.querySelector('#pitInteract').onclick=()=>this.interact();
  $('pitFill2').onclick=()=>this.startFuel(2);$('pitFillAll').onclick=()=>this.startFuel(12);
  for(const button of this.panel.querySelectorAll('[data-snack]'))button.onclick=()=>this.buySnack(button.dataset.snack);
  for(const button of this.panel.querySelectorAll('[data-repair]'))button.onclick=()=>{if(this.service.startRepair(button.dataset.repair,button.dataset.kind)){this.message='Serviço autorizado e pago. Pode adicionar outras peças ou sair para passear.';mode.state.emitSound('judgeCheck');}else this.message='Confira o saldo: esta peça pode já estar na fila.';this.render();};
 }
 get racing(){return !this.mode.finishing&&(this.mode.active?this.mode.state.phase==='race':!this.mode.freeFinished);}
 get fuel(){return this.mode.active?this.mode.state.fuel:this.mode.freeFuel;}
 get wallet(){return this.mode.active?this.mode.state.cash+this.mode.state.profile.fund:this.bank;}
 spend(cost,service=false){
  if(!Number.isFinite(cost)||cost<0||cost>this.wallet+.001)return false;
  if(this.mode.active){const cash=Math.min(this.mode.state.cash,cost),fund=cost-cash;this.mode.state.cash-=cash;this.mode.state.profile.fund-=fund;if(service)this.payment={cash,fund,total:cost};this.mode.save();}
  else{this.bank-=cost;if(service)this.payment={total:cost};}return true;
 }
 refund(amount,payment=this.payment){if(this.mode.active){const ratio=payment?.cash/(payment?.total||1)||0;this.mode.state.cash+=amount*ratio;this.mode.state.profile.fund+=amount*(1-ratio);this.mode.save();}else this.bank+=amount;}
 startFuel(amount){if(this.service.startFuel(amount)){this.message='Abastecimento pago e adicionado aos serviços. O cronômetro continua.';this.mode.state.emitSound('fuelFill');}else this.message='Tanque cheio, saldo insuficiente ou abastecimento já na fila.';this.render();}
 // Realism setting: with damage off the immersive story keeps its own simple health.
 setDamage(on){this.condition.setEnabled(on);this.mode.state.condition=on?this.condition:null;}
 reset(){this.service.cancel();this.close();this.condition.reset();this.bank=450;this.departing=false;this.stationary=0;this.message='';}
 close(){if(this.cameraRef){this.cameraRef.clearViewOffset();this.viewShifted=false;if(this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;this.cameraRef.updateProjectionMatrix();this.savedFov=undefined;}}this.opened=false;this.coffee=null;this.hero.visible=false;this.cup.visible=false;this.driver.root.visible=true;this.panel.hidden=true;this.walkHud.hidden=true;this.markers.visible=false;this.cafePrompt.visible=false;document.body.classList.remove('pit-open','pit-walking','pit-cafe-menu');this.onClose?.();}
 leave(){if(this.coffee){this.returnCar();return;}const refund=this.service.cancel();this.message=refund?`Serviços interrompidos. ${money(refund)} devolvidos.`:'';this.close();this.departing=true;this.stationary=0;}
 visitCafe(){if(!this.opened||this.coffee)return;this.coffee={elapsed:0,menu:false,cycle:0,steps:0,snack:null,snackTime:0};this.hero.visible=true;this.hero.position.copy(this.heroStart());this.hero.rotation.y=this.station.rotation.y+Math.PI/2;this.followYaw=this.hero.rotation.y;this.followPosition=null;this.message='Passeio grátis. Chegue perto da Tia para ver o cardápio.';this.onClose?.();this.render();}
 heroStart(){const c=this.car;return new THREE.Vector3(c.x-Math.sin(c.heading)*1.6,c.surface.z,-c.y-Math.cos(c.heading)*1.6);}
 interaction(){if(!this.coffee)return null;if(this.hero.position.distanceTo(this.heroStart())<1.5)return 'car';if(this.hero.position.distanceTo(this.cafeSeat)<2.6)return 'cafe';return null;}
 interact(){if(!this.coffee||this.coffee.menu)return;if(this.interaction()==='car')this.returnCar();else if(this.interaction()==='cafe'){this.coffee.menu=true;this.onClose?.();this.mode.state.emitSound('paper');this.render();}}
 returnCar(){if(!this.coffee||this.interaction()!=='car')return false;this.coffee=null;this.mode.state.emitSound('engineCatch');this.leave();return true;}
 buySnack(id){const item=CAFE_MENU.find(item=>item.id===id);if(!item||!this.coffee?.menu||this.interaction()!=='cafe'||!this.spend(item.price))return false;this.coffee.snack=id;this.coffee.snackTime=4;this.coffee.feedback=`${item.name} servido! ${money(item.price)} pagos. Bom demais, sô!`;this.mode.state.emitSound('pitCoffee');this.render();return true;}
 walk(input,dt){
  const s=this.coffee;if(!s)return;s.elapsed+=dt;s.snackTime=Math.max(0,s.snackTime-dt);const forward=s.menu?0:input.throttle-input.brake,turn=s.menu?0:input.left-input.right;this.hero.rotation.y+=turn*2.2*dt;
  const previous=this.hero.position.clone(),next=previous.clone().add(new THREE.Vector3(Math.cos(this.hero.rotation.y)*forward*3*dt,0,-Math.sin(this.hero.rotation.y)*forward*3*dt));
  const local=this.station.worldToLocal(next);local.x=THREE.MathUtils.clamp(local.x,-7,7);local.z=THREE.MathUtils.clamp(local.z,-8.7,3.5);local.y=Math.max(0,Math.min(.25,(-local.z-6.5)*.25));
  // Walk around the car, fuel pump and people; the service area stays off the live lane.
  const obstacles=[[4,-3.5,.9,.8],[2.7,-2.5,.55,.55],[-5,-4,.35,.35],[5,-4,.35,.35],[-6.5,-8,.35,.35],[6.5,-8,.35,.35],...(this.layout?.obstacles??[])];
  const blocked=obstacles.some(([x,z,rx,rz])=>Math.abs(local.x-x)<rx&&Math.abs(local.z-z)<rz);this.station.localToWorld(next);
  const dx=next.x-this.car.x,dz=next.z+this.car.y,h=this.car.heading,inCar=Math.abs(dx*Math.cos(h)-dz*Math.sin(h))<2.65&&Math.abs(dx*Math.sin(h)+dz*Math.cos(h))<1.25;
  if(!blocked&&!inCar)this.hero.position.copy(next);
  const distance=this.hero.position.distanceTo(previous);s.cycle+=distance*3.3;s.steps+=distance;if(s.steps>.8){s.steps%=.8;this.mode.state.emitSound('footstep');}
  const swing=distance>.0001?Math.sin(s.cycle)*.55:0;for(const side of [-1,1]){const leg=this.hero.getObjectByName('Membro_perna_'+side),arm=this.hero.getObjectByName('Membro_braco_'+side),blend=1-Math.exp(-dt*18);leg.rotation.z+=(swing*side-leg.rotation.z)*blend;const pose=side===-1&&s.snackTime>0?1.1:-swing*side;arm.rotation.z+=(pose-arm.rotation.z)*blend;}
 }
 beforeStep(input,dt){
  if(!this.racing){if(this.opened){this.service.cancel();this.close();}return false;}
  const c=this.car,speed=Math.hypot(c.vx,c.vy),box=this.layout?.inBox?this.layout.inBox(c.surface):inPitBox(c.surface);
  if(!box)this.departing=false;
  this.condition.wear(dt,{offRoad:!c.surface.onRoad,speed,spin:c.rearSlipSpeed});
  if(!this.opened){this.stationary=box&&speed<.65&&!input.throttle&&!input.reverse?this.stationary+dt:0;if(this.stationary>.65&&!this.departing){this.opened=true;this.mode.goTime=0;this.message='Bem-vindo ao box. Escolha abastecimento, reparos ou um passeio.';this.onOpen();this.mode.state.emitSound('paper');this.render();}}
  if(!this.opened)return false;
  this.walk(input,dt);Object.assign(input,idle);c.vx=c.vy=c.yaw=0;c.burnout=c.rearSlipSpeed=0;
  this.mode.stepPit(dt);
  const job=this.service.job;if(job&&job.id!=='fuel'&&Math.floor(job.elapsed/1.4)!==Math.floor((job.elapsed+dt)/1.4))this.mode.state.emitSound('pitRepair');
  const completed=this.service.step(dt);
  if(completed){this.message=`${jobName(completed)}: serviço concluído.`+(this.service.job?` Agora: ${jobName(this.service.job)}.`:' Tudo pronto para voltar!');this.mode.state.emitSound('judgeApprove');}
  if(this.mode.active){this.mode.state.health=this.condition.health;if(this.condition.quality.tanque>.4){this.mode.state.tankDetached=false;this.mode.state.tankWear=0;}}
  return true;
 }
 render(){
  const $=id=>this.panel.querySelector('#'+id),job=this.service.job,busy=!!job,walking=!!this.coffee;
  $('pitTitle').textContent=walking?'Lanchonete da Tia':this.title;$('pitWallet').textContent=(this.mode.active?'Saldo disponível: ':'Verba da equipe: ')+money(this.wallet);$('pitFuel').textContent=this.fuel.toFixed(1)+' / 12 L';$('pitMessage').textContent=this.message||'';
  $('pitJob').hidden=!busy;if(job){$('pitJobLabel').textContent=`${jobName(job)} · ${Math.ceil(job.seconds-job.elapsed)} s`+(this.service.queue.length?` · +${this.service.queue.length} na fila`:'');$('pitProgress').value=job.progress;}
  const signature=this.service.queue.map(j=>j.id).join(',');if(this.queueSignature!==signature){this.queueSignature=signature;$('pitQueue').replaceChildren();for(const queued of this.service.queue){const button=document.createElement('button');button.dataset.cancelJob=queued.id;button.textContent=`${jobName(queued)}${queued.kind==='patch'?' (gambiarra)':''} · cancelar ×`;button.onclick=()=>{const refund=this.service.cancelQueued(queued.id);this.message=`Retirado da fila. ${money(refund)} devolvidos.`;this.render();};$('pitQueue').append(button);}}
  for(const p of CAR_PARTS){const q=this.condition.quality[p.id];this.panel.querySelector(`[data-quality="${p.id}"]`).textContent=pct(q);this.panel.querySelector(`[data-quality-bar="${p.id}"]`).value=q;}
  for(const b of this.panel.querySelectorAll('[data-repair]')){const quote=this.condition.quote(b.dataset.repair,b.dataset.kind),proper=b.dataset.kind==='proper',pending=this.service.has(b.dataset.repair);b.textContent=pending?(job?.id===b.dataset.repair?'Em serviço':'Na fila · pago'):quote?`${proper?'Resolver pra valer':'Gambiarra'} · ${money(quote.cost)} · ${Math.ceil(quote.seconds)} s → ${pct(quote.to)}`:proper?'Tudo certo · 100%':'Gambiarra não melhora';b.disabled=pending||!quote||quote.cost>this.wallet;}
  for(const [id,amount] of [['pitFill2',2],['pitFillAll',12]]){const litres=Math.min(amount,12-this.fuel),cost=Math.ceil(litres*6.5);$(id).textContent=this.service.has('fuel')?'Abastecimento · pago':litres<.05?'Tanque cheio':(id==='pitFill2'?'Abastecer ':'Completar · ')+litres.toFixed(1)+' L · '+money(cost);$(id).disabled=this.service.has('fuel')||litres<.05||cost>this.wallet;}
  $('pitGarage').hidden=walking;$('pitCafe').hidden=!walking;$('pitCoffee').hidden=walking;$('pitLeave').hidden=walking;$('pitLeave').textContent=busy?'Sair agora · interromper serviços':'Voltar à pista →';
  $('pitCafeStatus').textContent=this.coffee?.feedback||'Escolha um quitute. Só paga o que pedir.';
  for(const button of this.panel.querySelectorAll('[data-snack]'))button.disabled=CAFE_MENU.find(item=>item.id===button.dataset.snack).price>this.wallet;
  if(walking){const action=this.interaction();this.walkHud.querySelector('#pitWalkJob').textContent=busy?`Mecânico: ${jobName(job)} · ${Math.ceil(job.seconds-job.elapsed)} s`+(this.service.queue.length?` · +${this.service.queue.length} na fila`:''):'Opala pronto. Volte quando quiser.';this.walkHud.querySelector('#pitWalkHint').textContent=`Saldo: ${money(this.wallet)} · `+(document.body.classList.contains('touch-device')?'Caminhe até a Tia ou o carro.':'W/S: caminhar · A/D: virar · E: interagir');const button=this.walkHud.querySelector('#pitInteract');button.hidden=!action;button.textContent=action==='car'?(busy?'Entrar e sair · interromper serviços':'Entrar no Opala e voltar à pista'):'Ver cardápio da Tia';}
 }
 update(dt,camera,visible){
  this.cameraRef=camera;const walking=!!this.coffee,menu=!!this.coffee?.menu;this.hud.hidden=!visible||!this.racing||this.opened||!this.condition.enabled;this.panel.hidden=!visible||!this.opened||(walking&&!menu);this.walkHud.hidden=!visible||!walking||menu;this.panel.classList.toggle('cafe-menu',walking);
  document.body.classList.toggle('pit-open',visible&&this.opened);document.body.classList.toggle('pit-walking',visible&&walking);document.body.classList.toggle('pit-cafe-menu',visible&&menu);
  if(this.viewShifted&&(!visible||!this.opened||walking)){camera.clearViewOffset();this.viewShifted=false;}
  if(this.savedFov!==undefined&&(!visible||!walking)){camera.fov=this.savedFov;camera.updateProjectionMatrix();this.savedFov=undefined;}
  this.hud.querySelector('#conditionPower').textContent='CONDIÇÃO '+pct(this.condition.health)+' · POTÊNCIA '+pct(this.condition.factors.power);
  for(const p of CAR_PARTS)this.hud.querySelector(`[data-health="${p.id}"]`).value=this.condition.quality[p.id];
  this.hud.querySelector('#pitHint').textContent=this.car.surface.pit?'BOX 99 · pare no retângulo amarelo':'P no mapa · pitstop na reta principal';
  this.markers.visible=this.opened&&!walking;this.cafePrompt.visible=visible&&walking&&!menu;this.markers.children.forEach((m,i)=>m.material.color.setHSL(this.condition.quality[CAR_PARTS[i].id]*.32,.85,.52));
  if(!this.opened)return;this.render();this.driver.root.visible=!walking;this.cup.visible=walking&&this.coffee.snack==='cafe'&&this.coffee.snackTime>0;
  if(!visible)return;
  const c=this.car,forward=new THREE.Vector3(Math.cos(c.heading),0,-Math.sin(c.heading)),inside=new THREE.Vector3(-Math.sin(c.heading),0,-Math.cos(c.heading));
  const target=new THREE.Vector3(c.x,c.surface.z+1,-c.y),eye=target.clone().addScaledVector(forward,-7).addScaledVector(inside,-7).add(new THREE.Vector3(0,2.7,0));
  if(walking){if(this.savedFov===undefined){this.savedFov=camera.fov;camera.fov=58;camera.updateProjectionMatrix();}const yaw=this.hero.rotation.y;this.followYaw+=Math.atan2(Math.sin(yaw-this.followYaw),Math.cos(yaw-this.followYaw))*(1-Math.exp(-dt*6));target.copy(this.hero.position).add(new THREE.Vector3(Math.cos(this.followYaw)*.7,1.15,-Math.sin(this.followYaw)*.7));eye.copy(this.hero.position).add(new THREE.Vector3(-Math.cos(this.followYaw)*4.8,3.2,Math.sin(this.followYaw)*4.8));}
  else{camera.setViewOffset(innerWidth,innerHeight,this.panel.getBoundingClientRect().width/2,0,innerWidth,innerHeight);this.viewShifted=true;}
  camera.position.lerp(eye,1-Math.exp(-Math.max(dt,.016)*7));camera.up.set(0,1,0);camera.lookAt(target);
 }
 buildScene(){
  const v=this.mode.visual,anchor=this.layout?.anchor??trackPoint(this.data,20,20);this.anchor=anchor;const h=anchor.heading;
  this.station=new THREE.Group();this.station.position.set(anchor.x,anchor.y,anchor.z);this.station.rotation.y=h;this.root.add(this.station);
  const box=(pos,size,color)=>v.box(this.station,pos,size,color);
  // Building signs stay fixed to the facade instead of turning across the camera.
  const sign=(text,pos,w,h,fg,bg)=>{const sprite=v.tag(this.station,text,pos,w,h,fg,bg),plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:sprite.material.map,side:THREE.DoubleSide}));plane.position.copy(sprite.position);this.station.remove(sprite);sprite.material.dispose();this.station.add(plane);return plane;};
  this.station.updateMatrixWorld(true);if(!this.layout){const apronGeometry=new THREE.PlaneGeometry(16,16).rotateX(-Math.PI/2).translate(0,-.024,-4).applyMatrix4(this.station.matrixWorld);const apron=new THREE.Mesh(this.roadSurface.geometry(apronGeometry),this.roadSurface.material);apron.name='Asfalto_Area_Box99';apron.receiveShadow=true;this.root.add(apron);}
  for(const z of [-2.25,2.25])box([0,.03,z],[7,.025,.12],0xf3d349);for(const x of [-3.5,3.5])box([x,.03,0],[.12,.025,4.5],0xf3d349);
  box([0,4.15,.62],[9.5,1.25,.14],0x103a30);const pitSign=sign('PITSTOP · BOX 99',[0,4.15,.71],9.2,1.12,'#fff4c5','#103a30');pitSign.name='Placa_Pitstop_Frente';pitSign.material.map.anisotropy=8;pitSign.material.side=THREE.FrontSide;const backSign=pitSign.clone();backSign.name='Placa_Pitstop_Verso';backSign.position.z=.53;backSign.rotation.y=Math.PI;this.station.add(backSign);
  for(const x of [-5,5])box([x,2.3,-4],[.18,4.6,.18],0xb6b9ac);box([0,4.65,-4],[12,.18,9],0x447361);
  box([4,1,-3.5],[1,2,.7],0xd6bc43);v.tag(this.station,'GASOLINA',[4,2.35,-3.5],1.7,.32);
  const mechanic=v.human(0x547c9e);mechanic.position.set(2.7,0,-2.5);this.station.add(mechanic);v.tag(mechanic,'MECÂNICO',[0,2.1,0],2,.32);
  // The café is inside the pit complex, on the infield side of the service lane.
  box([0,.1,-12],[14,.3,9],0xaf9875);box([0,1.7,-15],[14,3.4,.25],0xb8764b);box([0,3.6,-12],[15,.25,9],0x974b32);
  for(const x of [-6.5,6.5])box([x,1.8,-8],[.2,3.6,.2],0xd5b898);
  box([0,.7,-10],[8,.9,1.2],0xe0c89a);sign('LANCHONETE DA TIA',[0,3,-14.8],11,.8,'#ffe2a0','#754627');sign('CAFÉ · PÃO DE QUEIJO · DOCE DE LEITE',[0,2.2,-14.8],8,.38,'#fff','#8b5434');
  const tia=this.tia=v.human(0xe5b269);tia.position.set(1,.25,-11.2);tia.rotation.y=Math.PI/2;this.station.add(tia);v.box(tia,[.18,1.03,0],[.03,.48,.36],0xf2ecdc);v.tag(tia,'TIA',[0,2.05,0],.8,.3);
  for(let i=0;i<5;i++){const bread=new THREE.Mesh(new THREE.SphereGeometry(.16,10,6),new THREE.MeshStandardMaterial({color:0xe8bb62,roughness:.9}));bread.position.set(-1.6+i*.32,1.33,-9.7);this.station.add(bread);}
  for(const [x,color] of [[1,0x815031],[2,0xeee9dc]]){const jar=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.45,12),new THREE.MeshStandardMaterial({color}));jar.position.set(x,1.4,-9.7);this.station.add(jar);}
  this.hero=v.human(0xd82125);v.tag(this.hero,'99',[.19,1.15,0],.3,.25);const helmet=this.driver.root.getObjectByName('Capacete_preto_vermelho_balaclava');if(helmet){this.hero.userData.head.visible=false;const copy=helmet.clone();copy.position.set(0,1.62,0);this.hero.add(copy);}this.hero.visible=false;this.root.add(this.hero);
  this.cup=new THREE.Mesh(new THREE.CylinderGeometry(.075,.055,.13,10),new THREE.MeshStandardMaterial({color:0xf5edd8}));this.cup.position.set(.09,-.5,0);this.hero.getObjectByName('Membro_braco_-1').add(this.cup);this.cup.visible=false;
  this.station.updateMatrixWorld(true);this.cafeSeat=this.station.localToWorld(new THREE.Vector3(-1,.25,-8.2));this.cafePrompt=v.tag(this.station,'CARDÁPIO DA TIA',[-1,2.3,-8.2],2.6,.4,'#ffe2a0','#754627');this.cafePrompt.visible=false;
  this.markers=new THREE.Group();this.carRoot.add(this.markers);for(const [i,p] of CAR_PARTS.entries()){const marker=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshBasicMaterial({color:0x60df62,depthTest:false}));marker.position.set(...p.point);marker.renderOrder=100;this.markers.add(marker);v.tag(marker,String(i+1),[0,.23,0],.25,.25);}this.markers.visible=false;
  // Driveable entrance and exit join the track smoothly. All vertices follow physics.
  // A surveyed circuit brings its own pit lane.
  if(this.layout)return;
  const positions=[],indices=[];let n=0;
  const ordered=this.data.samples.filter(p=>pitLane(this.data,p[0])).sort((a,b)=>pitLane(this.data,a[0]).u-pitLane(this.data,b[0]).u);
  for(const p of ordered){const lane=pitLane(this.data,p[0]);for(const side of [-1,1]){const d=lane.offset+side*lane.halfWidth;positions.push(p[1]+p[9]*d,3.075,-p[2]-p[10]*d);}if(n){const k=(n-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}n++;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const laneGeometry=this.roadSurface.geometry(g),coords=laneGeometry.getAttribute('roadData');for(let i=0;i<coords.count;i++){const lane=pitLane(this.data,coords.getY(i));coords.setX(i,coords.getX(i)-(lane?.offset??0));coords.setZ(i,6.6);coords.setW(i,0);}const asphalt=new THREE.Mesh(laneGeometry,this.roadSurface.material);asphalt.name='Asfalto_Acesso_Pitstop';asphalt.receiveShadow=true;this.root.add(asphalt);
  for(const s of [1110,1140,1170,40,80,120]){const p=trackPoint(this.data,s,pitLane(this.data,s).offset);v.tag(this.root,s>1000?'P → BOX 99':'SAÍDA →',[p.x,p.y+1.6,p.z],3,.5,'#fff','#176455');}
 }
 info(){return {opened:this.opened,coffee:!!this.coffee,walking:!!this.coffee,cafeMenu:!!this.coffee?.menu,hero:this.hero.position.toArray(),queue:this.service.queue.map(job=>({...job})),job:this.service.job?{...this.service.job}:null,wallet:this.wallet,quality:{...this.condition.quality},factors:this.condition.factors};}
}
