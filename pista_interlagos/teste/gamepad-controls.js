// Xbox and PlayStation controllers (Gamepad API, standard mapping only: a wheel or pedals, or a pad a
// browser does not map, has its buttons and axes elsewhere, and is left out). As in F1 and the other racing
// games, RT (R2) accelerates and LT (L2) brakes, both analog, and the left stick steers. The other
// buttons press the keyboard's keys (BUTTON_KEYS), so every place that answers a key answers the
// controller too; the right stick looks around like the captured mouse (onLook, in mouse pixels).
export const BUTTON_KEYS=Object.freeze({
 0:['Space'],          // A / ✕: handbrake (on foot a jump, on the podium Continuar)
 1:['KeyQ'],           // B / ○: reverse, held
 2:['KeyE'],           // X / □: the action key (talk, hood, trunk)
 3:['KeyL','KeyF'],    // Y / △: IGN at the start; on foot, out of the Opala or back in
 4:['KeyI'],           // LB / L1: the starter, held
 5:['KeyC'],           // RB / R1: next camera (on foot: crouch)
 8:['KeyR'],           // View / Share: reposition, or call the tow
 10:['ShiftLeft'],     // LS / L3: run on foot, held
 11:['KeyB'],          // RS / R3: look back, held
 12:['Digit2'],13:['KeyN'],14:['Digit1'],15:['Digit3'] // D-pad: answers 1 2 3 on foot; ↓ the next driver in the recon lap
});
export const MENU_BUTTON=9; // Menu / Options: the pause menu, and back to the race
export const STEERING_CURVES=Object.freeze({suave:2.2,normal:1.6,direta:1});
// A trigger's travel counts from where it rests: the lowest it has read up to TRIGGER_REST (a worn
// trigger never goes back to 0; one pressed further when first read rests at 0 until let go).
const STICK_DEADZONE=.12,TRIGGER_DEADZONE=.04,TRIGGER_REST=.3,LOOK_SPEED=900;
const keyName=code=>code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code.startsWith('Digit')?code.slice(5):code==='ShiftLeft'?'Shift':code;
// Stick travel past the dead zone, full at 95% (worn sticks and diagonals never reach 1), then the
// curve: above 1 the middle turns gently and the ends still give full lock.
export function stickValue(value,curve=STEERING_CURVES.normal){
 const amount=Math.min(1,Math.max(0,(Math.abs(value||0)-STICK_DEADZONE)/(.95-STICK_DEADZONE)));
 return amount?Math.sign(value)*amount**curve:0;
}
export function triggerValue(value,rest=0){const r=Math.max(0,rest||0)+TRIGGER_DEADZONE;return Math.min(1,Math.max(0,((value||0)-r)/(1-r)));}
function readPads(){try{return [...(navigator.getGamepads?.()??[])].filter(Boolean);}catch{return [];}}
const padName=pad=>pad?.id.replace(/\s*\(.*\)\s*$/,'').trim()||'Controle';
export class GamepadControls {
 constructor({target=document,onMenu,onLook,onChange}={}){
  this.target=target;this.onMenu=onMenu;this.onLook=onLook;this.onChange=onChange;
  this.steering=this.throttle=this.brake=this.walk=0;this.held=new Set();this.menuHeld=false;this.pad=null;this.other=null;
  this.curve=STEERING_CURVES.normal;this.rumble=true;this.touching=new Map();this.rests=new Map();
  addEventListener('gamepadconnected',()=>this.poll(0));addEventListener('gamepaddisconnected',()=>this.poll(0));
 }
 get connected(){return !!this.pad;}
 // Chrome names it "Xbox 360 Controller (XInput STANDARD GAMEPAD)": the part in brackets goes.
 get name(){return padName(this.pad);}
 // A device plugged in that is no standard pad (a wheel, pedals, some pads in some browsers): its
 // buttons and axes mean other things, so it drives nothing; the settings say so (null: none).
 get unsupported(){return this.pad||!this.other?null:padName(this.other);}
 // Driving input: the triggers or the stick are in use (the recon lap gives the wheel back to the player).
 get driving(){return !!(this.throttle||this.brake||this.steering);}
 setSteering(name){this.curve=STEERING_CURVES[name]??STEERING_CURVES.normal;}
 // main.js: whether a held button presses that key now (a key the game let go of meanwhile, its menu
 // or a pause, is still held while the button is).
 holds(code){for(const index of this.held)if(BUTTON_KEYS[index].includes(code))return true;return false;}
 // The standard pad the player last took up: one whose button or stick has just been pressed takes
 // over, one held all along (a trigger that rests above zero) never does; else the same one as before.
 pick(){
  const all=readPads(),pads=all.filter(p=>p.mapping==='standard');this.other=all.find(p=>p.mapping!=='standard')??null;if(!pads.length)return null;
  let pad=pads.find(p=>p.index===this.pad?.index&&p.id===this.pad?.id)??null;
  for(const p of pads){
   const key=p.index+' '+p.id,touched=p.buttons.some(b=>b.pressed||b.value>.1)||p.axes.some(a=>Math.abs(a)>.5);
   if(touched&&!this.touching.get(key))pad=p;this.touching.set(key,touched);
  }
  // (one unplugged is new again when it comes back, its triggers' rest too)
  for(const key of this.touching.keys())if(!pads.some(p=>p.index+' '+p.id===key)){this.touching.delete(key);this.rests.delete(key);}
  return pad??pads[0];
 }
 // Once per frame. Hidden pages read nothing: what is held lets go.
 poll(dt){
  const seen=c=>[c.pad?.id,c.pad?.index,c.unsupported].join('|'),before=seen(this);
  this.pad=document.hidden?null:this.pick();const pad=this.pad;if(seen(this)!==before)this.onChange?.(this);
  if(!pad){this.steering=this.throttle=this.brake=this.walk=0;this.releaseAll();this.menuHeld=false;return;}
  const button=i=>pad.buttons[i],axis=i=>pad.axes[i]??0;
  // (LT and RT, each from where it rests on this pad: a worn one gives no brake or throttle at rest)
  const key=pad.index+' '+pad.id,rest=this.rests.get(key)??[null,null];this.rests.set(key,rest);
  const trigger=(k,i)=>{const value=button(i)?.value??0;if(value<=TRIGGER_REST&&(rest[k]===null||value<rest[k]))rest[k]=value;return triggerValue(value,rest[k]??0);};
  this.brake=trigger(0,6);this.throttle=trigger(1,7);
  this.steering=stickValue(axis(0),this.curve);
  // Pushed up or down, the left stick walks forward or back (main.js uses it on foot only).
  this.walk=-stickValue(axis(1),1)||0;
  for(const [index,codes] of Object.entries(BUTTON_KEYS)){
   const down=!!button(index)?.pressed,was=this.held.has(index);
   if(down===was)continue;
   if(down)this.held.add(index);else this.held.delete(index);
   for(const code of codes)this.key(down?'keydown':'keyup',code);
  }
  const menu=!!button(MENU_BUTTON)?.pressed;if(menu&&!this.menuHeld)this.onMenu?.();this.menuHeld=menu;
  const lookX=stickValue(axis(2),1.4),lookY=stickValue(axis(3),1.4);
  if((lookX||lookY)&&dt>0)this.onLook?.(lookX*LOOK_SPEED*dt,lookY*LOOK_SPEED*.6*dt);
 }
 key(type,code){this.target.dispatchEvent(new KeyboardEvent(type,{code,key:keyName(code),bubbles:true,cancelable:true}));}
 press(code){this.key('keydown',code);this.key('keyup',code);}
 releaseAll(){for(const index of this.held)for(const code of BUTTON_KEYS[index])this.key('keyup',code);this.held.clear();}
 // A knock on the car (impact in m/s of lost speed): a short shake, stronger for harder hits.
 bump(impact){
  const actuator=this.pad?.vibrationActuator;if(!this.rumble||!actuator?.playEffect||impact<4)return;
  const strength=Math.min(1,(impact-3)/14);
  actuator.playEffect('dual-rumble',{duration:Math.round(120+260*strength),strongMagnitude:strength,weakMagnitude:Math.min(1,.3+strength)}).catch(()=>{});
 }
}
