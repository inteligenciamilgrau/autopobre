import * as THREE from 'three';
import {DriverMotion,solveArm} from './driver-rig.js?v=20260913-inward';
import {createHelmet} from './driver-helmet.js';

// Seated model based on geracoes_piloto/v01_omp_oli; +X front, -Z left.
// Suit UVs use the approved portrait; the helmet uses the new in-car photo.
export async function createDriver(wheel,wheelTurn){
 const root=new THREE.Group();root.name='Heroi_99_pilotando';root.add(wheel);
 const motion=new DriverMotion();
 const tex=await new THREE.TextureLoader().loadAsync('./assets/piloto/referencia_frente.png');tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
 const red=new THREE.MeshStandardMaterial({color:0xd91920,roughness:.92});
 const fabric=tex.clone();fabric.repeat.set(.07,.09);fabric.offset.set(.36,.49);fabric.needsUpdate=true;
 red.map=fabric;red.bumpMap=fabric;red.bumpScale=.0008;red.color.setHex(0xffffff);
 const front=new THREE.MeshStandardMaterial({map:tex,roughness:.91});
 const black=new THREE.MeshStandardMaterial({color:0x15181a,roughness:.95});
 const seam=new THREE.MeshStandardMaterial({color:0x94111a,roughness:1});
 const silver=new THREE.MeshStandardMaterial({color:0x74797c,metalness:.65,roughness:.42});
 function mesh(g,m,p,parent=root){const o=new THREE.Mesh(g,m);o.position.set(...p);parent.add(o);o.castShadow=true;o.receiveShadow=true;return o;}
 const sphere=(p,s,m,parent=root)=>{const o=mesh(new THREE.SphereGeometry(1,20,12),m,p,parent);o.scale.set(...s);return o;};
 function segment(a,b,r1,r2,m,parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const o=mesh(new THREE.CylinderGeometry(r2,r1,1,16,5),m,[0,0,0],parent);fit(o,av,bv);return o;}
 function fit(o,a,b){o.position.copy(a).add(b).multiplyScalar(.5);o.scale.y=a.distanceTo(b);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());}
 function tube(points,r,m,parent=root){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),m,[0,0,0],parent);}
 function badge(text,p,w,h,parent=root){
  const c=document.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#181a1b';ctx.fillRect(0,0,256,96);ctx.fillStyle='#ecece8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='italic bold 51px Arial';ctx.fillText(text,128,52);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,roughness:1,side:THREE.DoubleSide}),p,parent);return o;
 }
 // Seat and legs stay planted while the torso pivots against the harness.
 sphere([-.18,.48,-.34],[.19,.09,.175],red);
 for(const side of [-1,1]){
  const z=-.34+side*.095;
  segment([-.14,.49,z],[.23,.46,z],.080,.066,red);
  sphere([.23,.46,z],[.078,.070,.069],red);
  segment([.23,.46,z],[.58,.315,z],.063,.043,red);
  sphere([.63,.315,z],[.13,.045,.052],black);
  tube([[-.13,.547,z+side*.056],[.10,.514,z+side*.054],[.23,.49,z+side*.053]],.002,seam);
 }
 const torso=new THREE.Group();torso.position.set(-.20,.54,-.34);root.add(torso);
 const rings=[[0,.135,.09],[.07,.143,.102],[.20,.17,.111],[.33,.19,.105],[.39,.15,.091],[.425,.064,.064]];
 const vertices=[],uvs=[],indices=[];const segments=40;
 for(const [y,width,depth] of rings)for(let j=0;j<=segments;j++){
  const a=j/segments*Math.PI*2,x=Math.cos(a)*depth,z=Math.sin(a)*width;
  vertices.push(x,y,z);uvs.push(.496-z/.40*.40,1-(798-y/.425*510)/1536);
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<segments;j++){
  const a=i*(segments+1)+j,b=a+segments+1,start=indices.length;indices.push(a,b,a+1,a+1,b,b+1);
  geo.addGroup(start,6,Math.cos((j+.5)/segments*Math.PI*2)>.35?1:0);
 }
 const groups=[];for(const g of geo.groups){const last=groups.at(-1);if(last&&last.materialIndex===g.materialIndex&&last.start+last.count===g.start)last.count+=g.count;else groups.push({...g});}geo.clearGroups();for(const g of groups)geo.addGroup(g.start,g.count,g.materialIndex);
 geo.setIndex(indices);geo.computeVertexNormals();mesh(geo,[red,front],[0,0,0],torso);
 // Side inserts, collar, harness and buckle.
 for(const side of [-1,1]){
  sphere([-.015,.20,side*.149],[.094,.158,.025],black,torso);
  tube([[.066,.403,side*.105],[.112,.29,side*.085],[.118,.15,side*.06],[.11,.056,side*.027]],.020,black,torso);
  const patch=badge('OMP',[.117,.321,side*.096],.065,.024,torso);patch.rotation.y=Math.PI/2;
 }
 sphere([0,.429,0],[.067,.028,.069],red,torso);
 sphere([.115,.067,0],[.016,.026,.038],silver,torso);
 const head=new THREE.Group();head.position.set(-.015,.565,0);torso.add(head);
 const helmet=await createHelmet();head.add(helmet.root);
 // Gloves are children of the actual steering rig: their contact never drifts.
 const arms=[];
 for(const side of [-1,1]){
  const grip=new THREE.Group();grip.position.set(side*.173,0,.008);wheelTurn.add(grip);
  sphere([side*.009,0,.024],[.032,.045,.026],black,grip);
  for(let finger=0;finger<4;finger++){
   const y=(finger-1.5)*.017;
   tube([[side*.030,y,.025],[0,y,.040],[-side*.023,y,.024],[-side*.021,y,-.008]],.007,black,grip);
  }
  tube([[side*.03,-side*.025,.02],[side*.022,-side*.047,.025],[-side*.002,-side*.034,.029]],.010,black,grip);
  const tag=badge('OMP',[side*.012,0,.053],.047,.020,grip);tag.rotation.z=side*.18;
  const upper=segment([0,0,0],[0,1,0],.061,.052,red);
  const lower=segment([0,0,0],[0,1,0],.053,.038,red);
  const elbow=sphere([0,0,0],[.054,.055,.054],red);
  const shoulder=sphere([0,0,0],[.073,.074,.077],red);
  const cuff=segment([0,0,0],[0,1,0],.037,.039,black);
  arms.push({side,grip,upper,lower,elbow,shoulder,cuff});
 }
 let pose={lean:0,pitch:0,lateral:0},errors=[];
 const toLocal=p=>root.worldToLocal(p);
 function update(car,dt){
  pose=motion.update(car,dt);torso.rotation.x=pose.lean;torso.rotation.z=pose.pitch;
  head.rotation.x=-pose.lean*.35;head.rotation.y=-Math.max(-.10,Math.min(.10,car.yaw*.08));
  root.updateWorldMatrix(true,true);errors=[];
  for(const arm of arms){
   const s=toLocal(torso.localToWorld(new THREE.Vector3(.004,.355,arm.side*.18)));
   const wrist=toLocal(arm.grip.localToWorld(new THREE.Vector3(0,0,.021)));
   const pole=s.clone().add(new THREE.Vector3(-.02,-.25,arm.side*.22));
   const ik=solveArm(s,wrist,pole);fit(arm.upper,s,ik.elbow);fit(arm.lower,ik.elbow,wrist);
   arm.shoulder.position.copy(s);arm.elbow.position.copy(ik.elbow);
   const cuffStart=wrist.clone().lerp(ik.elbow,.16);fit(arm.cuff,cuffStart,wrist);
   errors.push({side:arm.side,reachable:ik.reachable,upper:s.distanceTo(ik.elbow),lower:ik.elbow.distanceTo(wrist),gripRadius:Math.hypot(arm.grip.position.x,arm.grip.position.y)});
  }
 }
 return {root,update,reset:()=>motion.reset(),info:()=>({reference:'geracoes_piloto/v01_omp_oli',...pose,arms:errors,visible:root.visible,helmet:helmet.info(),headHeight:1.105+.161})};
}
