import * as THREE from 'three';
import {steeringWheelAngle} from './driver-rig.js';
import {createFamilyPhone} from './family-phone.js';

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
 // Shifter, pedals, exposed cables and passenger fire extinguisher.
 bar([.08,.38,.02],[.12,.69,.02],.013,silver);mesh(new THREE.SphereGeometry(.026,16,12),silver,[.12,.70,.02]);
 for(let i=0;i<3;i++){const pedal=box([.68,.39,-.46+i*.10],[.025,.095,.06],silver);pedal.rotation.z=.25;}
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
 return {root,wheel,wheelTurn,eye:new THREE.Vector3(-.39,1.08,.015),update,mirrorTarget,rearCamera,resetPhone:()=>phone.reset(),
  info:()=>({reference:'carro/carro_14_interna.JPG',steering:wheelTurn.rotation.z,speed:lastSpeed,mirror:[768,192],visible:root.visible,phone:phone.info()})};
}
