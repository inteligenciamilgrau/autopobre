import * as THREE from 'three';
import {TestCar,clamp,wrap,GUARDRAIL_CLEARANCE,guardrailClearance,guardrailSections} from './physics.js';
import {pitLane} from './pit-lane.js';
import {sceneryBands,bandClearance} from './track-clearance.js';

// Billboards stand this far (metres) from roads, garages and the grandstands' margin.
export const BOARD_CLEARANCE=6.5;
// Sixteen slots for boards facing the approaching drivers, alternating sides. Each board
// keeps off every road (the other straights too), out of the garages, out of the
// grandstands' view and away from the other boards: it tries the other side, then slides
// along the track up to 150 m. A slot with no clear place gets no board (slot keeps the
// artwork alternating).
export function billboardSpots(data){
 const length=data.meta.reconstructed_xy_m,bands=sceneryBands(data),spots=[],shifts=[0];
 for(let d=12;d<=150;d+=12)shifts.push(d,-d);
 for(let slot=0;slot<16;slot++){
  const start=slot===0?length-30:slot===1?70:230+(slot-2)*(length-480)/14;
  search:for(const shift of shifts)for(const side of [slot%2?1:-1,slot%2?-1:1]){
   const s=((start+shift)%length+length)%length,index=Math.max(0,data.samples.findIndex(q=>q[0]>=s)),p=data.samples[index];
   const offset=side*(p[4]/2+guardrailClearance(data,p[0],side)+5),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
   const clearance=bandClearance(bands,x,y).distance;
   if(clearance>BOARD_CLEARANCE&&spots.every(b=>Math.hypot(b.x-x,b.y-y)>25)){spots.push({slot,index,p,side,x,y,clearance});break search;}
  }
 }
 return spots;
}

export async function createTrackBranding(data){
 const loader=new THREE.TextureLoader(),[oldStock,game]=await Promise.all([
  loader.loadAsync('./assets/branding/old_stock_preparada_v1.jpg'),
  loader.loadAsync('./assets/abertura/logo_auto_pobre_racing.webp'),
 ]);for(const texture of [oldStock,game]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;}
 const root=new THREE.Group();root.name='Outdoors_AutoPobre_OldStock';
 const frameMaterial=new THREE.MeshStandardMaterial({color:0x263a3a,roughness:.8,metalness:.3});
 const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),dark=new THREE.MeshStandardMaterial({color:0x142a27,roughness:1});
 const artwork=[new THREE.MeshBasicMaterial({map:oldStock}),new THREE.MeshBasicMaterial({map:game,transparent:true})];
 for(const material of [white,dark,...artwork]){material.polygonOffset=true;material.polygonOffsetFactor=artwork.includes(material)?-4:-2;material.polygonOffsetUnits=artwork.includes(material)?-4:-2;}
 const probe=new TestCar(data),spots=billboardSpots(data);
 for(const {slot:i,index,p,side,x,y} of spots){
  probe.index=index;const ground=probe.sample(x,y).z;
  const board=new THREE.Group();board.name=i%2?'Outdoor_AutoPobre':'Outdoor_OldStock';board.position.set(x,ground,-y);
  // Face the approaching driver, rather than presenting the edge of the sign.
  const fx=-p[7]*.8+p[8]*side*.6,fz=p[8]*.8+p[7]*side*.6;board.rotation.y=Math.atan2(fx,fz);
  for(const post of [-4.5,4.5]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.22,5.9,.22),frameMaterial);leg.position.set(post,2.95,0);leg.castShadow=true;board.add(leg);}
  const backing=new THREE.Mesh(new THREE.BoxGeometry(12.4,5.9,.22),frameMaterial);backing.position.y=4.8;backing.castShadow=true;board.add(backing);
  const field=new THREE.Mesh(new THREE.PlaneGeometry(12,5.5),i%2?dark:white);field.position.set(0,4.8,.13);board.add(field);
  const width=i%2?10.6:7.8,height=i%2?5.3:5.2;
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(width,height),artwork[i%2]);logo.position.set(0,4.8,.15);board.add(logo);root.add(board);
 }
 const autoPobre=spots.filter(b=>b.slot%2).length;
 return {root,oldStock,stats:{billboards:spots.length,oldStock:spots.length-autoPobre,autoPobre}};
}

// Painted kerb: 1.2 m blocks (Interlagos yellow/green; circuits from open data give their
// own colours in meta.kerb_colors), worn paint, rubber on the track side and shallow
// rumble ridges. DataTextures keep this usable in Node tests.
const curbMaps=new Map();
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function curbTextures(colors=['#e2b22e','#1a7034']){
 const key=colors.join();if(curbMaps.has(key))return curbMaps.get(key);
 const w=64,h=256,color=new Uint8Array(w*h*4),normal=new Uint8Array(w*h*4);
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const a=hash(ix%16,iy%64),b=hash((ix+1)%16,iy%64),c=hash(ix%16,(iy+1)%64),d=hash((ix+1)%16,(iy+1)%64);return (a+(b-a)*sx)+((c+(d-c)*sx)-(a+(b-a)*sx))*sy;};
 const [yellow,green]=colors.map(rgb);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,u=x/w,base=y<h/2?yellow:green,edge=Math.min(y%(h/2),h/2-1-y%(h/2));
  const wear=.78+.22*noise(x/6,y/6)*noise(x/2,y/2+7),rubber=Math.max(0,1-u/.45)*(.25+.35*noise(x/3,y/9)),seam=edge<2?.72:1;
  for(let k=0;k<3;k++)color[i+k]=Math.round(base[k]*wear*seam*(1-rubber)+18*rubber);
  color[i+3]=255;
  // Ridge every 0.4 m along the kerb (six per 2.4 m tile), fading toward the outer edge.
  const slope=Math.cos(y/h*Math.PI*2*6)*.55*(1-u*.4),nx=(noise(x/4,y/4)-.5)*.12,len=Math.hypot(nx,slope,1);
  normal[i]=Math.round((nx/len*.5+.5)*255);normal[i+1]=Math.round((-slope/len*.5+.5)*255);normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
 }
 const make=(data,srgb)=>{const t=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;};
 const maps={map:make(color,true),normalMap:make(normal,false)};curbMaps.set(key,maps);return maps;
}

export function createCurbs(data){
 const root=new THREE.Group();root.name='Zebras_circuito_completo';
 const probe=new TestCar(data),profile=[[0,.02],[.48,.065],[1.05,.02]],L=data.meta.reconstructed_xy_m;
 const maps=curbTextures(data.meta.kerb_colors),material=new THREE.MeshStandardMaterial({name:'Zebra_pintada',map:maps.map,normalMap:maps.normalMap,normalScale:new THREE.Vector2(.9,.9),roughness:.62,metalness:0,side:THREE.DoubleSide});
 function vertex(p,index,side,[width,height]){
  const offset=side*(p[4]/2+width),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
  probe.index=index;return [x,probe.sample(x,y).z+height,-y];
 }
 for(const side of [-1,1]){
  const positions=[],uvs=[];
  for(let i=0;i<data.samples.length;i++){
   const j=(i+1)%data.samples.length,p=data.samples[i],q=data.samples[j];
   const lane=pitLane(data,p[0]);if(side===1&&lane&&(lane.entry||lane.exit))continue;
   // Surveyed circuits flag the kerbs seen on the orthophoto, per side (13 right, 14 left).
   const flag=side<0?13:14;if(p.length>flag&&!(p[flag]&&q[flag]))continue;
   const a=profile.map(v=>vertex(p,i,side,v)),b=profile.map(v=>vertex(q,j,side,v)),va=p[0]/2.4,vb=(j?q[0]:L)/2.4,u=[0,.46,1];
   for(let k=0;k<2;k++){
    positions.push(...a[k],...b[k],...a[k+1],...b[k],...b[k+1],...a[k+1]);
    uvs.push(u[k],va,u[k],vb,u[k+1],va,u[k],vb,u[k+1],vb,u[k+1],va);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.name=side<0?'Zebra_direita':'Zebra_esquerda';root.add(m);
 }
 return root;
}

// Each rendered strip is independent: no faces or posts bridge the run-off gaps.
export function createGuardrails(data){
 const root=new THREE.Group(),closed=data.meta.id==='curvelo';root.name=closed?'Guardrail_circuito_completo':'Guardrails_trechos_Interlagos';
 const probe=new TestCar(data),nodes=data.samples.filter((_,i)=>i%2===0),positions=[],indices=[],postPoints=[],a=data.samples,L=data.meta.reconstructed_xy_m;
 const profile=[[.34,0],[.44,.10],[.56,0],[.68,.10],[.8,0],[.91,.06]];
 const metal=new THREE.MeshStandardMaterial({color:0xa3aeb8,metalness:.65,roughness:.48,side:THREE.DoubleSide});
 let segments=0,coverage=0,sections=0;
 function point(s){
  if(s>=L)return a[0];let lo=0,hi=a.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(a[mid][0]<=s)lo=mid;else hi=mid-1;}
  const p=a[lo],q=a[(lo+1)%a.length],u=(s-p[0])/((lo===a.length-1?L:q[0])-p[0]);return p.map((value,k)=>k===0?s:value+(q[k]-value)*u);
 }
 for(const side of [-1,1])for(const [from,end] of guardrailSections(data,side)){
  const to=Math.min(end,L);if(from>=to)continue;coverage+=to-from;sections++;
  const strip=[point(from),...nodes.filter(p=>p[0]>from&&p[0]<to),point(to)],base=positions.length/3;
  for(let i=0;i<strip.length;i++){
   const p=strip[i],offset=side*(p[4]/2+guardrailClearance(data,p[0],side)),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
   probe.index=Math.min(a.length-1,Math.floor(p[0]/L*a.length));const surface=probe.sample(x,y);probe.index=surface.i;const ground=surface.z;
   for(const [height,ridge] of profile)positions.push(x+p[8]*side*ridge,ground+height,-y+p[7]*side*ridge);
   // Posts reach 1 m into the ground, so they meet it where a bank beside the road was cut back.
   if(!(to===L&&i===strip.length-1))postPoints.push({x,y:ground,z:-y,heading:Math.atan2(p[8],p[7])});
   if(i>0){segments++;for(let j=0;j<profile.length-1;j++){const k=base+(i-1)*profile.length+j,b=k+profile.length;indices.push(k,b,k+1,b,b+1,k+1);}}
  }
 }
 const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,2,.14),metal,postPoints.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
 postPoints.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),p.heading);matrix.compose(new THREE.Vector3(p.x,p.y,p.z),q,scale);posts.setMatrixAt(i,matrix);});
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const rails=new THREE.Mesh(geometry,metal);rails.name=closed?'Guardrail_continuo':'Guardrail_por_trechos';rails.castShadow=rails.receiveShadow=true;posts.name='Postes_guardrail';posts.castShadow=posts.receiveShadow=true;posts.computeBoundingSphere();root.add(rails,posts);
 return {root,rails,stats:{sides:2,closed,segments,sections,coverageMetres:coverage,coverageRatio:coverage/(L*2),clearance:GUARDRAIL_CLEARANCE}};
}

// Braking and concrete zones along the lap: [from, to] in metres. A zone across the
// timing line is split in two, each half reaching past the seam (the closing triangles run
// to s = L + 2; pit lanes use s from 6000, far from any zone).
function brakeZones(data){return data.meta.brake_zones??(data.meta.id==='curvelo'?[[135,280],[760,960]]:[[160,345],[1380,1590],[2320,2460],[2950,3160]]);}
function concreteZones(data){return (data.meta.surface_zones??[]).filter(z=>z.kind==='concreto').map(z=>[z.from,z.to]);}
function zoneSum(zones,fn,L){
 const parts=[];for(let [a,b] of zones){a=((a%L)+L)%L;b=((b%L)+L)%L;if(a<=b)parts.push([a,b]);else{parts.push([a,L+40]);parts.push([-40,b]);}}
 return parts.map(([a,b])=>`${fn}(s,${a.toFixed(1)},${b.toFixed(1)})`).join('+')||'0.0';
}
// Metres throughout: the road detail stays attached to the measured surface.
// These wear patterns are game art, not surveyed marks of the real circuit.
export async function createTrackSurface(renderer,data){
 const loader=new THREE.TextureLoader();
 const [texture,normalMap,roughnessMap,grainMap]=await Promise.all([...['diff','nor_gl','rough'].map(kind=>`asfalto_${kind}_v3.jpg`),'asfalto_grao_v1.jpg'].map(file=>loader.loadAsync(`./assets/texturas/${file}`)));
 texture.colorSpace=THREE.SRGBColorSpace;
 const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
 for(const map of [texture,normalMap,roughnessMap,grainMap]){
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=anisotropy;map.minFilter=THREE.LinearMipmapLinearFilter;
 }
 const L=data.meta.reconstructed_xy_m,material=new THREE.MeshStandardMaterial({name:'Asfalto_PBR_circuito_v4',map:texture,normalMap,normalScale:new THREE.Vector2(.8,.8),roughnessMap,roughness:1,metalness:0});
 // The shader sets the asphalt's tone from the scanned aggregate.
 material.color.setRGB(1,1,1);
 // Kept on the material so a circuit change disposes it with the other maps.
 material.grainMap=grainMap;
 material.onBeforeCompile=shader=>{
  shader.uniforms.grainMap={value:grainMap};shader.uniforms.grainAnisotropy={value:anisotropy};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 roadData;\nvarying vec4 vRoad;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoad=roadData;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vRoad;
float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float roadNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y);}
float brakeZone(float s,float a,float b){return smoothstep(a,a+25.0,s)*(1.0-smoothstep(b-15.0,b,s));}
float slabZone(float s,float a,float b){return smoothstep(a,a+4.0,s)*(1.0-smoothstep(b-4.0,b,s));}
uniform sampler2D grainMap;
uniform float grainAnisotropy;
float brakeAt(float s){return clamp(${zoneSum(brakeZones(data),'brakeZone',L)},0.0,1.0);}
// Old tyre marks: a car's two tracks (1.56 m apart) left where it braked hard or slid, 8-24 m
// long, fading out. Each 9 m of the lap may start one, more often in the braking zones; a
// fragment looks at the marks started in its stretch and the three before it. No pair strays
// more than 4.7 m from the line (1.7 offset, 2 m of drift, .78 + .14 to a tyre's outer edge).
float oldMarks(float s,float d,float path){
 if(abs(d-path)>4.7)return 0.0;
 float dark=0.0,cell=floor(s/9.0);
 for(int k=0;k<4;k++){
  float c=cell-float(k);
  if(roadHash(vec2(c,13.7))>.2+.5*brakeAt(c*9.0+4.5))continue;
  float t=s-c*9.0-roadHash(vec2(c,4.1))*9.0,len=8.0+roadHash(vec2(c,8.3))*16.0;
  if(t<0.0||t>len)continue;
  // Each pair drifts across the lane a little, as a car sliding or turning in does.
  float center=path+(roadHash(vec2(c,2.9))-.5)*3.4+(roadHash(vec2(c,6.2))-.5)*.07*t+(roadHash(vec2(c,9.4))-.5)*.004*t*t;
  float w=.08+.06*roadHash(vec2(c,1.3));
  float line=1.0-smoothstep(w*.55,w,abs(abs(d-center)-.78));
  float fade=smoothstep(0.0,1.2,t)*pow(1.0-t/len,.7)*(.6+.4*roadNoise(vec2(t*.8,c)));
  dark=max(dark,line*fade*(.4+.45*roadHash(vec2(c,5.5))));
 }
 return dark;
}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
// Scanned race-track asphalt (fresh, near black) weathered to the grey of a circuit in
// the sun: contrast of the aggregate compressed around a lifted mean, a hint of its tint kept.
vec3 fine=texture2D(map,vMapUv).rgb;
float fineL=max(dot(fine,vec3(.2126,.7152,.0722)),1e-4);
vec3 aggregate=vec3(.08*pow(fineL/.0137,.7))*mix(vec3(1.0),fine/fineL,.22);
// Coarse grain (asfalto_grao_v1, drawn 6 m a tile): stones and patches that keep their contrast where
// the scan's millimetre detail has mipmapped to grey, the texture the eye follows at speed. Two
// scales, swapped by a broad noise, hide the tile.
vec2 grainA=vMapUv*.3333,grainB=mat2(.799,.602,-.602,.799)*vMapUv*.253+vec2(.31,.67);
float grainTex=mix(texture2D(grainMap,grainA).r,texture2D(grainMap,grainB).r,smoothstep(.42,.58,roadNoise(vMapUv*.09+11.0)));
// The map flattens as its mip level rises, so its contrast is given back as the footprint grows;
// close up, where a texel covers several pixels, the scan carries the detail and the grain steps back.
vec2 grainDx=dFdx(grainA)*2048.0,grainDy=dFdy(grainA)*2048.0;
float grainMajor=max(length(grainDx),length(grainDy)),grainMinor=min(length(grainDx),length(grainDy));
float grainLod=log2(max(max(grainMajor/grainAnisotropy,grainMinor),1e-3));
float grain=(grainTex-.5)*min(.7*exp2(max(grainLod,0.0)*max(grainLod,0.0)*.045),2.0)*mix(.3,1.0,smoothstep(-1.5,.5,grainLod));
float d=vRoad.x, s=vRoad.y, width=vRoad.z;
vec2 road=vec2(s,d);
float macro=roadNoise(vMapUv*.18)*.65+roadNoise(vMapUv*.047)*.35;
// Broad mottling survives speed; fade subpixel detail to prevent shimmering.
float detailFade=1.0-smoothstep(.08,.45,length(fwidth(vMapUv*3.4)));
// Lanes of different age along the lap (resurfacing), and gentle patchiness.
float laneAge=roadNoise(vec2(s*.0032,d*.025+1.7));
float wear=mix(.9,1.08,macro)*mix(.9,1.07,laneAge)*mix(1.0,.94+.12*roadNoise(vMapUv*3.4),detailFade);
float brake=brakeAt(s);
float path=vRoad.w+(roadNoise(vec2(s*.012,5.3))-.5)*.8;
float lateral=d-path;
// Rubbered racing line, darkest where the cars brake.
float rubber=exp(-pow(lateral/1.7,2.0))*(.2+.24*brake);
// Tyre tracks along the lap: fine darker and polished lines across the band the cars use, faded
// where they would be thinner than a pixel.
float acrossPixel=fwidth(d);
float streak=mix(.5,roadNoise(vec2(d*24.0,s*.12)),1.0-smoothstep(.25,.6,acrossPixel*24.0));
float tyreLines=(roadNoise(vec2(d*11.0,s*.025))-.5)*(1.0-smoothstep(.3,.7,acrossPixel*11.0))+(roadNoise(vec2(d*27.0+3.0,s*.06))-.5)*.5*(1.0-smoothstep(.3,.7,acrossPixel*27.0));
rubber+=exp(-pow(lateral/2.9,2.0))*tyreLines*.22;
float tirePair=exp(-pow((abs(lateral)-.80)/.19,2.0));
rubber+=tirePair*(.06+.22*brake)*(.3+.7*streak);
rubber+=oldMarks(s,d,path)*(1.0-smoothstep(.07,.16,acrossPixel));
rubber=clamp(rubber,-.1,.8);
// Oil and fuel drips down the middle of the line, between the wheel tracks, drawn out by the speed.
vec2 dropUv=vec2(s/1.1,lateral/.4),dropCell=floor(dropUv),dropAt=dropCell+.2+.6*vec2(roadHash(dropCell+3.1),roadHash(dropCell+7.9));
float dropRadius=.025+.05*roadHash(dropCell+1.7);
float drop=step(roadHash(dropCell+5.3),.3)*(1.0-smoothstep(dropRadius*.6,dropRadius,length((dropUv-dropAt)*vec2(1.1/1.7,.4))));
drop*=exp(-pow(lateral/.55,2.0))*(1.0-smoothstep(.05,.18,fwidth(s)));
// Off the line: lighter, dusty, with rubber marbles thrown off the tyres.
float offLine=smoothstep(1.4,3.8,abs(lateral))*(1.0-smoothstep(width*.42,width*.5,abs(d)));
vec2 marbleCell=floor(road*vec2(9.0,11.0));
float marble=step(.965,roadHash(marbleCell))*offLine*detailFade*(1.0-smoothstep(.0,.35,length(fract(road*vec2(9.0,11.0))-.5)));
// Crack sealant ("tar snakes"): thin glossy isolines of a noise field, in some stretches only.
// Cracks run mostly along the lane, so the noise is stretched along the track.
float tarN=roadNoise(road*vec2(.1,.42)+7.1)*.62+roadNoise(road*vec2(.3,1.25)+2.3)*.38;
float tarWidth=.009+length(fwidth(road))*.012;
float tar=(1.0-smoothstep(.0,tarWidth,abs(tarN-.5)))*step(.74,roadNoise(vec2(s*.014,d*.07)+3.3))*mix(.3,.9,detailFade);
// Occasional thin sealed joints, with feathered edges and broken coverage.
float jointDistance=abs(fract((s+roadNoise(vec2(d*.45,3.0))*.9)/73.0)-.5)*73.0;
float joint=(1.0-smoothstep(.015,.065,jointDistance))*smoothstep(.28,.55,roadNoise(vec2(s*.1,d*.4)));
float edge=smoothstep(width*.34,width*.5,abs(d));
// Resurfaced patches: fresher, darker asphalt with a sealed border.
float section=floor(s/47.0),along=mod(s,47.0),patchCenter=(roadHash(vec2(section,2.4))-.5)*width*.5;
float patchAlong=smoothstep(5.0,5.2,along)*(1.0-smoothstep(32.0,32.2,along)),patchAcross=1.0-smoothstep(1.2,1.25,abs(d-patchCenter));
float roadRepair=step(.79,roadHash(vec2(section,7.6)))*patchAlong*patchAcross;
float patchBorder=roadRepair*(1.0-smoothstep(.0,.07,min(min(along-5.2,32.0-along),1.2-abs(d-patchCenter))));
float seam=(1.0-smoothstep(.01,.045,abs(abs(d)-width*.24)))*(.4+.6*roadNoise(vec2(s*.13,d)));
// Rubber fills the grain on the line.
float grainTone=max(1.0+grain*3.5*(1.0-.6*clamp(rubber*2.5,0.0,1.0)),.2);
vec3 asphaltColor=aggregate*wear*grainTone*(1.0-rubber)*(1.0-joint*.3)*(1.0-roadRepair*.24)*(1.0-seam*.12)*(1.0-drop*.5);
// Concrete stretches (meta.surface_zones): pale slabs 5 m long with sawn joints, rubber still dark on the line.
float concrete=clamp(${zoneSum(concreteZones(data),'slabZone',L)},0.0,1.0);
float slabJoint=max(1.0-smoothstep(.02,.06,abs(fract(s/5.0+.5)-.5)*5.0),(1.0-smoothstep(.02,.06,abs(abs(d)-width*.25)))*step(.1,abs(d)));
vec3 concreteColor=vec3(.235,.222,.2)*mix(.92,1.05,macro)*mix(.95,1.04,laneAge)*(1.0+grain*.6)*(1.0-rubber*.75)*(1.0-slabJoint*.45);
asphaltColor=mix(asphaltColor,asphaltColor*vec3(1.1,1.07,1.0),offLine*.55);
asphaltColor=mix(asphaltColor,asphaltColor*vec3(1.16,1.1,.98),edge*.6);
asphaltColor=mix(asphaltColor,vec3(.012,.011,.01),max(max(tar,patchBorder)*.85,marble*.8));
asphaltColor=mix(asphaltColor,concreteColor,concrete);
diffuseColor.rgb*=asphaltColor;
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
// Rubber, fresh tar, oil and the tyre-polished stones are smoother than the open aggregate: they
// catch the low sun.
float fineRough=texture2D(roughnessMap,vRoughnessMapUv).g;
float roughnessFactor=clamp(.62+.34*fineRough-rubber*.3-tar*.45-roadRepair*.08+edge*.05+concrete*.08-grain*.22-drop*.3,.3,1.0);
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
vec3 asphaltN=texture2D(normalMap,vNormalMapUv).xyz*2.0-1.0;
asphaltN.xy*=normalScale*(1.0-.75*max(tar,rubber*.6));
normal=normalize(tbn*asphaltN);
`);
 };
 material.customProgramCacheKey=()=> 'opala-track-asphalt-circuit-v6-'+(data.meta.id||'interlagos');
 const probe=new TestCar(data),length=data.meta.reconstructed_xy_m;
 const stats={texture:'assets/texturas/asfalto_diff_v3.jpg',normal:'assets/texturas/asfalto_nor_gl_v3.jpg',roughness:'assets/texturas/asfalto_rough_v3.jpg',grain:'assets/texturas/asfalto_grao_v1.jpg',grainTileMetres:6,resolution:2048,tileMetres:2,anisotropy:texture.anisotropy,vertices:0,wear:'decorative',pbr:true};
 function geometry(source){
  const g=source.index?source.toNonIndexed():source;
  if(g!==source)source.dispose();
  const pos=g.attributes.position,uv=new Float32Array(pos.count*2),coords=new Float32Array(pos.count*4);
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),p=probe.sample(x,-z);probe.index=p.i;
   const a=data.samples[(p.i-18+probe.n)%probe.n],b=data.samples[(p.i+18)%probe.n];
   const bend=wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7]));
   const path=clamp(bend*1.2,-1,1)*p.width*.18;
   uv.set([x/2,z/2],i*2);coords.set([p.d,p.s,p.width,path],i*4);
  }
  // Do not interpolate a whole lap of wear patterns across the closing triangle.
  for(let i=0;i<pos.count;i+=3){
   const ss=[coords[i*4+1],coords[(i+1)*4+1],coords[(i+2)*4+1]];
   if(Math.max(...ss)-Math.min(...ss)>length/2)for(let j=0;j<3;j++)if(ss[j]<length/2)coords[(i+j)*4+1]+=length;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('roadData',new THREE.BufferAttribute(coords,4));
  stats.vertices+=pos.count;return g;
 }
 return {material,geometry,stats};
}
