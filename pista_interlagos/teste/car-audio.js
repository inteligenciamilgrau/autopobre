import {SoundEffects} from './sound-effects.js';
import {GameMusic} from './game-music.js';
import {RecordedMusic} from './recorded-music.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Synthesized engine/exhaust, gearbox and tyres. No downloads or external samples.
export class CarAudio {
 constructor(){
  this.volume=.55;this.musicVolume=.35;this.effectsVolume=1;this.focused=true;this.hasDriven=false;this.openingTime=0;this.muted=false;this.paused=true;this.context=null;this.shifts=0;this.error=null;
  try{const saved=JSON.parse(localStorage.getItem('opala99-audio'));if(saved){this.volume=clamp(Number(saved.volume)||0,0,1);this.muted=!!saved.muted;}}catch{}
  try{const saved=JSON.parse(localStorage.getItem('opala99-audio'));for(const key of ['musicVolume','effectsVolume'])if(Number.isFinite(saved?.[key]))this[key]=clamp(saved[key],0,1);}catch{}
  this.reset();
 }
 reset(){this.state={gear:'N',rpm:950,skid:0,throttle:0};this.shiftUntil=0;this.lastGear=null;this.effects?.stopWorld();}
 build(ctx){
  this.context=ctx;
  this.master=ctx.createGain();this.master.gain.value=0;
  this.compressor=ctx.createDynamicsCompressor();this.compressor.threshold.value=-12;this.compressor.knee.value=15;this.compressor.ratio.value=5;
  this.compressor.attack.value=.004;this.compressor.release.value=.12;
  this.master.connect(this.compressor);this.compressor.connect(ctx.destination);
  this.analyser=ctx.createAnalyser();this.analyser.fftSize=256;this.compressor.connect(this.analyser);this.meter=new Float32Array(256);
  this.engineFilter=ctx.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=1700;this.engineFilter.Q.value=.6;
  this.engineGain=ctx.createGain();this.engineGain.gain.value=0;this.engineFilter.connect(this.engineGain);this.engineGain.connect(this.master);
  const real=new Float32Array(25),imag=new Float32Array(25);
  for(let i=1;i<25;i++){real[i]=Math.cos(i*.27)/(i**.8);imag[i]=Math.sin(i*.27)/(i**.8);}
  this.engine=ctx.createOscillator();this.engine.setPeriodicWave(ctx.createPeriodicWave(real,imag));this.engine.frequency.value=47.5;this.engine.connect(this.engineFilter);this.engine.start();
  this.sub=ctx.createOscillator();this.sub.type='sine';this.sub.frequency.value=23.75;
  const subGain=ctx.createGain();subGain.gain.value=.16;this.sub.connect(subGain);subGain.connect(this.engineFilter);this.sub.start();
  // A seamless, deterministic noise bed adds exhaust rasp and sliding rubber texture.
  const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),samples=buffer.getChannelData(0);let seed=99;
  for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
  this.noiseBuffer=buffer;this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
  const exhaustFilter=ctx.createBiquadFilter();exhaustFilter.type='bandpass';exhaustFilter.frequency.value=650;exhaustFilter.Q.value=.7;
  this.rasp=ctx.createGain();this.rasp.gain.value=.05;this.noise.connect(exhaustFilter);exhaustFilter.connect(this.rasp);this.rasp.connect(this.engineFilter);
  this.tyreFilter=ctx.createBiquadFilter();this.tyreFilter.type='bandpass';this.tyreFilter.frequency.value=1900;this.tyreFilter.Q.value=.8;
  this.tyreGain=ctx.createGain();this.tyreGain.gain.value=0;this.noise.connect(this.tyreFilter);this.tyreFilter.connect(this.tyreGain);this.tyreGain.connect(this.master);
  this.squeal=ctx.createOscillator();this.squeal.type='triangle';this.squeal.frequency.value=1100;
  this.squealGain=ctx.createGain();this.squealGain.gain.value=0;this.squeal.connect(this.squealGain);this.squealGain.connect(this.master);this.squeal.start();this.noise.start();
  this.uiBus=ctx.createGain();this.musicBus=ctx.createGain();this.uiBus.gain.value=this.musicBus.gain.value=0;
  this.uiBus.connect(this.compressor);this.musicBus.connect(this.compressor);
  this.effects=new SoundEffects(ctx,this.master,this.uiBus,buffer);this.music=new GameMusic(ctx,this.musicBus,buffer);
 }
 async unlock(){
  try{
   if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio){this.error='Audio indisponivel';return;}this.build(new Audio({latencyHint:'interactive'}));}
   if(this.context.state==='suspended')await this.context.resume();
   if(!this.recordings)this.recordings=new RecordedMusic(this.context,this.musicBus);
   this.setPaused(this.paused);
  }catch(e){this.error=e.message;}
 }
 setVolume(value){this.volume=clamp(value,0,1);this.save();this.applyVolume();}
 setMusicVolume(value){this.musicVolume=clamp(value,0,1);this.save();this.applyVolume();}
 setEffectsVolume(value){this.effectsVolume=clamp(value,0,1);this.save();this.applyVolume();}
 toggleMute(){this.muted=!this.muted;this.save();this.applyVolume();}
 save(){try{localStorage.setItem('opala99-audio',JSON.stringify({volume:this.volume,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,muted:this.muted}));}catch{}}
 applyVolume(){if(!this.context)return;const t=this.context.currentTime,v=this.muted||!this.focused?0:this.volume;this.master.gain.setTargetAtTime(this.paused?0:v*this.effectsVolume,t,.025);this.uiBus.gain.setTargetAtTime(v*this.effectsVolume,t,.025);this.musicBus.gain.setTargetAtTime(v*this.musicVolume,t,.08);if(!v||!this.musicVolume)this.recordings?.suspend();if(!v){this.effects.stopWorld();this.effects.ui.stop();this.music.update(this.music.theme,false);}}
 setPaused(value){if(value&&!this.paused)this.effects?.stopWorld();this.paused=value;this.applyVolume();}
 setFocused(value){this.focused=value;this.applyVolume();}
 effect(name,options={}){if(!this.paused&&!this.muted&&this.focused&&this.volume>0&&this.effectsVolume>0&&this.context?.state==='running')this.effects.play(name,options);}
 async uiClick(){await this.unlock();if(!this.muted&&this.focused)this.effects?.play('click',{},true);}
 async previewEffects(){await this.unlock();const t=this.context?.currentTime??0;if(this.muted||!this.focused||!this.volume||!this.effectsVolume||t-(this.previewAt??-10)<.35)return;this.previewAt=t;this.effects?.play('engineCatch',{strength:.6},true);}
 updateScene(scene={},events=[],dt=0){
  if(!this.context)return;
  const enabled=this.focused&&!this.muted&&this.volume>0&&this.context.state==='running';
  if(!this.paused)this.hasDriven=true;
  if(enabled&&this.paused&&!this.hasDriven)this.openingTime+=dt;
  let theme=scene.phase==='free-finish'?(scene.won?'victory':'defeat'):this.paused?(!this.hasDriven&&(this.recordings?.has('opening')?!this.recordings.ended:this.openingTime<18)?'opening':'menu'):
   ['broken','tow','snag','disqualified'].includes(scene.phase)?'defeat':['podium','complete'].includes(scene.phase)?(scene.won?'victory':'defeat'):
   scene.driving||scene.phase==='grid'?'race':scene.phase==='crowd'?'sponsor':'menu';
  const recorded=this.recordings?.update(theme,enabled&&this.musicVolume>0);
  this.music.update(theme,enabled&&this.musicVolume>0&&!recorded);
  this.effects.update(scene,enabled&&!this.paused&&this.effectsVolume>0);
  for(const event of events)this.effect(event.name,event.options);
 }
 notifyPhone(){
  const ctx=this.context;if(this.paused||!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime;
  for(const [offset,hz] of [[0,1175],[.11,1568]]){
   const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type='sine';tone.frequency.value=hz;
   gain.gain.setValueAtTime(0,t+offset);gain.gain.linearRampToValueAtTime(.075,t+offset+.008);gain.gain.exponentialRampToValueAtTime(.001,t+offset+.13);
   tone.connect(gain);gain.connect(this.master);tone.start(t+offset);tone.stop(t+offset+.15);tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
 }
 shift(up){
  this.shifts++;
  const ctx=this.context;if(!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime;this.shiftUntil=t+.14;
  const source=ctx.createBufferSource();source.buffer=this.noiseBuffer;
  const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=up?650:950;
  const gain=ctx.createGain();gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.32,t+.008);gain.gain.exponentialRampToValueAtTime(.001,t+.11);
  source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+.12);
  source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
 }
 update(car,command,skid,paused,mode){
  if(this.paused!==paused)this.setPaused(paused);
  if(paused)return this.state;
  const speed=Math.hypot(car.vx,car.vy)*3.6;
  const wheelspin=car.rearSlipSpeed??0,physicsGear=Number.isInteger(car.gear)&&Number.isFinite(car.rpm);
  let gear=Number.isInteger(this.state.gear)?this.state.gear:1;
  if(physicsGear)gear=Math.max(1,car.gear);
  else{
   // Hysteresis prevents repeated shifts when speed oscillates around a threshold.
   while(gear<5&&speed>gear*42+1.5)gear++;
   while(gear>1&&speed<(gear-1)*42-2.5)gear--;
  }
  if(command.reverse||car.gear<0)gear='R';else if(wheelspin>1&&!physicsGear)gear=1;else if(speed<2&&!(physicsGear&&command.throttle>.05))gear='N';
  if(Number.isInteger(gear)&&Number.isInteger(this.lastGear)&&gear!==this.lastGear)this.shift(gear>this.lastGear);
  if(command.engineOff)gear='N';
  this.lastGear=gear;
  const throttle=clamp(Math.max(command.throttle||0,command.reverse||0),0,1);
  const ratio=gear==='R'?150:[0,138,73,49,37,30][gear];
  const rpm=command.engineOff?0:clamp(gear==='N'?950+throttle*3200:physicsGear&&gear!=='R'?car.rpm+throttle*120:950+(speed+wheelspin*3.6)*ratio+throttle*250,950,7400);
  this.state={gear,rpm,skid:car.surface.onRoad&&(speed>5||wheelspin>1)?clamp(Math.max(skid,wheelspin/20),0,1):0,throttle};
  const ctx=this.context;if(!ctx)return this.state;
  const t=ctx.currentTime,param=(p,v,tau=.06)=>p.setTargetAtTime(v,t,tau);
  // Three firing pulses per revolution: four-stroke inline-six character.
  param(this.engine.frequency,rpm/20);param(this.sub.frequency,rpm/40);
  const inside=mode==='cockpit';param(this.engineFilter.frequency,inside?1100+throttle*850:1600+throttle*1900);
  const distance=mode==='aerial'?.38:1,cut=t<this.shiftUntil?.3:1;
  param(this.engineGain.gain,(command.engineOff?0:1)*(.22+throttle*.23+rpm/7400*.07)*cut*distance,.035);
  param(this.rasp.gain,.04+throttle*.19);
  param(this.tyreGain.gain,this.state.skid*.65*distance,.035);
  param(this.tyreFilter.frequency,1500+speed*5+Math.sin(t*13)*130);
  param(this.squeal.frequency,900+speed*4+Math.sin(t*19)*65);
  param(this.squealGain.gain,this.state.skid*.075*distance,.035);
  return this.state;
 }
 info(){
  let rms=0;if(this.analyser){this.analyser.getFloatTimeDomainData(this.meter);rms=Math.sqrt(this.meter.reduce((s,x)=>s+x*x,0)/this.meter.length);}
  return {...this.state,volume:this.volume,musicVolume:this.musicVolume,effectsVolume:this.effectsVolume,muted:this.muted,focused:this.focused,paused:this.paused,context:this.context?.state??'locked',shifts:this.shifts,rms,worldGain:this.master?.gain.value??0,music:this.music?.info(),recordings:this.recordings?.info(),effects:this.effects?.info(),error:this.error};
 }
}
