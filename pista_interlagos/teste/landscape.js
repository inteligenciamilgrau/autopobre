import * as THREE from 'three';
import {clamp} from './physics.js';

// Land cover is read from the 2020 GeoSampa orthophoto already packed in the
// track GLB: woods become 3D trees, orange roofs become houses, dark smooth
// areas become water. This is a visual interpretation for the game, not a survey.
const FIELD_RANGE=80;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function random(seed){let s=(seed>>>0)||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const shared={time:{value:0}};

export function terrainHeight(data,x,y){
 const t=data.terrain,fx=clamp((x-t.x0)/t.step,0,t.nx-1.001),fy=clamp((y-t.y0)/t.step,0,t.ny-1.001),ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,k=iy*t.nx+ix;
 return (t.z[k]*(1-u)+t.z[k+1]*u)*(1-v)+(t.z[k+t.nx]*(1-u)+t.z[k+t.nx+1]*u)*v;
}

export async function loadTerrainTextures(renderer){
 const loader=new THREE.TextureLoader(),names=['grama_diff_v1','mato_diff_v1','brita_diff_v1','concreto_diff_v1','grama_nor_gl_v1'];
 const maps=await Promise.all(names.map(name=>loader.loadAsync(`./assets/texturas/${name}.jpg`)));
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 maps.forEach((map,i)=>{map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;if(i<4)map.colorSpace=THREE.SRGBColorSpace;});
 const [grass,wild,gravel,concrete,grassNormal]=maps;
 return {grass,wild,gravel,concrete,grassNormal,dispose(){maps.forEach(m=>m.dispose());}};
}

// Signed distance from every terrain texel to the asphalt edge (metres), plus
// the lateral offset used for mowing stripes. Rendering and scenery placement share it.
export function buildTrackField(data,resolution=1024){
 const t=data.terrain,x0=t.x0,y0=t.y0,width=(t.nx-1)*t.step,height=(t.ny-1)*t.step;
 const nx=resolution,ny=Math.max(2,Math.round(resolution*height/width)),sx=width/nx,sy=height/ny;
 const edge=new Float32Array(nx*ny).fill(FIELD_RANGE),side=new Float32Array(nx*ny).fill(FIELD_RANGE),water=new Float32Array(nx*ny),inside=new Uint8Array(nx*ny);
 const a=data.samples,n=a.length;
 for(let i=0;i<n;i++){
  const p=a[i],q=a[(i+1)%n],ax=p[1],ay=p[2],dx=q[1]-ax,dy=q[2]-ay,len2=Math.max(1e-6,dx*dx+dy*dy),reach=FIELD_RANGE+Math.max(p[4],q[4])/2;
  const i0=Math.max(0,Math.floor((Math.min(ax,q[1])-reach-x0)/sx)),i1=Math.min(nx-1,Math.ceil((Math.max(ax,q[1])+reach-x0)/sx));
  const j0=Math.max(0,Math.floor((Math.min(ay,q[2])-reach-y0)/sy)),j1=Math.min(ny-1,Math.ceil((Math.max(ay,q[2])+reach-y0)/sy));
  for(let j=j0;j<=j1;j++){
   const y=y0+(j+.5)*sy,row=j*nx;
   for(let k=i0;k<=i1;k++){
    const x=x0+(k+.5)*sx;let u=((x-ax)*dx+(y-ay)*dy)/len2;u=u<0?0:u>1?1:u;
    const ex=x-ax-u*dx,ey=y-ay-u*dy,e=Math.sqrt(ex*ex+ey*ey)-(p[4]+(q[4]-p[4])*u)/2,index=row+k;
    if(e<edge[index]){edge[index]=e;side[index]=ex*(p[9]+(q[9]-p[9])*u)+ey*(p[10]+(q[10]-p[10])*u);}
   }
  }
 }
 // Scanline fill of the closed centre line: the infield never receives houses.
 for(let j=0;j<ny;j++){
  const y=y0+(j+.5)*sy,cuts=[];
  for(let i=0;i<n;i++){const p=a[i],q=a[(i+1)%n];if((p[2]>y)!==(q[2]>y))cuts.push(p[1]+(y-p[2])/(q[2]-p[2])*(q[1]-p[1]));}
  cuts.sort((u,v)=>u-v);
  for(let c=0;c+1<cuts.length;c+=2){const k0=Math.max(0,Math.ceil((cuts[c]-x0)/sx-.5)),k1=Math.min(nx-1,Math.floor((cuts[c+1]-x0)/sx-.5));for(let k=k0;k<=k1;k++)inside[j*nx+k]=1;}
 }
 const texture=new THREE.DataTexture(new Uint16Array(nx*ny*4),nx,ny,THREE.RGBAFormat,THREE.HalfFloatType);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;
 const field={nx,ny,x0,y0,width,height,sx,sy,edge,side,water,inside,texture,
  cell(x,y){const k=Math.floor((x-x0)/sx),j=Math.floor((y-y0)/sy);return k<0||j<0||k>=nx||j>=ny?-1:j*nx+k;},
  upload(){const out=texture.image.data,h=THREE.DataUtils.toHalfFloat;for(let i=0;i<nx*ny;i++){out[i*4]=h(edge[i]);out[i*4+1]=h(side[i]);out[i*4+2]=h(water[i]);out[i*4+3]=h(inside[i]);}texture.needsUpdate=true;}
 };
 field.upload();
 return field;
}

// CPU copy of the orthophoto at ~1.15 m per pixel, with its UV projection
// fitted from the terrain mesh that carries it.
export function readOrtho(texture,geometry){
 const image=texture?.image;if(!image?.width||!geometry?.attributes.uv)return null;
 const w=Math.min(1400,image.width),h=Math.round(image.height*w/image.width);
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,w,h);
 const pixels=context.getImageData(0,0,w,h).data;canvas.width=canvas.height=1;
 const pos=geometry.attributes.position,uv=geometry.attributes.uv;let a=0,b=0,c=0,d=0;
 for(let i=1;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);if(x<pos.getX(a))a=i;if(x>pos.getX(b))b=i;if(z<pos.getZ(c))c=i;if(z>pos.getZ(d))d=i;}
 const ku=(uv.getX(b)-uv.getX(a))/(pos.getX(b)-pos.getX(a)),bu=uv.getX(a)-ku*pos.getX(a);
 const kv=(uv.getY(d)-uv.getY(c))/(pos.getZ(d)-pos.getZ(c)),bv=uv.getY(c)-kv*pos.getZ(c);
 const lum=new Float32Array(w*h);for(let i=0;i<w*h;i++)lum[i]=(.299*pixels[i*4]+.587*pixels[i*4+1]+.114*pixels[i*4+2])/255;
 // Local luminance variation separates flat water from textured canopies.
 const sum=new Float64Array((w+1)*(h+1)),sq=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=lum[y*w+x],i=(y+1)*(w+1)+x+1;sum[i]=v+sum[i-1]+sum[i-w-1]-sum[i-w-2];sq[i]=v*v+sq[i-1]+sq[i-w-1]-sq[i-w-2];}
 const rough=new Float32Array(w*h),r=2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const xa=Math.max(0,x-r),xb=Math.min(w,x+r+1),ya=Math.max(0,y-r),yb=Math.min(h,y+r+1),count=(xb-xa)*(yb-ya);
  const box=s=>s[yb*(w+1)+xb]-s[ya*(w+1)+xb]-s[yb*(w+1)+xa]+s[ya*(w+1)+xa],mean=box(sum)/count;
  rough[y*w+x]=Math.sqrt(Math.max(0,box(sq)/count-mean*mean));
 }
 return {w,h,pixels,lum,rough,
  index(x,y){const u=ku*x+bu,v=kv*(-y)+bv;return u<0||u>=1||v<0||v>=1?-1:Math.floor(v*h)*w+Math.floor(u*w);}};
}

export function landCover(ortho,i){
 const p=ortho.pixels,r=p[i*4]/255,g=p[i*4+1]/255,b=p[i*4+2]/255,lum=ortho.lum[i],mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=(mx-mn)/Math.max(mx,.001);
 return {lum,r,g,b,rough:ortho.rough[i],
  tree:smooth(0,.05,g-b)*smooth(-.06,-.01,g-r)*(1-smooth(.3,.42,lum)),
  roof:smooth(.07,.14,r-g)*smooth(.03,.1,g-b)*smooth(.3,.45,r),
  paved:(1-smooth(.1,.2,sat))*smooth(.35,.5,lum),
  water:(1-smooth(.13,.19,lum))*(1-smooth(.012,.03,ortho.rough[i]))};
}

// Lakes and rivers: dark, smooth, flat and large. Each body gets a level surface.
function findWater(field,ortho,data){
 const {nx,ny,x0,y0,sx,sy}=field,mask=new Uint8Array(nx*ny),bodies=[];
 for(let j=1;j<ny-1;j++)for(let k=1;k<nx-1;k++){
  const x=x0+(k+.5)*sx,y=y0+(j+.5)*sy,i=ortho.index(x,y);if(i<0||field.edge[j*nx+k]<6||ortho.lum[i]>.19||ortho.rough[i]>.03)continue;
  const slope=Math.hypot(terrainHeight(data,x+3,y)-terrainHeight(data,x-3,y),terrainHeight(data,x,y+3)-terrainHeight(data,x,y-3))/6;
  if(slope<.06&&landCover(ortho,i).water>.5)mask[j*nx+k]=1;
 }
 const seen=new Uint8Array(nx*ny),stack=[];
 for(let start=0;start<nx*ny;start++){
  if(!mask[start]||seen[start])continue;
  const cells=[];stack.push(start);seen[start]=1;
  while(stack.length){const c=stack.pop();cells.push(c);const k=c%nx,j=(c-k)/nx;
   for(const d of [c-1,c+1,c-nx,c+nx]){if(d<0||d>=nx*ny||seen[d]||!mask[d])continue;if((d===c-1&&k===0)||(d===c+1&&k===nx-1))continue;seen[d]=1;stack.push(d);}}
  if(cells.length*sx*sy<2500)continue;
  const heights=cells.map(c=>{const k=c%nx,j=(c-k)/nx;return terrainHeight(data,x0+(k+.5)*sx,y0+(j+.5)*sy);}).sort((u,v)=>u-v);
  bodies.push({cells,level:heights[Math.floor(heights.length*.6)]+.12});
 }
 for(const body of bodies)for(const c of body.cells)field.water[c]=1;
 return bodies;
}

function waterMesh(field,bodies){
 const positions=[],indices=[],{nx,x0,y0,sx,sy}=field;
 for(const body of bodies){
  const rows=new Map();
  for(const c of body.cells){const k=c%nx,j=(c-k)/nx;if(!rows.has(j))rows.set(j,[]);rows.get(j).push(k);}
  for(const [j,ks] of rows){
   ks.sort((u,v)=>u-v);let start=ks[0],last=ks[0];
   const quad=(a,b)=>{const base=positions.length/3,xa=x0+(a-1.5)*sx,xb=x0+(b+2.5)*sx,ya=y0+(j-1)*sy,yb=y0+(j+2)*sy;positions.push(xa,body.level,-ya,xb,body.level,-ya,xb,body.level,-yb,xa,body.level,-yb);indices.push(base,base+1,base+2,base,base+2,base+3);};
   for(let i=1;i<=ks.length;i++){if(i<ks.length&&ks[i]===last+1){last=ks[i];continue;}quad(start,last);if(i<ks.length){start=last=ks[i];}}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({name:'Agua_lago',color:0x0d1a17,roughness:.06,metalness:0,envMapIntensity:1.2,polygonOffset:true,polygonOffsetFactor:-1});
 material.onBeforeCompile=shader=>{
  shader.uniforms.landTime=shared.time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float landTime;varying vec3 vWaterWorld;
float waterWave(vec2 p){return sin(p.x)*sin(p.y*.8+p.x*.3);}`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec2 wp=vWaterWorld.xz*.35;float t=landTime*.9;
vec2 ripple=vec2(waterWave(wp+vec2(t,.3*t))-waterWave(wp*1.7-vec2(.6*t,t)),waterWave(wp.yx*1.3+t)-waterWave(wp*.7+vec2(t*.4,-t)))*.035;
normal=normalize(normal+(viewMatrix*vec4(ripple.x,0.0,ripple.y,0.0)).xyz);`);
 };
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Lagos_e_rio';mesh.receiveShadow=true;return mesh;
}

export function terrainMaterial(textures,field,{ortho=null,mobile=false}={}){
 const material=new THREE.MeshStandardMaterial({name:'Terreno_paisagem_v1',map:ortho,roughness:.95,metalness:0});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{grassMap:{value:textures.grass},wildMap:{value:textures.wild},concreteMap:{value:textures.concrete},grassNormalMap:{value:textures.grassNormal},
   trackField:{value:field.texture},fieldBounds:{value:new THREE.Vector4(field.x0,field.y0,field.width,field.height)}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D grassMap,wildMap,concreteMap,grassNormalMap,trackField;uniform vec4 fieldBounds;varying vec3 vLandWorld;
float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float landNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1,1)),f.x),f.y);}
`).replace('#include <map_fragment>',`
vec4 field=texture2D(trackField,vec2((vLandWorld.x-fieldBounds.x)/fieldBounds.z,(-vLandWorld.z-fieldBounds.y)/fieldBounds.w));
float edgeDist=field.r,lateral=field.g,waterBed=field.b,viewDist=length(vLandWorld-cameraPosition);
vec2 w=vLandWorld.xz;
float macro=landNoise(w*.011)*.6+landNoise(w*.043)*.4;
#ifdef USE_MAP
 vec3 ortho=texture2D(map,vMapUv,1.0).rgb,cs=pow(max(texture2D(map,vMapUv,2.2).rgb,vec3(0.0)),vec3(1.0/2.2));
 float lum=dot(cs,vec3(.299,.587,.114)),mx=max(cs.r,max(cs.g,cs.b)),sat=(mx-min(cs.r,min(cs.g,cs.b)))/max(mx,.001);
 float treeM=smoothstep(0.0,.05,cs.g-cs.b)*smoothstep(-.06,-.01,cs.g-cs.r)*(1.0-smoothstep(.3,.42,lum));
 float roofM=smoothstep(.07,.14,cs.r-cs.g)*smoothstep(.03,.1,cs.g-cs.b)*smoothstep(.3,.45,cs.r);
 float pavedM=(1.0-smoothstep(.1,.2,sat))*smoothstep(.35,.5,lum);
 float paintM=smoothstep(.05,.12,cs.b-cs.r)*smoothstep(.05,.12,cs.g-cs.r)*smoothstep(.3,.45,lum);
 vec3 wildTint=clamp(ortho/vec3(.19,.15,.085),vec3(.5),vec3(1.7));
#else
 // Cerrado without photography: broad dry and green patches.
 float lum=.45,treeM=0.0,roofM=0.0,pavedM=0.0,paintM=0.0;
 vec3 ortho=mix(vec3(.16,.15,.07),vec3(.11,.14,.05),macro);
 vec3 wildTint=mix(vec3(1.25,1.05,.8),vec3(.85,1.0,.75),landNoise(w*.006));
#endif
treeM*=1.0-waterBed;
vec3 grass=mix(texture2D(grassMap,w/3.3).rgb,texture2D(grassMap,w/12.7+.31).rgb,.45);
vec3 wild=mix(texture2D(wildMap,w/4.2).rgb,texture2D(wildMap,w/15.3+.17).rgb,.5);
vec3 concrete=mix(texture2D(concreteMap,w/3.9).rgb,texture2D(concreteMap,w/13.1+.5).rgb,.4);
// Mown verge beside the asphalt, with stripes parallel to the track.
float groomed=1.0-smoothstep(14.0,30.0,edgeDist);
float stripe=smoothstep(.2,.8,abs(fract(lateral/6.0)-.5)*2.0);
vec3 lawn=grass*vec3(.62,.9,.42)*mix(.86,1.1,stripe)*mix(.9,1.06,macro);
vec3 ground=wild*vec3(.88,1.0,.78)*mix(vec3(1.0),wildTint,.5)*mix(.82,1.1,macro);
ground=mix(ground,wild*vec3(.36,.42,.26),treeM);
ground=mix(ground,lawn,groomed*(1.0-pavedM)*(1.0-paintM));
vec3 asphalt=concrete*vec3(.33,.34,.35);
vec3 paved=mix(concrete*clamp(lum*1.25,.45,1.2),asphalt,groomed);
ground=mix(ground,paved,pavedM*(1.0-paintM));
ground=mix(ground,mix(asphalt*1.15,vec3(.03,.1,.085),.5),paintM);
ground=mix(ground,concrete*.55,roofM*(1.0-groomed));
// The aerial photograph reads correctly from afar and hides texture repetition.
ground=mix(ground,ortho*vec3(.9,.94,.86),smoothstep(220.0,1100.0,viewDist)*.75);
ground=mix(ground,vec3(.035,.045,.03),waterBed);
diffuseColor.rgb=ground;
`).replace('#include <roughnessmap_fragment>',`float roughnessFactor=mix(.97,.8,max(pavedM,paintM));`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
#ifndef LAND_SIMPLE
 vec3 grassBump=texture2D(grassNormalMap,w/3.3).xyz*2.0-1.0;
 float bumpAmount=(1.0-smoothstep(6.0,55.0,viewDist))*(1.0-pavedM)*(1.0-paintM)*.55;
 normal=normalize(normal+(viewMatrix*vec4(grassBump.x,0.0,-grassBump.y,0.0)).xyz*bumpAmount);
#endif`);
 };
 if(mobile)material.defines={LAND_SIMPLE:''};
 material.customProgramCacheKey=()=>'terrain-landscape-v1-'+(ortho?'ortho':'cerrado')+(mobile?'-mobile':'');
 return material;
}

// --- Instanced scenery -------------------------------------------------------
function merge(parts){
 for(const p of parts){if(p.geometry.index)p.geometry=p.geometry.toNonIndexed();p.facet??=.35;}
 let count=0;for(const p of parts)count+=p.geometry.attributes.position.count;
 const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),mask=new Float32Array(count);let offset=0;
 for(const p of parts){
  const pos=p.geometry.attributes.position,nor=p.geometry.attributes.normal;
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),o=offset+i;position.set([x,y,z],o*3);
   let n=[nor.getX(i),nor.getY(i),nor.getZ(i)];
   if(p.center){const d=[x-p.center[0],y-p.center[1],z-p.center[2]],l=Math.hypot(...d)||1;n=n.map((v,k)=>v*p.facet+d[k]/l*(1-p.facet));const l2=Math.hypot(...n);n=n.map(v=>v/l2);}
   normal.set(n,o*3);color.set(p.color(x,y,z),o*3);mask[o]=p.mask;
  }
  offset+=pos.count;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setAttribute('color',new THREE.BufferAttribute(color,3));g.setAttribute('partMask',new THREE.BufferAttribute(mask,1));
 g.computeBoundingSphere();return g;
}
// Displacement depends only on the original position, so shared corners stay welded.
function lumpy(geometry,seed,amount){const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),h=Math.sin(x*12.99+y*78.23+z*37.71+seed)*43758.5453,k=1+(h-Math.floor(h)-.5)*amount;p.setXYZ(i,x*k,y*k,z*k);}return geometry;}

// Unit trees (1 m tall, ~1 m crown); instances scale them. partMask marks foliage.
// detail 1: near crowns (~110 triangles); detail 0: distant crowns (~20 triangles).
function treeGeometry(kind,seed,detail=1){
 const rand=random(seed),parts=[],bark=[.09,.07,.05],far=detail===0;
 const shade=(low,high)=>(x,y)=>{const s=.5+.5*smooth(low,high,y);return [s,s,s];};
 if(kind==='tall'){
  if(!far)parts.push({geometry:new THREE.CylinderGeometry(.018,.034,.72,4,1,true).translate(0,.36,0),mask:0,color:()=>bark});
  const layers=far?2:4;
  for(let i=0;i<layers;i++){const y=.56+i*.36/layers*1.3,r=.2-i*.1/layers,c=[(rand()-.5)*.08,y,(rand()-.5)*.08];
   const g=far?new THREE.OctahedronGeometry(1,0).scale(r*1.1,r*1.1,r*1.1).translate(...c):lumpy(new THREE.IcosahedronGeometry(1,0),rand()*100,.3).scale(r,r*.8,r).translate(...c);
   parts.push({geometry:g,mask:1,center:c,facet:.12,color:shade(.45,1)});}
 }else{
  if(!far)parts.push({geometry:new THREE.CylinderGeometry(.03,.055,.5,4,1,true).translate(0,.25,0),mask:0,color:()=>bark});
  const blobs=far?[[0,.66,0,.36],[.08,.52,-.06,.3]]:[[0,.72,0,.3],[.2,.58,.1,.24],[-.18,.6,.14,.23],[.05,.58,-.22,.24],[-.12,.5,-.1,.2]];
  for(const [x,y,z,r] of blobs){const c=[x+(rand()-.5)*.06,y,z+(rand()-.5)*.06];
   const g=far?new THREE.OctahedronGeometry(1,0).scale(r,r*.85,r).translate(...c):lumpy(new THREE.IcosahedronGeometry(1,0),rand()*100,.35).scale(r,r*.85,r).translate(...c);
   parts.push({geometry:g,mask:1,center:[0,.6,0],facet:.12,color:shade(.35,.95)});}
 }
 return merge(parts);
}
function houseGeometry(flat){
 const walls=new THREE.BoxGeometry(1,1.35,1).translate(0,.325,0),parts=[{geometry:walls,mask:0,color:()=>[1,1,1]}];
 if(flat)parts.push({geometry:new THREE.BoxGeometry(1.02,.06,1.02).translate(0,1.03,0),mask:1,color:()=>[1,1,1]});
 else{
  const roof=new THREE.BufferGeometry(),e=.54,top=1.36,ridge=.22;
  const v=[[-e,1,-e],[e,1,-e],[e,1,e],[-e,1,e],[-ridge,top,0],[ridge,top,0]];
  const faces=[0,5,1,0,4,5,2,4,3,2,5,4,1,5,2,3,4,0];
  roof.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(i=>v[i]),3));roof.computeVertexNormals();
  parts.push({geometry:roof,mask:1,color:()=>[1,1,1]});
 }
 return merge(parts);
}
function sceneryMaterial(kind){
 const material=new THREE.MeshStandardMaterial({name:{tree:'Arvores_instanciadas',house:'Casas_instanciadas',crowd:'Torcida_instanciada'}[kind],vertexColors:true,roughness:kind==='tree'?.88:.82,metalness:0});
 material.onBeforeCompile=shader=>{
  shader.uniforms.landTime=shared.time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute float partMask;uniform float landTime;varying float vPart;varying vec3 vPartLocal,vPartNormal,vPartScale;`).replace('#include <color_vertex>',`
vPart=partMask;vPartLocal=position;vPartNormal=normal;vPartScale=vec3(1.0);
vColor=vec4(1.0);
#ifdef USE_COLOR
 vColor.rgb*=color;
#endif
#ifdef USE_INSTANCING
 vPartScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
#endif
#ifdef USE_INSTANCING_COLOR
 #ifdef HOUSES
  float seed=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453);
  vec3 wall=seed<.3?vec3(.62,.6,.55):seed<.5?vec3(.66,.55,.36):seed<.65?vec3(.55,.36,.27):seed<.8?vec3(.38,.46,.5):vec3(.48,.47,.44);
  vColor.rgb*=mix(wall,instanceColor.rgb,partMask);
 #else
  vColor.rgb*=mix(vec3(1.0),instanceColor.rgb,partMask);
 #endif
#endif`).replace('#include <begin_vertex>',`#include <begin_vertex>
#if defined(TREES)&&defined(USE_INSTANCING)
 float sway=sin(landTime*1.4+instanceMatrix[3].x*.07+instanceMatrix[3].z*.05)*.012*partMask*position.y;
 transformed.x+=sway;transformed.z+=sway*.6;
#endif
#if defined(CROWD)&&defined(USE_INSTANCING)
 // Fans bob and stand up now and then, each on their own rhythm.
 float fan=fract(sin(dot(instanceMatrix[3].xz,vec2(41.3,17.9)))*9631.7);
 transformed.y+=max(0.0,sin(landTime*(3.0+fan*4.0)+fan*40.0))*.07+max(0.0,sin(landTime*.35+fan*6.3)-.85)*1.6;
#endif`);
  if(kind!=='house')return;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vPart;varying vec3 vPartLocal,vPartNormal,vPartScale;').replace('#include <color_fragment>',`#include <color_fragment>
if(vPart<.5&&abs(vPartNormal.y)<.5){
 float along=abs(vPartNormal.x)>.5?vPartLocal.z*vPartScale.z:vPartLocal.x*vPartScale.x,up=vPartLocal.y*vPartScale.y;
 float cellA=fract(along/3.1),cellU=fract(up/2.9);
 float window=step(.3,cellA)*step(cellA,.7)*step(.4,cellU)*step(cellU,.8)*step(.5,up)*step(up,vPartScale.y-.2);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.045,.055,.065),window*.9);
}`);
 };
 material.defines={tree:{TREES:''},house:{HOUSES:''},crowd:{CROWD:''}}[kind];
 material.customProgramCacheKey=()=>'scenery-'+kind+'-v1';
 return material;
}
function chunked(name,geometry,material,items,compose,{size=380,shadows=true}={}){
 const root=new THREE.Group(),groups=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color();root.name=name;
 for(const item of items){const key=Math.floor(item.x/size)+':'+Math.floor(item.y/size);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 for(const list of groups.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name=name+'_bloco';
  list.forEach((item,i)=>{compose(item,matrix,color);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);});
  mesh.computeBoundingSphere();mesh.castShadow=shadows;mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}
// Linear-space foliage albedo: real canopies reflect little light.
const TREE_GREENS=[[.085,.15,.04],[.065,.125,.035],[.11,.17,.05],[.06,.1,.045],[.13,.16,.06],[.075,.14,.06]];
function composeTree(item,matrix,color){
 matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.width,item.height,item.width));
 color.setRGB(...item.color);
}
function treeColor(rand,dry=0){
 const pick=rand();
 // A few flowering ipês (yellow/pink) are part of the São Paulo landscape.
 if(pick<.012)return [.62,.44,.04];if(pick<.022)return [.52,.16,.3];
 const c=TREE_GREENS[Math.floor(rand()*TREE_GREENS.length)],k=.85+rand()*.3;
 return [c[0]*k+dry*.05,c[1]*k+dry*.01,c[2]*k];
}

export function createLandscape({data,field,ortho=null,mobile=false,style='urban'}){
 const root=new THREE.Group();root.name='Paisagem';
 const rand=random(data.samples.length*7919+17),stats={trees:0,houses:0,water:0};
 const trees=[],tall=[],houses=[],flats=[];
 const {x0,y0,width,height}=field;
 if(ortho){
  const bodies=findWater(field,ortho,data);field.upload();stats.water=bodies.length;
  if(bodies.length)root.add(waterMesh(field,bodies));
  const spacing=mobile?8.5:6;
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing*.9,py=y+(rand()-.5)*spacing*.9,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.water[cell])continue;const edge=field.edge[cell],cover=landCover(ortho,i);
   if(edge>9&&cover.tree>.45&&rand()<Math.pow(cover.tree,1.4)*.9){
    const h=(edge<25?6:7.5)+rand()*6.5,list=rand()<.22?tall:trees;
    list.push({x:px,y:py,z:terrainHeight(data,px,py)-.3,height:list===tall?h*1.45:h,width:(list===tall?.75:.9)*h*(.8+rand()*.35),turn:rand()*Math.PI*2,color:treeColor(rand)});
   }
  }
  // Houses follow the local street grid: the orientation of the photo's edges.
  const houseSpacing=mobile?11:8.2,ow=ortho.w;
  for(let y=y0+houseSpacing/2;y<y0+height;y+=houseSpacing)for(let x=x0+houseSpacing/2;x<x0+width;x+=houseSpacing){
   const px=x+(rand()-.5)*2.5,py=y+(rand()-.5)*2.5,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.inside[cell]||field.water[cell]||field.edge[cell]<42)continue;
   const cover=landCover(ortho,i);if(cover.roof<.5||rand()>.92)continue;
   let xx=0,yy=0,xy=0;const cx=i%ow,cy=(i-cx)/ow;
   for(let v=-4;v<=4;v++)for(let u=-4;u<=4;u++){const a=(Math.min(ortho.h-2,Math.max(1,cy+v)))*ow+Math.min(ow-2,Math.max(1,cx+u)),gx=ortho.lum[a+1]-ortho.lum[a-1],gy=ortho.lum[a+ow]-ortho.lum[a-ow];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}
   const turn=.5*Math.atan2(2*xy,xx-yy),tallBuilding=rand()<.04,floors=tallBuilding?3+Math.floor(rand()*5):rand()<.62?1:2;
   const w=6+rand()*3.5,d=8+rand()*5,corner=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>terrainHeight(data,px+a*w*.5,py+b*d*.5));
   const item={x:px,y:py,z:Math.min(...corner)-.15,w,d,h:floors*3+.4+rand()*.6,turn:-turn,color:tallBuilding?[.42,.43,.44]:[.42+rand()*.16,.11+rand()*.06,.04+rand()*.03]};
   (tallBuilding?flats:houses).push(item);
  }
 }else if(style==='cerrado'){
  // Sparse, low cerrado trees away from the oval and the service area.
  const spacing=mobile?16:11;
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing,py=y+(rand()-.5)*spacing,cell=field.cell(px,py);if(cell<0||field.edge[cell]<55||field.inside[cell]&&field.edge[cell]<70)continue;
   if(rand()>.18+.5*smooth(.55,.8,Math.sin(px*.013)*Math.cos(py*.011)*.5+.5))continue;
   const h=3.2+rand()*4.2;trees.push({x:px,y:py,z:terrainHeight(data,px,py)-.2,height:h,width:h*(1+rand()*.4),turn:rand()*Math.PI*2,color:treeColor(rand,.8)});
  }
 }
 const treeMaterial=sceneryMaterial('tree');
 // Trees are chunked in 200 m blocks; each block picks near or distant crowns every frame.
 const lodBlocks=[];
 for(const [list,kind,seed,name] of [[trees,'round',11,'Arvores'],[tall,'tall',23,'Arvores_altas']]){
  if(!list.length)continue;const near=treeGeometry(kind,seed,1),far=treeGeometry(kind,seed,0);
  const group=chunked(name,near,treeMaterial,list,composeTree,{size:200});root.add(group);
  for(const mesh of group.children){mesh.geometry=far;lodBlocks.push({mesh,near,far,center:mesh.boundingSphere.center.clone(),radius:mesh.boundingSphere.radius});}
 }
 const lodDistance=mobile?80:130;
 const houseMaterial=sceneryMaterial('house'),composeHouse=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
 if(houses.length)root.add(chunked('Casas',houseGeometry(false),houseMaterial,houses,composeHouse,{size:450}));
 if(flats.length)root.add(chunked('Predios',houseGeometry(true),houseMaterial,flats,composeHouse,{size:900}));
 const horizon=createHorizon(data,field,rand,{mobile,urban:style!=='cerrado'});root.add(horizon.root);
 Object.assign(stats,{trees:trees.length+tall.length,houses:houses.length+flats.length+horizon.buildings,chunks:0});root.traverse(o=>{if(o.isInstancedMesh)stats.chunks++;});
 return {root,stats,dispose(){for(const block of lodBlocks){block.near.dispose();block.far.dispose();}},update(dt,camera){
  shared.time.value+=dt;if(!camera)return;
  for(const block of lodBlocks){const geometry=camera.position.distanceTo(block.center)-block.radius<lodDistance?block.near:block.far;if(block.mesh.geometry!==geometry)block.mesh.geometry=geometry;}
 }};
}

// Ground continues past the surveyed terrain, rising into hazy hills and a
// distant skyline so the world never ends at the edge of the LiDAR grid.
function createHorizon(data,field,rand,{mobile,urban}){
 const t=data.terrain,root=new THREE.Group();root.name='Horizonte';
 const border=[],x1=t.x0+(t.nx-1)*t.step,y1=t.y0+(t.ny-1)*t.step,cx=(t.x0+x1)/2,cy=(t.y0+y1)/2;
 for(let i=0;i<t.nx-1;i++)border.push([t.x0+i*t.step,t.y0,0,-1]);
 for(let j=0;j<t.ny-1;j++)border.push([x1,t.y0+j*t.step,1,0]);
 for(let i=t.nx-1;i>0;i--)border.push([t.x0+i*t.step,y1,0,1]);
 for(let j=t.ny-1;j>0;j--)border.push([t.x0,t.y0+j*t.step,-1,0]);
 const rings=[0,25,90,260,620,1300,2600,5200],positions=[],colors=[],indices=[],base=t.z.reduce((s,z)=>s+z,0)/t.z.length;
 const hill=(x,y)=>{let s=0,a=1,f=.0011;for(let o=0;o<4;o++){s+=a*(Math.sin(x*f+o*1.7)*Math.cos(y*f*1.13+o*.9));a*=.5;f*=2.1;}return s;};
 border.forEach(([bx,by,nx,ny])=>{
  // Radial direction blends the edge normal into the centre direction to round the corners.
  const rx=bx-cx,ry=by-cy,rl=Math.hypot(rx,ry),dx=nx*.4+rx/rl*.6,dy=ny*.4+ry/rl*.6,dl=Math.hypot(dx,dy),edgeZ=terrainHeight(data,bx,by);
  for(const [k,dist] of rings.entries()){
   const x=bx+dx/dl*dist,y=by+dy/dl*dist,f=smooth(0,1400,dist),z=k===0?edgeZ-.05:edgeZ*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f;
   positions.push(x,z,-y);const g=.75+.25*Math.sin(x*.01)*Math.cos(y*.013);
   const c=urban?[.21*g,.2*g,.17*g]:[.2*g,.2*g,.1*g];colors.push(...c);
  }
 });
 const R=rings.length,N=border.length;
 for(let i=0;i<N;i++){const j=(i+1)%N;for(let k=0;k<R-1;k++){const a=i*R+k,b=j*R+k;indices.push(a,a+1,b,b,a+1,b+1);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({name:'Horizonte_solo',vertexColors:true,roughness:1}));ground.name='Horizonte_solo';ground.receiveShadow=false;root.add(ground);
 let buildings=0;
 if(urban){
  // Neighbourhood rooftops and, farther out, taller towers toward the city centre (north).
  const items=[],towers=[],count=mobile?1400:3600;
  for(let i=0;i<count;i++){
   const b=border[Math.floor(rand()*N)],rx=b[0]-cx,ry=b[1]-cy,rl=Math.hypot(rx,ry),dx=b[2]*.4+rx/rl*.6,dy=b[3]*.4+ry/rl*.6,dl=Math.hypot(dx,dy);
   const dist=12+Math.pow(rand(),1.6)*1200,x=b[0]+dx/dl*dist+(rand()-.5)*60,y=b[1]+dy/dl*dist+(rand()-.5)*60;
   const f=smooth(0,1400,dist),edgeZ=terrainHeight(data,b[0],b[1]),z=edgeZ*(1-f)+(base+22+hill(x,y)*38+dist*.012)*f;
   const floors=rand()<.08?3+Math.floor(rand()*6):1+Math.floor(rand()*2);
   items.push({x,y,z:z-1.2,w:6+rand()*4,d:8+rand()*6,h:floors*3+1,turn:Math.round(rand()*4)*Math.PI/2+(rand()-.5)*.3,color:floors>2?[.4,.42,.44]:[.42+rand()*.14,.12+rand()*.05,.05]});
  }
  for(let i=0;i<(mobile?90:220);i++){
   const angle=Math.PI/2+(rand()-.5)*2.4,dist=1700+rand()*2300,x=cx+Math.cos(angle)*dist,y=cy+Math.sin(angle)*dist+Math.max(0,dist-1500)*.2;
   towers.push({x,y,z:base+15+hill(x,y)*38+dist*.012,w:14+rand()*18,d:14+rand()*18,h:28+Math.pow(rand(),2)*110,turn:rand()*Math.PI,color:[.26+rand()*.12,.29+rand()*.12,.33+rand()*.12]});
  }
  const material=sceneryMaterial('house'),compose=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
  root.add(chunked('Horizonte_casas',houseGeometry(false),material,items,compose,{size:1100,shadows:false}));
  root.add(chunked('Horizonte_predios',houseGeometry(true),material,towers,compose,{size:3000,shadows:false}));
  buildings=items.length+towers.length;
 }
 return {root,buildings};
}

// Seated fans on every grandstand step found in the static scene. Each step is a
// box; its top face gives the row. Instanced in one draw call per circuit.
export function createCrowd(steps,{mobile=false}={}){
 const rand=random(steps.length*131+7),items=[];
 for(const corners of steps){
  // Order the four corners around the centre so consecutive points share an edge.
  const mx=corners.reduce((v,q)=>v+q.x,0)/4,mz=corners.reduce((v,q)=>v+q.z,0)/4,top=[...corners].sort((u,v)=>Math.atan2(u.z-mz,u.x-mx)-Math.atan2(v.z-mz,v.x-mx));
  const [a,b,c,d]=top,cx=(a.x+b.x+c.x+d.x)/4,cz=(a.z+b.z+c.z+d.z)/4,y=Math.max(a.y,b.y,c.y,d.y);
  // Longest edge of the top face is the row direction.
  const edges=[[a,b],[b,c],[c,d],[d,a]].map(([p,q])=>({dx:q.x-p.x,dz:q.z-p.z,l:Math.hypot(q.x-p.x,q.z-p.z)})).sort((u,v)=>v.l-u.l),row=edges[0];
  if(row.l<4)continue;const ux=row.dx/row.l,uz=row.dz/row.l,turn=Math.atan2(-uz,ux);
  for(let t=-row.l/2+.4;t<row.l/2-.3;t+=mobile?.9:.62){
   if(rand()<.22)continue;
   const pick=rand(),shirt=pick<.3?[.62,.52,.04]:pick<.5?[.04,.3,.08]:pick<.62?[.5,.5,.48]:pick<.72?[.05,.1,.35]:pick<.8?[.5,.04,.03]:[.12+rand()*.4,.12+rand()*.3,.12+rand()*.3];
   items.push({x:cx+ux*(t+(rand()-.5)*.12),y:-(cz+uz*(t+(rand()-.5)*.12)),z:y,turn,color:shirt,scale:.9+rand()*.2});
  }
 }
 const skin=[[.5,.32,.2],[.3,.17,.1],[.62,.42,.3],[.2,.11,.07]],parts=[];
 parts.push({geometry:new THREE.BoxGeometry(.4,.55,.26).translate(0,.52,0),mask:1,color:()=>[1,1,1]});
 parts.push({geometry:new THREE.BoxGeometry(.3,.26,.34).translate(0,.2,.1),mask:0,color:()=>[.08,.08,.1]});
 parts.push({geometry:new THREE.IcosahedronGeometry(.12,0).translate(0,.93,0),mask:0,color:()=>skin[0]});
 const geometry=merge(parts),material=sceneryMaterial('crowd');
 const compose=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.scale,item.scale,item.scale));color.setRGB(...item.color);};
 const root=chunked('Torcida',geometry,material,items,compose,{size:2000,shadows:false});
 return {root,count:items.length};
}

// Static circuit buildings from the GLB and the Curvelo scene get world-mapped
// concrete, ribbed garage doors and reflective glass instead of flat colours.
export function structureMaterial(material,textures,cache=new Map()){
 if(!material||Array.isArray(material))return material;
 const kind={Concreto:'concrete',Metal:'metal',Vidros_boxes:'glass',Boxes_azul:'roof'}[material.name];
 if(!kind)return material;
 const key=material.uuid;if(cache.has(key))return cache.get(key);
 const upgraded=material.clone();upgraded.name=material.name+'_v2';
 if(kind==='glass'){upgraded.color.setRGB(.02,.035,.045);upgraded.roughness=.06;upgraded.metalness=.4;upgraded.envMapIntensity=1.4;}
 else{
  upgraded.roughness=kind==='metal'?.42:kind==='roof'?.55:.92;upgraded.metalness=kind==='metal'?.55:0;
  if(kind==='concrete')upgraded.color.setRGB(.56,.56,.54);
  upgraded.onBeforeCompile=shader=>{
   shader.uniforms.concreteMap={value:textures.concrete};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vStructWorld,vStructNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvStructWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vStructNormal=normalize(mat3(modelMatrix)*objectNormal);');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D concreteMap;varying vec3 vStructWorld,vStructNormal;').replace('#include <map_fragment>',`#include <map_fragment>
vec3 blendN=pow(abs(normalize(vStructNormal)),vec3(4.0));blendN/=blendN.x+blendN.y+blendN.z;
vec3 wall=texture2D(concreteMap,vStructWorld.zy/3.2).rgb*blendN.x+texture2D(concreteMap,vStructWorld.xz/3.2).rgb*blendN.y+texture2D(concreteMap,vStructWorld.xy/3.2).rgb*blendN.z;
#if STRUCTURE_KIND==1
 diffuseColor.rgb*=wall*1.9;
#elif STRUCTURE_KIND==2
 // Roller doors: horizontal ribs.
 float rib=smoothstep(.35,.5,abs(fract(vStructWorld.y*5.0)-.5));
 diffuseColor.rgb*=mix(.72,1.05,rib)*mix(vec3(1.0),wall*2.0,.35);
#else
 diffuseColor.rgb*=mix(vec3(1.0),wall*2.0,.45);
#endif`);
  };
  upgraded.defines={STRUCTURE_KIND:kind==='concrete'?1:kind==='metal'?2:3};
  upgraded.customProgramCacheKey=()=>'structure-'+kind+'-v1';
 }
 cache.set(key,upgraded);return upgraded;
}
