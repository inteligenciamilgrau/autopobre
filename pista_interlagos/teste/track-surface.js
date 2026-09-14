import * as THREE from 'three';
import {TestCar,clamp,wrap,GUARDRAIL_CLEARANCE,guardrailClearance} from './physics.js';
import {pitLane} from './pit-lane.js';

export async function createTrackBranding(data){
 const loader=new THREE.TextureLoader(),[oldStock,game]=await Promise.all([
  loader.loadAsync('./assets/branding/old_stock_preparada_v1.png'),
  loader.loadAsync('./assets/abertura/logo_auto_pobre_racing.png'),
 ]);for(const texture of [oldStock,game]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;}
 const root=new THREE.Group();root.name='Outdoors_AutoPobre_OldStock';
 const frameMaterial=new THREE.MeshStandardMaterial({color:0x263a3a,roughness:.8,metalness:.3});
 const white=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),dark=new THREE.MeshStandardMaterial({color:0x142a27,roughness:1});
 const artwork=[new THREE.MeshBasicMaterial({map:oldStock}),new THREE.MeshBasicMaterial({map:game,transparent:true})];
 for(const material of [white,dark,...artwork]){material.polygonOffset=true;material.polygonOffsetFactor=artwork.includes(material)?-4:-2;material.polygonOffsetUnits=artwork.includes(material)?-4:-2;}
 const probe=new TestCar(data),length=data.meta.reconstructed_xy_m;
 for(let i=0;i<16;i++){
  const s=i===0?length-30:i===1?70:230+(i-2)*(length-480)/14;
  const index=Math.max(0,data.samples.findIndex(p=>p[0]>=s)),p=data.samples[index],side=i%2?1:-1,offset=side*(p[4]/2+guardrailClearance(data,p[0],side)+5);
  const x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;probe.index=index;const ground=probe.sample(x,y).z;
  const board=new THREE.Group();board.name=i%2?'Outdoor_AutoPobre':'Outdoor_OldStock';board.position.set(x,ground,-y);
  // Face the approaching driver, rather than presenting the edge of the sign.
  const fx=-p[7]*.8+p[8]*side*.6,fz=p[8]*.8+p[7]*side*.6;board.rotation.y=Math.atan2(fx,fz);
  for(const post of [-4.5,4.5]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.22,5.9,.22),frameMaterial);leg.position.set(post,2.95,0);leg.castShadow=true;board.add(leg);}
  const backing=new THREE.Mesh(new THREE.BoxGeometry(12.4,5.9,.22),frameMaterial);backing.position.y=4.8;backing.castShadow=true;board.add(backing);
  const field=new THREE.Mesh(new THREE.PlaneGeometry(12,5.5),i%2?dark:white);field.position.set(0,4.8,.13);board.add(field);
  const width=i%2?10.6:7.8,height=i%2?5.3:5.2;
  const logo=new THREE.Mesh(new THREE.PlaneGeometry(width,height),artwork[i%2]);logo.position.set(0,4.8,.15);board.add(logo);root.add(board);
 }
 return {root,oldStock,stats:{billboards:16,oldStock:8,autoPobre:8}};
}

export function createCurbs(data){
 const root=new THREE.Group();root.name='Zebras_circuito_completo';
 const probe=new TestCar(data),batches=[[],[]],profile=[[0,.02],[.48,.065],[1.05,.02]];
 function vertex(p,index,side,[width,height]){
  const offset=side*(p[4]/2+width),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
  probe.index=index;return [x,probe.sample(x,y).z+height,-y];
 }
 for(const side of [-1,1])for(let i=0;i<data.samples.length;i++){
  const j=(i+1)%data.samples.length,p=data.samples[i],q=data.samples[j],out=batches[Math.floor(p[0]/4)%2];
  const lane=pitLane(data,p[0]);if(side===1&&lane&&(lane.entry||lane.exit))continue;
  const a=profile.map(v=>vertex(p,i,side,v)),b=profile.map(v=>vertex(q,j,side,v));
  for(let k=0;k<2;k++)out.push(...a[k],...b[k],...a[k+1],...b[k],...b[k+1],...a[k+1]);
 }
 for(const [i,positions] of batches.entries()){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:i?0x187637:0xf1c82a,roughness:.92,side:THREE.DoubleSide}));m.receiveShadow=true;m.name=i?'Zebra_verde_continua':'Zebra_amarela_continua';root.add(m);
 }
 return root;
}

// Game safety barrier, following both closed track edges and the terrain height.
export function createGuardrails(data){
 const root=new THREE.Group();root.name='Guardrail_circuito_completo';
 const probe=new TestCar(data),nodes=data.samples.filter((_,i)=>i%2===0),positions=[],indices=[];
 const profile=[[.34,0],[.44,.10],[.56,0],[.68,.10],[.8,0],[.91,.06]];
 const metal=new THREE.MeshStandardMaterial({color:0xa3aeb8,metalness:.65,roughness:.48,side:THREE.DoubleSide});
 const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,1.05,.14),metal,nodes.length*2),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(1,1,1);
 let post=0;
 for(const side of [-1,1]){
  const base=positions.length/3;
  for(let i=0;i<=nodes.length;i++){
   const p=nodes[i%nodes.length],offset=side*(p[4]/2+guardrailClearance(data,p[0],side)),x=p[1]-p[8]*offset,y=p[2]+p[7]*offset;
   probe.index=data.samples.indexOf(p);const ground=probe.sample(x,y).z;
   for(const [height,ridge] of profile)positions.push(x+p[8]*side*ridge,ground+height,-y+p[7]*side*ridge);
   if(i<nodes.length){q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.atan2(p[8],p[7]));matrix.compose(new THREE.Vector3(x,ground+.475,-y),q,scale);posts.setMatrixAt(post++,matrix);}
   if(i>0)for(let j=0;j<profile.length-1;j++){const a=base+(i-1)*profile.length+j,b=a+profile.length;indices.push(a,b,a+1,b,b+1,a+1);}
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
 const rails=new THREE.Mesh(geometry,metal);rails.name='Guardrail_continuo';rails.castShadow=rails.receiveShadow=true;posts.name='Postes_guardrail';posts.castShadow=posts.receiveShadow=true;posts.computeBoundingSphere();root.add(rails,posts);
 return {root,rails,stats:{sides:2,closed:true,segments:nodes.length*2,clearance:GUARDRAIL_CLEARANCE}};
}

// Metres throughout: the road detail stays attached to the measured surface.
// These wear patterns are game art, not surveyed marks of the real circuit.
export async function createTrackSurface(renderer,data){
 const loader=new THREE.TextureLoader();
 const [texture,normalMap,roughnessMap]=await Promise.all(['diff','nor_gl','rough'].map(kind=>loader.loadAsync(`./assets/texturas/asfalto_${kind}_v2.jpg`)));
 texture.colorSpace=THREE.SRGBColorSpace;
 for(const map of [texture,normalMap,roughnessMap]){
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());map.minFilter=THREE.LinearMipmapLinearFilter;
 }
 const material=new THREE.MeshStandardMaterial({name:'Asfalto_PBR_rustico_v3',map:texture,normalMap,normalScale:new THREE.Vector2(.8,.8),roughnessMap,roughness:1,metalness:0});
 material.color.setRGB(.82,.84,.86);
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 roadData;\nvarying vec4 vRoad;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoad=roadData;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vRoad;
float roadHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float roadNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(roadHash(i),roadHash(i+vec2(1,0)),f.x),mix(roadHash(i+vec2(0,1)),roadHash(i+vec2(1,1)),f.x),f.y);}
float brakeZone(float s,float a,float b){return smoothstep(a,a+25.0,s)*(1.0-smoothstep(b-15.0,b,s));}
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
// Fine aggregate plus a 3.3x coarser layer that remains readable in motion.
vec3 coarseGrain=texture2D(map,vMapUv*.30+vec2(.17,.43)).rgb;
vec3 grain=mix(texture2D(map,vMapUv).rgb,coarseGrain,.72);
grain*=mix(.82,1.2,smoothstep(.015,.09,dot(coarseGrain,vec3(.3333))));
float d=vRoad.x, s=vRoad.y, width=vRoad.z;
float macro=roadNoise(vMapUv*.18)*.65+roadNoise(vMapUv*.047)*.35;
// Broad mottling survives speed; fade subpixel detail to prevent shimmering.
float detailFade=1.0-smoothstep(.08,.45,length(fwidth(vMapUv*3.4)));
float weathered=.72+.40*roadNoise(vMapUv*3.4)+.16*roadNoise(vMapUv*13.0);
float wear=mix(.74,1.22,macro)*mix(1.0,weathered,detailFade);
float brake=clamp(${data.meta.id==='curvelo'?'brakeZone(s,135.0,280.0)+brakeZone(s,760.0,960.0)':'brakeZone(s,160.0,345.0)+brakeZone(s,1380.0,1590.0)+brakeZone(s,2320.0,2460.0)+brakeZone(s,2950.0,3160.0)'},0.0,1.0);
float path=vRoad.w+(roadNoise(vec2(s*.012,5.3))-.5)*.8;
float lateral=d-path;
float rubber=exp(-pow(lateral/1.8,2.0))*(.13+.18*brake);
float streak=roadNoise(vec2(d*24.0,s*.12));
float tirePair=exp(-pow((abs(lateral)-.80)/.19,2.0));
rubber+=tirePair*brake*.19*(.3+.7*streak);
// Occasional thin sealed joints, with feathered edges and broken coverage.
float jointDistance=abs(fract((s+roadNoise(vec2(d*.45,3.0))*.9)/73.0)-.5)*73.0;
float joint=(1.0-smoothstep(.015,.065,jointDistance))*smoothstep(.28,.55,roadNoise(vec2(s*.1,d*.4)));
float edge=smoothstep(width*.34,width*.5,abs(d));
// Sparse resurfaced areas and longitudinal paving seams, in road metres.
float section=floor(s/47.0),along=mod(s,47.0),patchCenter=(roadHash(vec2(section,2.4))-.5)*width*.5;
float roadRepair=step(.79,roadHash(vec2(section,7.6)))*smoothstep(5.0,7.0,along)*(1.0-smoothstep(32.0,34.0,along));
roadRepair*=1.0-smoothstep(1.2,1.45,abs(d-patchCenter));
float seam=(1.0-smoothstep(.01,.045,abs(abs(d)-width*.24)))*(.4+.6*roadNoise(vec2(s*.13,d)));
diffuseColor.rgb*=grain*wear*(1.0-rubber)*(1.0-joint*.24)*(1.0-roadRepair*.13)*(1.0-seam*.12);
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.13,1.08,.98),edge*.6);
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
float coarseRough=texture2D(roughnessMap,vRoughnessMapUv*.30+vec2(.17,.43)).g;
float roughnessFactor=clamp(.7+.28*coarseRough-rubber*.25+edge*.05+roadRepair*.04,.55,1.0);
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
vec3 fineN=texture2D(normalMap,vNormalMapUv).xyz*2.0-1.0;
vec3 coarseN=texture2D(normalMap,vNormalMapUv*.30+vec2(.17,.43)).xyz*2.0-1.0;
vec3 asphaltN=normalize(mix(fineN,coarseN,.72));
asphaltN.xy*=normalScale;
normal=normalize(tbn*asphaltN);
`);
 };
 material.customProgramCacheKey=()=> 'opala-track-asphalt-rustic-v3-'+(data.meta.id||'interlagos');
 const probe=new TestCar(data),length=data.meta.reconstructed_xy_m;
 const stats={texture:'assets/texturas/asfalto_diff_v2.jpg',normal:'assets/texturas/asfalto_nor_gl_v2.jpg',roughness:'assets/texturas/asfalto_rough_v2.jpg',resolution:2048,tileMetres:2.1,coarseTileMetres:7,anisotropy:texture.anisotropy,vertices:0,wear:'decorative',pbr:true};
 function geometry(source){
  const g=source.index?source.toNonIndexed():source;
  if(g!==source)source.dispose();
  const pos=g.attributes.position,uv=new Float32Array(pos.count*2),coords=new Float32Array(pos.count*4);
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),p=probe.sample(x,-z);probe.index=p.i;
   const a=data.samples[(p.i-18+probe.n)%probe.n],b=data.samples[(p.i+18)%probe.n];
   const bend=wrap(Math.atan2(b[8],b[7])-Math.atan2(a[8],a[7]));
   const path=clamp(bend*1.2,-1,1)*p.width*.18;
   uv.set([x/2.1,z/2.1],i*2);coords.set([p.d,p.s,p.width,path],i*4);
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
