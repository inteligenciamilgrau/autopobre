import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {crewBack,lollipop} from './pit-textures.js';

// People of the Interlagos pits: articulated figures (hips, torso, head, two-part
// arms and legs) built from vertex-coloured primitives, a pose library, the Box 99
// crew that runs out to the car in its box, and the Tia behind her counter.
// Figures face +x and their limb groups swing about z (positive = forward), like the
// boxy figures of the immersive mode, so the pit walk animates either kind.
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),SC=new THREE.Vector3(),TR=new THREE.Vector3();
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function piece(geometry,color,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
 const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();g.deleteAttribute('uv');
 g.applyMatrix4(M.compose(TR.set(...pos),Q.setFromEuler(E.set(...rot)),SC.set(...scale)));
 const c=new THREE.Color(color),n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++){rgb[i*3]=c.r;rgb[i*3+1]=c.g;rgb[i*3+2]=c.b;}
 g.setAttribute('color',new THREE.BufferAttribute(rgb,3));return g;
}
const merge=parts=>{const g=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return g;};
const ball=(r,w=12,h=9)=>new THREE.SphereGeometry(r,w,h),capsule=(r,len)=>new THREE.CapsuleGeometry(r,len,3,10),tube=(a,b,h,s=12)=>new THREE.CylinderGeometry(a,b,h,s),block=(x,y,z)=>new THREE.BoxGeometry(x,y,z);
const darker=(color,k)=>new THREE.Color(color).multiplyScalar(k);

const BASE={skin:0xc68e6a,hair:0x2b1f17,hairStyle:'short',top:0x5a6a78,bottom:0x2d3a4a,belt:0x1b1d20,shoes:0x1b1d20,hands:null,trim:null,sleeves:'long',hat:null,hatColor:0xc81d25,apron:null,skirt:null,legs:null,glasses:false,mustache:false,belly:0,back:false};
const CREW={top:0xc81d25,bottom:0xc81d25,trim:0xf4f1ea,hands:0x1b1d20,shoes:0x1b1d20,back:true};
export const OUTFITS={
 crew:CREW,
 // Out of the car the driver swaps the helmet for a cap, to eat and drink.
 driver:{...CREW,top:0xd82125,bottom:0xd82125,hat:'cap',hatColor:0x1b1d20,skin:0xc98f68},
 tia:{skin:0xd8a27e,hair:0xbab4ab,hairStyle:'bun',top:0xe690a8,sleeves:'short',skirt:0x3f5f8f,bottom:0x3f5f8f,apron:0xf7f1e3,legs:0xd09a76,shoes:0x6b3f25,glasses:true,belly:.8},
 engineer:{top:0xc81d25,sleeves:'short',bottom:0x2b2f33,trim:0xf4f1ea,hat:'headset'},
};

// Head, centre 0.1 m above the neck joint: face, ears, hair and headwear.
function headGeometry(o){
 const p=[],skin=o.skin,hair=o.hair;
 p.push(piece(ball(.104,16,12),skin,[0,.1,0],[0,0,0],[1.04,1.17,.93]),piece(ball(.072,12,8),skin,[.028,.035,0],[0,0,0],[1,.95,1.12]),piece(block(.034,.05,.03),darker(skin,.82),[.107,.092,0],[0,0,-.28]));
 for(const z of [-1,1])p.push(piece(ball(.02,8,6),0xf2eee6,[.086,.118,z*.037],[0,0,0],[.6,1,1]),piece(ball(.011,6,5),0x2a1c12,[.099,.118,z*.037]),piece(block(.012,.011,.04),hair,[.1,.148,z*.038],[z*.15,0,0]),piece(ball(.028,8,6),skin,[-.002,.1,z*.1],[0,0,0],[.55,1,.45]));
 p.push(piece(block(.012,.011,.042),0x8a4637,[.1,.042,0]));
 if(o.mustache)p.push(piece(block(.02,.016,.07),hair,[.104,.063,0]));
 // Skull caps tilt back so hair and caps clear the brow but cover the nape.
 const shell=(r,color,cut=.55)=>piece(new THREE.SphereGeometry(r,16,8,0,Math.PI*2,0,Math.PI*cut),color,[-.006,.1,0],[0,0,.6],[1.06,1.2,1]);
 if(o.hairStyle==='bun')p.push(shell(.111,hair),piece(ball(.056,10,8),hair,[-.1,.2,0]));
 else if(o.hairStyle==='curly')p.push(shell(.113,hair),...[0,1,2,3,4,5,6].map(k=>piece(ball(.045,8,6),hair,[-.07+Math.cos(k*.9)*.05,.2+Math.sin(k*1.7)*.02,Math.sin(k*.9)*.07])));
 else if(o.hairStyle!=='bald')p.push(shell(.111,hair));
 if(o.hat==='cap')p.push(shell(.119,o.hatColor,.5),piece(block(.13,.014,.18),o.hatColor,[.12,.16,0],[0,0,-.18]),piece(ball(.013,6,4),o.hatColor,[-.03,.24,0]));
 if(o.hat==='helmet')p.push(piece(new THREE.SphereGeometry(.14,16,8,0,Math.PI*2,0,Math.PI/2),o.hatColor,[0,.11,0],[0,0,.15],[1.05,1.1,1]),piece(new THREE.SphereGeometry(.14,16,5,Math.PI+.95,Math.PI*2-1.9,Math.PI/2,Math.PI*.2),o.hatColor,[0,.11,0],[0,0,.15],[1.05,1.1,1]),piece(block(.3,.03,.03),0xc81d25,[-.01,.26,0],[0,0,.15]));
 if(o.hat==='headset'){p.push(piece(new THREE.TorusGeometry(.128,.011,6,18,Math.PI),0x1b1d20,[0,.11,0],[0,Math.PI/2,0]));for(const z of [-1,1])p.push(piece(tube(.042,.042,.035,12),0x1b1d20,[0,.1,z*.118],[Math.PI/2,0,0]));p.push(piece(block(.11,.01,.01),0x1b1d20,[.05,.065,-.095],[0,.55,0]),piece(ball(.014,6,5),0x1b1d20,[.1,.05,-.05]));}
 if(o.glasses){for(const z of [-1,1])p.push(piece(new THREE.TorusGeometry(.024,.0045,6,16),0x3a2a22,[.113,.117,z*.038],[0,Math.PI/2,0]),piece(block(.1,.006,.006),0x3a2a22,[.065,.12,z*.1]));p.push(piece(block(.006,.006,.022),0x3a2a22,[.116,.12,0]));}
 return merge(p);
}
function torsoGeometry(o){
 const p=[],b=o.belly;
 p.push(piece(tube(.19,.15+.05*b,.52,16),o.top,[0,.27,0],[0,0,0],[.66+.14*b,1,1]),piece(tube(.05,.058,.12,10),o.skin,[0,.57,0]),piece(tube(.066,.074,.05,12),o.top,[0,.535,0]));
 for(const z of [-1,1])p.push(piece(ball(.078,10,8),o.top,[0,.49,z*.18],[0,0,0],[.9,.9,1]));
 if(o.trim)p.push(piece(tube(.192,.184,.055,16),o.trim,[0,.37,0],[0,0,0],[.67+.14*b,1,1.01]),piece(block(.008,.46,.014),darker(o.top,.6),[.126+.03*b,.28,0]),piece(block(.01,.06,.08),0xf4f1ea,[.128+.03*b,.43,.075]));
 if(o.apron)p.push(piece(block(.02,.36,.3),o.apron,[.13+.03*b,.2,0]));
 return merge(p);
}
function hipsGeometry(o){
 const p=[piece(tube(.155,.15,.2,14),o.bottom,[0,-.03,0],[0,0,0],[.72,1,1.05]),piece(tube(.157,.157,.045,14),o.belt,[0,.06,0],[0,0,0],[.73,1,1.06])];
 if(o.skirt)p.push(piece(tube(.165,.26,.56,16),o.skirt,[0,-.3,0],[0,0,0],[.82,1,1]));
 if(o.apron)p.push(piece(block(.02,.46,.34),o.apron,[o.skirt?.19:.125,-.2,0],[0,0,o.skirt?-.14:0]));
 return merge(p);
}
const upperGeometry=o=>merge([piece(capsule(.052,.19),o.top,[0,-.14,0]),...(o.trim?[piece(tube(.054,.054,.03,10),o.trim,[0,-.05,0])]:[])]);
function foreGeometry(o){const sleeve=o.sleeves==='short'?o.skin:o.top,hand=o.hands??o.skin;return merge([piece(capsule(.045,.18),sleeve,[0,-.12,0]),piece(tube(.05,.05,.04,10),o.sleeves==='short'?o.skin:hand,[0,-.22,0]),piece(ball(.05,10,8),hand,[0,-.285,0],[0,0,0],[.75,1.15,.52]),piece(ball(.022,6,5),hand,[.035,-.26,0])]);}
function thighGeometry(o,side){const p=[piece(capsule(.072,.3),o.skirt?(o.legs??o.skin):o.bottom,[0,-.21,0])];if(o.trim&&!o.skirt)p.push(piece(block(.014,.38,.012),o.trim,[0,-.21,side*.071]));return merge(p);}
function shinGeometry(o,side){const p=[piece(capsule(.058,.3),o.skirt?(o.legs??o.skin):o.bottom,[0,-.2,0]),piece(block(.24,.1,.11),o.shoes,[.045,-.45,0]),piece(ball(.056,10,7),o.shoes,[.155,-.455,0],[0,0,0],[1,.8,1])];if(o.trim&&!o.skirt)p.push(piece(block(.012,.3,.012),o.trim,[0,-.2,side*.059]));return merge(p);}

// Poses: hips drop (y), forward lean, head nod; per side [left, right]: thigh swing,
// knee bend, arm raise, elbow bend and arm spread (radians).
const pose=(y,lean,head,thigh,knee,arm,elbow,spread=[.1,.1])=>({y,lean,head,turn:0,thigh,knee,arm,elbow,spread});
export const POSES={
 stand:pose(0,0,0,[0,0],[0,0],[.06,.06],[.18,.18]),
 ready:pose(-.04,.14,.05,[.12,.12],[.22,.22],[.3,.3],[.55,.55],[.14,.14]),
 folded:pose(0,-.02,0,[0,.06],[0,.08],[.38,.38],[1.75,1.75],[.34,.34]),
 kneel:pose(-.42,.32,.15,[1.4,-.12],[1.45,1.5],[.75,.65],[.35,.45],[.05,.05]),
 jack:pose(-.08,.35,.1,[.45,-.1],[.6,.2],[.7,.7],[.2,.2],[.04,.04]),
 rest:pose(0,0,0,[0,.05],[0,.05],[.06,.45],[.18,.5]),
 fuel:pose(-.03,.18,.3,[.12,-.05],[.15,.05],[.85,.8],[.75,.85],[.02,.02]),
 lollipop:pose(0,0,0,[0,.05],[0,.05],[.25,1.35],[.4,.05],[.1,.05]),
 work:pose(-.08,.85,-.3,[.25,.25],[.35,.35],[1.2,1],[.6,.8]),
 sit:pose(-.46,.05,0,[1.5,1.5],[1.5,1.5],[.45,.5],[.9,1.1],[.12,.12]),
 stool:pose(-.2,.1,0,[1.35,1.3],[1.15,1.25],[.8,.85],[.7,.6]),
 serve:pose(0,.18,.2,[0,0],[0,0],[1.2,.3],[.35,.6],[.05,.1]),
 wave:pose(0,-.03,-.1,[0,0],[0,0],[.1,2.7],[.2,.5],[.1,.25]),
 wipe:pose(0,.22,.25,[0,0],[0,0],[.2,1.05],[.4,.5],[.1,.05]),
 cheer:pose(0,-.05,-.2,[0,0],[0,0],[2.6,2.6],[.3,.3],[.3,.3]),
};
const clonePose=p=>({...p,thigh:[...p.thigh],knee:[...p.knee],arm:[...p.arm],elbow:[...p.elbow],spread:[...p.spread]});
function copyPose(to,from){for(const key of ['y','lean','head','turn'])to[key]=from[key];for(const key of ['thigh','knee','arm','elbow','spread'])for(const i of [0,1])to[key][i]=from[key][i];}
function applyPose(rig,p){
 rig.hips.position.y=.93+p.y;rig.torso.rotation.z=-p.lean;rig.head.rotation.z=-p.head;rig.head.rotation.y=p.turn;
 for(const [i,side] of [[0,-1],[1,1]]){const l=rig.limbs[side];l.leg.rotation.z=p.thigh[i];l.shin.rotation.z=-p.knee[i];l.arm.rotation.z=p.arm[i];l.arm.rotation.x=-side*p.spread[i];l.fore.rotation.z=p.elbow[i];}
}
// Holds a figure in a pose (people standing still: supporters, the podium).
export function setPose(root,pose){root.userData.pose=clonePose(pose);applyPose(root.userData.rig,root.userData.pose);}
function blendPose(cur,target,k){for(const key of ['y','lean','head','turn'])cur[key]+=((target[key]??0)-cur[key])*k;for(const key of ['thigh','knee','arm','elbow','spread'])for(const i of [0,1])cur[key][i]+=(target[key][i]-cur[key][i])*k;}
// Walking and running layered over the current pose.
function gait(cur,phase,amount,run){
 for(const [i,sign] of [[0,1],[1,-1]]){const s=Math.sin(phase)*sign,c=Math.cos(phase)*sign;
  cur.thigh[i]+=((run?.7:.42)*s-cur.thigh[i])*amount;cur.knee[i]+=(.12+(run?1.05:.55)*Math.max(0,c)-cur.knee[i])*amount;
  cur.arm[i]+=(-(run?.6:.32)*s-cur.arm[i])*amount;cur.elbow[i]+=((run?1.3:.35)-cur.elbow[i])*amount;cur.spread[i]+=(.1-cur.spread[i])*amount;}
 cur.lean+=((run?.22:.04)-cur.lean)*amount;cur.y+=(-(run?.05:.02)+Math.abs(Math.sin(phase))*.03-cur.y)*amount;cur.head+=(0-cur.head)*amount;
}

// Bones of a figure in its rest pose, with the part geometries that ride on each.
function skeletonFor(o){
 const bones=[],bone=(name,parent,x,y,z)=>{const b=new THREE.Bone();b.name=name;b.position.set(x,y,z);parent?.add(b);bones.push(b);return b;};
 const hips=bone('Quadril',null,0,.93,0),torso=bone('Tronco',hips,0,0,0),head=bone('Cabeca',torso,0,.6,0),limbs={},parts=[[hipsGeometry(o),hips],[torsoGeometry(o),torso]],upper=upperGeometry(o),fore=foreGeometry(o);
 for(const side of [-1,1]){
  const arm=bone('Membro_braco_'+side,torso,0,.47,side*.2),forearm=bone('Antebraco_'+side,arm,0,-.28,0),hand=bone('Mao_'+side,forearm,0,-.29,0),leg=bone('Membro_perna_'+side,hips,0,0,side*.095),shin=bone('Canela_'+side,leg,0,-.43,0);
  limbs[side]={arm,fore:forearm,hand,leg,shin};parts.push([side<0?upper:upper.clone(),arm],[side<0?fore:fore.clone(),forearm],[thighGeometry(o,side),leg],[shinGeometry(o,side),shin]);
 }
 return {bones,parts,rig:{hips,torso,head,limbs},head:headGeometry(o)};
}

export function createPeople(){
 const material=new THREE.MeshStandardMaterial({name:'Pessoas_boxes',vertexColors:true,roughness:.72});let backMaterial=null;
 // One skinned mesh per body (every vertex follows a single bone) plus the head, so
 // the head can give way to the driver's helmet.
 function person(outfit,{shadows=true}={}){
  const o={...BASE,...outfit},{bones,parts,rig,head}=skeletonFor(o),root=new THREE.Group();root.name='Pessoa_boxes';rig.hips.updateMatrixWorld(true);
  const geometry=merge(parts.map(([g,b])=>{g.applyMatrix4(b.matrixWorld);const n=g.attributes.position.count,index=new Uint16Array(n*4),weight=new Float32Array(n*4),k=bones.indexOf(b);for(let i=0;i<n;i++){index[i*4]=k;weight[i*4]=1;}
   g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));return g;}));
  const body=new THREE.SkinnedMesh(geometry,material);body.name='Corpo';body.castShadow=shadows;body.add(rig.hips);root.add(body);body.bind(new THREE.Skeleton(bones));
  const face=new THREE.Mesh(head,material);face.name='Cabeca';face.castShadow=shadows;rig.head.add(face);
  // The 99 on the back sits below the white band round the chest (.34-.40 m).
  if(o.back){backMaterial??=new THREE.MeshStandardMaterial({name:'Macacao_costas_99',map:crewBack(),transparent:true,roughness:.7,polygonOffset:true,polygonOffsetFactor:-1});const decal=new THREE.Mesh(new THREE.PlaneGeometry(.22,.22),backMaterial);decal.position.set(-.114-.03*o.belly,.215,0);decal.rotation.y=-Math.PI/2;rig.torso.add(decal);}
  root.userData={head:face,rig,pose:clonePose(POSES.stand)};applyPose(rig,root.userData.pose);return root;
 }
 // Props carried by the crew, in the same vertex-coloured material.
 function prop(parts,parent,name){const m=new THREE.Mesh(merge(parts),material);m.name=name;m.castShadow=true;parent.add(m);return m;}
 // Static people posed and merged into one mesh: café customers, rival crews, the
 // pit wall stand and the terrace.
 function bake(entries){
  if(!entries.length)return null;const parts=[],anchor=new THREE.Group();
  for(const e of entries){
   const {parts:pieces,rig,head}=skeletonFor({...BASE,...e.outfit}),pose=clonePose(POSES[e.pose]??POSES.stand);if(e.turn)pose.turn=e.turn;
   anchor.position.set(e.x,e.y,e.z);anchor.rotation.set(0,e.yaw,0);anchor.add(rig.hips);applyPose(rig,pose);anchor.updateMatrixWorld(true);
   for(const [g,b] of pieces)parts.push(g.applyMatrix4(b.matrixWorld));parts.push(head.applyMatrix4(rig.head.matrixWorld));anchor.remove(rig.hips);
  }
  const mesh=new THREE.Mesh(mergeGeometries(parts,false),material);parts.forEach(g=>g.dispose());mesh.name='Pessoas_paradas_boxes';mesh.castShadow=mesh.receiveShadow=true;return mesh;
 }
 return {material,person,prop,bake};

}

// One animated person: walks or jogs to a target spot, turns to face its heading,
// settles into a pose and layers small work movements on top.
class Actor{
 constructor(person,x,y,yaw){this.person=person;this.x=x;this.y=y;this.yaw=yaw;this.speed=0;this.phase=0;this.t=Math.random()*9;this.act=null;this.look=0;this.target={x,y,yaw,pose:'stand'};this.show=clonePose(person.userData.pose);}
 go(x,y,yaw,pose,pass=false){Object.assign(this.target,{x,y,yaw,pose,pass});}
 step(dt,ground){
  const dx=this.target.x-this.x,dy=this.target.y-this.y,dist=Math.hypot(dx,dy),p=this.person.userData.pose;this.t+=dt;let moving=0;
  if(dist>.05){const want=this.target.pass?3.2:Math.min(dist>2.5?3.6:1.7,dist*3+.3);this.speed+=(want-this.speed)*Math.min(1,dt*6);const len=Math.min(dist,this.speed*dt);this.x+=dx/dist*len;this.y+=dy/dist*len;this.yaw+=wrap(Math.atan2(dy,dx)-this.yaw)*Math.min(1,dt*10);moving=Math.min(1,this.speed/1.1);this.phase+=len*(this.speed>2.3?3.2:4.3);}
  else{this.speed=0;this.yaw+=wrap(this.target.yaw-this.yaw)*Math.min(1,dt*6);}
  blendPose(p,POSES[this.target.pose]??POSES.stand,1-Math.exp(-dt*7));
  if(moving>.05)gait(p,this.phase,moving,this.speed>2.3);
  // Work movements and breathing go on a copy, so they never build up in the pose.
  const s=this.show,t=this.t;copyPose(s,p);s.turn+=this.look;s.y+=Math.sin(t*1.7)*.004;s.lean+=Math.sin(t*1.7)*.01;
  if(moving<=.05){
   if(this.act==='gun'){s.elbow[1]+=Math.sin(t*38)*.06;s.lean+=Math.sin(t*3)*.02;}
   else if(this.act==='wrench'){s.arm[1]+=Math.sin(t*6)*.18;s.elbow[1]+=Math.sin(t*6+1)*.25;s.arm[0]+=Math.sin(t*2.3)*.06;}
   else if(this.act==='fuel')s.arm[0]+=Math.sin(t*2)*.03;
   else if(this.act==='wave')s.spread[1]+=Math.sin(t*9)*.35;
   else if(this.act==='wipe'){s.arm[1]+=Math.sin(t*4)*.14;s.spread[1]+=Math.cos(t*4)*.18;}
  }
  applyPose(this.person.userData.rig,s);this.person.position.set(this.x,ground(this.x,this.y),-this.y);this.person.rotation.y=this.yaw;
 }
}

// Walking round the car, never through it: the shortest way past the corners of its
// footprint (car frame: forward, right; metres, with a margin). `keep` favours the
// corner taken last time so a detour does not flip sides halfway.
const CAR_HALF=[2.75,1.25];
function crossesBox(p,q,hx,hy){
 let t0=0,t1=1;const dx=q[0]-p[0],dy=q[1]-p[1];
 for(const [a,b] of [[-dx,p[0]+hx],[dx,hx-p[0]],[-dy,p[1]+hy],[dy,hy-p[1]]]){
  if(a===0){if(b<0)return false;continue;}const r=b/a;
  if(a<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}
 }
 return t0<t1;
}
function detour(a,t,keep){
 const [hx,hy]=CAR_HALF;
 if(Math.abs(a[0])<hx&&Math.abs(a[1])<hy)return hy-Math.abs(a[1])<hx-Math.abs(a[0])?{point:[a[0],Math.sign(a[1]||-1)*(hy+.35)],corner:-1}:{point:[Math.sign(a[0]||1)*(hx+.35),a[1]],corner:-1};
 if(!crossesBox(a,t,hx-.05,hy-.05))return null;
 const nodes=[a,...[[1,1],[1,-1],[-1,-1],[-1,1]].map(([i,j])=>[i*(hx+.3),j*(hy+.3)]),t],n=nodes.length,dist=Array(n).fill(Infinity),prev=Array(n).fill(-1),done=Array(n).fill(false);dist[0]=0;
 for(;;){
  let u=-1;for(let i=0;i<n;i++)if(!done[i]&&dist[i]<Infinity&&(u<0||dist[i]<dist[u]))u=i;if(u<0||u===n-1)break;done[u]=true;
  for(let v=1;v<n;v++)if(!done[v]&&!crossesBox(nodes[u],nodes[v],hx-.05,hy-.05)){const w=Math.hypot(nodes[u][0]-nodes[v][0],nodes[u][1]-nodes[v][1])-(u===0&&v===keep?.4:0);if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;}}
 }
 let v=n-1;if(prev[v]<0)return null;while(prev[v]!==0)v=prev[v];return {point:nodes[v],corner:v};
}

// Box 99 crew: [role, outfit extras, spot beside the car (forward, right of the car
// centre, metres), pose there]. Jobs send the matching mechanic to the part.
const ROLES=[
 ['Chefe_pirulito',{hat:'headset',skin:0xb77a55,mustache:true},[2.75,-1.5],'lollipop'],
 ['Macaco_dianteiro',{hat:'cap',skin:0x8d5a3b},[3.2,-.5],'ready'],
 ['Roda_dianteira',{hat:'helmet',hatColor:0xf2f2ee,skin:0xe0b08f},[1.53,-1.55],'ready'],
 ['Roda_traseira',{hat:'helmet',hatColor:0xf2f2ee,skin:0x6b4128},[-1.12,-1.55],'ready'],
 ['Gasolina',{hat:'cap',skin:0xc68e6a,hairStyle:'curly'},[-2.4,-1.45],'stand'],
 ['Mecanico',{hat:'cap',skin:0xd9a37f,mustache:true,belly:.6},[.25,-1.6],'ready'],
];
const JOBS={
 fuel:[[4,[-.7,1.55],'fuel','fuel']],
 motor:[[5,[2.85,.45],'work','wrench'],[1,[3.2,-.5],'jack']],
 cambio:[[5,[-.1,-1.45],'kneel','wrench']],
 freios:[[5,[1.53,1.42],'kneel','gun'],[1,[3.2,-.5],'jack']],
 suspensao:[[2,[1.53,-1.45],'kneel','gun'],[1,[3.2,-.5],'jack']],
 pneus:[[3,[-1.12,-1.45],'kneel','gun'],[5,[-1.12,1.42],'kneel','gun']],
 tanque:[[5,[-2.95,-.25],'kneel','wrench']],
};
export class PitCrew{
 // homes: [{x,y,yaw,pose}] in track coordinates (y north); ground(x,y) gives the floor height.
 constructor(people,{homes,ground}){
  this.root=new THREE.Group();this.root.name='Equipe_box99';this.ground=ground;this.homes=homes;
  this.actors=ROLES.map(([name,extra],i)=>{const person=people.person({...CREW,...extra});person.name=name;this.root.add(person);const h=homes[i];const a=new Actor(person,h.x,h.y,h.yaw);a.go(h.x,h.y,h.yaw,h.pose);return a;});
  const hand=i=>this.actors[i].person.userData.rig.limbs[1].hand;
  // Wheel guns, fuel dump can, spanner and the front jack.
  for(const i of [2,3,5]){const g=people.prop([piece(block(.09,.2,.1),0x2a2d30,[0,-.06,0]),piece(tube(.025,.025,.16,10),0xb9bec2,[0,-.22,0]),piece(block(.06,.1,.05),0xf0c419,[.07,-.02,0])],hand(i),'Pistola_pneumatica');if(i===5)this.gun=g;}
  // Dump can, origin at its handle; the spout tip is at SPOUT (filler at the right rear quarter).
  this.can=people.prop([piece(block(.34,.38,.18),0xc81d25,[-.02,-.26,0]),piece(block(.22,.03,.04),0x2a2d30,[0,-.02,0]),piece(block(.03,.06,.04),0x2a2d30,[-.1,-.05,0]),piece(block(.03,.06,.04),0x2a2d30,[.1,-.05,0]),piece(tube(.024,.024,.34,8),0x2a2d30,[.27,-.21,0],[0,0,-2.27]),piece(tube(.032,.032,.04,8),0xf0c419,[-.12,-.06,.05])],this.root,'Galao_gasolina');
  this.spout=new THREE.Vector3(.4,-.31,0);this.filler=new THREE.Vector3();
  this.spanner=people.prop([piece(block(.03,.28,.015),0xc9ced2,[0,-.12,0])],hand(5),'Chave_boca');
  const jack=this.actors[1].person;people.prop([piece(block(.9,.14,.3),0xc81d25,[1.3,.12,0]),piece(tube(.06,.06,.04,12),0x2a2d30,[1.7,.07,.14],[Math.PI/2,0,0]),piece(tube(.06,.06,.04,12),0x2a2d30,[1.7,.07,-.14],[Math.PI/2,0,0]),piece(block(.2,.04,.24),0x3a3f44,[1.72,.21,0]),piece(tube(.022,.022,.85,8),0xb9bec2,[.74,.6,0],[0,0,.28])],jack,'Macaco_jacare');
  // Lollipop: the pole follows the chief's right hand; the disc turns to the driver.
  this.discs={stop:new THREE.MeshBasicMaterial({map:lollipop('FREIO','#c81d25'),transparent:true,side:THREE.DoubleSide}),go:new THREE.MeshBasicMaterial({map:lollipop('ENGATA\n1ª','#1f8a3b'),transparent:true,side:THREE.DoubleSide})};
  this.pole=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,1,8),people.material);this.pole.geometry.deleteAttribute('uv');
  const colors=new Float32Array(this.pole.geometry.attributes.position.count*3).fill(.12);this.pole.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  this.disc=new THREE.Mesh(new THREE.CircleGeometry(.23,28),this.discs.stop);this.root.add(this.pole,this.disc);
  this.handPos=new THREE.Vector3();this.poleDir=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);this.visible=true;
 }
 update(dt,{car,active,job,finished,departing,near}){
  this.root.visible=near;if(!near)return;
  const h=car.heading,cos=Math.cos(h),sin=Math.sin(h),toWorld=(f,r)=>[car.x+cos*f+sin*r,car.y+sin*f-cos*r];
  const facing=(f,r)=>{const [x,y]=toWorld(f,r),[tx,ty]=toWorld(Math.max(-2,Math.min(2,f)),Math.max(-.5,Math.min(.5,r)));return Math.atan2(ty-y,tx-x);};
  const tasks=new Map((active?JOBS[job]??[]:[]).map(([role,at,pose,act])=>[role,{at,pose,act}]));
  const local=(x,y)=>{const dx=x-car.x,dy=y-car.y;return [dx*cos+dy*sin,dx*sin-dy*cos];},parked=Math.hypot(car.vx??0,car.vy??0)<1;
  this.actors.forEach((actor,i)=>{
   let x,y,yaw,pose;
   if(active){const [,,ready,idle]=ROLES[i],task=tasks.get(i),at=task?.at??ready;[x,y]=toWorld(...at);yaw=facing(...at);pose=task?.pose??(i===0?'lollipop':idle);actor.act=task?.act??null;}
   else{const home=this.homes[i];({x,y,yaw,pose}=home);if(i===0&&departing)pose='wave';actor.act=i===0&&departing?'wave':null;}
   // Round the parked car rather than through it.
   const way=parked&&Math.hypot(actor.x-car.x,actor.y-car.y)<12?detour(local(actor.x,actor.y),local(x,y),actor.corner):null;
   if(way){actor.corner=way.corner;const [wx,wy]=toWorld(...way.point);actor.go(wx,wy,Math.atan2(wy-actor.y,wx-actor.x),'stand',true);actor.act=null;}
   else{actor.corner=-1;actor.go(x,y,yaw,pose);}
   actor.step(dt,this.ground);
  });
  // The can: spout in the filler while refuelling, otherwise hanging from the right hand.
  const fuel=this.actors[4];fuel.person.updateMatrixWorld(true);
  if(active&&fuel.act==='fuel'&&Math.hypot(fuel.target.x-fuel.x,fuel.target.y-fuel.y)<.2){
   const [fx,fy]=toWorld(-.7,.79),turn=Math.atan2(fy-fuel.y,fx-fuel.x);this.filler.set(fx,this.ground(fx,fy)+.9,-fy);
   this.can.rotation.set(0,turn,-.35);this.can.position.copy(this.filler).sub(this.spout.clone().applyEuler(this.can.rotation));
  }else{fuel.person.userData.rig.limbs[1].hand.getWorldPosition(this.can.position);this.can.rotation.set(0,fuel.yaw,0);}
  if(this.gun)this.gun.visible=this.actors[5].act==='gun';this.spanner.visible=!this.gun?.visible;
  // Pole along the hand, disc square to the driver (or to the lane when idle).
  const chief=this.actors[0],hand=chief.person.userData.rig.limbs[1].hand;chief.person.updateMatrixWorld(true);
  hand.getWorldPosition(this.handPos);this.poleDir.set(0,-1,0).transformDirection(hand.matrixWorld);
  this.pole.position.copy(this.handPos).addScaledVector(this.poleDir,.35);this.pole.scale.y=1.2;this.pole.quaternion.setFromUnitVectors(this.up,this.poleDir);
  this.disc.position.copy(this.handPos).addScaledVector(this.poleDir,.95);this.disc.rotation.set(0,active?h-Math.PI/2:chief.yaw+Math.PI/2,0);
  this.disc.material=finished?this.discs.go:this.discs.stop;
 }
}

// The Tia: turns to a customer coming close, waves, serves what was bought and
// wipes the counter in between.
export class CafeHost{
 constructor(people,{x,y,yaw,ground}){this.actor=new Actor(people.person(OUTFITS.tia),x,y,yaw);this.actor.person.name='Tia_da_lanchonete';this.home={x,y,yaw};this.ground=ground;this.greeted=false;this.wave=0;this.idle=0;}
 get root(){return this.actor.person;}
 update(dt,{hero,walking,snack,near}){
  this.root.visible=near;if(!near)return;
  const a=this.actor,dx=hero?hero.x-a.x:0,dy=hero?-hero.z-a.y:0,dist=walking?Math.hypot(dx,dy):99;
  if(dist<3.4&&!this.greeted){this.greeted=true;this.wave=1.8;}if(dist>6)this.greeted=false;
  this.wave=Math.max(0,this.wave-dt);this.idle=(this.idle+dt)%9;
  const look=dist<6?wrap(Math.atan2(dy,dx)-this.home.yaw):0,yaw=this.home.yaw+Math.max(-.8,Math.min(.8,look))*.6;
  const pose=snack>2.4?'serve':this.wave>0?'wave':this.idle>5.5?'wipe':'stand';
  a.look+=(Math.max(-.6,Math.min(.6,look*.5))-a.look)*Math.min(1,dt*4);
  a.go(this.home.x,this.home.y,yaw,pose);a.act=pose==='wave'?'wave':pose==='wipe'?'wipe':null;a.step(dt,this.ground);
 }
}
