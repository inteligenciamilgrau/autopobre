import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,wrap,guardrailSections,guardrailClearance} from './physics.js';
import {sceneryBands,bandClearance} from './track-clearance.js';
import {canvasTexture} from './pit-textures.js';
import {createPeople} from './pit-crew.js';

// What makes a circuit look run by people on race day: sponsor banners tied to the
// guardrails, marshal posts with their flags, and TV camera towers on the outside of
// the corners (which the TV camera also films from). Sponsors are fictional, taken
// from the game's own world. Game art, not a survey of the real circuit.

// One banner design per row of the atlas: [background, text, accent, words].
const SPONSORS=[
 ['#b3161d','#f6f1e4','#f0c419','AUTO-POBRE RACING'],
 ['#12351f','#f0c419','#f6f1e4','OLD STOCK · INTERLAGOS'],
 ['#f0c419','#1a1a1a','#b3161d','PNEUS PAULISTA · RECAPAGEM'],
 ['#1b2a4a','#f6f1e4','#e8702a','POSTO 99 · ADITIVADA'],
 ['#f6f1e4','#b3161d','#1b2a4a','LANCHONETE DA TIA'],
 ['#1a1a1a','#e8702a','#f6f1e4','RETÍFICA DO ZÉ'],
 ['#0f5f58','#f6f1e4','#f0c419','SEIVA · DANILO VEÍCULOS'],
 ['#e8702a','#1a1a1a','#f6f1e4','OFICINA DA BLAZER']
];
const ROWS=SPONSORS.length,BANNER_TILE=7.5,BANNER_LOW=.37,BANNER_HIGH=.87,BANNER_FRONT=.118;
function bannerAtlas(){
 return canvasTexture((ctx,w,h)=>{
  const rowH=h/ROWS;
  SPONSORS.forEach(([bg,fg,accent,words],i)=>{
   const y=i*rowH;ctx.fillStyle=bg;ctx.fillRect(0,y,w,rowH);
   ctx.fillStyle=accent;ctx.fillRect(0,y+rowH*.08,w,rowH*.06);ctx.fillRect(0,y+rowH*.86,w,rowH*.06);
   ctx.font=`900 ${Math.round(rowH*.5)}px "Arial Black","Arial Bold",Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillStyle=fg;ctx.fillText(words,w/2,y+rowH*.52,w*.9);
   // Grommets and a little road dirt on the lower edge.
   ctx.fillStyle='rgba(0,0,0,.35)';for(let x=w*.03;x<w;x+=w*.12){ctx.beginPath();ctx.arc(x,y+rowH*.2,rowH*.035,0,7);ctx.fill();}
   const dirt=ctx.createLinearGradient(0,y+rowH,0,y+rowH*.55);dirt.addColorStop(0,'rgba(60,50,38,.45)');dirt.addColorStop(1,'rgba(60,50,38,0)');ctx.fillStyle=dirt;ctx.fillRect(0,y+rowH*.55,w,rowH*.45);
  });
 },1024,ROWS*96);
}

// Vertex-coloured parts merged into one mesh.
function tinted(geometry,color,matrix){
 const g=(geometry.index?geometry.toNonIndexed():geometry).applyMatrix4(matrix);g.deleteAttribute('uv');
 const c=new THREE.Color(color),n=g.attributes.position.count,rgb=new Float32Array(n*3);for(let i=0;i<n;i++)rgb.set([c.r,c.g,c.b],i*3);
 g.setAttribute('color',new THREE.BufferAttribute(rgb,3));return g;
}
const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(1,1,1),P=new THREE.Vector3(),Y=new THREE.Vector3(0,1,0);
const place=(x,y,z,yaw=0,scale=[1,1,1])=>M.clone().compose(P.set(x,y,z),Q.clone().setFromAxisAngle(Y,yaw),S.clone().set(...scale));

function trackPoint(data,s){
 const a=data.samples,L=data.meta.reconstructed_xy_m;s=((s%L)+L)%L;let lo=0,hi=a.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}return {p:a[lo],i:lo};
}
function heading(p){return Math.atan2(p[8],p[7]);}
// Signed bend (rad per metre) around s: positive turns left.
function bend(data,s,span=22){return wrap(heading(trackPoint(data,s+span).p)-heading(trackPoint(data,s-span).p))/(2*span);}

// Outside of the sharper corners, clear of roads, pits and stands.
export function towerSpots(data,count=9){
 const L=data.meta.reconstructed_xy_m,bands=sceneryBands(data),candidates=[];
 for(let s=0;s<L;s+=6)candidates.push({s,k:bend(data,s)});
 candidates.sort((a,b)=>Math.abs(b.k)-Math.abs(a.k));
 const spots=[];
 for(const c of candidates){
  if(spots.length>=count)break;
  if(spots.some(t=>{const d=Math.abs(t.s-c.s);return Math.min(d,L-d)<260;}))continue;
  const side=c.k>0?-1:1;let spot=null;
  for(const shift of [0,-15,15,-30,30])for(const out of [17,23,30]){
   const s=c.s+shift,{p}=trackPoint(data,s),off=side*(p[4]/2+out),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   if(bandClearance(bands,x,y).distance>7){spot={s,side,x,y,p};break;}
  }
  if(spot)spots.push(spot);
 }
 return spots.sort((a,b)=>a.s-b.s);
}
export function marshalSpots(data){
 const L=data.meta.reconstructed_xy_m,bands=sceneryBands(data),spots=[];
 for(let s=140,k=0;s<L-60;s+=360,k++){
  const side=k%2?1:-1;
  for(const shift of [0,20,-20,40,-40]){
   const {p}=trackPoint(data,s+shift),off=side*(p[4]/2+guardrailClearance(data,p[0],side)+2.6),x=p[1]-p[8]*off,y=p[2]+p[7]*off;
   if(bandClearance(bands,x,y).distance>2.5){spots.push({s:s+shift,side,x,y,p});break;}
  }
 }
 return spots;
}

export function createTrackside(data){
 const root=new THREE.Group();root.name='Beira_de_pista';
 // Ground under a point beside the track: start the search from its track sample.
 const probe=new TestCar(data),ground=(x,y,i=probe.index)=>{probe.index=i;const q=probe.sample(x,y);probe.index=q.i;return q.z;};
 const parts=[],people=[];

 // Sponsor banners on the track face of the guardrails, in runs of a few tiles.
 const L=data.meta.reconstructed_xy_m,a=data.samples,positions=[],uvs=[],indices=[];let bannerMetres=0,runs=0;
 const rand=(()=>{let x=91;return()=>(x=x*16807%2147483647)/2147483647;})();
 const point=s=>{if(s>=L)return a[0];const {i}=trackPoint(data,s),p=a[i],q=a[(i+1)%a.length],u=(s-p[0])/((i===a.length-1?L:q[0])-p[0]);return p.map((v,k)=>k===0?s:v+(q[k]-v)*u);};
 for(const side of [-1,1])for(const [from,end] of guardrailSections(data,side)){
  const to=Math.min(end,L);
  for(let s=from+8;s<to-8;){
   const len=BANNER_TILE*(2+Math.floor(rand()*4)),stop=Math.min(to-8,s+len);
   if(rand()<.72&&stop-s>BANNER_TILE){
    const row=Math.floor(rand()*ROWS),v0=1-(row+1)/ROWS+.002,v1=1-row/ROWS-.002,base=positions.length/3;let count=0;
    for(let t=s;t<=stop+.01;t+=2){
     const p=point(Math.min(t,stop)),off=side*(p[4]/2+guardrailClearance(data,p[0],side)),x=p[1]-p[8]*off+p[8]*side*BANNER_FRONT,y=p[2]+p[7]*off-p[7]*side*BANNER_FRONT;
     probe.index=Math.min(a.length-1,Math.floor(p[0]/L*a.length));const z=ground(x,y),u=(Math.min(t,stop)-s)/BANNER_TILE*(side>0?1:-1);
     positions.push(x,z+BANNER_LOW,-y,x,z+BANNER_HIGH,-y);uvs.push(u,v0,u,v1);
     if(count>0){const k=base+(count-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}count++;
    }
    bannerMetres+=stop-s;runs++;
   }
   s=stop+BANNER_TILE*(rand()<.5?0:1);
  }
 }
 const bannerGeometry=new THREE.BufferGeometry();bannerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bannerGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));bannerGeometry.setIndex(indices);bannerGeometry.computeVertexNormals();
 const atlas=bannerAtlas();atlas.wrapS=THREE.RepeatWrapping;
 const banners=new THREE.Mesh(bannerGeometry,new THREE.MeshStandardMaterial({name:'Faixas_patrocinio',map:atlas,roughness:.62,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
 banners.name='Faixas_nos_guardrails';banners.receiveShadow=true;root.add(banners);

 // Marshal posts: a small white-and-orange shelter, a flag stand and the marshal.
 const marshals=marshalSpots(data);
 for(const m of marshals){
  // Local +x looks at the track (data x/y plane); three.js turns by the same angle about y.
  const z=ground(m.x,m.y,trackPoint(data,m.s).i),yaw=Math.atan2(-m.side*m.p[7],m.side*m.p[8]);
  const at=(dx,dz,dy=0)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return [m.x+dx*c-dz*s,z+dy,-(m.y+dx*s+dz*c)];};
  const [bx,by,bz]=at(-1.3,0);
  parts.push(tinted(new THREE.BoxGeometry(1.5,.12,2.2),0x6d6f6c,place(bx,by+.06,bz,yaw)));
  for(const [dx,dz] of [[-.7,-1],[-.7,1],[.7,-1],[.7,1]]){const [x,y,zz]=at(-1.3+dx,dz);parts.push(tinted(new THREE.CylinderGeometry(.035,.035,2.2,6),0xd9dcd8,place(x,y+1.16,zz)));}
  parts.push(tinted(new THREE.BoxGeometry(1.7,.08,2.4),0xe8702a,place(bx,by+2.3,bz,yaw)));
  const [wx,wy,wz]=at(-2.02,0);parts.push(tinted(new THREE.BoxGeometry(.05,1.1,2.2),0xe9ebe7,place(wx,wy+.7,wz,yaw)));
  // Yellow flag held out toward the track.
  const [fx,fy,fz]=at(.28,.28);parts.push(tinted(new THREE.CylinderGeometry(.012,.012,1.2,5),0x2b2b2b,place(fx,fy+1.35,fz)));
  const [gx,gy,gz]=at(.28,.52);parts.push(tinted(new THREE.PlaneGeometry(.46,.32),0xf2c318,place(gx,gy+1.78,gz,yaw+Math.PI/2)));
  // He follows the cars with his eyes, calls on the radio, shifts his weight (pit-crew.js).
  people.push({outfit:{top:0xe8702a,bottom:0xe8702a,trim:0xf4f1ea,hat:'cap',hatColor:0xf4f1ea,hands:0x2b2b2b},pose:'rest',idle:'marshal',x:m.x,y:z,z:-m.y,yaw});
 }

 // TV towers: scaffold, deck with rails, a cameraman under an umbrella.
 const towers=towerSpots(data).map(t=>{
  const {p,i}=trackPoint(data,t.s),z=ground(t.x,t.y,i),deck=4.6,look=Math.atan2(p[2]-t.y,p[1]-t.x);
  for(const [dx,dz] of [[-.9,-.9],[-.9,.9],[.9,-.9],[.9,.9]])parts.push(tinted(new THREE.CylinderGeometry(.045,.045,deck+1.1,6),0xb9bec0,place(t.x+dx,z+(deck+1.1)/2,-t.y+dz)));
  for(let h=1.2;h<deck;h+=1.15)for(const [dx,dz,r] of [[0,-.9,0],[0,.9,0],[-.9,0,Math.PI/2],[.9,0,Math.PI/2]]){
   const brace=new THREE.CylinderGeometry(.025,.025,2.55,5).rotateZ(Math.PI/4);parts.push(tinted(brace,0xa9aeb0,place(t.x+dx,z+h+.55,-t.y+dz,r)));
  }
  parts.push(tinted(new THREE.BoxGeometry(2.2,.1,2.2),0x7b7f7c,place(t.x,z+deck,-t.y)));
  for(const [dx,dz,r] of [[0,-1.08,0],[0,1.08,0],[-1.08,0,Math.PI/2],[1.08,0,Math.PI/2]])parts.push(tinted(new THREE.BoxGeometry(2.2,.05,.05),0xd6d8d4,place(t.x+dx,z+deck+1,-t.y+dz,r)));
  // Tripod aimed at the track and a big white-and-red umbrella behind it. The camera head
  // pans on the tripod with its cameraman, who films the nearest car (pit-crew.js).
  const cx=t.x+Math.cos(look)*.5,cz=-t.y-Math.sin(look)*.5,ux=t.x-Math.cos(look)*.75,uz=-t.y+Math.sin(look)*.75;
  parts.push(tinted(new THREE.CylinderGeometry(.03,.09,1.25,5),0x222222,place(cx,z+deck+.66,cz)));
  parts.push(tinted(new THREE.CylinderGeometry(.02,.02,2.3,5),0xcfcfcf,place(ux,z+deck+1.15,uz)));
  parts.push(tinted(new THREE.ConeGeometry(1.35,.5,10,1,true),0xf2efe7,place(ux,z+deck+2.35,uz)));
  people.push({outfit:{top:0x24292e,bottom:0x3a3f45,hat:'headset'},pose:'stand',idle:'camera',x:cx,y:z+deck+1.3,z:cz,yaw:look,camera:{x:cx,y:z+deck+1.3,z:cz,back:.62,drop:1.25}});
  // The broadcast view sits just in front of the lens, not inside the camera body.
  return {s:t.s,side:t.side,x:t.x,y:t.y,z:z+deck+1.45,position:new THREE.Vector3(cx+Math.cos(look)*.95,z+deck+1.5,cz-Math.sin(look)*.95)};
 });

 const structure=new THREE.Mesh(mergeGeometries(parts,false),new THREE.MeshStandardMaterial({name:'Postos_e_torres',vertexColors:true,roughness:.6,metalness:.25,side:THREE.DoubleSide}));
 parts.forEach(g=>g.dispose());structure.name='Postos_fiscais_e_torres_TV';structure.castShadow=structure.receiveShadow=true;root.add(structure);
 const crew=createPeople().crowd(people,{name:'Fiscais_e_cinegrafistas',cell:60,seed:3});if(crew)root.add(crew);
 return {root,towers,stats:{bannerRuns:runs,bannerMetres:Math.round(bannerMetres),marshals:marshals.length,towers:towers.length},
  clearings:[...marshals.map(m=>({x:m.x,y:m.y,r:4})),...towers.map(t=>({x:t.x,y:t.y,r:6}))]};
}
