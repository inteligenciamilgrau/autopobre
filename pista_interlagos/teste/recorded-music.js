const FILES=Object.freeze({opening:'intro.mp3',sponsor:'patrocinio.mp3',race:'race.mp3',victory:'turbo.mp3',defeat:'hojenaodeu.mp3',menu:'energia.mp3'});
// Two streaming players crossfade without decoding several full songs into memory.
export class RecordedMusic {
 constructor(ctx,output){
  this.ctx=ctx;this.files=[];this.failed=new Set();this.current=null;this.index=0;this.theme=null;this.ended=false;this.error=null;
  this.players=Array.from({length:2},()=>{const audio=new Audio();audio.preload='none';const gain=ctx.createGain();gain.gain.value=0;const source=ctx.createMediaElementSource(audio);source.connect(gain);gain.connect(output);return {audio,gain,playing:false};});
  this.ready=fetch('./assets/audio/tracks.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('manifest');return r.json();}).then(value=>{this.files=Array.isArray(value)?[...new Set(value.filter(x=>Object.values(FILES).includes(x)))]:[];}).catch(()=>{this.files=[];});
 }
 fileFor(theme){return [FILES[theme],'energia.mp3'].find(file=>this.files.includes(file)&&!this.failed.has(file));}
 has(theme){return !!this.fileFor(theme);}
 update(theme,enabled){
  for(const p of this.players)if(p.pauseAt&&this.ctx.currentTime>=p.pauseAt){p.audio.pause();p.pauseAt=0;}
  if(!this.has(theme)){this.stop();this.theme=theme;return false;}
  const file=this.fileFor(theme),now=this.ctx.currentTime;
  if(this.current!==file||this.theme!==theme){
   this.stop();this.index=1-this.index;const p=this.players[this.index];p.pauseAt=0;p.audio.pause();p.audio.src='./assets/audio/'+file;p.audio.loop=['race','sponsor','menu'].includes(theme);p.audio.load();p.playing=false;
   this.current=file;this.ended=false;p.audio.onended=()=>{if(this.current===file&&this.players[this.index]===p&&this.theme===theme)this.ended=true;};
  }
  this.theme=theme;const p=this.players[this.index];
  if(!enabled){p.audio.pause();p.playing=false;p.gain.gain.setTargetAtTime(0,now,.04);return true;}
  if(!p.playing&&!this.ended){p.playing=true;p.gain.gain.setTargetAtTime(1,now,.25);p.audio.play().catch(error=>{if(error.name==='AbortError'||this.current!==file)return;p.playing=false;this.failed.add(file);this.error='Não foi possível tocar '+file+'; usando a trilha original.';});}
  return true;
 }
 stop(){for(const p of this.players)if(p.playing){p.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.1);p.pauseAt=this.ctx.currentTime+.35;p.playing=false;}this.current=null;}
 suspend(){for(const p of this.players){p.audio.pause();p.playing=false;p.pauseAt=0;p.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}}
 info(){return {file:this.current,theme:this.theme,available:[...this.files],playing:!!this.current&&this.players[this.index].playing&&!this.ended,ended:this.ended,error:this.error};}
}
