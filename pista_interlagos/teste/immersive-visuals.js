import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FANS,strapPath} from './immersive-state.js';
import {RIVAL_ROSTER} from './race-roster.js';
import {createPeople,setPose,POSES,OUTFITS} from './pit-crew.js';
import {curveloPitFrame,serviceSpot,garageBays,pitPoint} from './pit-lane.js';
import {footState,stepOnFoot,placeFootCamera,turnFootView,zoomFootView,footJump} from './on-foot.js';
import {shutOpenings,CarOpenings,carSpot,SPOT_OPENING} from './car-openings.js';
// V06 parts a rival never shows on track (engine and fuel cell stay under shut panels); the
// exporter also flags every other hidden mesh (bay, trunk, hinges) with the extra "interno".
const HIDDEN_ON_RIVALS=['Motor_CONJUNTO','Tanque_combustivel_CONJUNTO','Interior_do_jogo'];
const up=new THREE.Vector3(0,1,0);
// The small white 99 on the Opala's tail is part of its 'Branco' mesh: rivals drop the
// triangles on the tail panel (x < -2.05 m, car frame) and carry their own number there.
function withoutTail(g){
 const pos=g.attributes.position,n=g.index?g.index.count:pos.count,at=i=>g.index?g.index.getX(i):i,keep=[];
 for(let i=0;i+2<n;i+=3){const a=at(i),b=at(i+1),c=at(i+2);if((pos.getX(a)+pos.getX(b)+pos.getX(c))/3>-2.05)keep.push(a,b,c);}
 if(g.index){g.setIndex(keep);return g;}
 const out=new THREE.BufferGeometry();
 for(const [name,attr] of Object.entries(g.attributes)){
  // Same array type as the other meshes of the batch (mergeGeometries needs it).
  const raw=!attr.isInterleavedBufferAttribute,arr=raw?new attr.array.constructor(keep.length*attr.itemSize):new Float32Array(keep.length*attr.itemSize);
  keep.forEach((v,k)=>{for(let j=0;j<attr.itemSize;j++)arr[k*attr.itemSize+j]=raw?attr.array[v*attr.itemSize+j]:attr.getComponent(v,j);});out.setAttribute(name,new THREE.BufferAttribute(arr,attr.itemSize,raw&&attr.normalized));
 }
 g.dispose();return out;
}
const leanRotation=new THREE.Quaternion(),leanEuler=new THREE.Euler(),poseForward=new THREE.Vector3(),poseUp=new THREE.Vector3(),poseSide=new THREE.Vector3(),poseMatrix=new THREE.Matrix4();
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
  this.podium=new THREE.Group();this.stage.add(this.podium);
  this.box(this.stage,[0,-1.5,0],[26,3,23],0x353d3d);
  for(const z of [-10.5,10.5])this.box(this.stage,[0,.02,z],[25,.04,.18],0xeedbbb);
  this.tag(this.podium,'AUTO-POBRE RACING',[-7,4.8,0],10,1.1,'#e7b454','#142329');
  this.tag(this.podium,'STEVAN GAIPO · TODO MUNDO TEM UMA CONTA PRA PAGAR',[-7,3.85,0],10,.48,'#ffffff','#142329');
  // Before the race the pilot passes the hat round in front of the circuit's own pit
  // garages (pit-building.js): rivals' cars parked at their teams' doors, the Opala 99
  // inside Box 99 and six supporters on the working lane. The group is not turned, so
  // the hero's yaw stays a world heading; `lane` converts to lane coordinates.
  this.people=createPeople();this.crowd=new THREE.Group();this.crowd.name='Vaquinha_nos_boxes';this.root.add(this.crowd);
  const pit=data.pit??(data.meta.id==='curvelo'?curveloPitFrame(data):null);this.lane=this.crowdFrame(pit,anchor);this.crowd.position.copy(this.lane.origin);
  const L=this.lane,outfits=[{top:0x76a67b,bottom:0x2b3a55,hat:'cap',hatColor:0x2f7d4a,skin:0xc68e6a},{top:0xd69569,bottom:0x3b3f45,hairStyle:'long',hair:0x5a3a22,skin:0xe0b08f},{top:0xab7daf,bottom:0x3b3f45,hairStyle:'bun',hair:0x3b2a1a,glasses:true,skin:0xd8a27e,belly:.4},{top:0xb3a77a,bottom:0x2b3a55,hat:'cap',hatColor:0xc4232a,skin:0xb77a55},{top:0x77888f,bottom:0x1b1d20,hairStyle:'curly',skin:0x6b4128},{top:0x7492c9,bottom:0x2d3338,mustache:true,hairStyle:'bald',skin:0x8d5a3b}];
  // Supporters ahead of the pilot, between the parked cars, turned toward him.
  const spots=[[4,-1.4,.2,'ready'],[6.5,1,-.5,'stand'],[9.5,-.4,.35,'folded'],[16.5,1.1,-.3,'stand'],[19,-1.2,.4,'folded'],[22,.6,0,'ready']];
  this.fans=FANS.map((fan,i)=>{
   const [x,dd,turn,idle]=spots[i],pos=L.point(x,L.spotD+dd),person=this.people.person(outfits[i]);person.position.copy(pos);person.rotation.y=L.heading+Math.PI+(dd>0?.5:-.5)+turn;setPose(person,POSES[idle]);this.crowd.add(person);
   const label=this.tag(this.crowd,fan.name,[pos.x,pos.y+2.1,pos.z],1.8,.30),dollar=this.tag(this.crowd,'$',[pos.x,pos.y+2.65,pos.z],.43,.56,'#ffe380','#19452b');
   const reaction=this.tag(this.crowd,'HAHA! + R$ '+fan.gift,[pos.x,pos.y+3.15,pos.z],2.4,.45,'#203823','#c7ed9c');reaction.visible=false;
   return {pos,person,label,dollar,reaction,cheerUntil:0,idle,shown:idle};
  });
  this.socialMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.18),new THREE.MeshStandardMaterial({color:0x86e37c,emissive:0x28651f,roughness:.3}));this.crowd.add(this.socialMarker);
  // The pilot, out of the car in his cap; limbs listed left leg, left arm, right leg, right arm.
  this.hero=this.people.person(OUTFITS.driver);this.crowd.add(this.hero);const rig=this.hero.userData.rig.limbs;this.hero.userData.limbs=[rig[-1].leg,rig[-1].arm,rig[1].leg,rig[1].arm];
  this.heroStart=L.point(-1.5,L.spotD);this.heroYaw=L.heading;this.hero.position.copy(this.heroStart);this.hero.rotation.y=this.heroYaw;this.foot=footState(this.heroYaw,{floor:this.crowd.position.y+this.heroStart.y});
  this.rivals=RIVAL_ROSTER.map(entry=>{const group=this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName);group.userData.entry=entry;this.root.add(group);return group;});
  this.parked=[];
  if(pit){
   // The four teams nearest Box 99 park nose in at their garage doors.
   const {bay,team}=garageBays(pit,RIVAL_ROSTER.length);
   for(const [b,k] of [...team.entries()].sort((m,n)=>m[1]-n[1]).slice(0,4)){
    const sv=pit.garages[0]+(b+.5)*bay,x=sv-pit.box99.s,d=pitPoint(pit,sv).hi+.35-2.75,entry=RIVAL_ROSTER[k],parked=this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName);
    parked.position.copy(L.point(x,d));parked.rotation.y=L.heading+Math.PI/2;this.crowd.add(parked);this.parked.push({x,d});
   }
   const own=this.ownCar(rivalTemplate);own.position.copy(L.point(0,pit.box99.front+6.5,.05));own.rotation.y=L.heading-Math.PI/2;this.crowd.add(own);this.ownSpot={x:0,d:pit.box99.front+6.5};this.own=own;this.ownOpenings=new CarOpenings().attach(own);
  }
  this.banner(this.crowd,'PADDOCK · VAQUINHA ANTES DA LARGADA',L.point(12,L.bounds.d1-.1,6.3),L.heading,9,.55,'#f5d279','#1a292b');
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
  this.judge=this.people.person({top:0xe9e5d5,bottom:0x2d3338,hat:'cap',hatColor:0x37536a,glasses:true});this.root.add(this.judge);this.tag(this.judge,'JUIZ',[0,2.0,0],1.2,.38,'#fff','#37536a');
  this.closedPark=this.tag(this.root,'PARQUE FECHADO · AGUARDE A VISTORIA',[0,0,0],6,.7,'#fff','#285e69');
  this.pitSign=this.tag(this.root,'BOXES',[0,0,0],5,.7,'#fff','#8e4736');
  this.podiumHero=this.people.person(OUTFITS.driver);const cheer=this.podiumHero.userData.rig.limbs;this.podiumHero.userData.limbs=[cheer[-1].leg,cheer[-1].arm,cheer[1].leg,cheer[1].arm];this.podium.add(this.podiumHero);
  for(let i=0;i<6;i++){
   const height=[1.65,1.4,1.2,.95,.72,.45][i],z=i===0?0:i%2===1?(i+1)/2*2.8:-i/2*2.8;
   this.box(this.podium,[-2,height/2,z],[2,height,2.45],i===5?0xc89642:0x576a6c).name='Podio_'+(i+1);
   this.tag(this.podium,`${i+1}º`,[-.75,height*.5,z],.8,.8,'#fff',i===5?'#8c5923':'#314447');
   if(i<5){const color=RIVAL_ROSTER[i].color,h=this.people.person({top:color,bottom:0x2d3338,trim:0xf4f1ea,hat:'cap',hatColor:color,skin:[0xc68e6a,0x8d5a3b,0xe0b08f,0x6b4128,0xb77a55][i]});setPose(h,POSES[i%2?'folded':'stand']);h.position.set(-2,height,z);this.podium.add(h);}
   else this.podiumHero.position.set(-2,height,z);
  }
  this.tag(this.podium,'A FOTO É SEMPRE EM SEXTO.',[-2,4.2,0],9,.7,'#f7c75b','#15272b');
  this.box(this.podium,[-9,1.5,-5],[.25,3,5],0x747977);this.box(this.podium,[-6.7,3.05,-5],[4.8,.18,5],0x797b73);
  this.garageDoor=this.box(this.podium,[-4.35,1.3,-5],[.08,2.6,4.7],0x58615c);
  this.blazer=this.car(0x294c62,'BLAZER');this.blazer.scale.set(1.06,1.18,1.05);this.blazer.position.set(-6.8,.1,-5);this.podium.add(this.blazer);
  this.tag(this.podium,'OFICINA · BLAZER',[-5.8,3.5,-5],4,.55,'#f7d99b','#213c47');
 }
 // Paddock frame at the Box 99 service box: local points (unturned group) from lane
 // coordinates (x along the lane from Box 99, d across it) and back, and walking limits.
 crowdFrame(pit,fallback){
  if(!pit)return {origin:new THREE.Vector3(fallback.x,fallback.y,fallback.z),heading:0,spotD:0,point:(x,d,y=0)=>new THREE.Vector3(x,y,-d),lane:v=>({x:v.x,d:-v.z}),bounds:{x0:-8,x1:8,d0:-8,d1:8}};
  const spot=serviceSpot(pit),b=pit.box99,o=pitPoint(pit,b.s,spot.d),ux=Math.cos(o.heading),uy=Math.sin(o.heading),edge=pitPoint(pit,b.s);
  return {origin:new THREE.Vector3(o.x,o.y,o.z),heading:o.heading,spotD:spot.d,
   point:(x,d,y=0)=>{const p=pitPoint(pit,b.s+x,d);return new THREE.Vector3(p.x-o.x,p.y-o.y+y,p.z-o.z);},
   lane:v=>({x:v.x*ux-v.z*uy,d:spot.d-v.x*uy-v.z*ux}),bounds:{x0:-30,x1:30,d0:edge.lo+.5,d1:b.front-.15}};
 }
 // Where the rivals' numbers go, from the Opala 99's own stickers (Adesivo_*_99 on the
 // rear quarters, Decal_teto_99 read from the driver's side, the small 99 left of centre
 // on the tail). A grid is cast onto the body once per model, so each sticker follows
 // its curves 6 mm off the paint.
 numberPlates(template,detail){
  this.plateShapes??=new WeakMap();let list=this.plateShapes.get(template);if(list)return list;
  const body=[];detail.parent.updateMatrixWorld(true);detail.traverse(o=>{if(o.isMesh&&o.visible)body.push(o);});
  // Cast in world space (the clone keeps the model's own transform), stored car-local.
  const ray=new THREE.Raycaster(),V=(x,y,z)=>new THREE.Vector3(x,y,z),scale=detail.matrixWorld.getMaxScaleOnAxis();
  const bend=(center,right,up,w,h)=>{
   const normal=right.clone().cross(up),inward=normal.clone().negate(),nx=12,ny=6,pos=[],uv=[],index=[];
   for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const p=center.clone().addScaledVector(right,(i/nx-.5)*w).addScaledVector(up,(j/ny-.5)*h);ray.set(detail.localToWorld(p.clone().addScaledVector(normal,1.5)),inward.clone().transformDirection(detail.matrixWorld));ray.far=1.8*scale;
    const hit=ray.intersectObjects(body,false)[0];if(hit)p.copy(detail.worldToLocal(hit.point.clone())).addScaledVector(normal,.006);pos.push(p.x,p.y,p.z);uv.push(i/nx,j/ny);
    if(i&&j){const a=(j-1)*(nx+1)+i-1,c=j*(nx+1)+i-1;index.push(a,a+1,c+1,a,c+1,c);}
   }
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
  };
  list=[bend(V(-1.835,.667,-.86),V(-1,0,0),V(0,1,0),.57,.45),bend(V(-1.906,.67,.86),V(1,0,0),V(0,1,0),.57,.45),bend(V(-.19,1.3,0),V(-1,0,0),V(0,0,1),.94,.74),bend(V(-2.18,.69,-.29),V(0,0,1),V(0,1,0),.2,.156)];
  this.plateShapes.set(template,list);return list;
 }
 // The team's own Opala for the paddock: the player's model, livery and cage.
 ownCar(template){
  if(!template)return this.car(0x151515,'99');const root=template.clone(true),structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));shutOpenings(root);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  // Parked in the garage and walked round, it carries the player's whole cockpit, still (cockpit.js
  // outsideCopy), not the light interior of the rivals.
  const cabin=this.carRoot.getObjectByName('Interior_Opala_99')?.userData.outsideCopy?.();root.add(cabin??this.lightInterior());
  root.name='Opala_99_no_box';return root;
 }
 mat(color){return this.materials[color]??=(new THREE.MeshStandardMaterial({color,roughness:.76}));}
 // The car GLB carries no interior (the player's cockpit is built at runtime, cockpit.js): the
 // other Opalas get a light one that shows through their windows, at the cockpit's own places:
 // seat, head restraint, steering wheel and column, dash top up to the windscreen. One material.
 lightInterior(){
  const g=new THREE.Group(),dark=this.mat(0x17191b),add=(geometry,p,r=[0,0,0])=>{const o=new THREE.Mesh(geometry,dark);o.position.set(...p);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;g.add(o);};
  add(new THREE.BoxGeometry(.42,.08,.44),[-.17,.38,-.34]);
  add(new THREE.BoxGeometry(.08,.62,.46),[-.37,.72,-.34],[0,0,.16]);
  add(new THREE.BoxGeometry(.08,.22,.26),[-.44,1.13,-.34],[0,0,.16]);
  add(new THREE.TorusGeometry(.175,.016,8,24).rotateY(Math.PI/2),[.22,.88,-.34],[0,0,-.38]);
  add(new THREE.CylinderGeometry(.022,.022,.4,8).rotateZ(Math.PI/2),[.41,.806,-.34],[0,0,-.38]);
  add(new THREE.BoxGeometry(.37,.034,1.40),[.755,.89,0]);
  g.name='Interior_leve';return g;
 }
 box(parent,p,size,color){const o=new THREE.Mesh(new THREE.BoxGeometry(...size),this.mat(color));o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 labelTexture(text,w,h,fg,bg){
  const c=document.createElement('canvas');c.width=1024;c.height=Math.max(128,Math.round(1024*h/w));const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.round(c.height*.55)}px Arial`;ctx.fillText(text,512,c.height/2,970);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
 }
 tag(parent,text,p,w=3,h=.5,fg='#fff',bg='#192d30'){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.labelTexture(text,w,h,fg,bg),depthWrite:false}));sprite.position.set(...p);sprite.scale.set(w,h,1);parent.add(sprite);return sprite;}
 // A flat banner fixed to a wall, facing `heading` (a sprite this wide turns into the wall).
 banner(parent,text,p,heading,w,h,fg,bg){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:this.labelTexture(text,w,h,fg,bg)}));m.position.copy(p);m.rotation.y=heading;parent.add(m);return m;}
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
 // ~250-triangle Opala silhouette in the rival's colours, for distant cars.
 farProxy(color){
  const paint=new THREE.Color().setHex(color),parts=[];
  const add=(geometry,rgb)=>{let g=geometry.index?geometry.toNonIndexed():geometry;for(const key of Object.keys(g.attributes))if(key!=='position'&&key!=='normal')g.deleteAttribute(key);const c=new Float32Array(g.attributes.position.count*3);for(let i=0;i<c.length;i+=3){c[i]=rgb.r;c[i+1]=rgb.g;c[i+2]=rgb.b;}g.setAttribute('color',new THREE.BufferAttribute(c,3));parts.push(g);};
  const profile=(points,width,rgb)=>{const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));add(new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false}).translate(0,0,-width/2),rgb);};
  profile([[-2.35,.2],[2.42,.2],[2.46,.32],[2.46,.62],[2.35,.8],[.85,.9],[.05,1.4],[-.95,1.4],[-1.65,1],[-2.3,.97],[-2.39,.4]],1.84,paint);
  profile([[.9,.92],[.08,1.37],[-.97,1.37],[-1.7,.99]],1.86,new THREE.Color(.02,.025,.03));
  const tyre=new THREE.Color(.025,.025,.025),trim=new THREE.Color(.05,.05,.05);
  for(const x of [1.55,-1.117])for(const z of [-.8,.8])add(new THREE.CylinderGeometry(.316,.316,.26,8).rotateX(Math.PI/2).translate(x,.316,z),tyre);
  for(const z of [-.55,.55]){add(new THREE.BoxGeometry(.05,.08,.35).translate(-2.37,.95,z),new THREE.Color(.5,.02,.02));add(new THREE.BoxGeometry(.04,.1,.25).translate(2.45,.63,z*1.1),new THREE.Color(.8,.78,.6));}
  add(new THREE.BoxGeometry(.06,.14,1.8).translate(2.47,.42,0),trim);add(new THREE.BoxGeometry(.06,.14,1.8).translate(-2.41,.45,0),trim);
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  this.materials.farCar??=new THREE.MeshStandardMaterial({name:'Rival_distante',vertexColors:true,roughness:.4,metalness:.1});
  const mesh=new THREE.Mesh(geometry,this.materials.farCar);mesh.name='Rival_distante';mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;return mesh;
 }
 // Swap detailed and distant rival models around the player.
 detailLevel(obj){const u=obj.userData;if(!u.far)return;const far=obj.position.distanceToSquared(this.carRoot.position)>40*40;u.far.visible=far;u.detail.visible=!far;}
 rivalCar(template,color,number,name=''){
  if(!template)return this.car(color,number);
  const root=template.clone(true),materials=new Map(),pivots=[];
  const structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));
  for(const name of HIDDEN_ON_RIVALS)root.getObjectByName(name)?.removeFromParent();shutOpenings(root);root.add(this.lightInterior());
  const inside=[];root.traverse(o=>{if(o.isMesh&&o.userData.interno)inside.push(o);});inside.forEach(o=>o.removeFromParent());
  root.traverse(o=>{
   if(o.isMesh){
    const mats=Array.isArray(o.material)?o.material:[o.material];
    o.castShadow=mats.some(m=>!m.transparent||m.opacity>=.95);o.receiveShadow=true;
    // The Opala 99's number stickers (sides, roof) give way to the rival's own number.
    if(mats.some(m=>m.name.startsWith('Adesivo')||m.name==='Decal_teto_99')){o.visible=false;return;}
    const recolor=m=>{if(!['Pintura_preta','Faixa_amarela','Branco'].includes(m.name))return m;if(!materials.has(m)){const c=m.clone();c.color.setHex(m.name==='Pintura_preta'?color:0xe4e4d5);materials.set(m,c);}return materials.get(m);};
    o.material=Array.isArray(o.material)?mats.map(recolor):recolor(o.material);
   }
   if(!o.isMesh&&o.name.startsWith('Roda_')&&o.name.includes('PIVO'))pivots.push({obj:o,base:o.quaternion.clone()});
  });
  // Batch fixed bodywork by material; preserve separate wheel pivots for animation.
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map(),parts=[];
  root.traverse(o=>{if(!o.isMesh||!o.visible||Array.isArray(o.material)||o.children.length)return;let parent=o.parent;while(parent&&parent!==root){if(pivots.some(p=>p.obj===parent))return;parent=parent.parent;}parts.push(o);});
  for(const o of parts){let geometry=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));geometry.deleteAttribute('tangent');if(o.material.name==='Branco')geometry=withoutTail(geometry);if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geometries:[],objects:[]});const batch=batches.get(key);batch.geometries.push(geometry);batch.objects.push(o);}
  for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=!batch.material.transparent||batch.material.opacity>=.95;mesh.receiveShadow=true;root.add(mesh);batch.objects.forEach(o=>o.removeFromParent());}batch.geometries.forEach(g=>g.dispose());}
  // Level of detail: beyond ~40 m the car is one vertex-coloured mesh (one draw call).
  const detail=new THREE.Group();detail.name='Rival_detalhe';while(root.children.length)detail.add(root.children[0]);root.add(detail);
  const far=this.farProxy(color);root.add(far);root.userData.detail=detail;root.userData.far=far;
  const label=name?this.tag(root,name,[0,2.08,0],2.7,.30,'#fff','#172a2ddb'):null;
  // The rival's own number where the Opala 99 carries its 99 (those stickers are
  // hidden): big on both rear quarters and on the roof, small on the tail. White
  // italic numerals outlined in black, so they read on every paint; one texture each.
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=200;const ctx=canvas.getContext('2d');ctx.font='italic 900 170px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=16;ctx.strokeStyle='#101314';ctx.strokeText(number,128,108,228);ctx.fillStyle='#f4f3ee';ctx.fillText(number,128,108,228);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;const sticker=new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:.55,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.numberPlates(template,detail).forEach((g,i)=>{const decal=new THREE.Mesh(g,sticker);decal.name=['Numero_lateral_','Numero_lateral_','Numero_teto_','Numero_traseiro_'][i]+number;decal.renderOrder=2;detail.add(decal);});
  root.userData.wheels=pivots;root.userData.nameLabel=label;return root;
 }
 truckModel(){const root=new THREE.Group();this.box(root,[0,.66,0],[4.9,.35,2],0xe5b13f);this.box(root,[1.5,1.25,0],[1.65,1,1.9],0xe3c271);this.box(root,[1.55,1.54,0],[1.72,.35,1.91],0x354951);this.box(root,[-.5,1.1,0],[2.4,.22,1.8],0x535c5d);for(const x of [-1.5,1.65])for(const z of [-1,1]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.25,16).rotateX(Math.PI/2),this.mat(0x171a1c));w.position.set(x,.4,z);root.add(w);}this.tag(root,'REBOQUE · SEM PRESSA',[0,2.2,0],3.5,.5,'#222','#e5b13f');return root;}
 // Smoothed body roll and pitch from the rival's own cornering and braking.
 lean(obj,c){const u=obj.userData;u.roll=(u.roll??0)+(Math.max(-.03,Math.min(.03,(c.latAccel??0)*.0022))-(u.roll??0))*.15;u.pitch=(u.pitch??0)+(Math.max(-.025,Math.min(.015,(c.longAccel??0)*.002))-(u.pitch??0))*.15;obj.quaternion.multiply(leanRotation.setFromEuler(leanEuler.set(u.roll,0,u.pitch)));}
 // Rivals ride the same rigid body as the player: jumps, spins and rollovers show.
 setCarPose(obj,c){if(!c.pose){this.setPose(obj,{x:c.x,y:c.surface.z,z:-c.y,heading:c.heading,grade:c.surface.grade,bank:c.surface.bank});return;}const p=c.pose();obj.position.set(p.x,p.z,-p.y);poseForward.set(p.forward[0],p.forward[2],-p.forward[1]);poseUp.set(p.up[0],p.up[2],-p.up[1]);poseSide.crossVectors(poseForward,poseUp).normalize();obj.quaternion.setFromRotationMatrix(poseMatrix.makeBasis(poseForward,poseUp,poseSide));}
 setPose(obj,p){obj.position.set(p.x,p.y,p.z);const f=new THREE.Vector3(Math.cos(p.heading),p.grade||0,-Math.sin(p.heading)).normalize(),n=new THREE.Vector3(-(p.grade||0)*Math.cos(p.heading)+(p.bank||0)*Math.sin(p.heading),1,(p.grade||0)*Math.sin(p.heading)+(p.bank||0)*Math.cos(p.heading)).normalize(),side=new THREE.Vector3().crossVectors(f,n).normalize();n.crossVectors(side,f);obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f,n,side));}
 reset(){this.fans.forEach(f=>{f.cheerUntil=0;f.reaction.visible=false;f.dollar.visible=true;});this.followPosition=null;this.hero.rotation.y=this.heroYaw;this.hero.position.copy(this.heroStart);this.foot=footState(this.heroYaw,{floor:this.crowd.position.y+this.heroStart.y});this.leakCount=this.leakCursor=this.leakTimer=0;this.leak.geometry.setDrawRange(0,0);this.lastGlass=-1;this.ownOpenings?.closeAll(true);}
 // On foot in the paddock (on-foot.js), as in the pit stop's stroll: free to walk
 // anywhere, into Box 99 and the café too; ground is ImmersiveMode's footGround.
 walk(input,dt,{shift=false,touch=false,ground=null}={}){return stepOnFoot(this.foot,this.hero,input,dt,{shift,touch,ground,origin:this.crowd.position});}
 // The rivals parked at their garages, the Opala in Box 99 and the supporters are
 // solid (world positions; a step away from a supporter is always allowed).
 blocked(pos,from=pos){
  const local=pos.clone().sub(this.crowd.position),back=from.clone().sub(this.crowd.position),q=this.lane.lane(local);
  if([...this.parked,...(this.ownSpot?[this.ownSpot]:[])].some(p=>Math.abs(q.x-p.x)<1.3&&Math.abs(q.d-p.d)<2.7))return true;
  return this.fans.some(f=>{const a=Math.hypot(local.x-f.pos.x,local.z-f.pos.z);return a<.55&&a<Math.hypot(back.x-f.pos.x,back.z-f.pos.z);});
 }
 // Input that walks toward a world heading: sideways to the camera on a desktop; on
 // touch screens the view turns toward it first, as the steering pad does.
 toward(heading,touch=false){
  const r=Math.atan2(Math.sin(heading-this.foot.yaw),Math.cos(heading-this.foot.yaw));
  if(touch)return {throttle:Math.abs(r)<.65?1:0,brake:0,left:r>.05?1:0,right:r<-.05?1:0};
  const f=Math.cos(r),l=Math.sin(r);return {throttle:Math.max(0,f),brake:Math.max(0,-f),left:Math.max(0,l),right:Math.max(0,-l)};
 }
 // The team's Opala in Box 99: close enough to get in (F), and where it stands (data
 // coordinates and heading) for the real car to take its place.
 nearCar(){return !!this.own&&this.hero.position.distanceTo(this.own.position)<3.4;}
 // What the action key does by the Opala in Box 99, from where the pilot stands (car-openings.js):
 // 'capo' ahead of the nose, 'porta_malas' behind the tail (engine, fuel cell), 'porta' to get in.
 carAction(){if(!this.own||this.inCar)return null;this.own.updateMatrixWorld();return carSpot(this.own.worldToLocal(this.hero.getWorldPosition(new THREE.Vector3())));}
 toggleOwnOpening(spot){return !!this.ownOpenings&&!!SPOT_OPENING[spot]&&this.carAction()===spot&&this.ownOpenings.toggle(SPOT_OPENING[spot]);}
 ownOpen(spot){return !!this.ownOpenings?.held(SPOT_OPENING[spot],'manual');}
 ownPose(){if(!this.own)return null;const p=this.own.getWorldPosition(new THREE.Vector3());return {x:p.x,y:-p.z,heading:this.own.rotation.y};}
 // Out of the car by the driver's door (the other side if a wall is in the way).
 leaveCar(ground){
  const c=this.ownPose();if(!c)return;const o=this.crowd.position;
  for(const side of [1,-1]){
   const p=new THREE.Vector3(c.x-Math.sin(c.heading)*1.55*side,0,-c.y-Math.cos(c.heading)*1.55*side),floor=ground?ground(p,this.foot.floor,p):this.foot.floor;if(floor===null)continue;
   this.hero.position.set(p.x-o.x,floor-o.y,p.z-o.z);this.foot.floor=floor;break;
  }
  this.foot.lift=this.foot.vz=0;this.foot.yaw=this.hero.rotation.y=c.heading;this.followPosition=null;
 }
 turnView(dx,dy){turnFootView(this.foot,dx,dy);}
 zoomView(k){zoomFootView(this.foot,k);}
 jump(){return footJump(this.foot);}
 crouch(){this.foot.crouch=!this.foot.crouch;}
 nearestFan(){let best=-1,d=2.5;this.fans.forEach((f,i)=>{const distance=this.hero.position.distanceTo(f.pos);if(distance<d){best=i;d=distance;}});this.nearSocial=best;return best;}
 showDonation(index){const f=this.fans[index];if(f){f.cheerUntil=this.time+2.3;f.dollar.visible=false;f.reaction.visible=true;}}
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
 updateFree(rivals,dt){this.time+=dt;this.root.visible=true;this.damage.visible=false;this.carRoot.visible=true;for(const child of this.root.children)child.visible=this.rivals.includes(child);this.rivals.forEach((obj,i)=>{const c=rivals[i].car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-this.carRoot.position.x,c.y+this.carRoot.position.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-c.spin));});}
 update(state,car,dt,rivals,projectile,towOrigin){
  this.time+=dt;this.root.visible=this.damage.visible=state.active;if(!state.active)return;this.ownOpenings?.update(dt);
  const staged=['crowd','podium'].includes(state.phase);this.stage.visible=state.phase==='podium';this.crowd.visible=state.phase==='crowd';this.podium.visible=state.phase==='podium';this.carRoot.visible=!staged||!!this.inCar;if(this.own)this.own.visible=!this.inCar;if(this.inCar)this.hero.visible=false;
  this.rivals.forEach((obj,i)=>{obj.visible=['prepare','starting','grid','race'].includes(state.phase);if(obj.visible){const c=rivals[i].car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-this.carRoot.position.x,c.y+this.carRoot.position.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-rivals[i].progress/.31595));}});
  const selected=state.fan??this.nearSocial;this.socialMarker.visible=state.phase==='crowd'&&Number.isInteger(selected)&&!!this.fans[selected];if(this.socialMarker.visible){this.socialMarker.position.copy(this.fans[selected].pos).add(new THREE.Vector3(.4,2.85,0));this.socialMarker.rotation.y=this.time*1.5;}
  this.fans.forEach((f,i)=>{const laughing=this.time<f.cheerUntil||state.fan===i&&state.feedback.includes('risada'),pose=laughing?'cheer':f.idle;if(f.shown!==pose){setPose(f.person,POSES[pose]);f.shown=pose;}f.person.rotation.z=laughing?Math.sin(this.time*9)*.08:0;f.dollar.visible=!state.donors.includes(i);f.reaction.visible=this.time<f.cheerUntil;f.reaction.position.y=3.15+Math.max(0,2.3-(f.cheerUntil-this.time))*.15;f.label.material.color.setHex(state.donors.includes(i)?0xc4eb93:0xffffff);});
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
  if(state.phase==='podium')this.podiumHero.userData.limbs?.forEach((limb,i)=>{if(i%2)limb.rotation.z=2.7+Math.sin(this.time*3)*.12;});
 }
 restoreCamera(){if(this.cameraRef&&this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;this.cameraRef.updateProjectionMatrix();this.savedFov=undefined;}}
 camera(camera,state,dt=1/60){if(state.active&&['crowd','podium'].includes(state.phase)&&!this.inCar){if(this.savedFov===undefined){this.savedFov=camera.fov;this.cameraRef=camera;}camera.fov=58;camera.updateProjectionMatrix();if(state.phase==='crowd'){
   // Third person behind the pilot, turned by the mouse (ImmersiveMode); the view widens
   // while he runs, and a wall between them brings the camera in front of it.
   const s=this.foot;this.footFov=(this.footFov??58)+((s.running?65:58)-(this.footFov??58))*(1-Math.exp(-dt*5));camera.fov=this.footFov;camera.updateProjectionMatrix();
   this.followPosition=placeFootCamera(camera,s,this.hero.getWorldPosition(new THREE.Vector3()),{layout:this.layout,obstacles:this.obstacles,ground:this.groundAt,dt,follow:this.followPosition,body:this.hero});}else{this.followPosition=null;const framing=document.body.classList.contains('touch-device')?-5:-3;camera.fov=46;camera.updateProjectionMatrix();camera.position.copy(this.stage.position).add(new THREE.Vector3(20,7.5,framing));camera.up.copy(up);camera.lookAt(this.stage.position.clone().add(new THREE.Vector3(-2,1.8,framing)));}}else this.restoreCamera();}
}
