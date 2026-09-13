export class MobileControls {
 constructor({enabled,onMenu,onCamera,onSkin,onReset,onUnlock}){
  this.enabled=enabled;this.pressed=new Set();this.pointers=new Map();this.phase='';
  document.body.classList.toggle('touch-device',enabled);
  this.root=document.getElementById('touchControls');
  for(const button of this.root.querySelectorAll('[data-key]')){
   button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();if(!enabled||button.disabled)return;onUnlock();button.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,{key:button.dataset.key,button});this.pressed.add(button.dataset.key);button.classList.add('held');});
   const release=event=>{const item=this.pointers.get(event.pointerId);if(!item)return;this.pointers.delete(event.pointerId);if(![...this.pointers.values()].some(x=>x.key===item.key)){this.pressed.delete(item.key);item.button.classList.remove('held');}};
   button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
   button.addEventListener('contextmenu',event=>event.preventDefault());
  }
  document.getElementById('touchMenu').onclick=onMenu;document.getElementById('touchCamera').onclick=onCamera;document.getElementById('touchSkin').onclick=onSkin;document.getElementById('touchReset').onclick=onReset;
  const full=document.getElementById('touchFullscreen');full.hidden=!document.documentElement.requestFullscreen;full.onclick=async()=>{try{await document.documentElement.requestFullscreen();try{await screen.orientation?.lock?.('landscape');}catch{}}catch{}};
  window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
 }
 clear(){this.pressed.clear();for(const {button} of this.pointers.values())button.classList.remove('held');this.pointers.clear();}
 update(paused,phase){this.root.classList.toggle('hidden',!this.enabled||paused||['podium','complete','disqualified'].includes(phase));if(phase===this.phase)return;this.phase=phase;const walking=phase==='crowd';document.getElementById('touchGasLabel').textContent=walking?'ANDAR':'ACELERAR';document.getElementById('touchBrakeLabel').textContent=walking?'VOLTAR':'FREAR';document.getElementById('touchHandbrake').hidden=walking;document.getElementById('touchReverse').hidden=walking;document.getElementById('touchReset').hidden=walking;}
}
