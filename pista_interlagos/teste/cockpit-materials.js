import * as THREE from 'three';

// Interior surfaces of the Opala 99 cockpit. Photo-scanned CC0 maps (see
// assets/texturas/interior/creditos.txt) are laid out in real metres, and the
// instruments, labels and stickers are drawn on canvases. Three.js uploads the
// maps only when the cockpit is first drawn, so the external cameras pay nothing.
const DIR='./assets/texturas/interior/';
const loader=new THREE.TextureLoader();

// Geometry UVs in metres: planar per dominant normal (boxes) or along a tube.
export function boxUV(geometry){
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
 for(let i=0;i<p.count;i++){
  const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
  if(ax>=ay&&ax>=az)uv.setXY(i,p.getZ(i)*Math.sign(n.getX(i)),p.getY(i));
  else if(ay>=az)uv.setXY(i,p.getX(i),p.getZ(i)*Math.sign(n.getY(i)));
  else uv.setXY(i,p.getX(i)*-Math.sign(n.getZ(i)),p.getY(i));
 }
 uv.needsUpdate=true;return geometry;
}
export function tubeUV(geometry,radius,length){
 const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*2*radius,uv.getY(i)*length);
 uv.needsUpdate=true;return geometry;
}

function scanned(name,tile,{rough=true}={}){
 const load=(suffix,color)=>{const t=loader.load(`${DIR}${name}_${suffix}.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/tile,1/tile);t.anisotropy=8;if(color)t.colorSpace=THREE.SRGBColorSpace;return t;};
 return {map:load('diff',true),normalMap:load('nor_gl'),...(rough?{roughnessMap:load('rough')}:{})};
}

// Fine paint "orange peel" as a normal map, generated once from value noise.
function paintNormal(size=128,strength=2.2){
 const h=new Float32Array(size*size),rand=new Float32Array(33*33);
 for(let i=0;i<rand.length;i++)rand[i]=Math.random();
 const cell=size/32,at=(x,y)=>rand[(y%32)*33+(x%32)];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const gx=x/cell,gy=y/cell,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const top=at(ix,iy)+(at(ix+1,iy)-at(ix,iy))*sx,bottom=at(ix,iy+1)+(at(ix+1,iy+1)-at(ix,iy+1))*sx;
  h[y*size+x]=top+(bottom-top)*sy+Math.random()*.08;
 }
 const data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const H=(u,v)=>h[((v+size)%size)*size+(u+size)%size];
  const dx=(H(x+1,y)-H(x-1,y))*strength,dy=(H(x,y+1)-H(x,y-1))*strength,l=Math.hypot(dx,dy,1),i=(y*size+x)*4;
  data[i]=(-dx/l*.5+.5)*255;data[i+1]=(-dy/l*.5+.5)*255;data[i+2]=(1/l*.5+.5)*255;data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/.06,1/.06);t.needsUpdate=true;return t;
}

// What the cabin reflects: dark trim all round and bright glass ahead and to the
// sides, instead of the open sky. The cockpit turns it with the car (envMapRotation).
export function cabinEnvironment(renderer){
 const scene=new THREE.Scene(),add=(geometry,color,p,rotation=[0,0,0])=>{const o=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));o.position.set(...p);o.rotation.set(...rotation);scene.add(o);};
 add(new THREE.BoxGeometry(3,1.5,1.6),0x4a4e52,[0,0,0]);
 add(new THREE.PlaneGeometry(3,1.6),0x2c2e30,[0,-.74,0],[Math.PI/2,0,0]);
 const sky=new THREE.Color(0xc9dcef).multiplyScalar(3),side=new THREE.Color(0xa9bfd4).multiplyScalar(2.2);
 add(new THREE.PlaneGeometry(1.3,.55),sky,[1.49,.3,0],[0,-Math.PI/2,0]);
 add(new THREE.PlaneGeometry(1.1,.3),side.clone().multiplyScalar(.7),[-1.49,.35,0],[0,Math.PI/2,0]);
 for(const z of [-.79,.79])add(new THREE.PlaneGeometry(1.6,.45),side,[-.1,.3,z]);
 const pmrem=new THREE.PMREMGenerator(renderer),texture=pmrem.fromScene(scene,.02).texture;pmrem.dispose();
 return texture;
}

export function createInteriorMaterials(renderer){
 const peel=paintNormal(),envMap=renderer?cabinEnvironment(renderer):null;
 // Without the cabin map, most of the sky is hidden: reflections are scaled down.
 const inside=envMap?1:.4;
 const vinyl=scanned('couro_painel',.32),suede=scanned('camurca',.14),brushed=scanned('aluminio_escovado',.55);
 const tread=scanned('chapa_xadrez',.42),rubber=scanned('borracha',.5,{rough:false}),carbon=scanned('carbono',.075,{rough:false});
 const materials={
  // Leather-grain moulded dash, as on the original Opala panel.
  dash:new THREE.MeshStandardMaterial({...vinyl,color:0xd8d8d8,roughness:.95,normalScale:new THREE.Vector2(.8,.8),envMapIntensity:inside}),
  seatVinyl:new THREE.MeshStandardMaterial({...vinyl,color:0xd0d0d0,roughness:.92,normalScale:new THREE.Vector2(.35,.35),envMapIntensity:inside*.6}),
  // Resin-coated twill weave for the instrument pod.
  carbon:new THREE.MeshPhysicalMaterial({...carbon,color:0x6d7075,roughness:.42,metalness:.15,clearcoat:1,clearcoatRoughness:.06,normalScale:new THREE.Vector2(.7,.7),envMapIntensity:.7}),
  // Brushed aluminium door cards and seat brackets.
  aluminium:new THREE.MeshStandardMaterial({...brushed,color:0xc9ccce,metalness:.85,roughness:.55,envMapIntensity:.95}),
  // Aluminium tread plate on the floor.
  tread:new THREE.MeshStandardMaterial({...tread,color:0xc4c2bd,metalness:.85,roughness:.8,envMapIntensity:.3}),
  // Ribbed rubber over the tunnel and in the footwell.
  rubber:new THREE.MeshStandardMaterial({...rubber,color:0xdcdcdc,roughness:.9,envMapIntensity:.25}),
  // Suede: steering wheel rim and seat centres, with a soft fabric sheen.
  suede:new THREE.MeshPhysicalMaterial({...suede,color:0x6a6a6a,roughness:1,sheen:1,sheenColor:new THREE.Color(0x707070),sheenRoughness:.55,envMapIntensity:.2}),
  // Satin black body paint (roof, firewall, bulkheads) and the painted cage.
  body:new THREE.MeshStandardMaterial({color:0x2c3033,roughness:.62,metalness:.2,normalMap:peel,normalScale:new THREE.Vector2(.18,.18),envMapIntensity:inside}),
  cage:new THREE.MeshPhysicalMaterial({color:0x2b2f32,roughness:.45,metalness:.3,clearcoat:.5,clearcoatRoughness:.35,normalMap:peel,normalScale:new THREE.Vector2(.12,.12),envMapIntensity:.55}),
  // Gloss black hood seen through the windscreen.
  hood:new THREE.MeshPhysicalMaterial({color:0x0b0c0d,roughness:.28,metalness:.4,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1}),
  // Moulded fibreglass seat shell and plastic housings.
  shell:new THREE.MeshPhysicalMaterial({color:0x1a1d20,roughness:.35,clearcoat:.8,clearcoatRoughness:.2,envMapIntensity:.5}),
  plastic:new THREE.MeshStandardMaterial({color:0x25282b,roughness:.7,envMapIntensity:inside}),
  foam:new THREE.MeshStandardMaterial({color:0x1e2022,roughness:1,normalMap:suede.normalMap,normalScale:new THREE.Vector2(1.2,1.2),envMapIntensity:.15}),
  webbing:new THREE.MeshStandardMaterial({color:0x151618,roughness:.95,normalMap:suede.normalMap,normalScale:new THREE.Vector2(.8,.8),envMapIntensity:.15}),
  // Gloss red cylinder with a clear lacquer, like the real extinguisher.
  extinguisher:new THREE.MeshPhysicalMaterial({color:0xb3121a,roughness:.3,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.8}),
  // Instrument lenses: faint, sharp reflections over the faces.
  glass:new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.04,metalness:0,transparent:true,opacity:.12,clearcoat:1,envMapIntensity:1.6,depthWrite:false})
 };
 // Everything but the hood (outside the windscreen) reflects the cabin.
 if(envMap)for(const [name,material] of Object.entries(materials))if(name!=='hood'){material.envMap=envMap;material.envMapIntensity*=1.5;}
 return {...materials,envMap};
}

export function canvasTexture(width,height,draw,{anisotropy=4}={}){
 const c=document.createElement('canvas');c.width=width;c.height=height;draw(c.getContext('2d'),width,height);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=anisotropy;return t;
}

// Classic black-face instrument: needle angle 0 at 7:30 sweeping 270° clockwise.
export const GAUGE_START=-225,GAUGE_SWEEP=270;
export function gaugeTexture({title,subtitle='',min=0,max,major,minor,labels=v=>String(v),red=null,size=512}){
 return canvasTexture(size,size,(ctx,s)=>{
  const c=s/2,k=s/512;ctx.translate(c,c);
  const face=ctx.createRadialGradient(0,-40*k,10*k,0,0,c);face.addColorStop(0,'#1d2226');face.addColorStop(.72,'#121518');face.addColorStop(.93,'#07090a');face.addColorStop(1,'#020303');
  ctx.fillStyle=face;ctx.fillRect(-c,-c,s,s);
  const angle=v=>(GAUGE_START+GAUGE_SWEEP*(v-min)/(max-min))*Math.PI/180;
  if(red){ctx.beginPath();ctx.arc(0,0,196*k,angle(red),angle(max));ctx.lineWidth=18*k;ctx.strokeStyle='#c81d22';ctx.stroke();}
  ctx.beginPath();ctx.arc(0,0,214*k,angle(min),angle(max));ctx.lineWidth=2.2*k;ctx.strokeStyle='#cfd2cc';ctx.stroke();
  for(let v=min;v<=max+1e-6;v+=minor){
   const isMajor=Math.abs((v-min)/major-Math.round((v-min)/major))<1e-6,a=angle(v),inner=isMajor?168:190;
   ctx.beginPath();ctx.moveTo(Math.cos(a)*inner*k,Math.sin(a)*inner*k);ctx.lineTo(Math.cos(a)*212*k,Math.sin(a)*212*k);
   ctx.lineWidth=(isMajor?7:2.6)*k;ctx.strokeStyle=red&&v>red+1e-6?'#ff5a4e':'#eceee6';ctx.stroke();
   if(isMajor){ctx.fillStyle='#f1f2ea';ctx.font=`600 ${58*k}px "Arial Narrow",Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(labels(Math.round(v*100)/100),Math.cos(a)*128*k,Math.sin(a)*128*k);}
  }
  ctx.fillStyle='#d9dbd3';ctx.textAlign='center';ctx.font=`600 ${Math.min(30,300/title.length)*k}px Arial,sans-serif`;ctx.fillText(title,0,-58*k);
  if(subtitle){ctx.fillStyle='#8f959a';ctx.font=`${Math.min(24,330/subtitle.length)*k}px Arial,sans-serif`;ctx.fillText(subtitle,0,160*k);}
  // Shadow the bezel throws on the face.
  const rim=ctx.createRadialGradient(0,0,200*k,0,0,c);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(1,'rgba(0,0,0,.75)');ctx.fillStyle=rim;ctx.fillRect(-c,-c,s,s);
 },{anisotropy:8});
}

// Seven-segment LCD: unlit segments stay faintly visible, as on the real display.
const SEGMENTS={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};
export function drawSegments(ctx,text,x,y,height,lit,unlit){
 const w=height*.5,t=height*.12,g=t*.18;
 const bars={a:[0,0,1,0],b:[1,0,1,.5],c:[1,.5,1,1],d:[0,1,1,1],e:[0,.5,0,1],f:[0,0,0,.5],g:[0,.5,1,.5]};
 [...text].forEach((ch,i)=>{
  const ox=x+i*(w+height*.28);
  for(const [name,[x0,y0,x1,y1]] of Object.entries(bars)){
   const on=(SEGMENTS[ch]??'').includes(name);ctx.fillStyle=on?lit:unlit;
   const ax=ox+x0*w-y0*height*.06,ay=y+y0*height,bx=ox+x1*w-y1*height*.06,by=y+y1*height,horizontal=y0===y1;
   ctx.beginPath();
   if(horizontal){ctx.moveTo(ax+g,ay);ctx.lineTo(ax+t/2+g,ay-t/2);ctx.lineTo(bx-t/2-g,by-t/2);ctx.lineTo(bx-g,by);ctx.lineTo(bx-t/2-g,by+t/2);ctx.lineTo(ax+t/2+g,ay+t/2);}
   else{ctx.moveTo(ax,ay+g);ctx.lineTo(ax+t/2,ay+t/2+g);ctx.lineTo(bx+t/2,by-t/2-g);ctx.lineTo(bx,by-g);ctx.lineTo(bx-t/2,by-t/2-g);ctx.lineTo(ax-t/2,ay+t/2+g);}
   ctx.closePath();ctx.fill();
  }
 });
}

// Engraved labels and the stickers every scrutineered race car carries.
export function labelStrip(labels,{width=512,height=64,color='#e9e9e2',background='#15181a',font=22}={}){
 return canvasTexture(width,height,(ctx,w,h)=>{
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.fillStyle=color;ctx.font=`700 ${font}px Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  labels.forEach((text,i)=>ctx.fillText(text,(i+.5)*w/labels.length,h/2));
 });
}
export function cutOffSticker(){
 return canvasTexture(256,224,(ctx,w,h)=>{
  const tri=(inset,color)=>{ctx.beginPath();ctx.moveTo(w/2,inset*1.2);ctx.lineTo(w-inset,h-inset*.6);ctx.lineTo(inset,h-inset*.6);ctx.closePath();ctx.fillStyle=color;ctx.fill();};
  ctx.clearRect(0,0,w,h);tri(4,'#ffffff');tri(20,'#1d4fa8');
  ctx.beginPath();ctx.moveTo(140,62);ctx.lineTo(102,136);ctx.lineTo(128,136);ctx.lineTo(112,192);ctx.lineTo(158,112);ctx.lineTo(132,112);ctx.lineTo(150,62);ctx.closePath();ctx.fillStyle='#e0262b';ctx.fill();
 });
}
export function extinguisherLabel(){
 return canvasTexture(512,256,(ctx,w,h)=>{
  ctx.fillStyle='#f3f1ea';ctx.fillRect(0,0,w,h);ctx.fillStyle='#b3121a';ctx.fillRect(0,0,w,58);
  ctx.fillStyle='#ffffff';ctx.font='900 40px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('EXTINTOR',w/2,31);
  ctx.fillStyle='#1b1d1f';ctx.font='700 34px Arial,sans-serif';ctx.fillText('PÓ QUÍMICO ABC · 2 kg',w/2,100);
  ctx.font='24px Arial,sans-serif';ctx.fillText('Classes A · B · C   —   Uso em competição',w/2,146);
  ctx.fillStyle='#6d7176';ctx.font='20px Arial,sans-serif';ctx.fillText('Recarga: 09/2026   ·   Lacre nº 0099',w/2,190);
  ctx.strokeStyle='#b3121a';ctx.lineWidth=6;ctx.strokeRect(10,64,w-20,h-74);
 });
}
export function embroidery(text,{width=256,height=96,color='#c4161f',background='rgba(0,0,0,0)'}={}){
 return canvasTexture(width,height,(ctx,w,h)=>{
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.fillStyle=color;ctx.font=`italic 900 ${h*.52}px Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowOffsetY=2;ctx.shadowBlur=2;ctx.fillText(text,w/2,h/2+2);
 });
}
