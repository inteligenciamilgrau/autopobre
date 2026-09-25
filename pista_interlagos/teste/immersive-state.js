import {GRID_SIZE} from './race-roster.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FANS=[
 {name:'Dona Cida',taste:'família',hint:'Vim com os netos. Adoro uma história de família.',gift:42},
 {name:'Seu Toninho',taste:'oficina',hint:'Sou mecânico. Pode falar de carro quebrado!',gift:38},
 {name:'Bia da arquibancada',taste:'corrida',hint:'Quero uma piada de piloto!',gift:46},
 {name:'Pai do churrasco',taste:'família',hint:'Se tem boleto e criança no meio, eu entendo.',gift:40},
 {name:'Nando da graxa',taste:'oficina',hint:'Meu habitat é debaixo de um capô.',gift:44},
 {name:'Léo do radinho',taste:'corrida',hint:'Não perco uma chegada de corrida.',gift:36}
];
export const JOKES=[
 {topic:'família',text:'Lá em casa eu sou o piloto. Minha esposa escolhe o destino, a filha escolhe a música e o boleto pisa no acelerador.'},
 {topic:'oficina',text:'Minha Blazer está há tanto tempo na oficina que o mecânico já colocou ela como dependente.'},
 {topic:'corrida',text:'Meu carro faz de zero a cem em três segundos. Zero de dinheiro a cem de preocupação.'}
];
export const BLAZER_COST=900;
// What a start costs: the entry, the litre of fuel, the windscreen film, and the least that
// opens the fuel purchase on the grid (the entry and four litres).
export const COSTS=Object.freeze({entry:100,litre:6.5,film:30,minimum:126});
export const startCost=(litres,film)=>COSTS.entry+litres*COSTS.litre+(film?COSTS.film:0);
// Engine start: the throttle band where it catches (low to high), how long it must crank
// there (longer with wet plugs), the throttle above which it floods, and the battery's
// cranking time, which does not come back between tries. wet: how the plugs get soaked
// (level 1 floods the engine): each push of the pedal without cranking squirts fuel (per
// full push), cranking over the flood mark or in the high band soaks them (per second),
// cranking in or under the band clears them and they dry slowly otherwise.
export const START=Object.freeze({low:.22,high:.65,flood:.8,catchTime:.72,battery:4,wet:Object.freeze({pump:.3,rich:1.5,high:.25,clear:.2,dry:.02})});
export class ImmersiveState {
 constructor(profile={}){profile=profile&&typeof profile==='object'?profile:{};const counter=v=>Number.isFinite(v)&&v>=0?Math.min(v,Number.MAX_SAFE_INTEGER):0;this.profile={fund:counter(profile.fund),released:profile.released===true,races:Math.floor(counter(profile.races))};this.active=false;this.phase='off';this.revision=0;this.sounds=[];}
 emitSound(name,options={}){if(this.sounds.length<64)this.sounds.push({name,options});}
 takeSounds(){return this.sounds.splice(0);}
 touch(){this.revision++;}
 start(){
  this.sounds=[];this.emitSound('crowdWelcome');
  Object.assign(this,{active:true,phase:'crowd',cash:0,donors:[],fan:null,desk:false,feedback:'',fuel:0,tankDetached:false,tankWear:0,health:1,glass:0,film:false,
   pressure:0,crank:0,flood:0,battery:1,ignitionGood:0,starter:false,ignOn:false,raceTime:0,position:GRID_SIZE,result:null,reason:'',towSnags:0,inspection:0,judging:false,inspected:false,paid:false,prize:0,savedCash:0,podiumPlace:null,disqualifiedTime:0,alert:'',alertTime:0});this.touch();
 }
 disable(){this.sounds=[];this.active=false;this.phase='off';this.touch();}
 talk(index){if(this.phase!=='crowd'||this.desk||!FANS[index])return;this.emitSound('talk');this.fan=index;this.feedback='';this.touch();}
 // The registration is made with the team at the computers of its stand on the pit wall:
 // they show the kitty against the costs, and the pilot goes back for more or to the track.
 openDesk(){if(this.phase!=='crowd'||this.desk)return false;this.emitSound('talk');this.desk=true;this.fan=null;this.feedback='';this.touch();return true;}
 closeDesk(){if(!this.desk)return false;this.desk=false;this.touch();return true;}
 joke(index){
  if(this.phase!=='crowd'||this.fan===null||!JOKES[index])return false;
  const fan=FANS[this.fan],laughed=fan.taste===JOKES[index].topic;
  this.emitSound(this.donors.includes(this.fan)?'noDonation':laughed?'donation':'badJoke');
  if(this.donors.includes(this.fan))this.feedback=`${fan.name}: “Essa eu já patrocinei! Vai falar com o pessoal ali.”`;
  else if(laughed){this.cash+=fan.gift;this.donors.push(this.fan);this.feedback=`${fan.name} caiu na risada! + R$ ${fan.gift} para a vaquinha.`;}
  else this.feedback=`${fan.name}: “Essa não me pegou... tenta outra!”`;
  this.touch();return laughed;
 }
 // At the team's desk the entry, the fuel and the optional windscreen film are paid, and
 // the pilot goes straight to the engine start on the grid (from the kitty's minimum up).
 buy(litres,film){
  if(this.phase!=='crowd'||!this.desk)return false;
  litres=clamp(Math.round(Number(litres)||0),2,12);const cost=startCost(litres,film);
  if(this.cash<COSTS.minimum||cost>this.cash){this.emitSound('denied');this.feedback=this.cash<COSTS.minimum?'Ainda não fecha a inscrição: volta lá e pede mais um dindin!':'Não cabe tudo isso na vaquinha: tira uns litros ou a proteção.';this.touch();return false;}
  this.emitSound('paper');this.cash-=cost;this.fuel=litres;this.film=!!film;this.desk=false;this.feedback='';this.phase='starting';this.emitSound('fuelFill');this.touch();return true;
 }
 // The IGN switch on the overhead bank: without it the starter turns the engine, which never fires.
 switchIgnition(){if(this.phase!=='starting')return false;this.ignOn=!this.ignOn;this.emitSound('click');this.touch();return true;}
 // input.ignition or starter: the PART button held (crank: this try's cranking time).
 // Too much throttle, or pumping the pedal between tries, floods it even without IGN.
 catchTime(){return START.catchTime*(1+2*this.flood);}
 startEngine(input,dt){
  if(this.phase!=='starting')return;
  const before=this.pressure,wet=START.wet;this.pressure=clamp(this.pressure+(input.throttle?.60:-.42)*dt,0,1);
  const cranking=!!(input.ignition||this.starter),p=this.pressure;
  this.flood=Math.max(0,this.flood+(cranking?(p>START.flood?wet.rich:p>START.high?wet.high:-wet.clear)*dt:Math.max(0,p-before)*wet.pump-wet.dry*dt));
  if(this.flood>=1){this.fail('Motor afogado na partida','flooded');return;}
  if(cranking){
   if(!this.crank)this.emitSound('ignition');this.crank+=dt;this.battery=Math.max(0,this.battery-dt/START.battery);
   if(this.ignOn&&p>=START.low&&p<=START.high){this.ignitionGood=(this.ignitionGood||0)+dt;if(this.ignitionGood>this.catchTime()){this.phase='grid';this.countdown=3;this.emitSound('engineCatch');this.emitSound('countdown');this.touch();return;}}
   else this.ignitionGood=0;
   if(this.battery<=0){this.fail('A bateria arriou tentando dar partida','batteryDead');return;}
  }else{this.crank=0;this.ignitionGood=0;}
 }
 startRace(){if(this.phase!=='grid')return;this.emitSound('raceGo');this.phase='race';this.raceTime=0;this.touch();}
 warn(text){this.alert=text;this.alertTime=4;}
 hitDebris(){if(this.phase!=='race')return;this.glass=clamp(this.glass+(this.film?.23:.42),0,1);this.emitSound(this.glass>=1?'glassBreak':'glassHit');this.warn('Impacto no para-brisa! Saia de trás do carro da frente.');if(this.glass>=1)this.fail('Para-brisa estilhaçado');}
 hitCar(strength=1){if(this.phase!=='race')return;strength=clamp(strength,.1,1.5);this.emitSound('collision',{strength});this.health=this.condition?this.condition.health:Math.max(0,this.health-.23*strength);this.warn('Batida! O motor e os suportes sentiram o impacto.');if(this.health<=0)this.fail('O carro quebrou depois da batida');}
 raceStep(sensor,dt){
  if(this.phase!=='race')return;
  this.raceTime+=dt;this.alertTime=Math.max(0,this.alertTime-dt);
  // fuelScale (ImmersiveMode.start): driving burns the tank over the whole race as it did over one lap.
  const previousFuel=this.fuel;this.fuel=Math.max(0,this.fuel-dt*((.002+sensor.speed*.00045+sensor.throttle*.005+(sensor.wheelspin||0)*.0023)*(this.fuelScale??1)+(this.tankDetached?.35:0)+(this.condition?.factors.leak??0)));
  if(previousFuel>=1&&this.fuel<1&&this.fuel>0)this.emitSound('reserve');
  const depth=Math.max(0,sensor.offTrack||0);
  if(depth>2.5&&sensor.speed>7)this.tankWear+=dt*(depth-2.5)*.24;
  if(!this.tankDetached&&this.tankWear>=1){this.tankDetached=true;this.condition?.damage('tanque',.75);this.emitSound('tankDrop');this.warn('O suporte cedeu! Tanque arrastando e vazando combustível.');this.touch();}
  this.health=this.condition?this.condition.health:Math.max(0,this.health-dt*(depth>2?depth*sensor.speed*.0008:0)-(this.tankDetached?dt*.018:0));
  if(sensor.collision)this.hitCar();
  if(this.phase!=='race')return;
  if(this.fuel<=0)this.fail(this.tankDetached?'Combustível acabou após o vazamento':'Acabou a gasolina no meio da volta','fuelEmpty');
  else if(this.health<=0)this.fail('O carro quebrou fora da pista');
  else if(sensor.finished)this.finish(sensor.position||GRID_SIZE);
 }
 fail(reason,sound='breakdown'){if(!['race','starting','grid'].includes(this.phase))return;this.emitSound(sound);this.reason=reason;this.result={position:null,status:'Não terminou'};this.phase='broken';this.rescueWait=3;this.touch();}
 beginTow(){this.emitSound('towArrive');this.phase='tow';this.towTime=0;this.towDistance=0;this.towGap=5;this.towSpeed=0;this.truckSpeed=0;this.snagTime=0;this.touch();}
 towStep(input,dt){
  if(this.phase!=='tow')return;
  this.towTime+=dt;
  // The truck slows periodically. The towed car keeps rolling unless braked.
  const cycle=this.towTime%12;this.truckSpeed=cycle>5&&cycle<8?.8:4.8;
  this.towSpeed=Math.max(0,this.towSpeed-dt*(.16+(input.brake?7:0)));
  this.towGap+=(this.truckSpeed-this.towSpeed)*dt;
  if(this.towGap>=5){this.towGap=5;this.towSpeed=this.truckSpeed;}
  this.towGap=Math.max(.5,this.towGap);this.towDistance+=this.truckSpeed*dt;
  this.snagTime=this.towGap<2.2?this.snagTime+dt:0;
  if(this.snagTime>.45){this.emitSound('strapSnag');this.phase='snag';this.towSnags++;this.touch();return;}
  if(this.towDistance>=105)this.podium();
 }
 untangle(){if(this.phase==='snag'){this.emitSound('strapFree');this.phase='tow';this.towGap=5;this.towSpeed=0;this.towTime=Math.ceil(this.towTime/12)*12;this.snagTime=0;this.touch();}}
 finish(position,announce=true){if(this.phase!=='race')return;if(announce)this.emitSound('finish');this.result={position:clamp(position,1,GRID_SIZE),status:'Terminou'};this.podium();}
 leavePodium(){if(this.phase!=='podium')return;this.phase='inspection';this.judging=false;this.touch();}
 requestInspection(){if(this.phase==='inspection'&&!this.judging){this.emitSound('judgeStart');this.judging=true;this.inspection=0;this.touch();}}
 inspectionStep(dt){if(this.phase!=='inspection'||!this.judging)return;const tick=Math.floor(this.inspection/1.4);this.inspection+=dt;if(Math.floor(this.inspection/1.4)>tick)this.emitSound('judgeCheck');if(this.inspection>=8){this.emitSound('judgeApprove');this.inspected=true;this.phase='complete';this.touch();}}
 goToBox(){if(this.phase!=='inspection'||this.inspected)return;this.emitSound('disqualified');this.result={...this.result,status:'Desclassificado'};this.reason='Levou o carro ao box antes da vistoria do juiz';this.profile.fund=Math.max(0,this.profile.fund-this.prize);this.prize=0;this.phase='disqualified';this.disqualifiedTime=6;this.touch();}
 podium(){
  if(this.paid)return;
  const reward=this.result?.status==='Desclassificado'?0:this.result?.position?([600,450,300,220,170,120][this.result.position-1]??Math.max(40,120-(this.result.position-6)*10)):40;
  this.prize=Math.max(0,reward-this.towSnags*25);this.savedCash=Math.max(0,Number.isFinite(this.cash)?this.cash:0);this.profile.fund+=this.prize+this.savedCash;this.cash=0;this.profile.races++;this.emitSound(this.result?.position===1&&this.result?.status!=='Desclassificado'?'podiumWin':'podiumLoss');this.paid=true;this.phase='podium';this.podiumPlace=6;this.touch();
 }
 releaseBlazer(){if(this.phase==='complete'&&!this.profile.released&&this.profile.fund>=BLAZER_COST){this.emitSound('blazer');this.profile.fund-=BLAZER_COST;this.profile.released=true;this.touch();return true;}return false;}
 info(){return {active:this.active,phase:this.phase,cash:this.cash,desk:!!this.desk,fuel:this.fuel,health:this.health,glass:this.glass,tankDetached:this.tankDetached,pressure:this.pressure,ignOn:!!this.ignOn,flood:this.flood,battery:this.battery,
  position:this.position,result:this.result,reason:this.reason,towGap:this.towGap,towSnags:this.towSnags,inspected:this.inspected,podiumPlace:this.podiumPlace,prize:this.prize,savedCash:this.savedCash,profile:{...this.profile}};}
}

// Flat tow strap with a fixed five-metre length; slack bows sideways on the ground.
export function strapPath(start,end,length=5,steps=24){
 const distance=Math.hypot(end[0]-start[0],end[2]-start[2]),nx=-(end[2]-start[2])/Math.max(.01,distance),nz=(end[0]-start[0])/Math.max(.01,distance);
 const points=amount=>Array.from({length:steps+1},(_,i)=>{const t=i/steps,loop=Math.sin(Math.PI*t)*amount,fold=Math.sin(2*Math.PI*t)*amount*.55;return [start[0]+(end[0]-start[0])*t+nx*loop-nz*fold,start[1]+(end[1]-start[1])*t,start[2]+(end[2]-start[2])*t+nz*loop+nx*fold];});
 const measure=p=>p.slice(1).reduce((sum,v,i)=>sum+Math.hypot(...v.map((x,j)=>x-p[i][j])),0);
 let lo=0,hi=length;for(let i=0;i<18;i++){const mid=(lo+hi)/2;if(measure(points(mid))>length)hi=mid;else lo=mid;}
 return points((lo+hi)/2);
}
