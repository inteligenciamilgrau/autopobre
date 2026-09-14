import * as THREE from 'three';
import {CarCondition,CAR_PARTS,PitService} from './car-condition.js';
import {pitLane,inPitBox} from './pit-lane.js';
import {trackPoint} from './immersive-visuals.js';
const money=n=>'R$ '+n.toFixed(2).replace('.',','),pct=n=>Math.round(n*100)+'%';
const idle={throttle:0,brake:1,left:0,right:0,reverse:0,handbrake:0};
export class PitStop {
 constructor({scene,car,carRoot,driver,mode,data,onOpen,onClose,onSettings}){
  Object.assign(this,{car,carRoot,driver,mode,data,onOpen,onClose,onSettings});
  this.condition=new CarCondition();car.condition=this.condition;mode.state.condition=this.condition;
  this.bank=450;this.opened=false;this.coffee=null;this.stationary=0;this.departing=false;
  this.service=new PitService({condition:this.condition,getFuel:()=>this.fuel,setFuel:v=>{if(mode.active)mode.state.fuel=v;else mode.freeFuel=v;},pay:cost=>this.spend(cost,true),refund:cost=>this.refund(cost)});
  this.root=new THREE.Group();this.root.name='Pitstop_e_Lanchonete_da_Tia';scene.add(this.root);this.buildScene();
  this.hud=document.createElement('aside');this.hud.id='conditionHud';this.hud.hidden=true;this.hud.innerHTML='<b>OPALA · <span id="conditionPower"></span></b><div class="condition-bars">'+CAR_PARTS.map(p=>`<label>${p.name}<meter data-health="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter></label>`).join('')+'</div><small id="pitHint"></small>';document.body.append(this.hud);
  this.panel=document.createElement('section');this.panel.id='pitPanel';this.panel.hidden=true;this.panel.setAttribute('aria-label','Pitstop de Curvelo');
  this.panel.innerHTML=`<header class="pit-heading"><div><small>CURVELO · BOX 99</small><h2>Cuida do Opala, uai!</h2></div><button id="pitSettings" aria-label="Pausar e abrir configurações">⚙</button></header><p class="pit-budget"><span id="pitWallet"></span><b id="pitFuel"></b></p><p class="pit-message" id="pitMessage" role="status"></p><div id="pitJob" hidden><b id="pitJobLabel"></b><progress id="pitProgress" max="1" value="0"></progress></div><div class="pit-scroll"><div id="pitGarage"><div class="pit-refuel"><button id="pitFill2">Abastecer 2 L</button><button id="pitFillAll">Completar tanque</button></div><p class="pit-explain">Escolha por peça. Resolver pra valer recupera 100%; gambiarra recupera parte do dano, até 78%. A corrida continua durante o serviço.</p><div class="pit-parts">${CAR_PARTS.map((p,i)=>`<article><div class="pit-part-title"><b>${i+1}. ${p.name}</b><strong data-quality="${p.id}"></strong></div><small>${p.effect}</small><meter data-quality-bar="${p.id}" min="0" max="1" low=".4" high=".8" optimum="1" value="1"></meter><div class="pit-repair-options"><button data-repair="${p.id}" data-kind="proper"></button><button data-repair="${p.id}" data-kind="patch"></button></div></article>`).join('')}</div></div><div id="pitCafe" hidden><small>LANCHONETE DA TIA</small><h3>Café passado na hora.</h3><p>Pão de queijo quentinho e doce de leite. Aqui até o prejuízo vem acompanhado.</p><p id="pitCafeStatus"></p><button id="pitReturnCar">Voltar ao Opala</button></div></div><footer class="pit-actions"><button id="pitCoffee">Sair para um café · R$ 12</button><button id="pitLeave">Voltar à pista →</button></footer>`;
  document.body.append(this.panel);const $=id=>this.panel.querySelector('#'+id);
  $('pitSettings').onclick=onSettings;$('pitLeave').onclick=()=>this.leave();$('pitCoffee').onclick=()=>this.visitCafe();$('pitReturnCar').onclick=()=>this.returnCar();
  $('pitFill2').onclick=()=>this.startFuel(2);$('pitFillAll').onclick=()=>this.startFuel(12);
  for(const button of this.panel.querySelectorAll('[data-repair]'))button.onclick=()=>{if(this.service.startRepair(button.dataset.repair,button.dataset.kind)){this.message='Serviço autorizado. Pode esperar aqui ou ir tomar um café.';mode.state.emitSound('judgeCheck');}else this.message='Não foi possível iniciar: confira o saldo e o serviço em andamento.';this.render();};
 }
 get racing(){return !this.mode.finishing&&(this.mode.active?this.mode.state.phase==='race':!this.mode.freeFinished);}
 get fuel(){return this.mode.active?this.mode.state.fuel:this.mode.freeFuel;}
 get wallet(){return this.mode.active?this.mode.state.cash+this.mode.state.profile.fund:this.bank;}
 spend(cost,service=false){
  if(cost>this.wallet+.001)return false;
  if(this.mode.active){const cash=Math.min(this.mode.state.cash,cost),fund=cost-cash;this.mode.state.cash-=cash;this.mode.state.profile.fund-=fund;if(service)this.payment={cash,fund,total:cost};this.mode.save();}
  else{this.bank-=cost;if(service)this.payment={total:cost};}return true;
 }
 refund(amount){if(this.mode.active){const ratio=this.payment?.cash/(this.payment?.total||1)||0;this.mode.state.cash+=amount*ratio;this.mode.state.profile.fund+=amount*(1-ratio);this.mode.save();}else this.bank+=amount;}
 startFuel(amount){if(this.service.startFuel(amount)){this.message='Motor desligado. A gasolina entra aos poucos; o cronômetro continua.';this.mode.state.emitSound('fuelFill');}else this.message='Tanque cheio, saldo insuficiente ou serviço já em andamento.';this.render();}
 reset(){this.service.cancel();this.close();this.condition.reset();this.bank=450;this.departing=false;this.stationary=0;this.message='';}
 close(){this.opened=false;this.coffee=null;this.hero.visible=false;this.driver.root.visible=true;this.panel.hidden=true;this.markers.visible=false;document.body.classList.remove('pit-open');this.onClose?.();}
 leave(){if(this.coffee){this.returnCar();return;}const refund=this.service.cancel();this.message=refund?`Serviço interrompido. ${money(refund)} devolvidos.`:'';this.close();this.departing=true;this.stationary=0;}
 visitCafe(){if(this.coffee||!this.spend(12))return;this.coffee={elapsed:0,returning:false};this.hero.visible=true;this.hero.position.copy(this.heroStart());this.mode.state.emitSound('pitCoffee');this.render();}
 heroStart(){const c=this.car;return new THREE.Vector3(c.x-Math.sin(c.heading)*1.5,c.surface.z,-c.y-Math.cos(c.heading)*1.5);}
 returnCar(){if(!this.coffee||this.coffee.returning)return;this.coffee={elapsed:0,returning:true,from:this.hero.position.clone()};this.render();}
 beforeStep(input,dt){
  if(!this.racing){if(this.opened){this.service.cancel();this.close();}return false;}
  const c=this.car,speed=Math.hypot(c.vx,c.vy),box=inPitBox(c.surface);
  if(!box)this.departing=false;
  this.condition.wear(dt,{offRoad:!c.surface.onRoad,speed,spin:c.rearSlipSpeed});
  if(!this.opened){this.stationary=box&&speed<.65&&!input.throttle&&!input.reverse?this.stationary+dt:0;if(this.stationary>.65&&!this.departing){this.opened=true;this.message='Bem-vindo ao box. Escolha abastecimento, reparo ou lanchonete.';this.onOpen();this.mode.state.emitSound('paper');this.render();}}
  if(!this.opened)return false;
  Object.assign(input,idle);c.vx=c.vy=c.yaw=0;c.burnout=c.rearSlipSpeed=0;
  // The player's car is stationary, but the race clock and every rival continue.
  this.mode.stepPit(dt);
  const job=this.service.job;if(job&&job.id!=='fuel'&&Math.floor(job.elapsed/1.4)!==Math.floor((job.elapsed+dt)/1.4))this.mode.state.emitSound('pitRepair');
  const completed=this.service.step(dt);
  if(completed){this.message=completed.id==='fuel'?'Abastecimento pronto. Bora voltar!':`${CAR_PARTS.find(p=>p.id===completed.id).name}: serviço concluído.`;this.mode.state.emitSound('judgeApprove');}
  if(this.mode.active){this.mode.state.health=this.condition.health;if(this.condition.quality.tanque>.4){this.mode.state.tankDetached=false;this.mode.state.tankWear=0;}}
  if(this.coffee){this.coffee.elapsed+=dt;if(this.coffee.returning&&this.coffee.elapsed>=4){this.coffee=null;this.hero.visible=false;this.driver.root.visible=true;this.mode.state.emitSound('engineCatch');}}
  return true;
 }
 render(){
  const $=id=>this.panel.querySelector('#'+id),job=this.service.job,busy=!!job;
  $('pitWallet').textContent=(this.mode.active?'Saldo disponível: ':'Verba da equipe: ')+money(this.wallet);$('pitFuel').textContent=this.fuel.toFixed(1)+' / 12 L';$('pitMessage').textContent=this.message||'';
  $('pitJob').hidden=!busy;if(job){$('pitJobLabel').textContent=(job.id==='fuel'?'Abastecendo':`Consertando ${CAR_PARTS.find(p=>p.id===job.id).name}`)+` · ${Math.ceil(job.seconds-job.elapsed)} s`;$('pitProgress').value=job.progress;}
  for(const p of CAR_PARTS){const q=this.condition.quality[p.id];this.panel.querySelector(`[data-quality="${p.id}"]`).textContent=pct(q);this.panel.querySelector(`[data-quality-bar="${p.id}"]`).value=q;}
  for(const b of this.panel.querySelectorAll('[data-repair]')){const quote=this.condition.quote(b.dataset.repair,b.dataset.kind),proper=b.dataset.kind==='proper';b.textContent=quote?`${proper?'Caro · resolver pra valer':'Gambiarra só pra terminar'} · ${money(quote.cost)} · ${Math.ceil(quote.seconds)} s → ${pct(quote.to)}`:proper?'Tudo certo · 100%':'Gambiarra não melhora';b.disabled=busy||!quote||quote.cost>this.wallet;}
  for(const [id,amount] of [['pitFill2',2],['pitFillAll',12]]){const litres=Math.min(amount,12-this.fuel),cost=Math.ceil(litres*6.5);$(id).textContent=litres<.05?'Tanque cheio':(id==='pitFill2'?'Abastecer ':'Completar · ')+litres.toFixed(1)+' L · '+money(cost);$(id).disabled=busy||litres<.05||cost>this.wallet;}
  $('pitGarage').hidden=!!this.coffee;$('pitCafe').hidden=!this.coffee;$('pitCoffee').hidden=!!this.coffee;$('pitCoffee').disabled=this.wallet<12;
  $('pitLeave').hidden=!!this.coffee;$('pitLeave').textContent=busy?'Sair agora · interromper serviço':'Voltar à pista →';
  $('pitReturnCar').disabled=!!this.coffee?.returning;$('pitCafeStatus').textContent=this.coffee?.returning?'Voltando para o carro…':this.coffee?.elapsed<4?'Stevan foi até o balcão. A Tia já colocou a água no fogo.':busy?'Pode comer tranquilo. O mecânico continua trabalhando.':'Café, pão de queijo e doce de leite na mesa. Os adversários não esperam, uai!';
 }
 update(dt,camera,visible){
  this.hud.hidden=!visible||!this.racing||this.opened;this.panel.hidden=!visible||!this.opened;document.body.classList.toggle('pit-open',visible&&this.opened);
  if(this.viewShifted&&(!visible||!this.opened)){camera.clearViewOffset();this.viewShifted=false;}
  this.hud.querySelector('#conditionPower').textContent='CONDIÇÃO '+pct(this.condition.health)+' · POTÊNCIA '+pct(this.condition.factors.power);
  for(const p of CAR_PARTS)this.hud.querySelector(`[data-health="${p.id}"]`).value=this.condition.quality[p.id];
  this.hud.querySelector('#pitHint').textContent=this.car.surface.pit?'BOX 99 · pare no retângulo amarelo':'P no mapa · pitstop na reta principal';
  this.markers.visible=this.opened&&!this.coffee;this.markers.children.forEach((m,i)=>m.material.color.setHSL(this.condition.quality[CAR_PARTS[i].id]*.32,.85,.52));
  if(!this.opened)return;this.render();this.driver.root.visible=!this.coffee;
  if(visible){camera.setViewOffset(innerWidth,innerHeight,this.panel.getBoundingClientRect().width/2,0,innerWidth,innerHeight);this.viewShifted=true;}
  const c=this.car,forward=new THREE.Vector3(Math.cos(c.heading),0,-Math.sin(c.heading)),inside=new THREE.Vector3(-Math.sin(c.heading),0,-Math.cos(c.heading));
  const target=new THREE.Vector3(c.x,c.surface.z+1,-c.y),eye=target.clone().addScaledVector(forward,-7).addScaledVector(inside,-7).add(new THREE.Vector3(0,2.7,0));
  if(this.coffee){const t=Math.min(1,this.coffee.elapsed/4),from=this.coffee.returning?this.coffee.from:this.heroStart(),to=this.coffee.returning?this.heroStart():this.cafeSeat;this.hero.position.lerpVectors(from,to,t);const delta=to.clone().sub(from);this.hero.rotation.y=Math.atan2(-delta.z,delta.x);const walk=t<1?Math.sin(this.coffee.elapsed*9)*.55:0;for(const side of [-1,1]){this.hero.getObjectByName('Membro_perna_'+side).rotation.z=walk*side;this.hero.getObjectByName('Membro_braco_'+side).rotation.z=-walk*side;}if(t>=1&&!this.coffee.returning)this.hero.getObjectByName('Membro_braco_-1').rotation.z=1.1;target.copy(this.hero.position).add(new THREE.Vector3(0,1,0));eye.copy(target).addScaledVector(inside,-5).addScaledVector(forward,-4).add(new THREE.Vector3(0,3,0));}
  this.cup.visible=!!this.coffee&&!this.coffee.returning&&this.coffee.elapsed>=4;
  if(this.cup.visible){target.lerp(this.tia.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1,0)),.45);eye.copy(target).addScaledVector(inside,-7).addScaledVector(forward,-3).add(new THREE.Vector3(0,1,0));}
  camera.position.lerp(eye,1-Math.exp(-Math.max(dt,.016)*5));camera.up.set(0,1,0);camera.lookAt(target);
 }
 buildScene(){
  const v=this.mode.visual,anchor=trackPoint(this.data,20,20);this.anchor=anchor;const h=anchor.heading;
  this.station=new THREE.Group();this.station.position.set(anchor.x,anchor.y,anchor.z);this.station.rotation.y=h;this.root.add(this.station);
  const box=(pos,size,color)=>v.box(this.station,pos,size,color);
  // Building signs stay fixed to the facade instead of turning across the camera.
  const sign=(text,pos,w,h,fg,bg)=>{const sprite=v.tag(this.station,text,pos,w,h,fg,bg),plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:sprite.material.map,side:THREE.DoubleSide}));plane.position.copy(sprite.position);this.station.remove(sprite);sprite.material.dispose();this.station.add(plane);return plane;};
  box([0,-.055,0],[16,.06,8],0x454a43);
  for(const z of [-2.25,2.25])box([0,.03,z],[7,.025,.12],0xf3d349);for(const x of [-3.5,3.5])box([x,.03,0],[.12,.025,4.5],0xf3d349);
  sign('PITSTOP · BOX 99',[0,4.7,-1.9],8,1,'#fff','#176455');
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
  this.station.updateMatrixWorld(true);this.cafeSeat=this.station.localToWorld(new THREE.Vector3(-1,.25,-8.2));
  this.markers=new THREE.Group();this.carRoot.add(this.markers);for(const [i,p] of CAR_PARTS.entries()){const marker=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshBasicMaterial({color:0x60df62,depthTest:false}));marker.position.set(...p.point);marker.renderOrder=100;this.markers.add(marker);v.tag(marker,String(i+1),[0,.23,0],.25,.25);}this.markers.visible=false;
  // Driveable entrance and exit join the track smoothly. All vertices follow physics.
  const positions=[],indices=[];let n=0;
  const ordered=this.data.samples.filter(p=>pitLane(this.data,p[0])).sort((a,b)=>pitLane(this.data,a[0]).u-pitLane(this.data,b[0]).u);
  for(const p of ordered){const lane=pitLane(this.data,p[0]);for(const side of [-1,1]){const d=lane.offset+side*lane.halfWidth;positions.push(p[1]+p[9]*d,3.075,-p[2]-p[10]*d);}if(n){const k=(n-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}n++;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const asphalt=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x626766,roughness:1}));asphalt.receiveShadow=true;this.root.add(asphalt);
  for(const s of [1110,1140,1170,40,80,120]){const p=trackPoint(this.data,s,pitLane(this.data,s).offset);v.tag(this.root,s>1000?'P → BOX 99':'SAÍDA →',[p.x,p.y+1.6,p.z],3,.5,'#fff','#176455');}
 }
 info(){return {opened:this.opened,coffee:!!this.coffee,job:this.service.job?{...this.service.job}:null,wallet:this.wallet,quality:{...this.condition.quality},factors:this.condition.factors};}
}
