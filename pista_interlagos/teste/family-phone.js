import * as THREE from 'three';

// Fictional family messages, local to the game.
export const FAMILY_MESSAGES=[
 {from:'Esposa',text:'Buscar filha na escola'},
 {from:'Esposa',text:'Passa no mercado: leite e pão.'},
 {from:'Filha',text:'Pai, traz meu casaco, por favor!'},
 {from:'Escola',text:'A reunião de pais é amanhã.'},
 {from:'Casa',text:'Lembrar de pagar a conta de luz.'},
 {from:'Esposa',text:'A torneira da cozinha voltou a pingar.'},
 {from:'Filha',text:'Pai, hoje você faz o jantar?'},
 {from:'Esposa',text:'O gás acabou. Pede outro na volta?'}
];

export class FamilyMessages {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.elapsed=0;this.nextAt=4;this.arrivedAt=-100;this.count=0;this.message=null;this.queue=[];this.revision=0;this.active=false;}
 update(dt){
  if(dt<=0)return false;
  this.elapsed+=dt;let arrived=false;
  if(this.elapsed>=this.nextAt){
   if(!this.count)this.message=FAMILY_MESSAGES[0];
   else {
    if(!this.queue.length){
     this.queue=FAMILY_MESSAGES.filter(m=>m!==this.message);
     for(let i=this.queue.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.queue[i],this.queue[j]]=[this.queue[j],this.queue[i]];}
    }
    this.message=this.queue.pop();
   }
   this.arrivedAt=this.elapsed;this.nextAt=this.elapsed+48+this.random()*27;this.count++;this.revision++;arrived=true;
  }
  const active=this.count>0&&this.elapsed-this.arrivedAt<18;
  if(active!==this.active){this.active=active;this.revision++;}
  return arrived;
 }
 info(){return {message:this.message?{...this.message}:null,active:this.active,count:this.count,elapsed:this.elapsed,nextIn:Math.max(0,this.nextAt-this.elapsed)};}
}

export function createFamilyPhone(){
 const messages=new FamilyMessages(),root=new THREE.Group();root.name='Celular_recados_familia';
 root.position.set(0,-.107,.030);root.rotation.z=-.10;
 const body=new THREE.Mesh(new THREE.BoxGeometry(.082,.148,.014),new THREE.MeshStandardMaterial({color:0x090c10,roughness:.48,metalness:.25}));root.add(body);
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=680;
 const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(.071,.131),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.z=.0075;root.add(screen);
 const speaker=new THREE.Mesh(new THREE.BoxGeometry(.019,.002,.001),new THREE.MeshBasicMaterial({color:0x23282e}));speaker.position.set(0,.070,.0075);root.add(speaker);
 let drawn=-1;
 function text(value,x,y,size,color='#f6f7f8',weight=600){ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial`;ctx.fillText(value,x,y);}
 function lines(value,maxWidth,size){
  ctx.font=`700 ${size}px Arial`;const result=[];let line='';
  for(const word of value.split(' ')){const candidate=line?line+' '+word:word;if(line&&ctx.measureText(candidate).width>maxWidth){result.push(line);line=word;}else line=candidate;}
  if(line)result.push(line);return result;
 }
 function draw(){
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
  const bg=ctx.createLinearGradient(0,0,384,680);bg.addColorStop(0,'#183437');bg.addColorStop(1,'#071217');ctx.fillStyle=bg;ctx.fillRect(0,0,384,680);
  text('16:20',24,36,23);text('4G',266,36,20);ctx.strokeStyle='#e4eded';ctx.lineWidth=3;ctx.strokeRect(310,19,44,20);ctx.fillStyle='#a4d3b3';ctx.fillRect(314,23,33,12);
  if(messages.active){
   text('MENSAGENS',24,91,24,'#a9e6be');text('agora',288,91,19,'#adc1c5',400);
   ctx.fillStyle='#ecf3ee';ctx.beginPath();ctx.roundRect(14,118,356,466,24);ctx.fill();
   ctx.fillStyle='#247f55';ctx.beginPath();ctx.arc(56,161,23,0,Math.PI*2);ctx.fill();text(messages.message.from[0],47,171,28);
   text(messages.message.from,91,174,36,'#153e2b');
   let size=60,wrapped=lines(messages.message.text,308,size);
   while(wrapped.length*size*1.12>300&&size>36){size-=2;wrapped=lines(messages.message.text,308,size);}
   wrapped.forEach((line,i)=>text(line,36,249+i*size*1.12,size,'#172922',700));
   text('Família',27,636,24,'#a9bcc0',400);
  }else{
   text('Família',28,180,62);text('Celular do piloto',28,223,28,'#a9bcc0',400);
   ctx.fillStyle='#26474a';ctx.beginPath();ctx.roundRect(20,296,344,198,22);ctx.fill();
   text('Recados',42,354,38);text('Nenhuma mensagem',42,410,26,'#bfcecf',400);text('nova por aqui.',42,449,26,'#bfcecf',400);
  }
  ctx.fillStyle='#cbd9dc';ctx.beginPath();ctx.roundRect(133,659,118,5,3);ctx.fill();texture.needsUpdate=true;drawn=messages.revision;
 }
 draw();
 return {root,update(dt){const arrived=messages.update(dt);if(drawn!==messages.revision)draw();const age=messages.elapsed-messages.arrivedAt;root.rotation.z=-.10+(age<.55?Math.sin(age*65)*.012*(1-age/.55):0);return arrived;},
  reset(){messages.reset();draw();root.rotation.z=-.10;},info:()=>messages.info()};
}
