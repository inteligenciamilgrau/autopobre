const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Synthesized engine/exhaust, gearbox and tyres. No downloads or external samples.
export class CarAudio {
 constructor(){
  this.volume=.55;this.muted=false;this.paused=true;this.context=null;this.shifts=0;this.error=null;
  try{const saved=JSON.parse(localStorage.getItem('opala99-audio'));if(saved){this.volume=clamp(Number(saved.volume)||0,0,1);this.muted=!!saved.muted;}}catch{}
  this.reset();
 }
 reset(){this.state={gear:'N',rpm:950,skid:0,throttle:0};this.shiftUntil=0;this.lastGear=null;}
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
 }
 async unlock(){
  try{
   if(!this.context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio){this.error='Audio indisponivel';return;}this.build(new Audio({latencyHint:'interactive'}));}
   if(this.context.state==='suspended')await this.context.resume();
   this.setPaused(this.paused);
  }catch(e){this.error=e.message;}
 }
 setVolume(value){this.volume=clamp(value,0,1);this.save();this.applyVolume();}
 toggleMute(){this.muted=!this.muted;this.save();this.applyVolume();}
 save(){try{localStorage.setItem('opala99-audio',JSON.stringify({volume:this.volume,muted:this.muted}));}catch{}}
 applyVolume(){if(this.context)this.master.gain.setTargetAtTime(this.paused||this.muted?0:this.volume,this.context.currentTime,.025);}
 setPaused(value){this.paused=value;this.applyVolume();}
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
  let gear=Number.isInteger(this.state.gear)?this.state.gear:1;
  // Hysteresis prevents repeated shifts when speed oscillates around a threshold.
  while(gear<5&&speed>gear*42+1.5)gear++;
  while(gear>1&&speed<(gear-1)*42-2.5)gear--;
  const wheelspin=car.rearSlipSpeed??0;
  if(command.reverse)gear='R';else if(wheelspin>1)gear=1;else if(speed<2)gear='N';
  if(Number.isInteger(gear)&&Number.isInteger(this.lastGear)&&gear!==this.lastGear)this.shift(gear>this.lastGear);
  if(command.engineOff)gear='N';
  this.lastGear=gear;
  const throttle=clamp(Math.max(command.throttle||0,command.reverse||0),0,1);
  const ratio=gear==='R'?150:[0,138,73,49,37,30][gear];
  const rpm=command.engineOff?0:clamp(gear==='N'?950+throttle*3200:950+(speed+wheelspin*3.6)*ratio+throttle*250,950,7400);
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
  return {...this.state,volume:this.volume,muted:this.muted,paused:this.paused,context:this.context?.state??'locked',shifts:this.shifts,rms,error:this.error};
 }
}
