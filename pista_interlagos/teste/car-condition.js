const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
export const CAR_PARTS=Object.freeze([
 {id:'motor',name:'Motor',effect:'Potência e aceleração',price:180,point:[1.35,.95,0]},
 {id:'cambio',name:'Câmbio',effect:'Transmissão da força',price:140,point:[-.15,.6,0]},
 {id:'freios',name:'Freios',effect:'Distância de frenagem',price:75,point:[1.53,.4,.82]},
 {id:'suspensao',name:'Suspensão',effect:'Direção e estabilidade',price:110,point:[1.53,.65,-.82]},
 {id:'pneus',name:'Pneus',effect:'Aderência nas curvas',price:90,point:[-1.13,.4,.82]},
 {id:'tanque',name:'Tanque',effect:'Vazamento de combustível',price:65,point:[-1.9,.65,0]}
]);
export class CarCondition {
 constructor(){this.reset();}
 reset(){this.quality=Object.fromEntries(CAR_PARTS.map(p=>[p.id,1]));this.revision=0;}
 get health(){return CAR_PARTS.reduce((n,p)=>n+this.quality[p.id],0)/6;}
 get factors(){const q=this.quality;return {power:(.4+.6*q.motor)*(.55+.45*q.cambio),brakes:.3+.7*q.freios,grip:(.72+.28*q.pneus)*(.82+.18*q.suspensao),steering:.72+.28*q.suspensao,stability:.5+.5*q.suspensao,leak:(1-q.tanque)**2*.065};}
 damage(id,amount){if(!Object.hasOwn(this.quality,id))return;const before=this.quality[id];this.quality[id]=clamp(before-Math.max(0,amount));if(before!==this.quality[id])this.revision++;}
 impact(speed,forward=1,side=0){
  const force=clamp((speed-2)/28,0,.75);if(!force)return;
  const front=forward>.5,rear=forward<-.5,lateral=Math.abs(side)>.5;
  const weights={motor:front?1:.12,cambio:rear?.65:.23,freios:lateral?.7:.27,suspensao:front||lateral?.8:.2,pneus:lateral?.8:.3,tanque:rear?1:.08};
  for(const p of CAR_PARTS)this.damage(p.id,force*weights[p.id]);
 }
 wear(dt,{offRoad=false,speed=0,spin=0}={}){
  if(offRoad&&speed>8){this.damage('suspensao',dt*speed*.00012);this.damage('pneus',dt*speed*.00006);this.damage('tanque',dt*speed*.000055);}
  if(spin>3)this.damage('pneus',dt*spin*.0004);
 }
 quote(id,kind){
  const part=CAR_PARTS.find(p=>p.id===id);if(!part||!['proper','patch'].includes(kind))return null;
  const from=this.quality[id],to=kind==='proper'?1:Math.min(.78,from+(1-from)*.45);
  if(to-from<.005)return null;
  return {id,kind,from,to,cost:Math.max(5,Math.ceil(part.price*(1-from)*(kind==='proper'?1:.23))),seconds:kind==='proper'?4+12*(1-from):2+5*(1-from)};
 }
 applyRepair(quote,progress){if(!quote||!Object.hasOwn(this.quality,quote.id))return;this.quality[quote.id]=clamp(quote.from+(quote.to-quote.from)*clamp(progress));this.revision++;}
}

// Charged once; partial work stays installed and unused money is refunded.
export class PitService {
 constructor({condition,getFuel,setFuel,pay,refund}){Object.assign(this,{condition,getFuel,setFuel,pay,refund});this.job=null;this.queue=[];}
 has(id){return this.job?.id===id||this.queue.some(job=>job.id===id);}
 startRepair(id,kind){return this.start(this.condition.quote(id,kind));}
 startFuel(litres){const amount=Math.min(Math.max(0,Number(litres)||0),12-this.getFuel());if(amount<.05)return false;return this.start({id:'fuel',from:this.getFuel(),to:this.getFuel()+amount,cost:Math.ceil(amount*6.5),seconds:2+amount*1.5});}
 start(quote){if(!quote||this.has(quote.id))return false;const payment=this.pay(quote.cost);if(!payment)return false;const job={...quote,payment,elapsed:0,progress:0};if(this.job)this.queue.push(job);else this.job=job;return true;}
 step(dt){if(!this.job)return null;const job=this.job;job.elapsed=Math.min(job.seconds,job.elapsed+Math.max(0,dt));job.progress=job.elapsed/job.seconds;if(job.id==='fuel')this.setFuel(job.from+(job.to-job.from)*job.progress);else this.condition.applyRepair(job,job.progress);if(job.progress>=1){this.job=this.queue.shift()||null;return job;}return null;}
 cancelQueued(id){const index=this.queue.findIndex(job=>job.id===id);if(index<0)return 0;const [job]=this.queue.splice(index,1);this.refund(job.cost,job);return job.cost;}
 cancel(){const jobs=[...(this.job?[this.job]:[]),...this.queue];let total=0;for(const job of jobs){const amount=Math.floor(job.cost*(1-job.progress)*100)/100;this.refund(amount,job);total+=amount;}this.job=null;this.queue=[];return Math.round(total*100)/100;}
}
