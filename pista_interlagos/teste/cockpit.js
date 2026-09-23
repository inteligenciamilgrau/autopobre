import * as THREE from 'three';
import {steeringWheelAngle} from './driver-rig.js';
import {GATE} from './driver-controls.js';
import {clamp} from './physics.js';
import {createFamilyPhone} from './family-phone.js';

// Lever length (m) and lever/pedal travel (rad) for the controls the driver works.
const SHIFT_LEVER=.255,SHIFT_THROW=.2,SHIFT_LANE=.15,SHIFT_LEAN=.1;
const HANDBRAKE_REST=-.32,HANDBRAKE_PULL=.4;
const PEDAL_TRAVEL=Object.freeze({clutch:.22,brake:.11,throttle:.16});

// Reference: carro/carro_14_interna.JPG and carro_8_piloto_dentro_edu_neves.jpg.
// +X forward, +Y up, -Z driver's side. Dimensions are a visual reconstruction.
export function createCockpit(){
 const root=new THREE.Group();root.name='Interior_foto_14';root.visible=false;
 const black=new THREE.MeshStandardMaterial({color:0x292c2e,roughness:.84});
 const steel=new THREE.MeshStandardMaterial({color:0x343a3d,metalness:.65,roughness:.47});
 const satin=new THREE.MeshStandardMaterial({color:0x272d30,metalness:.25,roughness:.65});
 const silver=new THREE.MeshStandardMaterial({color:0x8d9293,metalness:.8,roughness:.34});
 const cloth=new THREE.MeshStandardMaterial({color:0x090b0b,roughness:1});
 const red=new THREE.MeshStandardMaterial({color:0x990f16,roughness:.6});
 const yellow=new THREE.MeshStandardMaterial({color:0xcfb452,roughness:.82});
 function mesh(g,m,p,parent=root){const o=new THREE.Mesh(g,m);o.position.set(...p);parent.add(o);o.receiveShadow=true;return o;}
 const box=(p,s,m=black,parent=root)=>mesh(new THREE.BoxGeometry(...s),m,p,parent);
 function bar(a,b,r=.023,m=satin,parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),o=mesh(new THREE.CylinderGeometry(r,r,av.distanceTo(bv),12),m,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
 function panel(p,parent=root){const g=new THREE.Group();g.position.set(...p);g.rotation.y=-Math.PI/2;parent.add(g);return g;}
 function label(text,width=512,height=128,color='#dadbd5',background='#111416',size=36){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.fillStyle=color;ctx.font=`600 ${size}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
 }
 function plaque(text,p,w,h,parent=root,color='#d4d7d3'){
  const group=panel(p,parent);mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:label(text,512,128,color)}),[0,0,.001],group);return group;
 }
 // Bare metal lower cabin, curved dash top and exposed transmission tunnel.
 box([.19,.29,0],[1.65,.04,1.49],satin);
 box([.80,.57,0],[.06,.57,1.49],satin);
 box([.26,.40,.07],[.92,.22,.25],satin);
 box([.67,.85,0],[.32,.11,1.40],black);
 bar([.62,.865,-.69],[.62,.865,.69],.036,black);
 box([.62,.75,0],[.06,.16,1.35],satin);
 box([1.18,.825,0],[.77,.025,1.44],black); // hood edge beyond the windscreen
 for(const side of [-1,1]){
  box([.10,.59,side*.745],[1.54,.57,.025],steel);
  for(let i=0;i<9;i++)mesh(new THREE.SphereGeometry(.005,6,4),silver,[-.43+i*.13,.805,side*.73]);
  bar([.77,.38,side*.70],[.62,.96,side*.70],.029);
  bar([.62,.96,side*.70],[.28,1.36,side*.59],.032);
  bar([.28,1.36,side*.59],[-.63,1.36,side*.59],.029);
  bar([.58,.60,side*.70],[-.62,.88,side*.70],.024);
  for(let i=0;i<5;i++)box([-.02,.93+i*.075,side*.735],[.94,.018,.008],cloth);
  for(let i=0;i<9;i++)box([-.46+i*.11,1.075,side*.735],[.018,.31,.008],cloth);
 }
 bar([.29,1.36,-.60],[.29,1.36,.60],.029);
 box([-.13,1.415,0],[1.08,.055,1.34],black);
 // Opaque sun strip, leaving the road aperture open.
 const banner=box([.36,1.296,0],[.022,.073,1.17],new THREE.MeshStandardMaterial({color:0x958c77,roughness:1}));banner.rotation.z=-.32;
 const bannerLogo=new THREE.TextureLoader().load('./assets/texturas/cockpit_faixa_invent.png');bannerLogo.colorSpace=THREE.SRGBColorSpace;
 const bannerPlane=new THREE.PlaneGeometry(.51,.079);const buv=bannerPlane.attributes.uv;for(let i=0;i<buv.count;i++)buv.setX(i,1-buv.getX(i));
 mesh(bannerPlane,new THREE.MeshBasicMaterial({map:bannerLogo,transparent:true,opacity:.42,depthWrite:false}),[0,0,0],panel([.335,1.288,.005]));
 // Tachometer pod and chrome-rimmed auxiliary instruments, as in the photo.
 const pod=panel([.42,.865,-.15]);
 const podShape=new THREE.Shape();podShape.moveTo(-.185,-.12);podShape.lineTo(.18,-.12);podShape.lineTo(.115,.095);podShape.quadraticCurveTo(.0,.18,-.09,.125);podShape.lineTo(-.185,-.025);podShape.closePath();
 mesh(new THREE.ExtrudeGeometry(podShape,{depth:.028,bevelEnabled:true,bevelThickness:.003,bevelSize:.005,bevelSegments:2}),satin,[0,0,-.031],pod);
 function gauge(parent,x,y,r,title,max){
  const face=new THREE.Group();face.position.set(x,y,.008);parent.add(face);
  mesh(new THREE.TorusGeometry(r,.004,8,48),silver,[0,0,0],face);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#131719';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#d8d9cf';ctx.fillStyle='#e4e4d7';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<=40;i++){const a=(-225+i*6.75)*Math.PI/180,major=i%5===0;ctx.lineWidth=major?3:1;ctx.beginPath();ctx.moveTo(128+Math.cos(a)*104,128+Math.sin(a)*104);ctx.lineTo(128+Math.cos(a)*(major?87:95),128+Math.sin(a)*(major?87:95));ctx.stroke();if(major){ctx.font='18px Arial';ctx.fillText(String(Math.round(i/40*max)),128+Math.cos(a)*70,128+Math.sin(a)*70);}}
  ctx.font='15px Arial';ctx.fillText(title,128,178);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  mesh(new THREE.CircleGeometry(r*.95,48),new THREE.MeshBasicMaterial({map:tex}),[0,0,0],face);
  const needle=new THREE.Group();face.add(needle);box([r*.36,0,.007],[r*.77,.003,.003],new THREE.MeshBasicMaterial({color:0xf45142}),needle);
  mesh(new THREE.CircleGeometry(r*.09,16),silver,[0,0,.012],face);
  return needle;
 }
 const tach=gauge(pod,-.015,.034,.080,'RPM x1000',8);
 const oil=gauge(pod,-.122,-.043,.040,'BAR',8);
 const water=gauge(pod,.107,-.031,.046,'TEMP',120);
 const shift=panel([.45,.986,-.055]);mesh(new THREE.CylinderGeometry(.024,.024,.063,20).rotateX(Math.PI/2),black,[0,0,0],shift);
 const shiftLight=mesh(new THREE.CircleGeometry(.019,20),new THREE.MeshBasicMaterial({color:0x41130b}),[0,0,.033],shift);
 // Three-spoke suede wheel with yellow centering stripe and lower phone bracket.
 bar([.52,.85,-.34],[.21,.87,-.34],.025,steel);
 const wheel=panel([.22,.88,-.34]);wheel.name='Volante_animado';wheel.rotation.z=.035;
 const wheelTurn=new THREE.Group();wheel.add(wheelTurn);
 mesh(new THREE.TorusGeometry(.173,.018,12,64),cloth,[0,0,0],wheelTurn);
 mesh(new THREE.TorusGeometry(.173,.0187,10,8,.12),yellow,[0,0,0],wheelTurn).rotation.z=Math.PI/2-.06;
 for(const angle of [Math.PI/6,Math.PI*5/6,Math.PI*1.5]){
  const spoke=box([Math.cos(angle)*.088,Math.sin(angle)*.088,-.005],[.15,.025,.008],silver,wheelTurn);spoke.rotation.z=angle;
 }
 mesh(new THREE.CylinderGeometry(.034,.034,.024,32).rotateX(Math.PI/2),black,[0,0,.006],wheelTurn);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(new THREE.SphereGeometry(.003,6,4),silver,[Math.cos(a)*.027,Math.sin(a)*.027,.021],wheelTurn);}
 const phone=createFamilyPhone();wheelTurn.add(phone.root);
 // Red digital display and overhead switch bank.
 const displayPanel=panel([.44,.92,.24]);box([0,0,0],[.108,.06,.04],black,displayPanel);
 const displayCanvas=document.createElement('canvas');displayCanvas.width=256;displayCanvas.height=128;const dc=displayCanvas.getContext('2d');
 const displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;
 mesh(new THREE.PlaneGeometry(.086,.039),new THREE.MeshBasicMaterial({map:displayTexture}),[0,0,.022],displayPanel);
 const switches=panel([.28,1.335,-.39]);box([0,0,0],[.26,.060,.026],black,switches);
 for(let i=0;i<7;i++){const x=-.104+i*.034;mesh(new THREE.TorusGeometry(.007,.002,6,12),silver,[x,0,.018],switches);bar([x,-.007,.018],[x,.007,.026],.0025,silver,switches);}
 // Driver controls. Each moving part is a pivot group the seated driver animates;
 // the *Grip/contact anchors are where a glove or boot sole meets it.
 const leather=new THREE.MeshStandardMaterial({color:0x141617,roughness:.9});
 const rubber=new THREE.MeshStandardMaterial({color:0x0b0c0d,roughness:.95});
 // Tall five-speed H lever on the tunnel, rubber boot and gate pattern on the knob.
 const shifter=new THREE.Group();shifter.name='Cambio_H_animado';shifter.position.set(.095,.512,.02);root.add(shifter);
 mesh(new THREE.TorusGeometry(.047,.006,8,28).rotateX(Math.PI/2),silver,[0,.004,0],shifter);
 const boot=new THREE.Group();shifter.add(boot);mesh(new THREE.CylinderGeometry(.017,.046,.075,18,3,true),leather,[0,.0375,0],boot);
 const lever=new THREE.Group();lever.name='Alavanca_cambio';shifter.add(lever);
 bar([0,0,0],[0,SHIFT_LEVER,0],.0085,silver,lever);
 mesh(new THREE.SphereGeometry(.027,20,14),black,[0,SHIFT_LEVER,0],lever);
 const patternCanvas=document.createElement('canvas');patternCanvas.width=patternCanvas.height=128;const pc=patternCanvas.getContext('2d');
 pc.fillStyle='#101213';pc.fillRect(0,0,128,128);pc.strokeStyle='#d9dad4';pc.lineWidth=4;pc.beginPath();
 for(const x of [34,64,94]){pc.moveTo(x,34);pc.lineTo(x,94);}pc.moveTo(34,64);pc.lineTo(94,64);pc.stroke();
 pc.fillStyle='#e8e8e2';pc.font='bold 22px Arial';pc.textAlign='center';pc.textBaseline='middle';
 [['1',34,20],['3',64,20],['5',94,20],['2',34,110],['4',64,110],['R',94,110]].forEach(([t,x,y])=>pc.fillText(t,x,y));
 const patternTexture=new THREE.CanvasTexture(patternCanvas);patternTexture.colorSpace=THREE.SRGBColorSpace;
 // Canvas top faces forward (+X) when seen from the seat.
 mesh(new THREE.CircleGeometry(.019,24).rotateX(-Math.PI/2).rotateY(-Math.PI/2),new THREE.MeshBasicMaterial({map:patternTexture}),[0,SHIFT_LEVER+.0262,0],lever);
 const knobGrip=new THREE.Object3D();knobGrip.position.set(0,SHIFT_LEVER-.034,0);lever.add(knobGrip);
 function setShifter(lane,throwPosition){
  lever.rotation.set(lane*SHIFT_LANE,0,-throwPosition*SHIFT_THROW-SHIFT_LEAN);
  boot.rotation.set(lever.rotation.x*.5,0,lever.rotation.z*.5);
 }
 // Hydraulic fly-off handbrake beside the shifter: pulled back toward the driver.
 const handbrake=new THREE.Group();handbrake.name='Freio_de_mao_hidraulico';handbrake.position.set(.06,.512,.105);root.add(handbrake);
 box([0,.012,0],[.075,.024,.05],steel,handbrake);
 mesh(new THREE.CylinderGeometry(.01,.01,.05,12).rotateZ(Math.PI/2),steel,[-.05,.022,0],handbrake);
 bar([-.075,.022,0],[-.09,-.015,0],.004,cloth,handbrake);
 mesh(new THREE.CylinderGeometry(.008,.008,.058,10).rotateX(Math.PI/2),silver,[0,.022,0],handbrake);
 const handbrakeLever=new THREE.Group();handbrakeLever.name='Alavanca_freio_de_mao';handbrakeLever.position.y=.022;handbrake.add(handbrakeLever);
 bar([0,0,0],[0,.30,0],.0095,steel,handbrakeLever);
 mesh(new THREE.CylinderGeometry(.0165,.0165,.105,16),rubber,[0,.235,0],handbrakeLever);
 mesh(new THREE.SphereGeometry(.013,12,8),red,[0,.292,0],handbrakeLever);
 const handbrakeGrip=new THREE.Object3D();handbrakeGrip.position.set(0,.232,0);handbrakeLever.add(handbrakeGrip);
 const setHandbrake=value=>{handbrakeLever.rotation.z=HANDBRAKE_REST+value*HANDBRAKE_PULL;};
 // Hanging pedals (clutch, brake, throttle) on a common axle under the dash; the
 // pads are angled to meet a boot sole pivoting on its heel.
 const pedals={};
 bar([.755,.70,-.52],[.755,.70,-.20],.01,steel);
 for(const [name,z,x,y,width,height] of [['clutch',-.46,.705,.458,.062,.075],['brake',-.35,.698,.462,.07,.08],['throttle',-.248,.712,.44,.05,.12]]){
  const pivot=new THREE.Group();pivot.name='Pedal_'+name;pivot.position.set(.755,.70,z);root.add(pivot);
  const pad=[x-.755,y-.70,0];bar([0,0,0],[pad[0]+.008,pad[1],0],.0075,silver,pivot);
  const face=new THREE.Group();face.position.set(...pad);face.rotation.z=-.7;pivot.add(face);
  box([0,0,0],[.012,height,width],silver,face);
  for(let i=-1;i<=1;i++)box([-.0068,i*height*.3,0],[.002,.006,width*.88],black,face);
  const contact=new THREE.Object3D();contact.position.x=-.008;face.add(contact);
  pedals[name]={pivot,contact,travel:PEDAL_TRAVEL[name]};
 }
 const footrest=new THREE.Group();footrest.name='Apoio_pe_esquerdo';footrest.position.set(.70,.43,-.585);footrest.rotation.z=-.7;root.add(footrest);
 box([0,0,0],[.012,.16,.085],satin,footrest);
 const restContact=new THREE.Object3D();restContact.position.set(-.008,.02,0);footrest.add(restContact);
 function setPedals(clutch,brake,throttle){for(const [name,value] of Object.entries({clutch,brake,throttle}))pedals[name].pivot.rotation.z=clamp(value,0,1)*pedals[name].travel;}
 setShifter(...GATE[1]);setHandbrake(0);
 const controls={shifter,lever,knobGrip,handbrake,handbrakeLever,handbrakeGrip,pedals,footrest,restContact,
  parts:[shifter,handbrake,footrest,...Object.values(pedals).map(p=>p.pivot)],
  apply(pose){setShifter(...pose.lever);setHandbrake(pose.handbrake);setPedals(pose.clutch,pose.brake,pose.throttle);},
  info:()=>({lever:[lever.rotation.x,lever.rotation.z],handbrake:handbrakeLever.rotation.z,pedals:Object.fromEntries(Object.entries(pedals).map(([k,p])=>[k,p.pivot.rotation.z/p.travel]))})};
 // Exposed cables and passenger fire extinguisher.
 for(let i=0;i<4;i++)bar([.54,.76,.22+i*.10],[.31,.35,.14+i*.09],.003,cloth);
 const extinguisher=mesh(new THREE.CylinderGeometry(.067,.067,.34,20),red,[.45,.40,.48]);extinguisher.rotation.x=Math.PI/2;
 for(const z of [.38,.57])box([.45,.40,z],[.14,.12,.022],steel);
 plaque('EXTINTOR',[.375,.42,.48],.095,.04,root,'#ddddcf');
 // Functional rear-view mirror: the texture is filled by the game renderer.
 const mirrorTarget=new THREE.WebGLRenderTarget(768,192);
 const mirror=panel([.34,1.337,.035]);box([0,0,0],[.58,.093,.023],black,mirror);
 const mirrorGeo=new THREE.PlaneGeometry(.555,.077);const uv=mirrorGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
 mesh(mirrorGeo,new THREE.MeshBasicMaterial({map:mirrorTarget.texture,toneMapped:false}),[0,0,.014],mirror);
 const rearCamera=new THREE.PerspectiveCamera(48,4,.1,2200);
 let lastSpeed=-1;
 function update(car,dt,powertrain){
  const speed=Math.hypot(car.vx,car.vy)*3.6,gear=Math.min(5,1+Math.floor(speed/42));
  const rpm=powertrain?.rpm??(speed<2?1100:Math.min(7800,1800+(speed%42)/42*5700));
  wheelTurn.rotation.z=steeringWheelAngle(car.steerVisual??car.steer);
  tach.rotation.z=(225-rpm/8000*270)*Math.PI/180;
  oil.rotation.z=(225-(3.8+rpm/8000*1.2)/8*270)*Math.PI/180;
  water.rotation.z=(225-86/120*270)*Math.PI/180;
  shiftLight.material.color.setHex(rpm>6700?0xff3d13:0x41130b);
  if(Math.round(speed)!==lastSpeed){lastSpeed=Math.round(speed);dc.fillStyle='#140404';dc.fillRect(0,0,256,128);dc.fillStyle='#ff3232';dc.font='bold 86px monospace';dc.textAlign='center';dc.fillText(String(lastSpeed).padStart(3,'0'),128,87);dc.font='18px Arial';dc.fillText('KM/H',128,117);displayTexture.needsUpdate=true;}
  const phoneArrived=phone.update(root.visible?dt:0);
  return {speed,rpm,gear,steering:wheelTurn.rotation.z,phoneArrived};
 }
 return {root,wheel,wheelTurn,controls,eye:new THREE.Vector3(-.39,1.08,.015),update,mirrorTarget,rearCamera,resetPhone:()=>phone.reset(),
  info:()=>({reference:'carro/carro_14_interna.JPG',steering:wheelTurn.rotation.z,speed:lastSpeed,mirror:[768,192],visible:root.visible,phone:phone.info(),controls:controls.info()})};
}
