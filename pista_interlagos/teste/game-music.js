import {Synth} from './sound-effects.js';
const hz=midi=>440*2**((midi-69)/12);
// Five original looping compositions. Notes are not taken from a film or recording.
export const MUSIC_THEMES=Object.freeze({
 opening:{title:'Chegamos ao Grande Prêmio',bpm:124,roots:[50,55,59,57],thirds:[4,4,3,4],lead:[74,null,78,81,83,81,78,null,76,78,81,null,78,76,74,null],rock:.65},
 menu:{title:'Vaquinha no Paddock',bpm:92,roots:[47,55,50,57],thirds:[3,4,4,4],lead:[71,null,74,null,78,null,74,null,69,null,73,null,76,null,73,null],rock:.15},
 race:{title:'Pé Embaixo e Fé',bpm:144,roots:[50,58,53,57],thirds:[3,4,4,4],lead:[74,null,77,81,79,77,74,72,74,77,null,79,81,84,81,null],rock:1},
 victory:{title:'Hoje a Blazer Volta',bpm:132,roots:[50,55,57,50],thirds:[4,4,4,4],lead:[74,78,81,null,86,null,85,81,83,null,81,78,76,78,74,null],rock:.6},
 defeat:{title:'Sexto, Mas Amanhã Tem Mais',bpm:70,roots:[47,55,52,54],thirds:[3,4,3,3],lead:[74,null,null,73,71,null,69,null,66,null,69,null,71,null,null,null],rock:0}
});

export class GameMusic {
 constructor(ctx,output,noise){this.ctx=ctx;this.synth=new Synth(ctx,output,noise,128);this.theme=null;this.step=0;this.next=0;this.playing=false;this.transitions=0;this.scheduled=0;}
 update(theme,enabled=true){
  if(!MUSIC_THEMES[theme])theme='menu';
  const now=this.ctx.currentTime;
  if(theme!==this.theme){this.synth.stop(null,.35);this.theme=theme;this.step=0;this.next=now+.05;this.transitions++;}
  if(!enabled){if(this.playing)this.synth.stop(null,.08);this.playing=false;this.next=now+.04;return;}
  if(!this.playing){this.playing=true;this.next=now+.04;}
  if(this.next<now-.15)this.next=now+.03;
  let guard=0;while(this.next<now+.16&&guard++<8){this.arrange(this.step++,this.next);this.next+=30/MUSIC_THEMES[this.theme].bpm;this.scheduled++;}
 }
 arrange(step,at){
  const song=MUSIC_THEMES[this.theme],beat=60/song.bpm,bar=Math.floor(step/8),pulse=step%8,section=Math.floor(bar/4)%4,chord=Math.floor(bar/2)%4,root=song.roots[chord],third=song.thirds[chord],rack=this.synth;
  const play=(midi,duration,gain,type='triangle',delay=0,pan=0,filter=4000,grit=0)=>rack.note({at:at+delay,hz:hz(midi),duration,gain,type,pan,filter,grit,attack:type==='sine'?.012:.018,tag:'music'});
  const noise=(duration,gain,filter,delay=0,pan=0)=>rack.note({at:at+delay,type:'noise',duration,gain,filter,pan,tag:'music'});
  const kick=()=>{rack.note({at,hz:120,end:40,duration:.2,gain:.28,type:'sine',tag:'music'});noise(.025,.055,2200);};
  const snare=()=>{noise(.15,.19,2100);play(43,.1,.08,'triangle');};
  // Sustained stereo strings and brass establish each two-bar harmony.
  if(pulse===0){
   for(const [i,n] of [root+12,root+12+third,root+19].entries())play(n,beat*4,.022,this.theme==='defeat'?'triangle':'sawtooth',0,(i-1)*.5,this.theme==='defeat'?1100:1600);
   if(this.theme!=='defeat')play(root-12,beat*1.4,.1,'sine');
  }
  // Piano/arpeggio passages for menus and the reflective defeat theme.
  if(this.theme==='menu'||this.theme==='defeat'){
   const interval=[0,7,12,third+12,7,12,third+12,19][pulse];
   play(root+interval,beat*1.8,.07,'sine',0,pulse%2?.2:-.2);
   play(root+interval+12,beat*.8,.018,'triangle',.012,pulse%2?-.35:.35,1900);
   if(this.theme==='menu'&&pulse%2===0)noise(.045,.025,7000);
  }else{
   const accent=pulse===0||pulse===4?1:.65;
   // Palm-muted power chords: filtered distortion, paired guitars and electric bass.
   if(pulse%2===0||this.theme==='race'){
    for(const p of [-.5,.5]){play(root,beat*.45,.052*song.rock*accent,'sawtooth',p>0?.009:0,p,1900,4);play(root+7,beat*.4,.027*song.rock,'sawtooth',.006,p,2200,3);}
    play(root-12+(pulse===7?7:0),beat*.55,.085,'triangle',0,0,800);
   }
   if(pulse===0||pulse===4||this.theme==='race'&&pulse===7)kick();
   if(pulse===2||pulse===6)snare();
   noise(pulse===7?.12:.04,pulse%2?.045:.065,7800,0,.3);
   if(pulse===0&&bar%4===0)noise(.9,.07,6100,0,-.45);
   if(bar%4===3&&pulse>=6){play(45-pulse,.12,.075,'sine');noise(.09,.075,1800,.1);}
  }
  // Original, varied two-bar motifs; the final phrase rests before repeating.
  const melody=song.lead[step%16];
  if(melody!==null&&!(section===3&&pulse>4)){
   const offset=section===2?12:0,soft=this.theme==='menu'||this.theme==='defeat';
   play(melody+offset,beat*(soft?1.6:.72),soft?.065:.072,soft?'sine':'sawtooth',0,-.07,soft?2200:2600,soft?0:1.5);
   if(!soft){play(melody+offset-12,beat*.8,.035,'triangle',.015,.1,1700);play(melody+offset,beat*.7,.018,'triangle',beat*.6,.45,1800);}
  }
 }
 info(){return {theme:this.theme,title:MUSIC_THEMES[this.theme]?.title,playing:this.playing,transitions:this.transitions,scheduledSteps:this.scheduled,activeVoices:this.synth.voices.size,peakVoices:this.synth.peak};}
}
