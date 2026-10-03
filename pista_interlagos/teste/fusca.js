import * as THREE from 'three';
import {numberSticker,bodyTriangles,bendOnBody} from './immersive-visuals.js';
import {BRAKE_ON} from './brake-lights.js';
// The Fusca (Modo Corrida's car screen, its Fusca tab): modelo_3d/fusca_v2, modelled from the Type 1's
// measurements and exported by modelo_3d/scripts/exportar_fusca_jogo.py in the Opala's frame (+X forward, -Z the
// driver's side, tyres on y=0, its 2.40 m wheelbase centred on the Opala's). In a Fusca race the whole field races
// one (immersive-visuals.js fuscaRival), with the Opala's physics. Each wears a team's colours as the Opalas do
// (race-roster.js): the body paint and the dash, a stripe along the waist, the number on both doors and on the roof.
export const FUSCA_URL='./assets/fusca_v2.glb?v=fusca-v2';
// The driver (driver.js and rival-driver.js, with the race wheel he turns) moves this much from the Opala's
// seat: onto the Fusca's steering wheel, 26 cm further forward and 11 cm higher.
export const FUSCA_SEAT=Object.freeze([.257,.113,0]);
// The cockpit camera (the Opala's is an onboard camera on the car's centre line, cockpit.js eye) moves with the
// seat and 7 cm higher still: over the dash top the road shows from about 8 m ahead.
export const FUSCA_EYE=Object.freeze([.257,.18,0]);
// The hood camera: the Opala's (main.js hoodEye, 1.1 m forward, 1.25 m up) would see past the Fusca's lower,
// rounder front lid; this one sits 13 cm over the lid, just ahead of the windscreen.
export const FUSCA_HOOD_EYE=Object.freeze([.92,1.22,0]);
// The side view (car-select.js card icons; the distant rivals' model, immersive-visuals.js farProxy, as
// FAR_PROFILE for the Opala): metres in the car frame, nose to +x, read off the GLB's silhouette. width, track,
// tail, head and bumpers shape the distant model; lamps moves the distant Opala's brake lights onto its tail.
export const FUSCA_PROFILE=Object.freeze({
 body:[[-1.73,.3],[1.99,.3],[1.99,.62],[1.9,.73],[1.8,.83],[1.7,.91],[1.6,.96],[1.4,1.03],[1.2,1.064],[1,1.087],[.8,1.107],[.6,1.43],[.5,1.465],[.3,1.506],[.1,1.528],[-.1,1.535],[-.3,1.533],[-.5,1.52],[-.7,1.489],[-.9,1.414],[-1.1,1.29],[-1.3,1.147],[-1.5,.94],[-1.6,.818],[-1.7,.634],[-1.73,.5]],
 glass:[[.69,1.02],[.6,1.17],[.46,1.32],[.3,1.345],[0,1.355],[-.4,1.345],[-.6,1.29],[-.74,1.22],[-.81,1.13],[-.81,1.02]],
 stripe:[[-1.2,.75],[1.4,.75],[1.4,.85],[-1.2,.85]],number:[.33,.56],axles:[1.417,-.983],wheel:.335,
 width:1.5,track:.666,tail:{x:-1.71,y:.64,z:.545,w:.08,h:.12},head:{x:1.97,y:.66,z:.505,w:.17,h:.17},bumpers:[[2.1,.47],[-1.86,.47]],bumperWidth:1.44,lamps:[.45,-.05,0]});
// Where the team's colours go (car frame): the waist stripe from the front fender to the rear one, above the
// wheel arches and under the window trim, ending before the fenders round off toward the nose and the tail
// (seen from behind it would wrap round them); the number on each door under it, and on the roof, read from
// the driver's side as the Opalas' are.
const STRIPE={x:.1,y:.8,w:2.6,h:.1},DOOR={x:.33,y:.56,w:.46,h:.34},ROOF={x:-.1,y:1.3,w:.66,h:.52},SIDE=.72;
// Painted like the body: the paint and the dash (a Fusca's is the body's sheet metal).
const PAINTED=['Pintura_fusca','Fusca_painel'];
// The loaded GLB made ready to clone: shadows, and glass as plain see-through materials (Blender's
// transmission would make three.js draw the scene twice a frame; main.js does the same to the Opala's).
export function prepareFusca(scene){
 scene.traverse(o=>{
  if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
  for(const m of [o.material].flat()){
   if(m.name==='Vidro_fusca'){m.color.setHex(0x1b252b);m.transmission=0;m.transparent=true;m.opacity=.42;m.roughness=.04;m.depthWrite=false;o.castShadow=false;}
   else if(m.transmission>0){m.transparent=true;m.opacity=Math.min(m.opacity,1-.65*m.transmission);m.transmission=0;m.depthWrite=false;}
  }
 });
 scene.name='Fusca_V2';return scene;
}
// A Fusca in a team's colours (entry: race-roster.js): a clone of the template sharing its geometries and
// textures; what is made for it is listed in userData.own (fuscaDispose). userData.wheels: the four pivots;
// userData.brake(v) lights the tail lamps.
export function fuscaCar(template,entry){
 const root=template.clone(true),own=[],swap=new Map(),wheels=[];root.name='Fusca_'+entry.number;
 let lamp=null;
 const recolor=m=>{
  if(!swap.has(m)){
   let c=m;
   if(PAINTED.includes(m.name)){c=m.clone();c.color.setHex(entry.color);if(entry.finish)Object.assign(c,entry.finish);}
   else if(m.name==='Lanterna_fusca'){c=lamp=m.clone();c.emissive.setRGB(1,.05,.02);c.emissiveIntensity=0;}
   if(c!==m)own.push(c);swap.set(m,c);
  }
  return swap.get(m);
 };
 root.traverse(o=>{
  if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(recolor):recolor(o.material);
  else if(o.name.startsWith('Roda_')&&o.name.includes('PIVO'))wheels.push(o);
 });
 // The stripe and numbers are bent onto the paint (immersive-visuals.js), 6 mm off it.
 root.updateMatrixWorld(true);const paint=[];root.traverse(o=>{if(o.isMesh&&[o.material].flat().some(m=>m.name==='Pintura_fusca'))paint.push(o);});
 const body=bodyTriangles(root,paint),V=(x,y,z)=>new THREE.Vector3(x,y,z),stuck=[];
 const stripe=new THREE.MeshStandardMaterial({name:'Faixa_fusca',color:entry.stripe,roughness:.3,metalness:.05,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),sticker=numberSticker(entry.number);
 own.push(stripe,sticker);
 for(const side of [-1,1]){
  stuck.push([bendOnBody(body,V(STRIPE.x,STRIPE.y,side*SIDE),V(side,0,0),V(0,1,0),STRIPE.w,STRIPE.h,72,2),stripe,'Faixa_fusca']);
  stuck.push([bendOnBody(body,V(DOOR.x,DOOR.y,side*SIDE),V(side,0,0),V(0,1,0),DOOR.w,DOOR.h,16,8),sticker,'Numero_porta_'+entry.number]);
 }
 stuck.push([bendOnBody(body,V(ROOF.x,ROOF.y,0),V(-1,0,0),V(0,0,1),ROOF.w,ROOF.h),sticker,'Numero_teto_'+entry.number]);
 for(const [geometry,material,name] of stuck){const decal=new THREE.Mesh(geometry,material);decal.name=name;decal.renderOrder=material===stripe?1:2;decal.receiveShadow=true;root.add(decal);own.push(geometry);}
 root.userData.own=own;root.userData.wheels=wheels;root.userData.entry=entry;root.userData.lamp=lamp;
 root.userData.brake=v=>{if(lamp)lamp.emissiveIntensity=v>BRAKE_ON?7:0;};
 return root;
}
// Frees what fuscaCar made for one car (its materials, their number textures, the stickers' geometries).
export function fuscaDispose(root){
 for(const r of root.userData.own??[]){if(r.map?.isCanvasTexture)r.map.dispose();r.dispose();}
 root.userData.own=[];
}
// The player's Fusca, on the car's sprung body (main.js holds the Opala's body, cockpit and brake lamps
// aside meanwhile): the race wheel the driver turns stands for its own, so that one hides. wheels as main.js
// keeps the Opala's (front, index 0-3 front left first, rest pose) for it to turn, spin and drop them.
export class FuscaBody {
 constructor(holder){this.holder=holder;this.car=null;this.wheels=[];}
 get active(){return !!this.car;}
 apply(template,entry){
  this.clear();if(!template||!entry)return false;
  const car=this.car=fuscaCar(template,entry);car.name='Fusca_do_jogador';
  const own=car.getObjectByName('Volante_Fusca');if(own)own.visible=false;
  this.wheels=car.userData.wheels.map(obj=>{const front=obj.name.includes('Dianteira');return {obj,front,index:(front?0:2)+(obj.position.z>0?1:0),base:obj.quaternion.clone(),basePosition:obj.position.clone()};});
  this.holder.add(car);return true;
 }
 brake(v){this.car?.userData.brake(v);}
 clear(){if(!this.car)return;this.car.removeFromParent();fuscaDispose(this.car);this.car=null;this.wheels=[];}
 info(){return this.car?{number:this.car.userData.entry.number,wheels:this.wheels.length,decals:this.car.children.filter(o=>o.name.startsWith('Faixa_')||o.name.startsWith('Numero_')).length,braking:!!this.car.userData.lamp?.emissiveIntensity,ownWheelShown:!!this.car.getObjectByName('Volante_Fusca')?.visible}:null;}
}
