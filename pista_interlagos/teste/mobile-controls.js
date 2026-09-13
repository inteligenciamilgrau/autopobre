export class MobileControls {
 constructor({enabled,onMenu,onCamera,onSkin,onReset,onUnlock}){
  this.enabled=enabled;this.pressed=new Set();this.pointers=new Map();this.phase='';this.handbrake=false;this.steering=0;this.steeringPosition=0;this.steerPointer=null;
  document.body.classList.toggle('touch-device',enabled);
  this.root=document.getElementById('touchControls');
  this.steerPad=document.getElementById('touchSteering');this.steerThumb=document.getElementById('steeringThumb');
  const steerAt=event=>{const rect=this.steerPad.getBoundingClientRect(),value=(event.clientX-rect.left-rect.width/2)/(rect.width/2-22);this.setSteering(Math.max(-1,Math.min(1,value)));};
  this.steerPad.addEventListener('pointerdown',event=>{if(!enabled||this.steerPointer!==null)return;event.preventDefault();event.stopPropagation();onUnlock();this.steerPointer=event.pointerId;this.steerPad.setPointerCapture(event.pointerId);this.steerPad.classList.add('active');steerAt(event);});
  this.steerPad.addEventListener('pointermove',event=>{if(event.pointerId===this.steerPointer){event.preventDefault();steerAt(event);}});
  const releaseSteering=event=>{if(event.pointerId!==this.steerPointer)return;this.steerPointer=null;this.steerPad.classList.remove('active');this.setSteering(0);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.steerPad.addEventListener(type,releaseSteering);
  this.steerPad.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){event.preventDefault();event.stopPropagation();this.setSteering(event.key==='Home'?0:this.steeringPosition+(event.key==='ArrowLeft'?-.1:.1));}});
  this.steerPad.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key))this.setSteering(0);});
  for(const button of this.root.querySelectorAll('[data-key]')){
   button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();if(!enabled||button.disabled)return;onUnlock();button.setPointerCapture(event.pointerId);if(button.dataset.key==='Space'){this.setHandbrake(!this.handbrake);return;}this.pointers.set(event.pointerId,{key:button.dataset.key,button});this.pressed.add(button.dataset.key);button.classList.add('held');});
   const release=event=>{const item=this.pointers.get(event.pointerId);if(!item)return;this.pointers.delete(event.pointerId);if(![...this.pointers.values()].some(x=>x.key===item.key)){this.pressed.delete(item.key);item.button.classList.remove('held');}};
   button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
   button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  document.getElementById('touchMenu').onclick=onMenu;document.getElementById('touchCamera').onclick=onCamera;document.getElementById('touchSkin').onclick=onSkin;document.getElementById('touchReset').onclick=onReset;
  const full=document.getElementById('touchFullscreen'),openingFull=document.getElementById('startFullscreen'),canFullscreen=!!document.documentElement.requestFullscreen;
  full.hidden=!canFullscreen;openingFull.hidden=!enabled;openingFull.disabled=!canFullscreen;if(!canFullscreen)openingFull.textContent='Tela cheia indisponível';
  const fullscreen=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();return;}await document.documentElement.requestFullscreen();try{await screen.orientation?.lock?.('landscape');}catch{}}catch{openingFull.textContent='Tentar tela cheia novamente';}};
  full.onclick=fullscreen;openingFull.onclick=fullscreen;document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?'Sair da tela cheia':'Tela cheia';full.textContent=openingFull.textContent=label;});
  window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 setHandbrake(value){this.handbrake=value;if(value)this.pressed.add('Space');else this.pressed.delete('Space');const button=document.getElementById('touchHandbrake');button.classList.toggle('held',value);button.setAttribute('aria-pressed',String(value));button.textContent=value?'SOLTAR FREIO DE MÃO':'FREIO DE MÃO';}
 setSteering(value){
  this.steeringPosition=Math.max(-1,Math.min(1,value));
  // Keep the thumb under the finger; soften the steering response near the center.
  const amount=Math.max(0,(Math.abs(this.steeringPosition)-.035)/.965);
  this.steering=Math.sign(this.steeringPosition)*amount*amount;
  this.steerPad.setAttribute('aria-valuenow',String(Math.round(this.steeringPosition*100)));
  this.steerThumb.style.left=`${50+this.steeringPosition*(50-2200/Math.max(44,this.steerPad.clientWidth||174))}%`;
 }
 clear(){this.pressed.clear();for(const {button} of this.pointers.values())button.classList.remove('held');this.pointers.clear();this.steerPointer=null;this.steerPad.classList.remove('active');this.setSteering(0);this.setHandbrake(this.handbrake);}
 update(paused,phase){this.root.classList.toggle('hidden',!this.enabled||paused||['podium','complete','disqualified'].includes(phase));if(phase===this.phase)return;this.phase=phase;const walking=phase==='crowd';if(walking||['podium','complete','disqualified'].includes(phase))this.setHandbrake(false);document.getElementById('touchGasLabel').textContent=walking?'ANDAR':'ACELERAR';document.getElementById('touchBrakeLabel').textContent=walking?'VOLTAR':'FREAR';document.getElementById('touchHandbrake').hidden=walking;document.getElementById('touchReverse').hidden=walking;document.getElementById('touchReset').hidden=walking;}
}
