import {ROLES,GUIDED,REQUIRED,H_ROLES,deviceName,sameSource} from './wheel-controls.js';
// The Controles tab's "Volante, pedais e câmbio": what the wheel reads now, the guided setup (the
// wheel and pedals, then the clutch, paddles and H gate, each of which can be skipped) and every
// command one by one (Definir learns it, ✕ clears it).
const $=id=>document.getElementById(id);
// (a device names itself: its name is text, never markup)
const escape=text=>String(text).replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const GROUPS=[['Direção e pedais',['steer','throttle','brake','clutch']],['Marchas',['up','down',...H_ROLES]],
 ['Botões',Object.keys(ROLES).filter(role=>ROLES[role].kind==='button'&&!['up','down',...H_ROLES].includes(role))]];
const GEAR_NAMES={'-1':'R',0:'N'};
export const gearName=gear=>GEAR_NAMES[gear]??String(gear);
function stepText(role){
 const r=ROLES[role];
 if(role==='steer')return 'Gire o volante <b>um quarto de volta para a direita</b> (90°: o topo do volante apontando para a direita) e segure parado.';
 if(role==='clutch')return 'Pise na <b>embreagem</b> até o fundo e solte.';
 if(r.kind==='pedal')return `Pise no <b>${r.label.toLowerCase()}</b> até o fundo e solte.`;
 if(role==='up')return 'Puxe a <b>borboleta de subir marcha</b> (ou a alavanca sequencial para cima).';
 if(role==='down')return 'Puxe a <b>borboleta de descer marcha</b> (ou a alavanca sequencial para baixo).';
 if(r.gear!==undefined)return `Câmbio H: passe pelo ponto morto e engate a <b>${r.gear<0?'ré':r.label.slice(-2)}</b>.`;
 return `Aperte o botão do volante para <b>${r.label}</b>.`;
}
const STEP_NOTES={steer:'Comece com o volante no centro.',clutch:'Sem embreagem? Pule.',up:'Sem borboletas nem alavanca sequencial? Pule.'};
export class WheelPanel {
 // gearbox: the ManualGearbox; manual(): whether Câmbio manual is on; onManual(): turns it on (a
 // setup that found paddles or an H gate).
 constructor({wheel,gearbox,manual,onManual}){
  this.wheel=wheel;this.gearbox=gearbox;this.manual=manual;this.onManual=onManual;
  this.queue=null;this.index=0;this.guided=false;this.before=null;this.lastDraw=0;this.message='';
  $('wheelSetup').onclick=()=>this.begin(GUIDED,true);
  $('wheelForget').onclick=()=>{this.cancel();this.wheel.forget();this.message='';this.refresh();};
  $('wheelStepSkip').onclick=()=>{this.index++;this.ask();};
  $('wheelStepSkipLever').onclick=()=>{while(H_ROLES.includes(this.queue?.[this.index]))this.index++;this.ask();};
  $('wheelStepCancel').onclick=()=>this.cancel();
  $('wheelBindings').onclick=e=>{
   const button=e.target.closest('button');if(!button)return;
   if(button.dataset.learn)this.begin([button.dataset.learn],false);
   else if(button.dataset.clear){this.wheel.clear(button.dataset.clear);this.refresh();}
  };
  this.refresh();
 }
 // A setup: the guided one starts afresh (cancelling it brings the old map back), one command is
 // learnt over the one it had.
 begin(roles,guided){
  this.cancel();this.queue=roles;this.index=0;this.guided=guided;this.done=[];this.message='';
  if(guided){this.before={...this.wheel.map};for(const role of GUIDED)delete this.wheel.map[role];}
  $('wheelStep').hidden=false;$('wheelActions').hidden=true;$('wheelMeters').hidden=true;this.ask();
 }
 ask(note=''){
  const role=this.queue?.[this.index];
  if(!role){this.finish();return;}
  $('wheelStepCount').textContent=this.guided?`PASSO ${this.index+1} DE ${this.queue.length}`:ROLES[role].label.toUpperCase();
  $('wheelStepText').innerHTML=stepText(role);
  $('wheelStepNote').textContent=note||STEP_NOTES[role]||'';
  $('wheelStepProgress').style.width='0%';
  $('wheelStepSkip').hidden=!this.guided||REQUIRED.includes(role);
  $('wheelStepSkipLever').hidden=!this.guided||role!==H_ROLES[0];
  this.wheel.learn(role,binding=>this.learnt(role,binding));
 }
 learnt(role,binding){
  // In the guided setup a button already given to an earlier step is a slip, not a change of mind.
  const clash=this.guided&&this.done.find(other=>ROLES[other].kind==='button'&&ROLES[role].kind==='button'&&sameSource(this.wheel.map[other]??{},binding));
  if(clash){this.ask(`Esse botão já ficou com ${ROLES[clash].label}. Use outro.`);return;}
  const result=this.wheel.set(role,binding);
  if(result.taken){this.ask(`Isso é ${ROLES[result.taken].label.toLowerCase()}. Tente de novo.`);return;}
  if(!result.ok){this.ask('Não deu para ler. Tente de novo.');return;}
  this.done.push(role);this.index++;this.ask(this.queue[this.index]?`✓ ${ROLES[role].label}: ${this.wheel.describe(role)}`:'');
 }
 finish(){
  const guided=this.guided,shifts=['up','down',...H_ROLES].some(role=>this.wheel.map[role]);
  this.close();
  if(guided){
   this.message='Pronto! Confira abaixo: gire, pise e troque de marcha.';
   if(shifts&&!this.manual()){this.onManual();this.message+=' O câmbio passou para Manual (Câmbio, no alto desta aba).';}
  }
  this.refresh();
 }
 // Leaves the setup (closing the settings too): a guided one half done gives the old map back.
 cancel(){
  if(!this.queue)return;
  if(this.guided&&this.before){this.wheel.map=this.before;this.wheel.save();}
  this.close();this.refresh();
 }
 close(){this.wheel.stopLearning();this.queue=null;this.before=null;$('wheelStep').hidden=true;$('wheelActions').hidden=false;}
 // The status line, the buttons and the list of commands.
 refresh(){
  const w=this.wheel,names=ids=>ids.map(deviceName).join(' + ');
  const found=w.pads.find(p=>p.mapping!=='standard'&&!w.uses(p.id));
  let text;
  if(this.queue)text='Configurando: siga o passo abaixo.';
  else if(!w.devices.length)text=found?`${deviceName(found.id)} encontrado. Clique em Configurar volante.`:'Nenhum volante configurado. Ligue o volante, gire ou aperte um botão dele e clique em Configurar volante.';
  else if(!w.configured)text=`Configuração incompleta: falta ${REQUIRED.filter(role=>!w.map[role]).map(role=>ROLES[role].label.toLowerCase()).join(', ')}. Clique em Configurar volante.`;
  else if(!w.connected)text=`${names(w.devices)}: configurado, mas desligado. Ligue e aperte um botão dele.`;
  else if(w.missing.length)text=`${names(w.present)} pronto; ${names(w.missing)} não está conectado.`;
  else text=`Volante pronto: ${names(w.devices)}`;
  $('wheelStatus').textContent=this.message&&w.configured&&w.connected?`${text}. ${this.message}`:text;
  $('wheelStatus').classList.toggle('connected',w.configured&&w.connected);
  $('wheelForget').hidden=!w.devices.length;
  $('wheelSetup').textContent=w.devices.length?'Configurar de novo →':'Configurar volante →';
  $('wheelMeters').hidden=!!this.queue||!w.connected;
  $('wheelClutchMeter').hidden=!w.map.clutch;
  $('wheelBindings').innerHTML=GROUPS.map(([title,roles])=>`<p class="wheel-binding-group">${title.toUpperCase()}</p>`+roles.map(role=>{
   const bound=w.describe(role);
   return `<div class="wheel-binding"><span>${ROLES[role].label}</span><em>${bound?escape(bound):'—'}</em><button type="button" data-learn="${role}">Definir</button>${bound?`<button type="button" data-clear="${role}" aria-label="Limpar ${ROLES[role].label}">✕</button>`:'<span></span>'}</div>`;
  }).join('')).join('');
 }
 // Each frame with the settings open: the step's progress, or what the wheel reads (about 15 times a second).
 frame(now=performance.now()){
  if(this.queue){$('wheelStepProgress').style.width=`${Math.round((this.wheel.learner?.progress??0)*100)}%`;return;}
  if(now-this.lastDraw<66||$('wheelMeters').hidden)return;this.lastDraw=now;
  const w=this.wheel,s=w.steering,pct=v=>`${Math.round(v*100)}%`;
  Object.assign($('wheelSteerBar').style,{left:`${50+Math.min(0,s)*50}%`,width:`${Math.abs(s)*50}%`});
  $('wheelSteerText').textContent=`${Math.round(Math.abs(w.degrees))}°${w.degrees>.5?' →':w.degrees<-.5?' ←':''}`;
  for(const [name,value] of [['Throttle',w.throttle],['Brake',w.brake],['Clutch',w.clutch]]){$(`wheel${name}Bar`).style.width=pct(value);$(`wheel${name}Text`).textContent=pct(value);}
  // The H lever's slot, or a paddle being pulled, or which gearbox is on.
  const lever=w.lever,held=[...w.held];
  $('wheelGearText').textContent=lever!==undefined?gearName(lever??0):held.includes('up')?'▲':held.includes('down')?'▼':this.manual()?`Manual · ${gearName(this.gearbox.gear)}`:'Automático';
  $('wheelPressed').textContent=held.filter(role=>role!=='up'&&role!=='down').map(role=>ROLES[role].label).join(' · ');
 }
}
