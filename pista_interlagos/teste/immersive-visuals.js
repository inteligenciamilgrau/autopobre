import * as THREE from 'three';
import {FANS,strapPath} from './immersive-state.js';
const up=new THREE.Vector3(0,1,0);
export function trackPoint(data,s,offset=0){
 const a=data.samples,L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;
 let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
 const p=a[lo],q=a[(lo+1)%a.length],span=(lo===a.length-1?L:q[0])-p[0],u=Math.max(0,Math.min(1,(s-p[0])/Math.max(.001,span))),mix=k=>p[k]+(q[k]-p[k])*u;
 const tx=mix(7),ty=mix(8);return {x:mix(1)-ty*offset,y:mix(3)+mix(5)*offset+.055,z:-mix(2)-tx*offset,heading:Math.atan2(ty,tx),grade:mix(6),bank:mix(5),width:mix(4),index:lo};
}
export class ImmersiveVisuals {
 constructor(scene,carRoot,data,driver,car,rivalTemplate){
  this.scene=scene;this.carRoot=carRoot;this.data=data;this.root=new THREE.Group();this.root.visible=false;scene.add(this.root);
  this.materials={};this.time=0;
  this.stage=new THREE.Group();this.root.add(this.stage);const anchor=trackPoint(data,35,-32);
  anchor.y=Math.max(...[-13,13].flatMap(x=>[-11,11].map(z=>car.sample(anchor.x+x,-anchor.z-z).z)))+.2;this.stage.position.set(anchor.x,anchor.y,anchor.z);
  this.crowd=new THREE.Group();this.podium=new THREE.Group();this.stage.add(this.crowd,this.podium);
  this.box(this.stage,[0,-1.5,0],[26,3,23],0x353d3d);
  for(const z of [-10.5,10.5])this.box(this.stage,[0,.02,z],[25,.04,.18],0xeedbbb);
  this.tag(this.stage,'AUTO-POBRE RACING',[-7,4.8,0],10,1.1,'#e7b454','#142329');
  this.tag(this.stage,'STEVAN GAIPO · TODO MUNDO TEM UMA CONTA PRA PAGAR',[-7,3.85,0],10,.48,'#ffffff','#142329');
  this.fans=FANS.map((fan,i)=>{
   const pos=new THREE.Vector3(-5+(i%3)*3,0,i<3?-5:5),person=this.human([0x76a67b,0xd69569,0x7492c9,0xb3a77a,0x77888f,0xab7daf][i]);person.position.copy(pos);person.rotation.y=i<3?-Math.PI/2:Math.PI/2;this.crowd.add(person);
   const label=this.tag(this.crowd,fan.name,[pos.x,2.3,pos.z],2.5,.44);return {pos,person,label};
  });
  this.hero=this.human(0xd82125);this.crowd.add(this.hero);this.hero.position.set(5,0,3);
  const helmet=driver.root.getObjectByName('Capacete_preto_vermelho_balaclava');if(helmet){this.hero.userData.head.visible=false;const h=helmet.clone();h.position.set(0,1.62,0);this.hero.add(h);}
  this.tag(this.hero,'99',[0,1.18,.19],.27,.28,'#fff','#971719');
  this.rivals=Array.from({length:5},(_,i)=>{const group=this.rivalCar(rivalTemplate,[0xb35d47,0x567ac4,0xe0bd57,0x65a18e,0xcdd3d5][i],String([17,42,63,88,12][i]));this.root.add(group);return group;});
  this.truck=this.truckModel();this.root.add(this.truck);
  const strapGeometry=new THREE.BufferGeometry();strapGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*2*3),3));const indices=[];for(let i=0;i<24;i++)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);strapGeometry.setIndex(indices);
  this.strap=new THREE.Mesh(strapGeometry,new THREE.MeshBasicMaterial({color:0xe9b640,side:THREE.DoubleSide}));this.strap.frustumCulled=false;this.root.add(this.strap);
  this.damage=new THREE.Group();this.damage.visible=false;carRoot.add(this.damage);
  this.tank=new THREE.Group();this.damage.add(this.tank);this.box(this.tank,[0,0,0],[.64,.17,.95],0x686b64);
  for(const z of [-.31,.31])this.box(this.tank,[0,-.012,z],[.67,.185,.045],0x302c26);
  this.tankTethers=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3)),new THREE.LineBasicMaterial({color:0x594f3e}));this.damage.add(this.tankTethers);
  this.crackCanvas=document.createElement('canvas');this.crackCanvas.width=1024;this.crackCanvas.height=512;this.crackTexture=new THREE.CanvasTexture(this.crackCanvas);
  const glassGeometry=new THREE.BufferGeometry();glassGeometry.setAttribute('position',new THREE.Float32BufferAttribute([.643,.927,-.66,.643,.927,.66,.295,1.333,-.59,.295,1.333,.59],3));glassGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));glassGeometry.setIndex([0,1,2,2,1,3]);glassGeometry.computeVertexNormals();
  this.crackedGlass=new THREE.Mesh(glassGeometry,new THREE.MeshBasicMaterial({map:this.crackTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false,opacity:.9}));this.damage.add(this.crackedGlass);this.lastGlass=-1;
  this.debris=new THREE.Mesh(new THREE.IcosahedronGeometry(.085,0),this.mat(0x655a4d));this.root.add(this.debris);
  const leakGeometry=new THREE.BufferGeometry();leakGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(240*3),3));this.leak=new THREE.Points(leakGeometry,new THREE.PointsMaterial({color:0x4b341b,size:.22,transparent:true,opacity:.55,depthWrite:false}));this.leak.frustumCulled=false;this.root.add(this.leak);this.leakCount=0;this.leakCursor=0;this.leakTimer=0;
  this.judge=this.human(0xe9e5d5);this.root.add(this.judge);this.tag(this.judge,'JUIZ',[0,2.0,0],1.2,.38,'#fff','#37536a');
  this.closedPark=this.tag(this.root,'PARQUE FECHADO · AGUARDE A VISTORIA',[0,0,0],6,.7,'#fff','#285e69');
  this.pitSign=this.tag(this.root,'BOX · SÓ DEPOIS DA VISTORIA',[0,0,0],5,.7,'#fff','#8e4736');
  const heroData=this.hero.userData;this.hero.userData={};this.podiumHero=this.hero.clone();this.hero.userData=heroData;
  this.podiumHero.userData={limbs:this.podiumHero.children.filter(o=>o.name.startsWith('Membro_'))};this.podium.add(this.podiumHero);
  for(let i=0;i<6;i++){
   const height=[1.65,1.4,1.2,.95,.72,.45][i],z=-7+i*2.8;
   this.box(this.podium,[-2,height/2,z],[2,height,2.45],i===5?0xc89642:0x576a6c);
   this.tag(this.podium,`${i+1}º`,[-.75,height*.5,z],.8,.8,'#fff',i===5?'#8c5923':'#314447');
   if(i<5){const h=this.human([0x51789d,0x847452,0x836672,0x70856b,0x767a7c][i]);h.position.set(-2,height,z);this.podium.add(h);}
   else this.podiumHero.position.set(-2,height,z);
  }
  this.tag(this.podium,'A FOTO É SEMPRE EM SEXTO.',[-2,4.2,0],9,.7,'#f7c75b','#15272b');
  this.box(this.podium,[-9,1.5,-5],[.25,3,5],0x747977);this.box(this.podium,[-6.7,3.05,-5],[4.8,.18,5],0x797b73);
  this.garageDoor=this.box(this.podium,[-4.35,1.3,-5],[.08,2.6,4.7],0x58615c);
  this.blazer=this.car(0x294c62,'BLAZER');this.blazer.scale.set(1.06,1.18,1.05);this.blazer.position.set(-6.8,.1,-5);this.podium.add(this.blazer);
  this.tag(this.podium,'OFICINA · BLAZER',[-5.8,3.5,-5],4,.55,'#f7d99b','#213c47');
 }
 mat(color){return this.materials[color]??=(new THREE.MeshStandardMaterial({color,roughness:.76}));}
 box(parent,p,size,color){const o=new THREE.Mesh(new THREE.BoxGeometry(...size),this.mat(color));o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 tag(parent,text,p,w=3,h=.5,fg='#fff',bg='#192d30'){
  const c=document.createElement('canvas');c.width=1024;c.height=Math.max(128,Math.round(1024*h/w));const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.round(c.height*.55)}px Arial`;ctx.fillText(text,512,c.height/2,970);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthWrite:false}));sprite.position.set(...p);sprite.scale.set(w,h,1);parent.add(sprite);return sprite;
 }
 human(color){
  const root=new THREE.Group(),limbs=[];
  this.box(root,[0,1.13,0],[.33,.58,.46],color);this.box(root,[0,.82,0],[.3,.2,.4],color===0xd82125?color:0x252c33);
  for(const side of [-1,1]){
   const leg=new THREE.Group();leg.name='Membro_perna_'+side;leg.position.set(0,.82,side*.12);root.add(leg);this.box(leg,[0,-.35,0],[.16,.68,.17],color===0xd82125?color:0x253344);this.box(leg,[.07,-.74,0],[.3,.1,.2],0x111719);limbs.push(leg);
   const arm=new THREE.Group();arm.name='Membro_braco_'+side;arm.position.set(0,1.37,side*.3);root.add(arm);this.box(arm,[0,-.25,0],[.14,.52,.14],color);this.box(arm,[0,-.54,0],[.12,.13,.13],0xc99472);limbs.push(arm);
  }
  const head=new THREE.Mesh(new THREE.SphereGeometry(.16,12,8),this.mat(0xc99472));head.position.y=1.61;root.add(head);root.userData={limbs,head};return root;
 }
 car(color,number){
  const root=new THREE.Group();this.box(root,[.05,.61,0],[4.28,.59,1.70],color);this.box(root,[-.3,1.07,0],[1.95,.52,1.5],0x22363e);this.box(root,[-.35,1.36,0],[1.75,.065,1.5],color);
  this.box(root,[1.34,.93,0],[1.55,.08,1.67],color);this.box(root,[-1.72,.92,0],[.83,.08,1.67],color);
  for(const x of [-1.13,1.53])for(const z of [-.83,.83]){const tyre=new THREE.Mesh(new THREE.CylinderGeometry(.316,.316,.205,16).rotateX(Math.PI/2),this.mat(0x16191a));tyre.position.set(x,.316,z);root.add(tyre);}
  for(const z of [-.54,.54])this.box(root,[2.21,.63,z],[.025,.17,.27],0xe7e5c4);
  this.box(root,[-2.13,.65,0],[.025,.13,1.27],0x972b25);
  if(number==='BLAZER'){this.box(root,[-.55,1.22,0],[3.25,.69,1.52],0x22363e);this.box(root,[-.55,1.59,0],[3.29,.07,1.56],color);for(const x of [-1.5,-.55,.5])this.box(root,[x,1.23,0],[.075,.67,1.57],color);}
  this.tag(root,number,[0,number==='BLAZER'?1.83:1.45,0],number==='BLAZER'?1.3:.7,.35,'#fff','#223234');return root;
 }
 rivalCar(template,color,number){
  if(!template)return this.car(color,number);
  const root=template.clone(true),materials=new Map(),pivots=[];
  const structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));
  root.traverse(o=>{
   if(o.isMesh){o.castShadow=false;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    if(mats.some(m=>m.name.startsWith('Adesivo'))){o.visible=false;return;}
    const recolor=m=>{if(!['Pintura_preta','Faixa_amarela','Branco'].includes(m.name))return m;if(!materials.has(m)){const c=m.clone();c.color.setHex(m.name==='Pintura_preta'?color:0xe4e4d5);materials.set(m,c);}return materials.get(m);};
    o.material=Array.isArray(o.material)?mats.map(recolor):recolor(o.material);
   }
   if(!o.isMesh&&o.name.startsWith('Roda_')&&o.name.includes('PIVO'))pivots.push({obj:o,base:o.quaternion.clone()});
  });
  this.tag(root,number,[0,1.65,0],.65,.36,'#fff','#243a3d');root.userData.wheels=pivots;return root;
 }
 truckModel(){const root=new THREE.Group();this.box(root,[0,.66,0],[4.9,.35,2],0xe5b13f);this.box(root,[1.5,1.25,0],[1.65,1,1.9],0xe3c271);this.box(root,[1.55,1.54,0],[1.72,.35,1.91],0x354951);this.box(root,[-.5,1.1,0],[2.4,.22,1.8],0x535c5d);for(const x of [-1.5,1.65])for(const z of [-1,1]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.25,16).rotateX(Math.PI/2),this.mat(0x171a1c));w.position.set(x,.4,z);root.add(w);}this.tag(root,'REBOQUE · SEM PRESSA',[0,2.2,0],3.5,.5,'#222','#e5b13f');return root;}
 setPose(obj,p){obj.position.set(p.x,p.y,p.z);const f=new THREE.Vector3(Math.cos(p.heading),p.grade||0,-Math.sin(p.heading)).normalize(),n=new THREE.Vector3(-(p.grade||0)*Math.cos(p.heading)+(p.bank||0)*Math.sin(p.heading),1,(p.grade||0)*Math.sin(p.heading)+(p.bank||0)*Math.cos(p.heading)).normalize(),side=new THREE.Vector3().crossVectors(f,n).normalize();n.crossVectors(side,f);obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f,n,side));}
 reset(){this.hero.position.set(5,0,3);this.leakCount=this.leakCursor=this.leakTimer=0;this.leak.geometry.setDrawRange(0,0);this.lastGlass=-1;}
 walk(input,dt){
  const forward=input.throttle-input.brake,side=input.right-input.left,dx=(-forward+side)*.707,dz=(-forward-side)*.707,n=Math.max(1,Math.hypot(dx,dz));
  this.hero.position.x=THREE.MathUtils.clamp(this.hero.position.x+dx/n*3*dt,-8,8);this.hero.position.z=THREE.MathUtils.clamp(this.hero.position.z+dz/n*3*dt,-8,8);
  if(dx||dz)this.hero.rotation.y=Math.atan2(-dz,dx);
  this.hero.userData.limbs.forEach((limb,i)=>limb.rotation.z=(dx||dz)?Math.sin(this.time*9+i*Math.PI)*.35:0);
 }
 nearestFan(){let best=-1,d=2.5;this.fans.forEach((f,i)=>{const distance=this.hero.position.distanceTo(f.pos);if(distance<d){best=i;d=distance;}});return best;}
 drawCracks(value){
  if(value===this.lastGlass)return;this.lastGlass=value;const ctx=this.crackCanvas.getContext('2d');ctx.clearRect(0,0,1024,512);
  let seed=99;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let hit=0;hit<Math.ceil(value*5);hit++){
   const x=150+rand()*720,y=90+rand()*300;ctx.strokeStyle='rgba(231,247,252,.88)';ctx.lineWidth=1.6;
   for(let ray=0;ray<12;ray++){const a=ray*Math.PI/6+rand()*.25,len=50+rand()*150;ctx.beginPath();ctx.moveTo(x,y);for(let k=1;k<=5;k++)ctx.lineTo(x+Math.cos(a)*len*k/5+(rand()-.5)*12,y+Math.sin(a)*len*k/5+(rand()-.5)*10);ctx.stroke();}
   for(let ring=1;ring<4;ring++){ctx.beginPath();for(let k=0;k<=12;k++){const a=k*Math.PI/6,r=ring*17+rand()*10;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  }
  if(value>=1){ctx.fillStyle='rgba(202,223,231,.22)';ctx.fillRect(0,0,1024,512);}
  // Keep the cracks below the opaque sun strip and the mirror housing.
  ctx.clearRect(0,0,1024,120);this.crackTexture.needsUpdate=true;
 }
 update(state,car,dt,rivals,projectile,towOrigin){
  this.time+=dt;this.root.visible=this.damage.visible=state.active;if(!state.active)return;
  const staged=['crowd','podium'].includes(state.phase);this.stage.visible=staged;this.crowd.visible=state.phase==='crowd';this.podium.visible=state.phase==='podium';this.carRoot.visible=!staged;
  this.rivals.forEach((obj,i)=>{obj.visible=['race','grid'].includes(state.phase);if(obj.visible){this.setPose(obj,trackPoint(this.data,rivals[i].progress,rivals[i].lane));for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-rivals[i].progress/.31595));}});
  this.fans.forEach((f,i)=>{const laughing=state.fan===i&&state.feedback.includes('risada');f.person.rotation.z=laughing?Math.sin(this.time*9)*.08:0;f.label.material.color.setHex(state.donors.includes(i)?0xc4eb93:0xffffff);});
  this.tank.position.set(state.tankDetached?-2.22:-1.56,state.tankDetached?.06+Math.abs(Math.sin(this.time*29))*.025:.19,state.tankDetached?Math.sin(this.time*8)*.08:0);this.tank.rotation.set(state.tankDetached?.12:0,0,state.tankDetached?-.19:0);
  this.tankTethers.visible=state.tankDetached;const ta=this.tankTethers.geometry.attributes.position;for(let i=0;i<2;i++){ta.setXYZ(i*2,-1.6,.24,(i-.5)*.6);ta.setXYZ(i*2+1,this.tank.position.x+.24,this.tank.position.y,(i-.5)*.6);}ta.needsUpdate=true;
  this.drawCracks(state.glass);this.crackedGlass.visible=state.glass>0;
  if(state.tankDetached&&state.fuel>0&&!staged){this.leakTimer+=dt;if(this.leakTimer>.08){this.leakTimer=0;const x=car.x-Math.cos(car.heading)*2.3,y=car.y-Math.sin(car.heading)*2.3,p=car.sample(x,y);this.leak.geometry.attributes.position.setXYZ(this.leakCursor,x,p.z+.002,-y);this.leakCursor=(this.leakCursor+1)%240;this.leakCount=Math.min(240,this.leakCount+1);this.leak.geometry.attributes.position.needsUpdate=true;this.leak.geometry.setDrawRange(0,this.leakCount);}}
  this.leak.visible=!staged;this.debris.visible=!!projectile&&state.phase==='race';if(this.debris.visible){const t=projectile.age/projectile.duration;this.debris.position.lerpVectors(projectile.start,projectile.end,t);this.debris.position.y+=Math.sin(t*Math.PI)*.55;this.debris.rotation.set(this.time*12,this.time*9,0);}
  const towing=['tow','snag'].includes(state.phase);this.truck.visible=towing||state.phase==='broken';this.strap.visible=towing;
  if(this.truck.visible){const point=trackPoint(this.data,towOrigin+(state.towDistance||0)+9);this.setPose(this.truck,point);if(towing){
   this.carRoot.updateWorldMatrix(true,false);this.truck.updateWorldMatrix(true,false);
   const start=new THREE.Vector3(2.22,.12,0).applyMatrix4(this.carRoot.matrixWorld),end=new THREE.Vector3(-2.45,.12,0).applyMatrix4(this.truck.matrixWorld);
   const points=strapPath(start.toArray(),end.toArray(),5),a=this.strap.geometry.attributes.position;
   points.forEach((p,i)=>{const next=points[Math.min(24,i+1)],previous=points[Math.max(0,i-1)],nx=-(next[2]-previous[2]),nz=next[0]-previous[0],n=Math.max(.001,Math.hypot(nx,nz));for(let side=0;side<2;side++)a.setXYZ(i*2+side,p[0]+nx/n*.035*(side*2-1),Math.max(p[1],car.sample(p[0],-p[2]).z+.025),p[2]+nz/n*.035*(side*2-1));});a.needsUpdate=true;this.strap.material.color.setHex(state.phase==='snag'?0xf34435:0xe9b640);
  }}
  this.judge.visible=state.phase==='inspection';this.closedPark.visible=this.pitSign.visible=state.phase==='inspection';
  if(this.judge.visible){const c=Math.cos(car.heading),s=Math.sin(car.heading),a=state.inspection*.65;this.judge.position.set(car.x+c*Math.cos(a)*2.7-s*2,car.surface.z,-car.y-s*Math.cos(a)*2.7-c*2);this.judge.rotation.y=car.heading;this.closedPark.position.set(car.x,car.surface.z+3.5,-car.y);const pit=trackPoint(this.data,45,11);this.pitSign.position.set(pit.x,pit.y+2,pit.z);}
  this.garageDoor.position.y=state.profile.released?4.2:1.3;this.blazer.position.x=state.profile.released?-3.9:-6.8;
  if(state.phase==='podium')this.podiumHero.userData.limbs?.forEach((limb,i)=>{if(i%2)limb.rotation.z=-2.3+Math.sin(this.time*3)*.12;});
 }
 restoreCamera(){if(this.cameraRef&&this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;this.cameraRef.updateProjectionMatrix();this.savedFov=undefined;}}
 camera(camera,state){if(state.active&&['crowd','podium'].includes(state.phase)){if(this.savedFov===undefined){this.savedFov=camera.fov;this.cameraRef=camera;}camera.fov=58;camera.updateProjectionMatrix();camera.position.copy(this.stage.position).add(new THREE.Vector3(20,11,14));camera.up.copy(up);camera.lookAt(this.stage.position.clone().add(new THREE.Vector3(2,1,-4)));}else this.restoreCamera();}
}
