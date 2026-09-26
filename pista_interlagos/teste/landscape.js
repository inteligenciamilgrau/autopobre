import * as THREE from 'three';
import {clamp} from './physics.js';
import {sceneryBands} from './track-clearance.js';
import {LakeWaves,waveVertexCommon,waveVertex,waveFragmentCommon,waveClip} from './lake-waves.js';

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

// Signed distance from every terrain texel to the nearest paved or built band
// (track, pit lane, garages, grandstands; metres), plus the lateral offset used
// for mowing stripes. Rendering and scenery placement share it.
export function buildTrackField(data,resolution=1024){
 const t=data.terrain,x0=t.x0,y0=t.y0,width=(t.nx-1)*t.step,height=(t.ny-1)*t.step;
 const nx=resolution,ny=Math.max(2,Math.round(resolution*height/width)),sx=width/nx,sy=height/ny;
 const edge=new Float32Array(nx*ny).fill(FIELD_RANGE),side=new Float32Array(nx*ny).fill(FIELD_RANGE),water=new Float32Array(nx*ny),inside=new Uint8Array(nx*ny);
 const a=data.samples,n=a.length;
 for(const band of sceneryBands(data)){
  const b=band.points,count=b.length;
  for(let i=0;i<(band.closed?count:count-1);i++){
   // Band points are [x, y, left x, left y, lo, hi]: measure from its middle line.
   const p=b[i],q=b[(i+1)%count],pc=(p[4]+p[5])/2,qc=(q[4]+q[5])/2,ph=(p[5]-p[4])/2,qh=(q[5]-q[4])/2;
   const ax=p[0]+p[2]*pc,ay=p[1]+p[3]*pc,bx=q[0]+q[2]*qc,by=q[1]+q[3]*qc,dx=bx-ax,dy=by-ay,len2=Math.max(1e-6,dx*dx+dy*dy),reach=FIELD_RANGE+Math.max(ph,qh);
   const i0=Math.max(0,Math.floor((Math.min(ax,bx)-reach-x0)/sx)),i1=Math.min(nx-1,Math.ceil((Math.max(ax,bx)+reach-x0)/sx));
   const j0=Math.max(0,Math.floor((Math.min(ay,by)-reach-y0)/sy)),j1=Math.min(ny-1,Math.ceil((Math.max(ay,by)+reach-y0)/sy));
   for(let j=j0;j<=j1;j++){
    const y=y0+(j+.5)*sy,row=j*nx;
    for(let k=i0;k<=i1;k++){
     const x=x0+(k+.5)*sx;let u=((x-ax)*dx+(y-ay)*dy)/len2;u=u<0?0:u>1?1:u;
     const ex=x-ax-u*dx,ey=y-ay-u*dy,e=Math.sqrt(ex*ex+ey*ey)-(ph+(qh-ph)*u),index=row+k;
     if(e<edge[index]){edge[index]=e;side[index]=ex*(p[2]+(q[2]-p[2])*u)+ey*(p[3]+(q[3]-p[3])*u)+pc+(qc-pc)*u;}
    }
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

// Floating plants and glare leave dry specks inside a lake: close them, but keep
// real islands (holes larger than maxCells).
function fillHoles(cells,nx,maxCells){
 let k0=Infinity,k1=-1,j0=Infinity,j1=-1;
 for(const c of cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
 const w=k1-k0+3,h=j1-j0+3,grid=new Uint8Array(w*h),stack=[];   // 1 water, 2 open land, 3 enclosed
 for(const c of cells){const k=c%nx,j=(c-k)/nx;grid[(j-j0+1)*w+k-k0+1]=1;}
 const flood=(start,mark,visit)=>{grid[start]=mark;stack.push(start);while(stack.length){const i=stack.pop(),x=i%w;visit?.(i);
  for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(n>=0&&n<w*h&&grid[n]===0){grid[n]=mark;stack.push(n);}}};
 flood(0,2);   // the padded border reaches all land around the lake
 for(let i=0;i<w*h;i++){if(grid[i])continue;const hole=[];flood(i,3,q=>hole.push(q));
  if(hole.length<=maxCells)for(const q of hole){const x=q%w,y=(q-x)/w;cells.push((y-1+j0)*nx+x-1+k0);}}
 return cells;
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
  bodies.push({level:heights[Math.floor(heights.length*.6)]+.12,cells:fillHoles(cells,nx,Math.round(600/(sx*sy)))});
 }
 for(const body of bodies)for(const c of body.cells)field.water[c]=1;
 return bodies;
}

// Whitewater around the car (lake-waves.js) breaks into lace: bubbles and streaks that
// fill in as the foam thickens.
const waveWhitewater=`
float waveHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float waveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(waveHash(i),waveHash(i+vec2(1,0)),f.x),mix(waveHash(i+vec2(0,1)),waveHash(i+vec2(1,1)),f.x),f.y);}
float waveWhite(vec2 p,float foam){
 float n=waveNoise(p*1.7)*.45+waveNoise(p*4.9+3.7)*.33+waveNoise(p*12.3-1.3)*.22,cover=foam*.72;
 return smoothstep(1.0-cover,1.12-cover,n)*min(1.0,foam*2.0)*.9;
}`;
// Stirred-up bed: brown and opaque.
const WAVE_MUD='vec3(.13,.1,.06)';

// Plain lake water; `patch` makes the mesh that follows the car, lifted by the waves.
function simpleWaterMaterial(shore,waves,patch){
 const material=new THREE.MeshStandardMaterial({name:patch?'Agua_lago_ondas':'Agua_lago',color:0x0d1a17,roughness:.06,metalness:0,envMapIntensity:1.2,polygonOffset:true,polygonOffsetFactor:-1,alphaTest:.5,alphaToCoverage:true});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,waves.uniforms,{landTime:shared.time,shoreMap:{value:shore.texture},shoreBounds:{value:shore.bounds}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;'+waveVertexCommon).replace('#include <begin_vertex>','#include <begin_vertex>'+waveVertex+'\nvWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform float landTime;uniform sampler2D shoreMap;uniform vec4 shoreBounds;varying vec3 vWaterWorld;${waveFragmentCommon}${waveWhitewater}
float waterWave(vec2 p){return sin(p.x)*sin(p.y*.8+p.x*.3);}`).replace('#include <color_fragment>',`#include <color_fragment>
${waveClip('vWaterWorld.xz')}
// The water ends on the smooth shoreline, not on the grid cells it was built from.
float waterShore=texture2D(shoreMap,vec2((vWaterWorld.x-shoreBounds.x)/shoreBounds.z,(-vWaterWorld.z-shoreBounds.y)/shoreBounds.w)).r;
diffuseColor.a=smoothstep(-.3,.3,waterShore);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.1,.095,.07),(1.0-smoothstep(.0,2.8,waterShore))*.5);
vec2 waveSlope=vec2(0.0);
#ifdef LAKE_WAVES
waveSlope=vWaveSlope;
diffuseColor.rgb=mix(diffuseColor.rgb,${WAVE_MUD},vWave.y*.75);
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.55,.52),waveWhite(vWaterWorld.xz,vWave.x)*.85);
#endif`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec2 wp=vWaterWorld.xz*.35;float t=landTime*.9;
vec2 ripple=vec2(waterWave(wp+vec2(t,.3*t))-waterWave(wp*1.7-vec2(.6*t,t)),waterWave(wp.yx*1.3+t)-waterWave(wp*.7+vec2(t*.4,-t)))*.035-waveSlope;
normal=normalize(normal+(viewMatrix*vec4(ripple.x,0.0,ripple.y,0.0)).xyz);`);
 };
 if(patch)material.defines={LAKE_WAVES:''};
 material.customProgramCacheKey=()=>'lake-simple-v4'+(patch?'-waves':'');
 return material;
}

function waterMesh(field,bodies,waves,shore){
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
 const mesh=new THREE.Mesh(geometry,simpleWaterMaterial(shore,waves,false));mesh.name='Lagos_e_rio';mesh.receiveShadow=true;return mesh;
}

// Signed distance to the shore in metres (positive over water), so the outline
// is a smooth curve instead of the field's staircase of cells. Every cell also
// knows its nearest lake, for the lake bed, the scenery and the car in the water.
const SHORE_RANGE=24;
function shoreField(field,bodies){
 const {nx,ny,x0,y0,sx,sy,water}=field,pad=Math.ceil(SHORE_RANGE/Math.min(sx,sy))+2;
 let k0=nx,k1=0,j0=ny,j1=0;
 for(const body of bodies)for(const c of body.cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
 k0=Math.max(0,k0-pad);k1=Math.min(nx-1,k1+pad);j0=Math.max(0,j0-pad);j1=Math.min(ny-1,j1+pad);
 const w=k1-k0+1,h=j1-j0+1,diagonal=Math.hypot(sx,sy),half=(sx+sy)/4,owner=new Int16Array(w*h).fill(-1);
 bodies.forEach((body,b)=>{for(const c of body.cells){const k=c%nx-k0,j=(c-c%nx)/nx-j0;owner[j*w+k]=b;}});
 // Two-pass chamfer distance from every cell to the nearest cell of the other kind.
 const chamfer=(wet,nearest=null)=>{
  const d=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let k=0;k<w;k++)d[j*w+k]=(water[(j+j0)*nx+k+k0]>.5)===wet?1e6:0;
  const relax=(k,j,dk,dj,cost)=>{const kk=k+dk,jj=j+dj;if(kk<0||jj<0||kk>=w||jj>=h)return;const n=jj*w+kk,v=d[n]+cost,i=j*w+k;if(v<d[i]){d[i]=v;if(nearest)nearest[i]=nearest[n];}};
  for(let j=0;j<h;j++)for(let k=0;k<w;k++){relax(k,j,-1,0,sx);relax(k,j,0,-1,sy);relax(k,j,-1,-1,diagonal);relax(k,j,1,-1,diagonal);}
  for(let j=h-1;j>=0;j--)for(let k=w-1;k>=0;k--){relax(k,j,1,0,sx);relax(k,j,0,1,sy);relax(k,j,1,1,diagonal);relax(k,j,-1,1,diagonal);}
  return d;
 };
 const nearest=Int16Array.from(owner),toDry=chamfer(true),toWet=chamfer(false,nearest);
 const sdf=new Float32Array(w*h),out=new Uint16Array(w*h),toHalf=THREE.DataUtils.toHalfFloat;
 for(let j=0;j<h;j++)for(let k=0;k<w;k++){const i=j*w+k,wet=water[(j+j0)*nx+k+k0]>.5;sdf[i]=clamp(wet?toDry[i]-half:half-toWet[i],-SHORE_RANGE,SHORE_RANGE);out[i]=toHalf(sdf[i]);}
 // The drawn shoreline uses a blurred copy: the field follows the grid cells and its zero line
 // would show their steps. Lake contact and the lake beds keep the exact field below.
 let soft=Float32Array.from(sdf);
 for(let pass=0;pass<3;pass++){const next=new Float32Array(w*h);
  for(let j=0;j<h;j++)for(let k=0;k<w;k++){let sum=0,n=0;for(let dj=-1;dj<=1;dj++)for(let dk=-1;dk<=1;dk++){const kk=k+dk,jj=j+dj;if(kk<0||jj<0||kk>=w||jj>=h)continue;sum+=soft[jj*w+kk];n++;}next[j*w+k]=sum/n;}
  soft=next;}
 for(let i=0;i<w*h;i++)out[i]=toHalf(soft[i]);
 const texture=new THREE.DataTexture(out,w,h,THREE.RedFormat,THREE.HalfFloatType);
 texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.generateMipmaps=false;texture.needsUpdate=true;
 const bx=x0+k0*sx,by=y0+j0*sy;
 return {texture,bounds:new THREE.Vector4(bx,by,w*sx,h*sy),
  // Same bilinear lookup as the shader (texel centres); far from every lake it is -SHORE_RANGE.
  distance(x,y){
   const fx=(x-bx)/sx-.5,fy=(y-by)/sy-.5;if(fx<0||fy<0||fx>w-1||fy>h-1)return -SHORE_RANGE;
   const i=Math.min(w-2,Math.floor(fx)),j=Math.min(h-2,Math.floor(fy)),u=fx-i,v=fy-j,a=j*w+i;
   return (sdf[a]*(1-u)+sdf[a+1]*u)*(1-v)+(sdf[a+w]*(1-u)+sdf[a+w+1]*u)*v;
  },
  body(x,y){const k=Math.floor((x-bx)/sx),j=Math.floor((y-by)/sy);return k<0||j<0||k>=w||j>=h?null:bodies[nearest[j*w+k]]??null;}};
}

// The LiDAR sees the water surface, not the bed: dig a basin under every lake,
// shallow at the bank and down to LAKE_DEPTH, on any height grid shaped like
// data.terrain (the physics ground and the visible terrain mesh).
const LAKE_DEPTH=.85;
export const lakeBedDepth=shore=>Math.min(LAKE_DEPTH,.2+.1*shore);
function digLakeBeds(t,heights,shore){
 const {x,y,z,w}=shore.bounds,i0=Math.max(0,Math.floor((x-t.x0)/t.step)),i1=Math.min(t.nx-1,Math.ceil((x+z-t.x0)/t.step));
 const j0=Math.max(0,Math.floor((y-t.y0)/t.step)),j1=Math.min(t.ny-1,Math.ceil((y+w-t.y0)/t.step));let dug=0;
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
  const px=t.x0+i*t.step,py=t.y0+j*t.step,s=shore.distance(px,py);if(s<=-1.5)continue;
  const body=shore.body(px,py),g=j*t.nx+i;if(!body)continue;
  const bed=body.level-lakeBedDepth(s);if(heights[g]>bed){heights[g]=bed;dug++;}
 }
 return dug;
}

// --- Realistic lakes (opt-in setting) -----------------------------------------

const lakeVertex=['#include <common>','#include <common>\nvarying vec3 vLakeWorld;'+waveVertexCommon,'#include <begin_vertex>','#include <begin_vertex>'+waveVertex+'\nvLakeWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'];
const lakeCommon=`#include <common>
uniform float landTime,planarWeight;uniform vec2 windDir,lakeLens;uniform vec3 lakeBed;uniform vec4 shoreBounds;uniform mat4 reflectionMatrix;uniform sampler2D shoreMap,reflectionMap;
varying vec3 vLakeWorld;${waveFragmentCommon}${waveWhitewater}
float lakeHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float lakeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(lakeHash(i),lakeHash(i+vec2(1,0)),f.x),mix(lakeHash(i+vec2(0,1)),lakeHash(i+vec2(1,1)),f.x),f.y);}
// Value noise with its analytic gradient (x: value, yz: d/dp).
vec3 lakeNoiseD(vec2 p){
 vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
 float a=lakeHash(i),b=lakeHash(i+vec2(1,0)),c=lakeHash(i+vec2(0,1)),d=lakeHash(i+vec2(1,1)),e=a-b-c+d;
 return vec3(a+(b-a)*u.x+(c-a)*u.y+e*u.x*u.y,du*(vec2(b-a,c-a)+e*u.yx));
}
// Wind chop: a few long swells plus rotated octaves of noise, each drifting
// downwind at the speed of water waves of its size (c=sqrt(g/k)). Returns the
// surface slope; detail smaller than a pixel fades out and becomes roughness.
vec2 lakeSlope(vec2 p,float footprint,float strength,out float lost){
 vec2 g=vec2(0.0);lost=0.0;float wind=atan(windDir.y,windDir.x),wavelength=5.3;
 for(int i=0;i<4;i++){
  float fi=float(i),angle=wind+sin(fi*2.39+.7)*.8,k=6.2831853/wavelength,steep=.018*strength;
  vec2 d=vec2(cos(angle),sin(angle));
  float fade=1.0-smoothstep(wavelength*.15,wavelength*.5,footprint);
  g+=d*steep*fade*cos(dot(d,p)*k-sqrt(9.81*k)*landTime+fi*2.1);
  lost+=steep*steep*.5*(1.0-fade);wavelength*=.63;
 }
 float size=1.7;
 for(int i=0;i<LAKE_OCTAVES;i++){
  float fi=float(i),angle=wind+(mod(fi,2.0)-.5)*.7,turn=fi*1.1+.4,speed=sqrt(9.81*size/6.2831853);
  mat2 r=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
  vec2 drift=vec2(cos(angle),sin(angle))*speed*landTime;
  vec3 n=lakeNoiseD(r*(p-drift)/size+fi*17.3);
  float steep=.075*strength,fade=1.0-smoothstep(size*.2,size*.7,footprint);
  g+=(n.yz*r)*steep*fade;
  lost+=steep*steep*.25*(1.0-fade);size*=.52;
 }
 return g;
}`;
const lakeSurface=`
vec2 lakeP=vLakeWorld.xz;${waveClip('lakeP')}
// Shoreline from the distance field, roughened so it does not follow the grid.
float lakeShore=texture2D(shoreMap,vec2((lakeP.x-shoreBounds.x)/shoreBounds.z,(-lakeP.y-shoreBounds.y)/shoreBounds.w)).r;
lakeShore+=(lakeNoise(lakeP*.19)-.5)*2.2+(lakeNoise(lakeP*.83)-.5)*.6;
if(lakeShore<-1.2)discard;
// Pixel size on the water, leaning to its long axis: at low angles the ripples
// stay as streaks across the view instead of fading to a flat sheet.
float lakeFootA=length(dFdx(lakeP)),lakeFootB=length(dFdy(lakeP));
float lakeFootprint=pow(min(lakeFootA,lakeFootB),.4)*pow(max(lakeFootA,lakeFootB),.6);
// Gusts sweep the lake: rippled streaks drawn out downwind beside glassy water.
// Water near the banks is sheltered.
vec2 lakeAlong=vec2(dot(lakeP,windDir),dot(lakeP,vec2(-windDir.y,windDir.x)))*vec2(.009,.026)-vec2(landTime*.05,0.0);
lakeAlong+=vec2(lakeNoise(lakeAlong*1.9+5.2),lakeNoise(lakeAlong*1.9-3.7))*.8;
float lakeWind=mix(.22,1.0,smoothstep(.3,.8,lakeNoise(lakeAlong)*.6+lakeNoise(lakeAlong*2.3+9.1)*.4))*mix(.35,1.0,smoothstep(0.0,14.0,lakeShore));
float lakeLost;vec2 lakeGrad=lakeSlope(lakeP,lakeFootprint,lakeWind,lakeLost);
// Around the car: the slope of the waves it pushes and the whitewater it churns.
float lakeFoam=0.0;
#ifdef LAKE_WAVES
lakeGrad+=vWaveSlope;lakeFoam=waveWhite(lakeP,vWave.x)*smoothstep(-1.0,.5,lakeShore);
#endif
vec3 lakeNormal=normalize(vec3(-lakeGrad.x,1.0,-lakeGrad.y));
// Murky urban water over the dug basin (0.2 m at the bank, 0.85 m out in the lake):
// the bed shows only in the first metres, anything sunk in it fades within a few spans.
vec3 lakeView=normalize(cameraPosition-vLakeWorld);
float lakeCosT=sqrt(1.0-(1.0-lakeView.y*lakeView.y)/1.777),lakeDepth=clamp(.2+.1*lakeShore,.02,.85);
float lakeCover=smoothstep(-1.2,1.6,lakeShore),lakeOpacity=lakeCover*(1.0-exp(-lakeDepth*3.0/max(lakeCosT,.15)));
diffuseColor.rgb=mix(lakeBed,diffuse,smoothstep(.2,.9,lakeOpacity));
#ifdef LAKE_WAVES
// Mud the tyres stir off the bed clouds the water behind the car.
diffuseColor.rgb=mix(diffuseColor.rgb,${WAVE_MUD},vWave.y*.75);lakeOpacity=max(lakeOpacity,vWave.y*.85*lakeCover);
#endif
// Churned water behind the car: white, rough and opaque.
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.5,.55,.52),lakeFoam*.85);lakeOpacity=max(lakeOpacity,lakeFoam*.9*lakeCover);
`;
const lakeReflection=`#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
{
 // Planar mirror of the scene. Ripples bend the reflected ray; the image shifts by that
 // angle on screen, which smears reflections downward at low angles as on a real lake.
 // The sky probe fills in where the mirror has no data.
 vec4 lakeClip=reflectionMatrix*vec4(vLakeWorld,1.0);
 vec3 lakeEye=normalize(vViewPosition),lakeFlat=normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);
 vec3 lakeRay=reflect(-lakeEye,normal),lakeMirrorRay=reflect(-lakeEye,lakeFlat);
 vec2 lakeUv=lakeClip.xy/lakeClip.w+vec2(lakeRay.x-lakeMirrorRay.x,lakeMirrorRay.y-lakeRay.y)*lakeLens*.5;
 vec2 lakeEdge=smoothstep(vec2(0.0),vec2(.04),lakeUv)*smoothstep(vec2(0.0),vec2(.04),1.0-lakeUv);
 float lakeMix=planarWeight*lakeEdge.x*lakeEdge.y*step(0.0,lakeClip.w);
 #ifdef LAKE_WAVES
 // Steep faces of the car's waves would pick random spots off the mirror: they take the sky probe.
 lakeMix*=1.0-smoothstep(.12,.35,length(vWaveSlope));
 #endif
 if(lakeMix>0.0)radiance=mix(radiance,texture2D(reflectionMap,lakeUv).rgb,lakeMix);
}
#endif`;
// Premultiplied output: the water colour fades over the bank, the reflection stays.
const lakeOutput=`gl_FragColor=vec4(totalDiffuse*lakeOpacity+(totalSpecular+totalEmissiveRadiance)*lakeCover,lakeOpacity);`;
const lakeFog=THREE.ShaderChunk.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );','gl_FragColor.rgb=gl_FragColor.rgb*(1.0-fogFactor)+fogColor*fogFactor*gl_FragColor.a;');

function lakeMaterial(uniforms,mobile,patch=false){
 const material=new THREE.MeshPhysicalMaterial({name:patch?'Agua_lago_realista_ondas':'Agua_lago_realista',color:new THREE.Color(.018,.034,.026),roughness:.03,metalness:0,ior:1.333,transparent:true,depthWrite:true,
  blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
 const planarWeight={value:0};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms,{planarWeight});
  shader.vertexShader=shader.vertexShader.replace(lakeVertex[0],lakeVertex[1]).replace(lakeVertex[2],lakeVertex[3]);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',lakeCommon).replace('#include <color_fragment>',lakeSurface)
   .replace('#include <roughnessmap_fragment>','float roughnessFactor=sqrt(sqrt(pow(roughness,4.0)+2.0*lakeLost))+lakeFoam*.45;')
   .replace('#include <normal_fragment_maps>','normal=normalize((viewMatrix*vec4(lakeNormal,0.0)).xyz);')
   .replace('#include <lights_fragment_maps>',lakeReflection).replace('#include <opaque_fragment>',lakeOutput).replace('#include <fog_fragment>',lakeFog);
 };
 material.defines={LAKE_OCTAVES:mobile?4:6,...(patch?{LAKE_WAVES:''}:{})};
 material.customProgramCacheKey=()=>'lake-realistic-v3'+(mobile?'-mobile':'')+(patch?'-waves':'');
 material.userData.planarWeight=planarWeight;
 return material;
}

// One flat surface per body over its bounding box; the shore field cuts the outline.
// A single planar reflection per frame, at the level of the nearest visible body.
// Around the car a denser patch, lifted by the waves, takes over from the flat surface.
function realisticLakes(field,bodies,shore,waves,{mobile=false}={}){
 const root=new THREE.Group();root.name='Lagos_realistas';
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
 target.texture.name='Reflexo_lagos';
 const reflectionMatrix=new THREE.Matrix4(),lens=new THREE.Vector2(1,1),uniforms={...waves.uniforms,landTime:shared.time,windDir:{value:new THREE.Vector2(.82,.57)},lakeLens:{value:lens},lakeBed:{value:new THREE.Color(.05,.045,.028)},
  shoreBounds:{value:shore.bounds},shoreMap:{value:shore.texture},reflectionMap:{value:target.texture},reflectionMatrix:{value:reflectionMatrix}};
 const {nx,x0,y0,sx,sy}=field,margin=4,lakes=[];
 for(const body of bodies){
  let k0=nx,k1=0,j0=Infinity,j1=0;
  for(const c of body.cells){const k=c%nx,j=(c-k)/nx;k0=Math.min(k0,k);k1=Math.max(k1,k);j0=Math.min(j0,j);j1=Math.max(j1,j);}
  const xa=x0+k0*sx-margin,xb=x0+(k1+1)*sx+margin,ya=y0+j0*sy-margin,yb=y0+(j1+1)*sy+margin;
  const geometry=new THREE.PlaneGeometry(xb-xa,yb-ya).rotateX(-Math.PI/2).translate((xa+xb)/2,body.level,-(ya+yb)/2);
  const material=lakeMaterial(uniforms,mobile),mesh=new THREE.Mesh(geometry,material);
  mesh.name='Lago_realista';mesh.receiveShadow=true;mesh.renderOrder=1;root.add(mesh);
  geometry.computeBoundingBox();lakes.push({mesh,level:body.level,box:geometry.boundingBox,weight:material.userData.planarWeight});
 }
 const patchMaterial=lakeMaterial(uniforms,mobile,true),patch=new THREE.Mesh(waves.patchGeometry(),patchMaterial),patchWeight=patchMaterial.userData.planarWeight;
 patch.name='Lago_realista_ondas';patch.receiveShadow=true;patch.renderOrder=1;patch.visible=false;root.add(patch);
 const virtual=new THREE.PerspectiveCamera(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),size=new THREE.Vector2();
 const eye=new THREE.Vector3(),look=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0),plane=new THREE.Plane(),clip=new THREE.Vector4(),q=new THREE.Vector4(),point=new THREE.Vector3();
 const scale=mobile?.35:.5,state={frame:0,rendered:-1,reflections:0,level:null};
 function reflect(renderer,scene,camera){
  // Rear-view mirror and other off-screen passes use the sky probe only; the film look's
  // main view (cinematic.js marks it isMainView) counts as the screen.
  const current=renderer.getRenderTarget();
  if(current&&!current.isMainView){for(const lake of lakes)lake.weight.value=0;patchWeight.value=0;state.rendered=-1;return;}
  if(state.rendered===state.frame)return;state.rendered=state.frame;state.level=null;
  for(const lake of lakes)lake.weight.value=0;patchWeight.value=0;
  matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
  eye.setFromMatrixPosition(camera.matrixWorld);
  let best=null,bestDistance=1600;
  for(const lake of lakes){if(eye.y<=lake.level+.05||!frustum.intersectsBox(lake.box))continue;const d=lake.box.distanceToPoint(eye);if(d<bestDistance){best=lake;bestDistance=d;}}
  if(!best)return;
  const level=best.level;state.level=level;
  // Mirror the camera through the water plane (same maths as three's Reflector).
  look.set(0,0,-1).applyQuaternion(camera.getWorldQuaternion(virtual.quaternion)).add(eye);
  virtual.position.set(eye.x,2*level-eye.y,eye.z);
  virtual.up.set(0,1,0).applyQuaternion(camera.getWorldQuaternion(virtual.quaternion));virtual.up.y*=-1;
  virtual.lookAt(look.x,2*level-look.y,look.z);virtual.near=camera.near;virtual.far=camera.far;virtual.layers.mask=camera.layers.mask;
  virtual.updateMatrixWorld();virtual.projectionMatrix.copy(camera.projectionMatrix);virtual.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  lens.set(camera.projectionMatrix.elements[0],camera.projectionMatrix.elements[5]);
  reflectionMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  // Oblique near plane at the water surface keeps the lake bed out of the mirror.
  plane.setFromNormalAndCoplanarPoint(normal,point.set(0,level,0)).applyMatrix4(virtual.matrixWorldInverse);
  clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const p=virtual.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  clip.multiplyScalar(2/clip.dot(q));p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1;p[14]=clip.w;
  renderer.getDrawingBufferSize(size);
  const w=Math.max(64,Math.round(size.x*scale)),h=Math.max(64,Math.round(size.y*scale));
  if(target.width!==w||target.height!==h)target.setSize(w,h);
  const shadows=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;root.visible=false;
  renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);if(!renderer.autoClear)renderer.clear();
  renderer.render(scene,virtual);
  renderer.setRenderTarget(current);renderer.shadowMap.autoUpdate=shadows;root.visible=true;
  state.reflections++;
  for(const lake of lakes)lake.weight.value=1-smooth(.3,1.2,Math.abs(lake.level-level));
  patchWeight.value=1-smooth(.3,1.2,Math.abs(waves.level-level));
 }
 for(const lake of lakes)lake.mesh.onBeforeRender=reflect;
 patch.onBeforeRender=reflect;
 return {root,target,patch,
  update(){state.frame++;},
  info:()=>({bodies:lakes.length,reflections:state.reflections,level:state.level,size:[target.width,target.height]}),
  dispose(){target.dispose();patch.geometry.dispose();patchMaterial.dispose();for(const lake of lakes){lake.mesh.geometry.dispose();lake.mesh.material.dispose();}}};
}

// Shoreline of the current circuit's lakes, for the terrain's wet banks (set by createLandscape).
const terrainShore={shoreMap:{value:null},shoreBounds:{value:new THREE.Vector4(0,0,1,1)},shoreOn:{value:0}};
export function terrainMaterial(textures,field,{ortho=null,mobile=false}={}){
 // Pushed back in depth: far away, roads and kerbs a few centimetres above it still win.
 const material=new THREE.MeshStandardMaterial({name:'Terreno_paisagem_v1',map:ortho,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:2});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,terrainShore,{grassMap:{value:textures.grass},wildMap:{value:textures.wild},concreteMap:{value:textures.concrete},grassNormalMap:{value:textures.grassNormal},
   trackField:{value:field.texture},fieldBounds:{value:new THREE.Vector4(field.x0,field.y0,field.width,field.height)}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLandWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLandWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D grassMap,wildMap,concreteMap,grassNormalMap,trackField,shoreMap;uniform vec4 fieldBounds,shoreBounds;uniform float shoreOn;varying vec3 vLandWorld;
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
// Mown verge beside the asphalt, with stripes parallel to the track. The cut lays the
// blades one way per stripe: seen along the cut a stripe is light, against it dark, so
// the pattern swaps as the view turns, like the verges of a real circuit.
float groomed=1.0-smoothstep(14.0,30.0,edgeDist);
vec2 fieldUV=vec2((vLandWorld.x-fieldBounds.x)/fieldBounds.z,(-vLandWorld.z-fieldBounds.y)/fieldBounds.w);
vec2 across=vec2(texture2D(trackField,fieldUV+vec2(3.0/fieldBounds.z,0.0)).g-lateral,texture2D(trackField,fieldUV+vec2(0.0,3.0/fieldBounds.w)).g-lateral);
vec2 cut=normalize(vec2(-across.y,across.x)+1e-5);cut.y=-cut.y;
float parity=step(.5,fract(lateral/6.0))*2.0-1.0,stripeEdge=smoothstep(.0,.06,abs(fract(lateral/6.0)-.5))*smoothstep(.0,.06,.5-abs(fract(lateral/6.0)-.5));
vec2 mowView=normalize(vLandWorld.xz-cameraPosition.xz+1e-4);
float sheen=dot(mowView,cut)*parity*stripeEdge;
float dryPatch=smoothstep(.55,.85,landNoise(w*.021+7.3)*.7+landNoise(w*.09)*.3);
vec3 lawn=grass*vec3(.5,.76,.36)*(1.0+.16*sheen)*mix(.9,1.05,macro);
lawn=mix(lawn,lawn*vec3(1.22,1.02,.7),dryPatch*.55);
// Worn, dusty strip where cars run wide off the kerbs.
float worn=(1.0-smoothstep(.6,3.2,edgeDist))*smoothstep(.35,.75,landNoise(w*.28)+landNoise(w*1.3)*.25);
lawn=mix(lawn,wild*vec3(.82,.68,.5),worn*.7);
vec3 ground=wild*vec3(.84,.94,.72)*mix(vec3(1.0),wildTint,.5)*mix(.8,1.1,macro);
ground=mix(ground,wild*vec3(.36,.42,.26),treeM);
ground=mix(ground,lawn,groomed*(1.0-pavedM)*(1.0-paintM));
vec3 asphalt=concrete*vec3(.33,.34,.35);
vec3 paved=mix(concrete*clamp(lum*1.25,.45,1.2),asphalt,groomed);
ground=mix(ground,paved,pavedM*(1.0-paintM));
ground=mix(ground,mix(asphalt*1.15,vec3(.03,.1,.085),.5),paintM);
ground=mix(ground,concrete*.55,roofM*(1.0-groomed));
// The aerial photograph reads correctly from afar and hides texture repetition.
ground=mix(ground,ortho*vec3(.9,.94,.86),smoothstep(220.0,1100.0,viewDist)*.75);
// Lake bed and a damp, darker bank along the smooth shoreline (the cell flags would show steps).
float shoreD=shoreOn>.5?texture2D(shoreMap,vec2((vLandWorld.x-shoreBounds.x)/shoreBounds.z,(-vLandWorld.z-shoreBounds.y)/shoreBounds.w)).r:-24.0;
float lakeBedM=shoreOn>.5?smoothstep(-.4,.5,shoreD):waterBed,bankM=smoothstep(-3.2,-.3,shoreD)*(1.0-lakeBedM)*shoreOn;
ground=mix(ground,ground*vec3(.58,.55,.46),bankM*.75);
ground=mix(ground,vec3(.035,.045,.03),lakeBedM);
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
 material.customProgramCacheKey=()=>'terrain-landscape-v3-'+(ortho?'ortho':'cerrado')+(mobile?'-mobile':'');
 return material;
}

// --- Instanced scenery -------------------------------------------------------
function merge(parts){
 for(const p of parts){if(p.geometry.index)p.geometry=p.geometry.toNonIndexed();p.facet??=.35;}
 let count=0;for(const p of parts)count+=p.geometry.attributes.position.count;
 const position=new Float32Array(count*3),normal=new Float32Array(count*3),color=new Float32Array(count*3),mask=new Float32Array(count),uvs=new Float32Array(count*2);let offset=0;
 for(const p of parts){
  const pos=p.geometry.attributes.position,nor=p.geometry.attributes.normal,uv=p.leaf?p.geometry.attributes.uv:null;
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),o=offset+i;position.set([x,y,z],o*3);
   let n=[nor.getX(i),nor.getY(i),nor.getZ(i)];
   if(p.center){const d=[x-p.center[0],y-p.center[1],z-p.center[2]],l=Math.hypot(...d)||1;n=n.map((v,k)=>v*p.facet+d[k]/l*(1-p.facet));const l2=Math.hypot(...n);n=n.map(v=>v/l2);}
   normal.set(n,o*3);color.set(p.color(x,y,z),o*3);mask[o]=p.mask;
   // Leaf cards use the cluster drawn in the atlas; everything else its solid corner.
   if(uv)uvs.set([uv.getX(i)*LEAF_SPAN,uv.getY(i)*LEAF_SPAN],o*2);else uvs.set(SOLID_UV,o*2);
  }
  offset+=pos.count;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));g.setAttribute('color',new THREE.BufferAttribute(color,3));g.setAttribute('partMask',new THREE.BufferAttribute(mask,1));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
 g.computeBoundingSphere();return g;
}
// Leaf atlas: one cluster of leaves over most of the square, and an opaque white corner
// for trunks and branches. Grey-green so each tree's own colour still tints it.
const LEAF_SPAN=.94,SOLID_UV=[.985,.985];
let leafAtlas=null;
function leafTexture(){
 if(leafAtlas)return leafAtlas;
 const size=256,data=new Uint8Array(size*size*4),rand=random(4242);
 for(let y=size-8;y<size;y++)for(let x=size-8;x<size;x++)data.set([255,255,255,255],(y*size+x)*4);
 const span=size*LEAF_SPAN,c=span/2;
 // Inner leaves first and darker: the cluster shades itself toward its middle.
 const leaves=[];
 for(let i=0;i<190;i++){const r=Math.sqrt(rand())*c*.8,a=rand()*Math.PI*2;leaves.push({x:c+Math.cos(a)*r,y:c+Math.sin(a)*r,r});}
 leaves.sort((u,v)=>u.r-v.r);
 for(const leaf of leaves){
  const angle=rand()*Math.PI*2,len=9+rand()*9,wid=3.2+rand()*2.6,ca=Math.cos(angle),sa=Math.sin(angle);
  const shade=.52+.4*(leaf.r/c)+rand()*.14,warm=rand()<.5,tint=warm?[1.04,1,.86]:[.9,1,.98];
  const x0=Math.max(0,Math.floor(leaf.x-len)),x1=Math.min(Math.floor(span)-1,Math.ceil(leaf.x+len)),y0=Math.max(0,Math.floor(leaf.y-len)),y1=Math.min(Math.floor(span)-1,Math.ceil(leaf.y+len));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const dx=x+.5-leaf.x,dy=y+.5-leaf.y,u=(dx*ca+dy*sa)/len,v=(-dx*sa+dy*ca)/wid;
   if(Math.abs(u)>1||Math.abs(v)>1-u*u)continue;
   // Lit half and a faint midrib.
   const k=Math.min(1,shade*(v>0?1.08:.9)*(Math.abs(v)<.12?.9:1)),i=(y*size+x)*4;
   data[i]=Math.round(255*Math.min(1,k*tint[0]));data[i+1]=Math.round(255*Math.min(1,k*tint[1]));data[i+2]=Math.round(255*Math.min(1,k*tint[2]));data[i+3]=255;
  }
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;
 leafAtlas=texture;return texture;
}
// A crown of crossed leaf cards on an ellipsoid shell. Normals point out of the crown
// (soft, rounded light like a real canopy); inner and lower cards are darker.
function leafCrown(parts,rand,{center,radii,cards,size}){
 for(let i=0;i<cards;i++){
  const u=rand()*2-1,a=rand()*Math.PI*2,shell=.55+.45*Math.cbrt(rand()),h=Math.sqrt(1-u*u);
  const c=[center[0]+Math.cos(a)*h*radii[0]*shell,center[1]+u*radii[1]*shell,center[2]+Math.sin(a)*h*radii[2]*shell];
  const s=size*(.8+rand()*.45),depth=shell;
  for(let k=0;k<2;k++){
   const g=new THREE.PlaneGeometry(s,s);g.rotateX((rand()-.5)*1.6);g.rotateY(rand()*Math.PI);g.rotateZ((rand()-.5)*.8);g.translate(...c);
   parts.push({geometry:g,mask:1,leaf:true,center,facet:.18,color:(x,y)=>{const low=smooth(center[1]-radii[1],center[1]+radii[1]*.8,y),v=(.5+.5*low)*(.62+.38*depth);return [v,v,v];}});
  }
 }
}
function branch(parts,from,to,r0,r1,bark){
 const d=new THREE.Vector3(...to).sub(new THREE.Vector3(...from)),len=d.length();
 const g=new THREE.CylinderGeometry(r1,r0,len,5,1,true).translate(0,len/2,0);
 g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...from);
 parts.push({geometry:g,mask:0,color:()=>bark});
}
// Near trees: trunk, a few limbs and a leaf-card crown (1 m tall unit; instances scale them).
function foliageTreeGeometry(kind,seed,detail=1){
 const rand=random(seed),parts=[],bark=[.13,.11,.09],far=detail===0;
 if(kind==='tall'){
  branch(parts,[0,0,0],[0,.8,0],.028,.012,bark);
  if(!far)for(let i=0;i<3;i++){const a=rand()*Math.PI*2,y=.5+i*.1;branch(parts,[0,y,0],[Math.cos(a)*.11,y+.12,Math.sin(a)*.11],.009,.004,bark);}
  leafCrown(parts,rand,{center:[0,.7,0],radii:[.2,.3,.2],cards:far?9:30,size:far?.3:.2});
 }else{
  branch(parts,[0,0,0],[.02,.42,0],.05,.03,bark);
  if(!far)for(let i=0;i<4;i++){const a=i/4*Math.PI*2+rand()*.8;branch(parts,[.02,.36+rand()*.06,0],[Math.cos(a)*.22,.6+rand()*.12,Math.sin(a)*.22],.022,.01,bark);}
  leafCrown(parts,rand,{center:[0,.64,0],radii:[.44,.3,.44],cards:far?12:40,size:far?.42:.3});
 }
 return merge(parts);
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
// Unit houses. partMask: 0 plastered wall, 1 roof (instance colour), 2 fixed colour, 3 wall of a
// laje house (bare brick, block or plaster, picked in the shader).
function houseGeometry(flat){
 if(flat==='laje'){
  const parts=[{geometry:new THREE.BoxGeometry(1,1.35,1).translate(0,.325,0),mask:3,color:()=>[1,1,1]},
   {geometry:new THREE.BoxGeometry(1.04,.05,1.04).translate(0,1.02,0),mask:1,color:()=>[1,1,1]},
   {geometry:new THREE.CylinderGeometry(.07,.07,.13,10).translate(.22,1.11,-.2),mask:2,color:()=>[.08,.2,.42]},
   {geometry:new THREE.BoxGeometry(1.02,.08,.03).translate(0,1.07,.5),mask:3,color:()=>[1,1,1]}];
  return merge(parts);
 }
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
function sceneryMaterial(kind,{foliage=false}={}){
 const material=new THREE.MeshStandardMaterial({name:{tree:'Arvores_instanciadas',house:'Casas_instanciadas',crowd:'Torcida_instanciada'}[kind],vertexColors:true,roughness:kind==='tree'?.88:.82,metalness:0});
 if(foliage)Object.assign(material,{map:leafTexture(),alphaTest:.45,alphaToCoverage:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  if(foliage){
   // Keep the leaves' coverage in the smaller mipmaps (they would thin out with distance),
   // and give both faces of a card the crown's outward normal.
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
vec4 leafTexel=texture2D(map,vMapUv);
float leafLod=max(0.0,log2(max(length(dFdx(vMapUv*256.0)),length(dFdy(vMapUv*256.0)))));
leafTexel.a=min(1.0,leafTexel.a*(1.0+leafLod*.3));
diffuseColor*=leafTexel;`).replace('normal *= faceDirection;','').replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
 // Sunlight through the leaves when the sun is behind the crown.
 float leafBack=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),5.0);
 reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*leafBack*.4*step(vMapUv.x,.95);
#endif`);
  }
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
  // Laje houses: mostly bare orange brick, some grey block, some painted.
  vec3 brick=seed<.55?vec3(.4,.19,.1)*(.85+.3*fract(seed*17.0)):seed<.75?vec3(.36,.36,.34):wall;
  vColor.rgb*=partMask>2.5?brick:partMask>1.5?vec3(1.0):mix(wall,instanceColor.rgb,partMask);
 #elif defined(CROWD)
  // partMask: 0 fixed colour, 1 shirt (instance colour), 2 skin, 3 trousers, 4 hair or cap.
  float who=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9898,78.233)))*43758.5453),who2=fract(who*91.7),who3=fract(who*37.3);
  vec3 skinTone=mix(vec3(.6,.4,.28),vec3(.16,.09,.055),who2*who2*.85+who2*.15);
  vec3 trousers=who3<.45?vec3(.05,.08,.15):who3<.7?vec3(.03,.03,.035):who3<.85?vec3(.28,.24,.16):vec3(.36,.36,.38);
  vec3 hairOrCap=who<.22?instanceColor.rgb*.8:who<.3?vec3(.7,.7,.68):who<.36?vec3(.03,.03,.035):who3<.2?vec3(.25,.18,.1):vec3(.03,.025,.02);
  vColor.rgb*=partMask<.5?vec3(1.0):partMask<1.5?instanceColor.rgb:partMask<2.5?skinTone:partMask<3.5?trousers:hairOrCap;
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
float houseWindow=0.0;
if((vPart<.5||vPart>2.5)&&abs(vPartNormal.y)<.5){
 float along=abs(vPartNormal.x)>.5?vPartLocal.z*vPartScale.z:vPartLocal.x*vPartScale.x,up=vPartLocal.y*vPartScale.y;
 float cellA=fract(along/3.1),cellU=fract(up/2.9);
 houseWindow=step(.3,cellA)*step(cellA,.7)*step(.4,cellU)*step(cellU,.8)*step(.5,up)*step(up,vPartScale.y-.2);
 // Frame round the glass.
 float frame=step(.27,cellA)*step(cellA,.73)*step(.37,cellU)*step(cellU,.83)*(1.0-houseWindow);
 // Rain streaks under the sills, grime rising from the pavement, a band at each floor slab.
 float streak=(1.0-houseWindow)*step(.34,cellA)*step(cellA,.66)*(1.0-smoothstep(0.0,.4,cellU))*.12;
 float grime=1.0-.28*(1.0-smoothstep(0.0,1.4,up));
 float slab=vPartScale.y>7.0?(1.0-smoothstep(0.0,.02,abs(cellU-.06)))*.18:0.0;
 float course=vPart>2.5?(1.0-smoothstep(0.0,.12,fract(up/.2)))*.15:0.0;
 diffuseColor.rgb*=grime*(1.0-streak-course)+slab;
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.77,.74),frame*.8);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.02,.025,.03),houseWindow*.92);
}`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
// Glass is smooth: it mirrors the sky and the neighbours instead of looking painted on.
roughnessFactor=mix(roughnessFactor,.06,houseWindow);`);
 };
 material.defines={tree:{TREES:''},house:{HOUSES:''},crowd:{CROWD:''}}[kind];
 material.customProgramCacheKey=()=>'scenery-'+kind+(foliage?'-foliage':'')+'-v5';
 return material;
}
function chunked(name,geometry,material,items,compose,{size=380,shadows=true}={}){
 const root=new THREE.Group(),groups=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color();root.name=name;
 for(const item of items){const key=Math.floor(item.x/size)+':'+Math.floor(item.y/size);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 for(const list of groups.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name=name+'_bloco';
  list.forEach((item,i)=>{compose(item,matrix,color);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color);item.instance={mesh,index:i};});
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
 const trees=[],tall=[],houses=[],flats=[],lajes=[];
 const {x0,y0,width,height}=field;
 let bodies=[],simpleWater=null,simplePatch=null,lakes=null,shore=null,waves=null;terrainShore.shoreOn.value=0;terrainShore.shoreMap.value=null;
 // Lakes for the car: the surface over a point (null on land), the nearest lake from the
 // bank, and the waves the car pushes (lake-waves.js), shown by a patch that follows it.
 const water={
  at(x,y){if(!shore)return null;const s=shore.distance(x,y);if(s<-1.5)return null;const body=shore.body(x,y);return body?{level:body.level,shore:s,depth:lakeBedDepth(s)}:null;},
  near(x,y){if(!shore)return null;const body=shore.body(x,y);return body?{level:body.level,shore:shore.distance(x,y)}:null;},
  waves:null
 };
 // Trunks and walls stay out of the water: clear of the shore, and above the level beside a lake.
 const dry=(x,y,clearance)=>{
  if(!shore)return true;const s=shore.distance(x,y);if(s>-clearance)return false;if(s<-8)return true;
  const body=shore.body(x,y);return !body||terrainHeight(data,x,y)>body.level+.35;
 };
 if(ortho){
  bodies=findWater(field,ortho,data);field.upload();stats.water=bodies.length;
  if(bodies.length){
   shore=shoreField(field,bodies);stats.lakeBed=digLakeBeds(data.terrain,data.terrain.z,shore);
   terrainShore.shoreMap.value=shore.texture;terrainShore.shoreBounds.value.copy(shore.bounds);terrainShore.shoreOn.value=1;
   waves=water.waves=new LakeWaves(water,{mobile});
   simpleWater=waterMesh(field,bodies,waves,shore);root.add(simpleWater);
   simplePatch=new THREE.Mesh(waves.patchGeometry(),simpleWaterMaterial(shore,waves,true));simplePatch.name='Lago_ondas';simplePatch.receiveShadow=true;simplePatch.visible=false;root.add(simplePatch);
  }
  const spacing=mobile?8.5:6;
  for(let y=y0+spacing/2;y<y0+height;y+=spacing)for(let x=x0+spacing/2;x<x0+width;x+=spacing){
   const px=x+(rand()-.5)*spacing*.9,py=y+(rand()-.5)*spacing*.9,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.water[cell]||!dry(px,py,2.5))continue;const edge=field.edge[cell],cover=landCover(ortho,i);
   if(edge>9&&cover.tree>.45&&rand()<Math.pow(cover.tree,1.4)*.9){
    const h=(edge<25?6:7.5)+rand()*6.5,list=rand()<.22?tall:trees;
    const tree={x:px,y:py,z:terrainHeight(data,px,py)-.3,height:list===tall?h*1.45:h,width:(list===tall?.75:.9)*h*(.8+rand()*.35),turn:rand()*Math.PI*2,color:treeColor(rand)};
    // The crown (about half the width across) stays 2 m clear of roads, garages and stands.
    if(edge>tree.width/2+2)list.push(tree);
   }
  }
  // Houses follow the local street grid: the orientation of the photo's edges.
  const houseSpacing=mobile?11:8.2,ow=ortho.w;
  for(let y=y0+houseSpacing/2;y<y0+height;y+=houseSpacing)for(let x=x0+houseSpacing/2;x<x0+width;x+=houseSpacing){
   const px=x+(rand()-.5)*2.5,py=y+(rand()-.5)*2.5,i=ortho.index(px,py),cell=field.cell(px,py);
   if(i<0||cell<0||field.inside[cell]||field.water[cell]||field.edge[cell]<42||!dry(px,py,6))continue;
   const cover=landCover(ortho,i);if(cover.roof<.5||rand()>.92)continue;
   let xx=0,yy=0,xy=0;const cx=i%ow,cy=(i-cx)/ow;
   for(let v=-4;v<=4;v++)for(let u=-4;u<=4;u++){const a=(Math.min(ortho.h-2,Math.max(1,cy+v)))*ow+Math.min(ow-2,Math.max(1,cx+u)),gx=ortho.lum[a+1]-ortho.lum[a-1],gy=ortho.lum[a+ow]-ortho.lum[a-ow];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}
   const turn=.5*Math.atan2(2*xy,xx-yy),tallBuilding=rand()<.04,floors=tallBuilding?3+Math.floor(rand()*5):rand()<.62?1:2;
   const w=6+rand()*3.5,d=8+rand()*5,corner=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>terrainHeight(data,px+a*w*.5,py+b*d*.5));
   const item={x:px,y:py,z:Math.min(...corner)-.15,w,d,h:floors*3+.4+rand()*.6,turn:-turn,color:tallBuilding?[.42,.43,.44]:[.42+rand()*.16,.11+rand()*.06,.04+rand()*.03]};
   if(!tallBuilding&&rand()<.4){item.color=[.47,.46,.44];lajes.push(item);}else (tallBuilding?flats:houses).push(item);
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
 const treeMaterial=sceneryMaterial('tree',{foliage:!mobile}),build=mobile?treeGeometry:foliageTreeGeometry;
 // Trees are chunked in 200 m blocks; each block picks near or distant crowns every frame.
 const lodBlocks=[];
 for(const [list,kind,seed,name] of [[trees,'round',11,'Arvores'],[tall,'tall',23,'Arvores_altas']]){
  if(!list.length)continue;const near=build(kind,seed,1),far=build(kind,seed,0);for(const item of list)item.kind=kind;
  const group=chunked(name,near,treeMaterial,list,composeTree,{size:200});root.add(group);
  for(const mesh of group.children){mesh.geometry=far;lodBlocks.push({mesh,near,far,center:mesh.boundingSphere.center.clone(),radius:mesh.boundingSphere.radius});}
 }
 const lodDistance=mobile?80:130;
 const houseMaterial=sceneryMaterial('house'),composeHouse=(item,matrix,color)=>{matrix.compose(new THREE.Vector3(item.x,item.z,-item.y),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),item.turn),new THREE.Vector3(item.w,item.h,item.d));color.setRGB(...item.color);};
 if(houses.length)root.add(chunked('Casas',houseGeometry(false),houseMaterial,houses,composeHouse,{size:450}));
 if(flats.length)root.add(chunked('Predios',houseGeometry(true),houseMaterial,flats,composeHouse,{size:900}));
 if(lajes.length)root.add(chunked('Casas_laje',houseGeometry('laje'),houseMaterial,lajes,composeHouse,{size:450}));
 const horizon=createHorizon(data,field,rand,{mobile,urban:style!=='cerrado'});root.add(horizon.root);
 Object.assign(stats,{trees:trees.length+tall.length,houses:houses.length+flats.length+lajes.length+horizon.buildings,chunks:0});root.traverse(o=>{if(o.isInstancedMesh)stats.chunks++;});
 let realistic=false;
 return {root,stats,dispose(){for(const block of lodBlocks){block.near.dispose();block.far.dispose();}lakes?.dispose();shore?.texture.dispose();waves?.dispose();simplePatch?.geometry.dispose();simplePatch?.material.dispose();},update(dt,camera){
  shared.time.value+=dt;lakes?.update();
  if(waves){waves.sync();const patch=realistic?lakes?.patch:simplePatch;if(simplePatch)simplePatch.visible=false;if(lakes)lakes.patch.visible=false;if(patch&&waves.active){patch.visible=true;waves.placePatch(patch);}}
  if(!camera)return;
  for(const block of lodBlocks){const geometry=camera.position.distanceTo(block.center)-block.radius<lodDistance?block.near:block.far;if(block.mesh.geometry!==geometry)block.mesh.geometry=geometry;}
 },
 // Trees give way to later trackside structures (marshal posts, TV towers): points {x,y,r} in track metres.
 clearAround(points){
  let removed=0;const zero=new THREE.Matrix4().makeScale(0,0,0),changed=new Set();
  for(const item of [...trees,...tall]){
   if(item.removed||!item.instance||!points.some(q=>Math.hypot(item.x-q.x,item.y-q.y)<q.r+item.width*.45))continue;
   item.removed=true;item.instance.mesh.setMatrixAt(item.instance.index,zero);changed.add(item.instance.mesh);removed++;
  }
  for(const mesh of changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  stats.cleared=(stats.cleared??0)+removed;return removed;
 },
 // Standing trees, for their trunks (tree-contact.js): position, size, kind, colour and instance.
 trunks:()=>[...trees,...tall].filter(t=>!t.removed&&t.instance),
 // The physics ground was dug when the lakes were found; the visible terrain grid gets the same basin.
 digLakeBeds:heights=>shore?digLakeBeds(data.terrain,heights,shore):0,
 water,
 // Opt-in lakes with planar reflections; built the first time they are switched on.
 setRealisticWater(on){
  realistic=!!on;if(!bodies.length)return;
  if(realistic&&!lakes){lakes=realisticLakes(field,bodies,shore,waves,{mobile});root.add(lakes.root);}
  simpleWater.visible=!realistic;if(lakes)lakes.root.visible=realistic;
 },
 // The wave patch is hidden until the car nears a lake: show it while the programs compile at loading.
 revealWaves(on){if(!waves)return;const patch=realistic?lakes?.patch:simplePatch;if(patch)patch.visible=on||waves.active;},
 // The mirror pass renders into a linear target: compile those program variants during loading too.
 async compileWater(renderer,scene,camera){
  if(!realistic||!lakes)return;const previous=renderer.getRenderTarget();renderer.setRenderTarget(lakes.target);
  let pending;try{pending=renderer.compileAsync(scene,camera);}finally{renderer.setRenderTarget(previous);}await pending;
 },
 waterInfo:()=>({realistic,bodies:bodies.length,simpleVisible:!!simpleWater?.visible,waves:waves?.info()??null,...(realistic&&lakes?lakes.info():{reflections:0,level:null,size:null}),
  lakes:bodies.map(b=>{let x=0,y=0;for(const c of b.cells){const k=c%field.nx;x+=k;y+=(c-k)/field.nx;}return {level:b.level,area:Math.round(b.cells.length*field.sx*field.sy),center:[field.x0+(x/b.cells.length+.5)*field.sx,field.y0+(y/b.cells.length+.5)*field.sy]};})})};
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
// box; its top face gives the row. A step may also be {corners, face: [x, z]},
// the direction its fans look. Instanced in one draw call per circuit.
export function createCrowd(steps,{mobile=false}={}){
 const rand=random(steps.length*131+7),items=[];
 for(const step of steps){
  const corners=step.corners??step,face=step.face;
  // Order the four corners around the centre so consecutive points share an edge.
  const mx=corners.reduce((v,q)=>v+q.x,0)/4,mz=corners.reduce((v,q)=>v+q.z,0)/4,top=[...corners].sort((u,v)=>Math.atan2(u.z-mz,u.x-mx)-Math.atan2(v.z-mz,v.x-mx));
  const [a,b,c,d]=top,cx=(a.x+b.x+c.x+d.x)/4,cz=(a.z+b.z+c.z+d.z)/4,y=Math.max(a.y,b.y,c.y,d.y);
  // Longest edge of the top face is the row direction.
  const edges=[[a,b],[b,c],[c,d],[d,a]].map(([p,q])=>({dx:q.x-p.x,dz:q.z-p.z,l:Math.hypot(q.x-p.x,q.z-p.z)})).sort((u,v)=>v.l-u.l),row=edges[0];
  if(row.l<4)continue;let ux=row.dx/row.l,uz=row.dz/row.l;
  // Fans look along (-uz, ux): turn the row so that is the requested direction.
  if(face&&face[1]*ux-face[0]*uz<0){ux=-ux;uz=-uz;}
  const turn=Math.atan2(-uz,ux);
  for(let t=-row.l/2+.4;t<row.l/2-.3;t+=mobile?.9:.62){
   if(rand()<.22)continue;
   // Race-day shirts: mostly white, black, grey and navy, many Brazil yellow and green, a few team colours.
   const pick=rand(),shirt=pick<.2?[.72,.72,.7]:pick<.33?[.035,.035,.04]:pick<.41?[.3,.3,.3]:pick<.51?[.04,.07,.2]:pick<.65?[.66,.52,.05]:pick<.73?[.03,.22,.07]:pick<.8?[.45,.04,.03]:pick<.85?[.2,.38,.6]:pick<.88?[.62,.24,.04]:[.08+rand()*.3,.08+rand()*.25,.08+rand()*.25];
   items.push({x:cx+ux*(t+(rand()-.5)*.12),y:-(cz+uz*(t+(rand()-.5)*.12)),z:y,turn,color:shirt,scale:.9+rand()*.2});
  }
 }
 const parts=[],white=()=>[1,1,1],limb=(r,from,to,mask,sides)=>{
  const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a),len=d.length();
  const g=new THREE.CylinderGeometry(r,r*.9,len,sides,1,true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());
  parts.push({geometry:g,mask,color:white});
 };
 // A seated fan facing +z: torso, arms resting on the thighs, legs down to the step below.
 const sides=mobile?4:6;
 parts.push({geometry:new THREE.CylinderGeometry(.165,.14,.5,sides+2).scale(1,1,.62).translate(0,.53,0),mask:1,color:white});
 for(const x of [-1,1]){
  // T-shirt sleeves, bare forearms.
  limb(.055,[x*.2,.76,0],[x*.21,.47,.1],1,sides);limb(.04,[x*.21,.47,.1],[x*.12,.35,.34],2,sides);
  limb(.075,[x*.09,.3,.02],[x*.1,.31,.36],3,sides);limb(.06,[x*.1,.3,.38],[x*.1,-.08,.42],3,sides);
  parts.push({geometry:new THREE.BoxGeometry(.1,.08,.24).translate(x*.1,-.13,.47),mask:0,color:()=>[.05,.05,.055]});
 }
 parts.push({geometry:new THREE.CylinderGeometry(.05,.055,.1,6,1,true).translate(0,.81,0),mask:2,color:white});
 parts.push({geometry:new THREE.SphereGeometry(.105,mobile?6:8,mobile?4:6).scale(.92,1.12,1).translate(0,.95,.01),mask:2,color:white});
 parts.push({geometry:new THREE.SphereGeometry(.112,mobile?6:8,3,0,Math.PI*2,0,Math.PI*.42).scale(.94,1.1,1.02).translate(0,.97,-.01),mask:4,color:white});
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
 // Cast concrete, not gravel: soften the aggregate toward its average and add broad weathering.
 vec3 wallAvg=texture2D(concreteMap,vStructWorld.xz/3.2,9.0).rgb;
 wall=wallAvg+(wall-wallAvg)*.42;
 float weather=texture2D(concreteMap,vStructWorld.xz/41.0+vec2(vStructWorld.y*.021,0.0)).g/max(wallAvg.g,.01);
 diffuseColor.rgb*=wall*1.9*mix(.86,1.08,clamp(weather-.5,0.0,1.0))*(1.0-.12*blendN.y);
#elif STRUCTURE_KIND==2
 // Roller doors: horizontal ribs.
 float rib=smoothstep(.35,.5,abs(fract(vStructWorld.y*5.0)-.5));
 diffuseColor.rgb*=mix(.72,1.05,rib)*mix(vec3(1.0),wall*2.0,.35);
#else
 diffuseColor.rgb*=mix(vec3(1.0),wall*2.0,.45);
#endif`);
  };
  upgraded.defines={STRUCTURE_KIND:kind==='concrete'?1:kind==='metal'?2:3};
  upgraded.customProgramCacheKey=()=>'structure-'+kind+'-v2';
 }
 cache.set(key,upgraded);return upgraded;
}
