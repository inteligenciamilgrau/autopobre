import * as THREE from 'three';
import {TestCar,clamp,wrap} from './physics.js';

// Metres throughout: the road detail stays attached to the measured surface.
// These wear patterns are game art, not surveyed marks of the real circuit.
export async function createTrackSurface(renderer,data){
 const loader=new THREE.TextureLoader();
 const [texture,normalMap,roughnessMap]=await Promise.all(['diff','nor_gl','rough'].map(kind=>loader.loadAsync(`./assets/texturas/asfalto_${kind}_v2.jpg`)));
 texture.colorSpace=THREE.SRGBColorSpace;
 for(const map of [texture,normalMap,roughnessMap]){
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());map.minFilter=THREE.LinearMipmapLinearFilter;
 }
 const material=new THREE.MeshStandardMaterial({name:'Asfalto_PBR_v2',map:texture,normalMap,normalScale:new THREE.Vector2(.55,.55),roughnessMap,roughness:1,metalness:0});
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
// Photographic aggregate with independent normal and roughness maps.
vec3 grain=texture2D(map,vMapUv).rgb;
float d=vRoad.x, s=vRoad.y, width=vRoad.z;
float macro=roadNoise(vMapUv*.18)*.65+roadNoise(vMapUv*.047)*.35;
float wear=mix(.84,1.15,macro);
float brake=clamp(brakeZone(s,160.0,345.0)+brakeZone(s,1380.0,1590.0)+brakeZone(s,2320.0,2460.0)+brakeZone(s,2950.0,3160.0),0.0,1.0);
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
float roughnessFactor=clamp(.66+.30*texture2D(roughnessMap,vRoughnessMapUv).g-rubber*.28+edge*.05+roadRepair*.04,.5,1.0);
`);
 };
 material.customProgramCacheKey=()=> 'opala-track-asphalt-pbr-v2';
 const probe=new TestCar(data),length=data.meta.reconstructed_xy_m;
 const stats={texture:'assets/texturas/asfalto_diff_v2.jpg',normal:'assets/texturas/asfalto_nor_gl_v2.jpg',roughness:'assets/texturas/asfalto_rough_v2.jpg',resolution:2048,tileMetres:2.1,anisotropy:texture.anisotropy,vertices:0,wear:'decorative',pbr:true};
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
