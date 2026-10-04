// Race sensations only: no scoring, physics changes or slow motion. Distances are in metres.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class RaceAction {
 constructor(){this.reset();}
 reset(){this.near=new Map();this.cooldown=0;this.impact=0;this.surge=0;this.braking=0;this.lastSpeed=null;this.lastPosition=null;this.event=null;this.serial=0;this.time=0;}
 update(dt,{car,rivals=[],impact=0,active=true}={}){
  this.event=null;if(!active||!car){this.near.clear();this.lastSpeed=null;this.lastPosition=null;this.impact=this.surge=this.braking=0;return;}
  if(!(dt>0))return;
  dt=Math.min(dt,.1);this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
  this.impact*=Math.exp(-dt*8);this.surge*=Math.exp(-dt*2.8);
  const speed=Math.hypot(car.vx,car.vy),jump=this.lastPosition&&Math.hypot(car.x-this.lastPosition.x,car.y-this.lastPosition.y)>Math.max(12,speed*dt*3);
  if(jump){this.near.clear();this.lastSpeed=null;this.impact=this.surge=0;}
  const deceleration=this.lastSpeed===null?0:clamp((this.lastSpeed-speed)/dt,0,12)/12;
  this.braking+=(deceleration-this.braking)*(1-Math.exp(-dt*9));this.lastSpeed=speed;this.lastPosition={x:car.x,y:car.y};
  if(impact>4){this.impact=Math.max(this.impact,clamp((impact-3)/18,0,1));this.near.clear();if(impact>7)this.emit('impact','IMPACTO','Segura o carro',.9);this.cooldown=Math.max(this.cooldown,1);return;}
  // The physics also reports gentle body contacts below the camera-shake threshold.
  // They still invalidate a clean pass, including angled cars whose centres are >1.9 m apart.
  if(impact>0){this.near.clear();return;}
  if(speed<18||!car.surface?.onRoad||jump){this.near.clear();return;}
  const c=Math.cos(car.heading),s=Math.sin(car.heading),alive=new Set();
  for(const rival of rivals){
   const other=rival.car??rival,dx=other.x-car.x,dy=other.y-car.y;
   if(!Number.isFinite(dx+dy)||Math.abs(dx)+Math.abs(dy)>35)continue;
   const ahead=dx*c+dy*s,side=-dx*s+dy*c,lateral=Math.abs(side),relative=Math.hypot(car.vx-other.vx,car.vy-other.vy);
   const closing=(car.vx-other.vx)*c+(car.vy-other.vy)*s;
   const dz=Math.abs((car.z??car.surface.z??0)-(other.z??other.surface?.z??0));
   if(dz>2||other.surface?.onRoad===false||Math.cos((other.heading??car.heading)-car.heading)<.7)continue;
   alive.add(other);let state=this.near.get(other);
   if(!state){state={last:ahead,armed:false,close:false,along:0,duel:false};this.near.set(other,state);}
   // Leaving the passing corridor invalidates a previous close approach. A steering
   // correction or a car sliding laterally is not an overtake by itself.
   if(lateral>=4){state.armed=false;state.close=false;state.along=0;}
   if(ahead>5&&ahead<22&&lateral>1.9&&lateral<4)state.armed=true;
   // Body width is ~1.8 m. Overlap cancels the candidate; an actual contact is never a clean pass.
   if(lateral<1.9&&Math.abs(ahead)<5){state.armed=false;state.close=false;state.along=0;}
   if(lateral>=1.9&&lateral<3.5&&Math.abs(ahead)<5){state.close=true;state.along+=dt;}
   else state.along=0;
   if(state.armed&&state.close&&state.last>=-5&&ahead<-5&&closing>3&&relative<65&&lateral<4){
    if(this.emit('near','POR UM TRIZ','Passagem limpa',1.6))this.surge=1;
    state.armed=false;state.close=false;
   }else if(!state.duel&&state.along>1.5&&speed>24){
    if(this.emit('duel','RODA A RODA','Disputa por espaço',1.4))this.surge=.4;
    state.duel=true;
   }
   state.last=ahead;
  }
  for(const other of this.near.keys())if(!alive.has(other))this.near.delete(other);
 }
 emit(kind,title,detail,duration){if(this.cooldown>0)return false;this.event={kind,title,detail,duration,id:++this.serial};this.cooldown=kind==='impact'?1.1:3.5;return true;}
 info(){return {impact:this.impact,surge:this.surge,braking:this.braking,event:this.event,time:this.time};}
}

export class ActionNotice {
 constructor(){
  this.root=document.createElement('div');this.root.id='raceAction';this.root.hidden=true;this.root.setAttribute('role','status');this.root.setAttribute('aria-live','polite');
  this.title=document.createElement('strong');this.detail=document.createElement('span');this.root.append(this.title,this.detail);document.body.append(this.root);this.left=0;
 }
 update(dt,event,enabled){
  if(!enabled){this.left=0;this.root.hidden=true;return;}
  if(event){this.left=event.duration;this.root.dataset.kind=event.kind;this.title.textContent=event.title;this.detail.textContent=event.detail;}
  else this.left=Math.max(0,this.left-dt);
  this.root.hidden=this.left<=0;
 }
}
