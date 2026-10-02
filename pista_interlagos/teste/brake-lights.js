import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Brake lights (players asked for them, to tell when the car ahead is braking). The V06
// Opala's four round tail lamps (material Lanterna_vermelha; car frame, +X forward, -Z the
// driver's side, rear faces measured in the model) get a bright red lens and a soft halo
// while the brake is on. One geometry and two materials serve every car; a hidden group
// costs nothing, so a car only draws them while braking.
export const TAIL_LAMPS=Object.freeze([[-2.17,-.66],[-2.187,-.47],[-2.187,.47],[-2.17,.66]].map(([x,z])=>Object.freeze({x,z})));
export const LAMP_Y=.6835;
// The distant rival (immersive-visuals farProxy) carries its lamps higher and further back.
const FAR_OFFSET=Object.freeze([-.215,.27,0]);
export const BRAKE_ON=.05;
let shared=null;
function parts(){
 if(shared)return shared;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
 const glow=new THREE.CanvasTexture(canvas);
 // Facing back: the discs' +Z turns to -X and their width runs across the car.
 const lens=TAIL_LAMPS.map(l=>new THREE.CircleGeometry(1,24).scale(.066,.047,1).rotateY(-Math.PI/2).translate(l.x-.006,LAMP_Y,l.z));
 const halo=TAIL_LAMPS.map(l=>new THREE.PlaneGeometry(.34,.24).rotateY(-Math.PI/2).translate(l.x-.02,LAMP_Y,l.z));
 const merge=list=>{const out=mergeGeometries(list,false);list.forEach(q=>q.dispose());return out;};
 shared={lens:merge(lens),halo:merge(halo),
  // Brighter than white on purpose: the film look's bloom (cinematic.js) makes them glow.
  lensMaterial:new THREE.MeshBasicMaterial({name:'Luz_de_freio',color:new THREE.Color().setRGB(6,.16,.07)}),
  haloMaterial:new THREE.MeshBasicMaterial({name:'Luz_de_freio_halo',map:glow,color:new THREE.Color().setRGB(1.6,.06,.03),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})};
 return shared;
}
// The geometries and materials every car's lamps share (kept when one car is thrown away).
export const sharedBrakeLights=()=>shared?[shared.lens,shared.halo,shared.lensMaterial,shared.haloMaterial]:[];
// A car's brake lights; far: placed for the distant rival's simple body. set(brake) shows them.
export function createBrakeLights({far=false}={}){
 const {lens,halo,lensMaterial,haloMaterial}=parts(),group=new THREE.Group();group.name='Luz_de_freio';
 const a=new THREE.Mesh(lens,lensMaterial),b=new THREE.Mesh(halo,haloMaterial);b.renderOrder=3;
 for(const m of [a,b]){m.castShadow=m.receiveShadow=false;group.add(m);}
 if(far)group.position.set(...FAR_OFFSET);
 group.visible=false;group.userData.set=brake=>{group.visible=brake>BRAKE_ON;};
 return group;
}
