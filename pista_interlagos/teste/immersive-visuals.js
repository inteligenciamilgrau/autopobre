import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FANS,strapPath} from './immersive-state.js';
import {RIVAL_ROSTER} from './race-roster.js';
import {createPeople,setPose,POSES,OUTFITS,Idler} from './pit-crew.js';
import {curveloPitFrame,serviceSpot,garageBays,pitPoint} from './pit-lane.js';
import {footState,stepOnFoot,placeFootCamera,turnFootView,zoomFootView,footJump} from './on-foot.js';
import {shutOpenings,CarOpenings,carSpot,SPOT_OPENING} from './car-openings.js';
import {createRivalDriver,CABIN_DROP} from './rival-driver.js';
import {podiumBanner,podiumPlate,podiumRibbon,signBoard} from './pit-textures.js';
// V06 parts a rival never shows on track (engine and fuel cell stay under shut panels); the
// exporter also flags every other hidden mesh (bay, trunk, hinges) with the extra "interno".
const HIDDEN_ON_RIVALS=['Motor_CONJUNTO','Tanque_combustivel_CONJUNTO','Interior_do_jogo'];
// The 99's livery (by material): sponsors, logos, drivers' names (Branco: with the tail's 99), its numbers, the
// hood, roof and trunk lid decals and the window stickers. The other cars carry none of it, only their own number.
const LIVERY_99=/^(Adesivo|Decal_|Pilotos_99_parabrisa|Invent_parabrisa|Jesus_|Logo_frontal|Stickers_vigia_|Branco$)/;
const up=new THREE.Vector3(0,1,0);
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
   // Waiting for the pilot they idle: phone, chatting, arms crossed (pit-crew.js).
   const idler=new Idler(person,'fan',{props:{phone:this.people.carry('phone',person.userData.rig.limbs[1].hand)},seed:.2+i*.17});
   return {pos,person,label,dollar,reaction,cheerUntil:0,idle,idler};
  });
  this.socialMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.18),new THREE.MeshStandardMaterial({color:0x86e37c,emissive:0x28651f,roughness:.3}));this.crowd.add(this.socialMarker);
  // The pilot, out of the car in his cap; limbs listed left leg, left arm, right leg, right arm.
  this.hero=this.people.person(OUTFITS.driver);this.crowd.add(this.hero);const rig=this.hero.userData.rig.limbs;this.hero.userData.limbs=[rig[-1].leg,rig[-1].arm,rig[1].leg,rig[1].arm];
  this.heroStart=L.point(-1.5,L.spotD);this.heroYaw=L.heading;this.hero.position.copy(this.heroStart);this.hero.rotation.y=this.heroYaw;this.foot=footState(this.heroYaw,{floor:this.crowd.position.y+this.heroStart.y});
  this.rivals=RIVAL_ROSTER.map(entry=>{const group=this.rivalCar(rivalTemplate,entry.color,entry.number,entry.shortName,{driven:true});group.userData.entry=entry;this.root.add(group);return group;});
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
  this.judge=this.people.person({top:0xe9e5d5,bottom:0x2d3338,hat:'cap',hatColor:0x37536a,glasses:true});this.root.add(this.judge);this.judgeIdle=new Idler(this.judge,'judge',{seed:.61});this.tag(this.judge,'JUIZ',[0,2.0,0],1.2,.38,'#fff','#37536a');
  this.closedPark=this.tag(this.root,'PARQUE FECHADO · AGUARDE A VISTORIA',[0,0,0],6,.7,'#fff','#285e69');
  this.pitSign=this.tag(this.root,'BOXES',[0,0,0],5,.7,'#fff','#8e4736');
  this.podiumHero=this.people.person(OUTFITS.driver);const cheer=this.podiumHero.userData.rig.limbs;this.podiumHero.userData.limbs=[cheer[-1].leg,cheer[-1].arm,cheer[1].leg,cheer[1].arm];this.podium.add(this.podiumHero);
  this.podiumSlots=[];this.podiumRivals=[];this.podiumPlates=[];
  for(let i=0;i<6;i++){
   const height=[1.65,1.4,1.2,.95,.72,.45][i],z=i===0?0:i%2===1?(i+1)/2*2.8:-i/2*2.8;
   this.box(this.podium,[-2,height/2,z],[2,height,2.45],i===5?0xc89642:0x576a6c).name='Podio_'+(i+1);
   this.podiumSlots.push({height,z});if(i===5)this.podiumHero.position.set(-2,height,z);
  }
  this.dressPodium(null,'');
  this.podiumDressing();
  this.box(this.podium,[-9,1.5,-5],[.25,3,5],0x747977);this.box(this.podium,[-6.7,3.05,-5],[4.8,.18,5],0x797b73);
  this.garageDoor=this.box(this.podium,[-4.35,1.3,-5],[.08,2.6,4.7],0x58615c);
  this.blazer=this.car(0x294c62,'BLAZER');for(const label of this.blazer.children.filter(o=>o.isSprite))label.removeFromParent();this.blazer.scale.set(1.06,1.18,1.05);this.blazer.position.set(-6.8,.1,-5);this.podium.add(this.blazer);
 }
 // The registration circle at the team stand on the pit wall (layout.desk, pit-box99.js),
 // as a mission marker in GTA: a glowing ring on the deck, a beam fading upward, an arrow
 // bobbing over it and a sign seen from anywhere in the paddock. Points are kept local.
 addDesk(desk){
  if(!desk)return;const o=this.crowd.position,local=v=>v.clone().sub(o);
  this.desk={face:desk.face,look:desk.look,spot:local(desk.spot),team:local(desk.team),route:desk.route.map(local)};
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=128;const ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'#fff');ctx.fillStyle=g;ctx.fillRect(0,0,4,128);
  const fade=new THREE.CanvasTexture(canvas),glow=(extra={})=>new THREE.MeshBasicMaterial({color:0xffc21a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,...extra});
  const marker=new THREE.Group();marker.name='Inscricao_equipe_99';marker.position.copy(this.desk.spot);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,1.3,40,1,true).translate(0,.65,0),glow({map:fade,opacity:.5}));
  const ring=new THREE.Mesh(new THREE.RingGeometry(.37,.46,48).rotateX(-Math.PI/2).translate(0,.015,0),glow({opacity:.95}));
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.37,48).rotateX(-Math.PI/2).translate(0,.012,0),glow({opacity:.16}));
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.15,.32,4).rotateX(Math.PI),new THREE.MeshStandardMaterial({color:0xffc21a,emissive:0xb07a00,roughness:.35}));arrow.position.y=2.2;
  marker.add(beam,ring,disc,arrow);this.crowd.add(marker);
  const sign=this.tag(this.crowd,'INSCRIÇÃO · EQUIPE 99',[this.desk.spot.x,this.desk.spot.y+2.8,this.desk.spot.z],2.6,.4,'#1d1a0c','#ffc83a');sign.material.depthTest=false;sign.renderOrder=90;
  this.deskMarker={marker,beam,ring,disc,arrow,sign};
 }
 // In the circle (it opens the registration), or near enough for the action key.
 atDesk(){return this.nearDesk(.5);}
 nearDesk(radius=1.7){if(!this.desk||this.inCar)return false;const p=this.hero.position,s=this.desk.spot;return Math.hypot(p.x-s.x,p.z-s.z)<radius&&Math.abs(p.y-s.y)<.6;}
 // The way to the circle: to the foot of the steps, up onto the wall, then to the circle
 // (the first legs are skipped once he is on the steps or up there).
 deskRoute(){if(!this.desk)return null;const [foot,top,spot]=this.desk.route,y=this.hero.position.y;return (y>top.y-.15?[spot]:y>foot.y+.2?[top,spot]:[foot,top,spot]).map(v=>v.clone());}
 // At the desk the pilot turns to the engineer and the camera frames the two of them and the screens.
 faceDesk(){if(!this.desk)return;this.hero.rotation.y=this.desk.face;this.foot.yaw=this.desk.look;this.foot.pitch=.32;}
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
 // seat, head restraint, steering wheel and column dropped onto the V06 floor as the player's
 // are, dash top up to the windscreen. One material. A driven rival's wheel comes with its driver.
 lightInterior({wheel=true}={}){
  const g=new THREE.Group(),dark=this.mat(0x17191b),add=(geometry,p,r=[0,0,0],drop=CABIN_DROP)=>{const o=new THREE.Mesh(geometry,dark);o.position.set(p[0],p[1]+drop,p[2]);o.rotation.set(...r);o.castShadow=o.receiveShadow=true;g.add(o);};
  add(new THREE.BoxGeometry(.42,.08,.44),[-.17,.38,-.34]);
  add(new THREE.BoxGeometry(.08,.62,.46),[-.37,.72,-.34],[0,0,.16]);
  add(new THREE.BoxGeometry(.08,.22,.26),[-.44,1.13,-.34],[0,0,.16]);
  if(wheel)add(new THREE.TorusGeometry(.175,.016,8,24).rotateY(Math.PI/2),[.22,.88,-.34],[0,0,-.38]);
  add(new THREE.CylinderGeometry(.022,.022,.4,8).rotateZ(Math.PI/2),[.41,.806,-.34],[0,0,-.38]);
  add(new THREE.BoxGeometry(.37,.034,1.40),[.755,.89,0],[0,0,0],0);
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
 // Detailed car or light proxy by how big it looks: distance to the camera shortened by the lens
 // zoom (the broadcast camera's long lens), or to the player's car when no camera is known.
 detailLevel(obj){const u=obj.userData;if(!u.far)return;const cam=this.viewCamera;
  const far=cam?obj.position.distanceTo(cam.position)*Math.tan(cam.fov*Math.PI/360)/Math.tan(29*Math.PI/180)>40:obj.position.distanceToSquared(this.carRoot.position)>40*40;
  u.far.visible=far;u.detail.visible=!far;}
 // driven: a rival out on track, with its driver (rival-driver.js) in the team's suit and helmet;
 // the cars parked at the garages before the race stand empty.
 rivalCar(template,color,number,name='',{driven=false}={}){
  if(!template)return this.car(color,number);
  const root=template.clone(true),materials=new Map(),pivots=[];
  const structure=this.carRoot.getObjectByName('Estrutura_cabine_V04');if(structure)root.add(structure.clone(true));
  for(const name of HIDDEN_ON_RIVALS)root.getObjectByName(name)?.removeFromParent();shutOpenings(root);root.add(this.lightInterior({wheel:!driven}));
  const inside=[];root.traverse(o=>{if(o.isMesh&&o.userData.interno)inside.push(o);});inside.forEach(o=>o.removeFromParent());
  root.traverse(o=>{
   if(o.isMesh){
    const mats=Array.isArray(o.material)?o.material:[o.material];
    o.castShadow=mats.some(m=>!m.transparent||m.opacity>=.95);o.receiveShadow=true;
    // No sponsor, name or number of the 99 on the other cars: their own number replaces it.
    if(mats.some(m=>LIVERY_99.test(m.name))){o.visible=false;return;}
    const recolor=m=>{if(!['Pintura_preta','Faixa_amarela'].includes(m.name))return m;if(!materials.has(m)){const c=m.clone();c.color.setHex(m.name==='Pintura_preta'?color:0xe4e4d5);materials.set(m,c);}return materials.get(m);};
    o.material=Array.isArray(o.material)?mats.map(recolor):recolor(o.material);
   }
   if(!o.isMesh&&o.name.startsWith('Roda_')&&o.name.includes('PIVO'))pivots.push({obj:o,base:o.quaternion.clone()});
  });
  // Batch fixed bodywork by material; preserve separate wheel pivots for animation.
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map(),parts=[];
  root.traverse(o=>{if(!o.isMesh||!o.visible||Array.isArray(o.material)||o.children.length)return;let parent=o.parent;while(parent&&parent!==root){if(pivots.some(p=>p.obj===parent))return;parent=parent.parent;}parts.push(o);});
  for(const o of parts){let geometry=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));geometry.deleteAttribute('tangent');if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,geometries:[],objects:[]});const batch=batches.get(key);batch.geometries.push(geometry);batch.objects.push(o);}
  for(const batch of batches.values()){const geometry=mergeGeometries(batch.geometries,false);if(geometry){const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=!batch.material.transparent||batch.material.opacity>=.95;mesh.receiveShadow=true;root.add(mesh);batch.objects.forEach(o=>o.removeFromParent());}batch.geometries.forEach(g=>g.dispose());}
  // Level of detail: beyond ~40 m the car is one vertex-coloured mesh (one draw call).
  const detail=new THREE.Group();detail.name='Rival_detalhe';while(root.children.length)detail.add(root.children[0]);root.add(detail);
  if(driven){const driver=createRivalDriver({color,number});detail.add(driver.root);root.userData.driver=driver;}
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
 // Flatbed tow truck ("guincho plataforma"): white cab with an orange stripe, aluminium bed,
 // dual rear wheels and an amber light bar that flashes. It faces +x; the strap hooks at x -2.45.
 truckModel(){const root=new THREE.Group(),glass=new THREE.MeshStandardMaterial({color:0x0c1114,roughness:.08,metalness:.3});
  this.box(root,[-.1,.62,0],[5.3,.22,1.1],0x202326);
  this.box(root,[2.05,1.42,0],[1.7,1.25,2.08],0xe9e7e0);this.box(root,[2.05,1.02,0],[1.72,.16,2.1],0xe06a1f);this.box(root,[2.05,2.08,0],[1.55,.08,1.98],0xd8d6cf);
  const pane=(p,size)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),glass);m.position.set(...p);root.add(m);};
  pane([2.91,1.72,0],[.04,.62,1.86]);for(const z of [-1,1])pane([2.25,1.74,z*1.045],[.95,.52,.02]);
  this.box(root,[2.95,.78,0],[.16,.26,2.12],0x2b2e31);this.box(root,[2.93,1.18,0],[.04,.3,1.1],0x1c1f22);
  for(const z of [-.78,.78]){const lamp=new THREE.Mesh(new THREE.BoxGeometry(.05,.16,.3),new THREE.MeshStandardMaterial({color:0xfff6dd,emissive:0xfff1c8,emissiveIntensity:1.2}));lamp.position.set(2.95,1.1,z);root.add(lamp);}
  this.box(root,[-.75,1.02,0],[3.5,.12,2.2],0xa3a9ad);for(const z of [-1.07,1.07])this.box(root,[-.75,1.14,z],[3.5,.12,.06],0x7e8488);
  this.box(root,[1.12,1.55,0],[.08,1.0,2.05],0x33373a);this.box(root,[-2.45,.78,0],[.28,.34,1.3],0xe0b33c);
  const beacon=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,1.3),new THREE.MeshStandardMaterial({color:0xffa21a,emissive:0xff8c00,emissiveIntensity:.3,roughness:.3}));beacon.position.set(2.1,2.18,0);root.add(beacon);root.userData.beacon=beacon;
  for(const [x,z,wide] of [[2.3,-.95,0],[2.3,.95,0],[-1.35,-.82,1],[-1.35,.82,1]]){
   const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,wide?.52:.28,18).rotateX(Math.PI/2),this.mat(0x151719));w.position.set(x,.42,z);root.add(w);
   const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.02,12).rotateX(Math.PI/2),this.mat(0x8b9094));hub.position.set(x,.42,z+Math.sign(z)*(wide?.27:.15));root.add(hub);
   this.box(root,[x,.9,z*1.03],[1.05,.06,wide?.62:.36],0x202326);
  }
  // The joke is painted on the doors, not floating over the truck.
  for(const side of [-1,1])this.banner(root,'REBOQUE · SEM PRESSA',new THREE.Vector3(2.05,1.42,side*1.05),side>0?0:Math.PI,1.45,.3,'#1d1d1d','#e9e7e0');
  root.traverse(o=>{if(o.isMesh)o.castShadow=true;});return root;}
 // Smoothed body roll and pitch from the rival's own cornering and braking.
 lean(obj,c){const u=obj.userData;u.roll=(u.roll??0)+(Math.max(-.03,Math.min(.03,(c.latAccel??0)*.0022))-(u.roll??0))*.15;u.pitch=(u.pitch??0)+(Math.max(-.025,Math.min(.015,(c.longAccel??0)*.002))-(u.pitch??0))*.15;obj.quaternion.multiply(leanRotation.setFromEuler(leanEuler.set(u.roll,0,u.pitch)));}
 // Rivals ride the same rigid body as the player: jumps, spins and rollovers show.
 setCarPose(obj,c){if(!c.pose){this.setPose(obj,{x:c.x,y:c.surface.z,z:-c.y,heading:c.heading,grade:c.surface.grade,bank:c.surface.bank});return;}const p=c.pose(this.renderAhead??0);obj.position.set(p.x,p.z,-p.y);poseForward.set(p.forward[0],p.forward[2],-p.forward[1]);poseUp.set(p.up[0],p.up[2],-p.up[1]);poseSide.crossVectors(poseForward,poseUp).normalize();obj.quaternion.setFromRotationMatrix(poseMatrix.makeBasis(poseForward,poseUp,poseSide));}
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
 // focus: the car the cameras watch (main.js, recon lap), else the player's: name tags show round it.
 updateFree(rivals,dt){this.time+=dt;this.root.visible=true;this.damage.visible=false;this.carRoot.visible=true;for(const child of this.root.children)child.visible=this.rivals.includes(child);const focus=this.focus??this.carRoot.position;this.rivals.forEach((obj,i)=>{const c=rivals[i].car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-focus.x,c.y+focus.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);obj.userData.driver?.update(c,dt,obj.userData.detail.visible);for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-c.spin));});}
 update(state,car,dt,rivals,projectile,towOrigin){
  this.time+=dt;this.root.visible=this.damage.visible=state.active;if(!state.active)return;this.ownOpenings?.update(dt);
  const staged=['crowd','podium'].includes(state.phase);this.stage.visible=state.phase==='podium';this.crowd.visible=state.phase==='crowd';this.podium.visible=state.phase==='podium';this.carRoot.visible=!staged||!!this.inCar;if(this.own)this.own.visible=!this.inCar;if(this.inCar)this.hero.visible=false;
  this.rivals.forEach((obj,i)=>{obj.visible=['starting','grid','race'].includes(state.phase);if(obj.visible){const c=rivals[i].car;if(obj.userData.nameLabel)obj.userData.nameLabel.visible=Math.hypot(c.x-this.carRoot.position.x,c.y+this.carRoot.position.z)<45;this.setCarPose(obj,c);this.lean(obj,c);this.detailLevel(obj);obj.userData.driver?.update(c,dt,obj.userData.detail.visible);for(const w of obj.userData.wheels||[])w.obj.quaternion.copy(w.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-rivals[i].progress/.31595));}});
  // The sign (seen through walls) fades out as the camera comes within a few metres of it.
  if(this.deskMarker){const m=this.deskMarker,show=state.phase==='crowd'&&!this.inCar&&!state.desk,pulse=.5+.5*Math.sin(this.time*3.2);m.marker.visible=m.sign.visible=show;
   if(show){m.beam.material.opacity=.36+.24*pulse;m.ring.material.opacity=.7+.3*pulse;m.arrow.position.y=2.2+.1*Math.sin(this.time*2.4);m.arrow.rotation.y=this.time*1.6;
    const far=this.viewCamera?this.viewCamera.position.distanceTo(m.sign.getWorldPosition(this.signPosition??=new THREE.Vector3())):99;m.sign.material.opacity=THREE.MathUtils.clamp((far-5)/4,0,1);m.sign.visible=far>5;}}
  const selected=state.fan??this.nearSocial;this.socialMarker.visible=state.phase==='crowd'&&Number.isInteger(selected)&&!!this.fans[selected];if(this.socialMarker.visible){this.socialMarker.position.copy(this.fans[selected].pos).add(new THREE.Vector3(.4,2.85,0));this.socialMarker.rotation.y=this.time*1.5;}
  this.fans.forEach((f,i)=>{const laughing=this.time<f.cheerUntil||state.fan===i&&state.feedback.includes('risada'),pose=laughing?'cheer':f.idle;if(this.crowd.visible)f.idler.update(dt,pose,{calm:laughing||state.fan===i});f.person.rotation.z=laughing?Math.sin(this.time*9)*.08:0;f.dollar.visible=!state.donors.includes(i);f.reaction.visible=this.time<f.cheerUntil;f.reaction.position.y=3.15+Math.max(0,2.3-(f.cheerUntil-this.time))*.15;f.label.material.color.setHex(state.donors.includes(i)?0xc4eb93:0xffffff);});
  this.tank.position.set(state.tankDetached?-2.22:-1.56,state.tankDetached?.06+Math.abs(Math.sin(this.time*29))*.025:.19,state.tankDetached?Math.sin(this.time*8)*.08:0);this.tank.rotation.set(state.tankDetached?.12:0,0,state.tankDetached?-.19:0);
  this.tankTethers.visible=state.tankDetached;const ta=this.tankTethers.geometry.attributes.position;for(let i=0;i<2;i++){ta.setXYZ(i*2,-1.6,.24,(i-.5)*.6);ta.setXYZ(i*2+1,this.tank.position.x+.24,this.tank.position.y,(i-.5)*.6);}ta.needsUpdate=true;
  this.drawCracks(state.glass);this.crackedGlass.visible=state.glass>0;
  if(state.tankDetached&&state.fuel>0&&!staged){this.leakTimer+=dt;if(this.leakTimer>.08){this.leakTimer=0;const x=car.x-Math.cos(car.heading)*2.3,y=car.y-Math.sin(car.heading)*2.3,p=car.sample(x,y);this.leak.geometry.attributes.position.setXYZ(this.leakCursor,x,p.z+.002,-y);this.leakCursor=(this.leakCursor+1)%240;this.leakCount=Math.min(240,this.leakCount+1);this.leak.geometry.attributes.position.needsUpdate=true;this.leak.geometry.setDrawRange(0,this.leakCount);}}
  this.leak.visible=!staged;this.debris.visible=!!projectile&&state.phase==='race';if(this.debris.visible){const t=projectile.age/projectile.duration;this.debris.position.lerpVectors(projectile.start,projectile.end,t);this.debris.position.y+=Math.sin(t*Math.PI)*.55;this.debris.rotation.set(this.time*12,this.time*9,0);}
  const towing=['tow','snag'].includes(state.phase);this.truck.visible=towing||state.phase==='broken';this.strap.visible=towing;
  if(this.truck.visible){const point=trackPoint(this.data,towOrigin+(state.towDistance||0)+9);this.setPose(this.truck,point);
   // Amber light bar: two quick flashes per second.
   const flash=(performance.now()/1000*2)%1;this.truck.userData.beacon.material.emissiveIntensity=flash<.12||(flash>.25&&flash<.37)?7:.25;if(towing){
   this.carRoot.updateWorldMatrix(true,false);this.truck.updateWorldMatrix(true,false);
   const start=new THREE.Vector3(2.22,.12,0).applyMatrix4(this.carRoot.matrixWorld),end=new THREE.Vector3(-2.45,.12,0).applyMatrix4(this.truck.matrixWorld);
   const points=strapPath(start.toArray(),end.toArray(),5),a=this.strap.geometry.attributes.position;
   points.forEach((p,i)=>{const next=points[Math.min(24,i+1)],previous=points[Math.max(0,i-1)],nx=-(next[2]-previous[2]),nz=next[0]-previous[0],n=Math.max(.001,Math.hypot(nx,nz));for(let side=0;side<2;side++)a.setXYZ(i*2+side,p[0]+nx/n*.035*(side*2-1),Math.max(p[1],car.sample(p[0],-p[2]).z+.025),p[2]+nz/n*.035*(side*2-1));});a.needsUpdate=true;this.strap.material.color.setHex(state.phase==='snag'?0xf34435:0xe9b640);
  }}
  this.judge.visible=state.phase==='inspection';this.closedPark.visible=this.pitSign.visible=state.phase==='inspection';if(this.judge.visible)this.judgeIdle.update(dt);
  // The first five applaud (or not) the pilot in sixth.
  if(state.phase==='podium')this.podiumIdlers?.forEach((idler,i)=>idler.update(dt,i%2?'folded':'stand'));
  if(this.judge.visible){const c=Math.cos(car.heading),s=Math.sin(car.heading),a=state.inspection*.65;this.judge.position.set(car.x+c*Math.cos(a)*2.7-s*2,car.surface.z,-car.y-s*Math.cos(a)*2.7-c*2);this.judge.rotation.y=car.heading;this.closedPark.position.set(car.x,car.surface.z+3.5,-car.y);const pit=trackPoint(this.data,45,11);this.pitSign.position.set(pit.x,pit.y+2,pit.z);}
  this.garageDoor.position.y=state.profile.released?4.2:1.3;this.blazer.position.x=state.profile.released?-3.9:-6.8;
  if(state.phase==='podium')this.podiumHero.userData.limbs?.forEach((limb,i)=>{if(i%2)limb.rotation.z=2.7+Math.sin(this.time*3)*.12;});
 }
 unshift(camera=this.cameraRef){if(this.viewShifted){camera?.clearViewOffset();this.viewShifted=false;}}
 restoreCamera(){this.unshift();if(this.cameraRef&&this.savedFov!==undefined){this.cameraRef.fov=this.savedFov;if(this.savedNear!==undefined)this.cameraRef.near=this.savedNear;this.cameraRef.updateProjectionMatrix();this.savedFov=this.savedNear=undefined;}}
 camera(camera,state,dt=1/60){if(state.active&&['crowd','podium'].includes(state.phase)&&!this.inCar){if(this.savedFov===undefined){this.savedFov=camera.fov;this.savedNear=camera.near;this.cameraRef=camera;}camera.fov=58;camera.near=this.savedNear;camera.updateProjectionMatrix();if(state.phase==='crowd'){this.unshift(camera);
   // Third person behind the pilot, turned by the mouse (ImmersiveMode); the view widens
   // while he runs, and a wall between them brings the camera in front of it.
   // The lens zoom (wheel past the pilot's eyes) sets the field of view; running widens it only at the normal lens.
   const s=this.foot,lens=s.zoomFov??58;this.footFov=(this.footFov??58)+((s.running&&lens>=57?65:lens)-(this.footFov??58))*(1-Math.exp(-dt*8));camera.fov=this.footFov;
   // Right at the eyes the near plane comes in, so parts a few centimetres away are not clipped.
   camera.near=s.distance<.8?.03:this.savedNear;camera.updateProjectionMatrix();
   this.followPosition=placeFootCamera(camera,s,this.hero.getWorldPosition(new THREE.Vector3()),{layout:this.layout,obstacles:this.obstacles,ground:this.groundAt,dt,follow:this.followPosition,body:this.hero});}else{this.followPosition=null;this.podiumCamera(camera,dt);}}else{this.podiumView=null;this.restoreCamera();}}
 // Podium photo mode: it opens on the official framing, then drag (or touch) looks round,
 // the wheel zooms in to the drivers' faces and W A S D / arrows walk the camera round the stage.
 // It turns round the middle of the steps; a lens shift keeps them clear of the panel on the right.
 podiumCamera(camera,dt){
  this.podiumControls();
  const zs=this.podiumSlots.map(slot=>slot.z),middle=(Math.min(...zs)+Math.max(...zs))/2;
  if(!this.podiumView)this.podiumView={yaw:0,pitch:Math.asin(5.7/Math.hypot(22,5.7)),distance:Math.hypot(22,5.7),target:new THREE.Vector3(-2,1.9,middle)};
  const panel=document.getElementById('immersivePanel'),shift=panel&&!panel.classList.contains('hidden')?panel.getBoundingClientRect().width/2:0;
  if(shift){camera.setViewOffset(innerWidth,innerHeight,shift,0,innerWidth,innerHeight);this.viewShifted=true;}else this.unshift(camera);
  const v=this.podiumView,k=this.podiumKeys,step=Math.min(dt,.1)*Math.max(2.5,v.distance*.35);
  const ahead=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0),aside=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0);
  // Forward is away from the camera, along the ground.
  v.target.x+=(-Math.cos(v.yaw)*ahead-Math.sin(v.yaw)*aside)*step;v.target.z+=(Math.sin(v.yaw)*ahead-Math.cos(v.yaw)*aside)*step;
  v.target.x=Math.max(-14,Math.min(14,v.target.x));v.target.z=Math.max(-12,Math.min(12,v.target.z));
  const c=Math.cos(v.pitch);camera.fov=46;camera.updateProjectionMatrix();
  camera.position.copy(this.stage.position).add(v.target).add(new THREE.Vector3(Math.cos(v.yaw)*c*v.distance,Math.sin(v.pitch)*v.distance,-Math.sin(v.yaw)*c*v.distance));
  camera.position.y=Math.max(camera.position.y,this.stage.position.y+.35);
  camera.up.copy(up);camera.lookAt(this.stage.position.clone().add(v.target));
 }
 // The podium's dressing, fixed in the scene (sprites turned with the camera): the banner over
 // the steps between two gilt poles, the joke's ribbon over the sixth step and the
 // workshop's sign on its roof. Art in pit-textures.js; +x faces the photo camera.
 podiumDressing(){
  const g=this.podium,gilt=new THREE.MeshStandardMaterial({color:0xd8b24a,metalness:.85,roughness:.28});
  const board=(map,w,h,x,y,z,backColor)=>{const front=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,roughness:.78}));front.position.set(x,y,z);front.rotation.y=Math.PI/2;front.castShadow=true;
   const back=new THREE.Mesh(new THREE.PlaneGeometry(w,h),this.mat(backColor));back.position.set(x-.012,y,z);back.rotation.y=-Math.PI/2;g.add(front,back);return front;};
  const x=-3.45,z0=-7.75,z1=10.55,top=6.15;
  for(const z of [z0,z1]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.08,top+.2,14),gilt);pole.position.set(x,(top+.2)/2,z);pole.castShadow=true;const knob=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),gilt);knob.position.set(x,top+.3,z);g.add(pole,knob);}
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,z1-z0,10),gilt);bar.rotation.x=Math.PI/2;bar.position.set(x+.03,top+.02,(z0+z1)/2);g.add(bar);
  board(podiumBanner('AUTO-POBRE RACING','STEVAN GAIPO · TODO MUNDO TEM UMA CONTA PRA PAGAR'),z1-z0-.35,1.85,x+.05,top-.95,(z0+z1)/2,0x5e0d12).name='Faixa_podio';
  // The ribbon hangs on two cords from the banner's hem, right over the sixth step.
  const rz=this.podiumSlots[5].z;board(podiumRibbon('A FOTO É SEMPRE EM SEXTO.'),4.2,.52,x+.08,3.78,rz,0xc98f1c).name='Faixa_sexto';
  for(const dz of [-1.9,1.9]){const cord=new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,.2,5),gilt);cord.position.set(x+.08,4.14,rz+dz);g.add(cord);}
  board(signBoard('OFICINA','BLAZER NO CONSERTO','#213c47','#f7d99b',{h:224}),3.6,.8,-4.3,3.58,-5,0x213c47).name='Placa_oficina';
 }
 // Places 1-5 go to the first five rivals of the classification (the pilot always stands sixth:
 // the joke), in their team colours, each with a plate at the foot of the step: place and name.
 dressPodium(order,pilot){
  const entries=(order?.length?order:RIVAL_ROSTER).slice(0,5),key=entries.map(e=>e.number).join(',')+'|'+pilot;
  if(key===this.podiumKey)return;this.podiumKey=key;
  for(const h of this.podiumRivals){h.removeFromParent();h.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
  for(const plate of this.podiumPlates){plate.removeFromParent();plate.geometry.dispose();plate.material.map.dispose();plate.material.dispose();}
  this.podiumRivals=[];this.podiumPlates=[];this.podiumIdlers=[];
  const skins=[0xc68e6a,0x8d5a3b,0xe0b08f,0x6b4128,0xb77a55];
  this.podiumSlots.forEach(({height,z},i)=>{
   if(i<5){const color=entries[i].color,h=this.people.person({top:color,bottom:0x2d3338,trim:0xf4f1ea,hat:'cap',hatColor:color,skin:skins[i]});setPose(h,POSES[i%2?'folded':'stand']);h.position.set(-2,height,z);this.podium.add(h);this.podiumRivals.push(h);this.podiumIdlers.push(new Idler(h,'podium',{seed:.3+i*.19}));}
   const name=i<5?entries[i].shortName:(pilot||'Stevan Gaipo');
   // The plate is fixed on the step's front (and its back, for the free camera behind).
   const ph=Math.min(.56,height*.72),map=podiumPlate(i+1,name,{color:i<5?entries[i].color:0xd82125,hero:i===5,w:2.2,h:ph}),material=new THREE.MeshStandardMaterial({map,roughness:.42,metalness:.35});
   for(const side of [1,-1]){const plate=new THREE.Mesh(new THREE.PlaneGeometry(2.2,ph),material);plate.position.set(-2+side*1.006,height-ph/2-.06,z);plate.rotation.y=side*Math.PI/2;plate.name='Placa_podio_'+(i+1);this.podium.add(plate);this.podiumPlates.push(plate);}
  });
 }
 podiumControls(){
  if(this.podiumKeys||typeof document==='undefined')return;
  const keys=this.podiumKeys=new Set(),view=document.getElementById('view'),active=()=>!!this.podiumView&&this.podium.visible,moves=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  document.addEventListener('keydown',e=>{if(active()&&moves.includes(e.code))keys.add(e.code);});
  document.addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
  view?.addEventListener('pointerdown',e=>{if(active())this.podiumDrag={id:e.pointerId,x:e.clientX,y:e.clientY};});
  view?.addEventListener('pointermove',e=>{const d=this.podiumDrag;if(!d||d.id!==e.pointerId||!active()||document.pointerLockElement===view)return;const v=this.podiumView;
   v.yaw-=(e.clientX-d.x)*.005;v.pitch=Math.max(-.12,Math.min(1.35,v.pitch+(e.clientY-d.y)*.004));d.x=e.clientX;d.y=e.clientY;});
  addEventListener('pointerup',e=>{if(this.podiumDrag?.id===e.pointerId)this.podiumDrag=null;});
  document.addEventListener('mousemove',e=>{if(!active()||document.pointerLockElement!==view)return;const v=this.podiumView;v.yaw-=e.movementX*.0032;v.pitch=Math.max(-.12,Math.min(1.35,v.pitch+e.movementY*.0028));});
  view?.addEventListener('wheel',e=>{if(active())this.podiumView.distance=Math.max(1.2,Math.min(45,this.podiumView.distance*(e.deltaY>0?1.15:1/1.15)));},{passive:true});
 }
}
