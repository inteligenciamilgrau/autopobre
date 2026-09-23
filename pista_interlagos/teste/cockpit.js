import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {steeringWheelAngle} from './driver-rig.js';
import {GATE} from './driver-controls.js';
import {clamp} from './physics.js';
import {createFamilyPhone} from './family-phone.js';
import {createInteriorMaterials,boxUV,tubeUV,canvasTexture,gaugeTexture,GAUGE_START,GAUGE_SWEEP,drawSegments,labelStrip,cutOffSticker,extinguisherLabel,embroidery} from './cockpit-materials.js';

// Lever length (m) and lever/pedal travel (rad) for the controls the driver works.
const SHIFT_LEVER=.255,SHIFT_THROW=.2,SHIFT_LANE=.15,SHIFT_LEAN=.1;
const HANDBRAKE_REST=-.32,HANDBRAKE_PULL=.4;
const PEDAL_TRAVEL=Object.freeze({clutch:.22,brake:.11,throttle:.16});
// Instrument scales: the needles and the printed faces share them.
const TACH={min:0,max:8},OIL={min:0,max:8},WATER={min:40,max:120};
const needleAngle=(value,{min,max})=>-(GAUGE_START+GAUGE_SWEEP*clamp((value-min)/(max-min),0,1))*Math.PI/180;

// Reference: carro/carro_14_interna.JPG and carro_8_piloto_dentro_edu_neves.jpg.
// +X forward, +Y up, -Z driver's side. Dimensions are a visual reconstruction.
export function createCockpit(renderer){
 const root=new THREE.Group();root.name='Interior_foto_14';root.visible=false;
 const m=createInteriorMaterials(renderer);
 const silver=new THREE.MeshStandardMaterial({color:0x8d9293,metalness:.8,roughness:.34});
 const chrome=new THREE.MeshStandardMaterial({color:0xe2e5e8,metalness:1,roughness:.12,envMapIntensity:1});
 const steel=new THREE.MeshStandardMaterial({color:0x343a3d,metalness:.65,roughness:.47,envMapIntensity:.5});
 const red=new THREE.MeshStandardMaterial({color:0x990f16,roughness:.6});
 const yellow=new THREE.MeshStandardMaterial({color:0xcfb452,roughness:.82});
 // Cabin reflections turn with the car; the hood keeps the sky.
 const reflective=[...Object.values(m),silver,chrome,steel,red,yellow].filter(x=>x.isMaterial&&x!==m.hood);
 if(m.envMap)for(const material of reflective)material.envMap=m.envMap;
 // Everything opaque in the cabin throws a shadow: sunlight enters through the glass only.
 function mesh(g,material,p,parent=root){const o=new THREE.Mesh(g,material);o.position.set(...p);parent.add(o);o.receiveShadow=true;o.castShadow=!material.transparent;return o;}
 const box=(p,s,material=m.plastic,parent=root)=>mesh(boxUV(new THREE.BoxGeometry(...s)),material,p,parent);
 function bar(a,b,r=.023,material=m.cage,parent=root){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),length=av.distanceTo(bv),o=mesh(tubeUV(new THREE.CylinderGeometry(r,r,length,12),r,length),material,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
 // Foam roll-cage padding over part of a tube, as fitted near the helmet.
 const padding=(a,b,from,to,r=.043)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);return bar(av.clone().lerp(bv,from).toArray(),av.clone().lerp(bv,to).toArray(),r,m.foam);};
 function panel(p,parent=root){const g=new THREE.Group();g.position.set(...p);g.rotation.y=-Math.PI/2;parent.add(g);return g;}
 function decal(texture,p,w,h,parent,opts={}){const o=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.55,transparent:!!opts.transparent,alphaTest:opts.transparent?.02:0,envMapIntensity:.3,polygonOffset:true,polygonOffsetFactor:-2}),p,parent);o.castShadow=false;return o;}
 // Padded shape: rounded rectangle extruded with a soft bevel, centred on its depth.
 // Extrusions keep three's own UVs, already in metres and seamless round the bevels.
 function cushion(width,height,depth,radius,bevel){
  const s=new THREE.Shape(),x=-width/2,y=-height/2,r=Math.min(radius,width/2,height/2);
  s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel*.8,bevelSegments:4,curveSegments:8});g.translate(0,0,-depth/2);g.computeVertexNormals();
  return g;
 }

 // --- Body shell: tread-plate floor, painted bulkheads and roof, aluminium door cards.
 box([.19,.29,0],[1.65,.04,1.49],m.tread);
 box([.54,.3115,-.40],[.40,.003,.38],m.rubber); // footwell mat under the pedals
 box([.80,.57,0],[.06,.57,1.49],m.body);
 box([.26,.40,.07],[.92,.22,.25],m.rubber);
 box([1.18,.825,0],[.77,.025,1.44],m.hood); // hood beyond the windscreen
 box([-.13,1.415,0],[1.08,.055,1.34],m.body);
 for(const x of [-.5,-.18,.14])box([x,1.381,0],[.035,.014,1.30],m.body); // roof ribs
 // --- Moulded leather-grain dash with its curved lip.
 box([.67,.85,0],[.32,.11,1.40],m.dash);
 bar([.62,.865,-.69],[.62,.865,.69],.036,m.dash);
 box([.62,.75,0],[.06,.16,1.35],m.dash);
 for(const side of [-1,1]){
  box([.10,.59,side*.745],[1.54,.57,.025],m.aluminium);
  box([.10,.878,side*.736],[1.54,.018,.03],m.body); // door top rail
  for(let i=0;i<9;i++)mesh(new THREE.SphereGeometry(.005,6,4),silver,[-.43+i*.13,.805,side*.73]);
  for(let i=0;i<9;i++)mesh(new THREE.SphereGeometry(.005,6,4),silver,[-.43+i*.13,.37,side*.73]);
  // Roll cage: A-pillar, roof rail, door bars and the main hoop behind the seat.
  bar([.77,.38,side*.70],[.62,.96,side*.70],.029);
  bar([.62,.96,side*.70],[.28,1.36,side*.59],.032);
  bar([.28,1.36,side*.59],[-.63,1.36,side*.59],.029);
  bar([.58,.60,side*.70],[-.62,.88,side*.70],.024);
  bar([-.63,.31,side*.63],[-.63,1.36,side*.59],.032);
  // Window net as on the real car: 4 rows and 6 columns of 40 mm webbing.
  for(let i=0;i<4;i++)box([-.02,.93+i*.10,side*.735],[.94,.04,.008],m.webbing);
  for(let i=0;i<6;i++)box([-.46+i*.18,1.08,side*.738],[.04,.34,.008],m.webbing);
 }
 bar([.29,1.36,-.60],[.29,1.36,.60],.029);
 bar([-.63,1.36,-.59],[-.63,1.36,.59],.032);
 bar([-.63,.96,-.62],[-.63,.96,.62],.026); // harness bar
 bar([-.63,1.36,-.59],[-.63,.31,.63],.026);
 // Padding where the helmet could touch: driver's roof rail, A-pillar and door bar.
 padding([.28,1.36,-.59],[-.63,1.36,-.59],.25,.95);
 padding([.62,.96,-.70],[.28,1.36,-.59],.45,1);
 padding([.58,.60,-.70],[-.62,.88,-.70],.35,.75,.038);
 padding([-.63,.31,-.63],[-.63,1.36,-.59],.62,.95);
 // Opaque sun strip, leaving the road aperture open.
 const banner=box([.36,1.296,0],[.022,.073,1.17],new THREE.MeshStandardMaterial({color:0x958c77,roughness:1}));banner.rotation.z=-.32;
 const bannerLogo=new THREE.TextureLoader().load('./assets/texturas/cockpit_faixa_invent.png');bannerLogo.colorSpace=THREE.SRGBColorSpace;
 const bannerPlane=new THREE.PlaneGeometry(.51,.079);const buv=bannerPlane.attributes.uv;for(let i=0;i<buv.count;i++)buv.setX(i,1-buv.getX(i));
 mesh(bannerPlane,new THREE.MeshBasicMaterial({map:bannerLogo,transparent:true,opacity:.42,depthWrite:false}),[0,0,0],panel([.335,1.288,.005]));

 // --- Racing bucket seat: fibreglass shell, suede centres, leather bolsters.
 const seat=new THREE.Group();seat.name='Banco_concha';root.add(seat);
 const seatPart=(geometry,material,p,rotation=[0,0,0])=>{const o=mesh(geometry,material,p,seat);o.rotation.set(...rotation);return o;};
 // Cushions are built in XY: toX turns one to face forward (backrest), toY lays it flat (base).
 const toX=[0,Math.PI/2,0],toY=[-Math.PI/2,0,0];
 seatPart(cushion(.30,.52,.04,.05,.02),m.suede,[-.345,.73,-.34],toX);
 seatPart(cushion(.40,.29,.035,.06,.02),m.suede,[-.17,.37,-.34],toY);
 seatPart(cushion(.20,.22,.035,.06,.018),m.suede,[-.39,1.16,-.34],toX);
 for(const side of [-1,1]){
  const z=-.34+side*.20;
  seatPart(cushion(.13,.48,.04,.045,.016),m.seatVinyl,[-.305,.69,z],[0,side*.18,0]);
  seatPart(cushion(.36,.10,.034,.04,.016),m.seatVinyl,[-.19,.42,-.34+side*.215],[0,0,-.06]);
  // Side of the shell: low at the thighs, up to the shoulders (the camera rides just outside).
  const profile=new THREE.Shape();profile.moveTo(-.44,.33);profile.lineTo(.05,.33);profile.lineTo(.05,.47);profile.quadraticCurveTo(-.12,.47,-.22,.56);profile.lineTo(-.26,.96);profile.quadraticCurveTo(-.30,1.04,-.44,1.04);profile.closePath();
  const wall=new THREE.ExtrudeGeometry(profile,{depth:.012,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2});wall.translate(0,0,-.006);
  seatPart(wall,m.shell,[0,0,-.34+side*.245]);
  const bracket=seatPart(boxUV(new THREE.BoxGeometry(.34,.085,.006)),m.aluminium,[-.19,.36,-.34+side*.256]);
  for(const x of [-.32,-.06])mesh(new THREE.CylinderGeometry(.006,.006,.012,10).rotateX(Math.PI/2),chrome,[x,.36,-.34+side*.26],seat);
 }
 seatPart(cushion(.47,.66,.012,.07,.006),m.shell,[-.43,.72,-.34],toX);
 seatPart(cushion(.25,.30,.012,.08,.006),m.shell,[-.43,1.15,-.34],toX); // head restraint shell
 // Embroidered number on the shell side facing the tunnel.
 decal(embroidery('AUTO-POBRE 99',{width:512,height:96}),[-.2,.62,-.34+.2565],.2,.0375,seat,{transparent:true});

 // --- Carbon instrument pod with chrome-bezel gauges behind glass.
 const pod=panel([.42,.865,-.15]);
 const podShape=new THREE.Shape();podShape.moveTo(-.185,-.12);podShape.lineTo(.18,-.12);podShape.lineTo(.115,.095);podShape.quadraticCurveTo(.0,.18,-.09,.125);podShape.lineTo(-.185,-.025);podShape.closePath();
 mesh(new THREE.ExtrudeGeometry(podShape,{depth:.028,bevelEnabled:true,bevelThickness:.003,bevelSize:.005,bevelSegments:2}),m.carbon,[0,0,-.031],pod);
 const needleMaterial=new THREE.MeshBasicMaterial({color:0xff5a24});
 function gauge(parent,x,y,r,faceOptions){
  const face=new THREE.Group();face.position.set(x,y,.008);parent.add(face);
  const bezel=new THREE.LatheGeometry([[r*.93,.002],[r*.98,.0065],[r*1.05,.0075],[r*1.1,.003],[r*1.1,-.004]].map(([a,b])=>new THREE.Vector2(a,b)),48).rotateX(Math.PI/2);
  mesh(bezel,chrome,[0,0,0],face);
  mesh(new THREE.CircleGeometry(r*.95,48),new THREE.MeshBasicMaterial({map:gaugeTexture(faceOptions)}),[0,0,0],face);
  const needle=new THREE.Group();needle.position.z=.004;face.add(needle);
  const blade=new THREE.Shape();blade.moveTo(-r*.18,-r*.022);blade.lineTo(r*.8,-r*.006);blade.lineTo(r*.82,0);blade.lineTo(r*.8,r*.006);blade.lineTo(-r*.18,r*.022);blade.closePath();
  mesh(new THREE.ShapeGeometry(blade),needleMaterial,[0,0,0],needle);
  mesh(new THREE.CylinderGeometry(r*.1,r*.11,.004,20).rotateX(Math.PI/2),m.plastic,[0,0,.006],face);
  mesh(new THREE.CircleGeometry(r*.96,48),m.glass,[0,0,.009],face);
  return needle;
 }
 const tach=gauge(pod,-.015,.034,.080,{title:'RPM x1000',subtitle:'OPALA 4.1 · 6 CIL',...TACH,major:1,minor:.2,red:6.5,size:1024});
 const oil=gauge(pod,-.122,-.043,.040,{title:'ÓLEO',subtitle:'bar',...OIL,major:2,minor:.5});
 const water=gauge(pod,.107,-.031,.046,{title:'ÁGUA',subtitle:'°C',...WATER,major:20,minor:5,red:105,labels:v=>v===40||v===120||v===80?String(v):''});
 // Warning lamps under the tachometer: dark tinted lenses, unlit.
 [[-.05,0x5a120e],[-.015,0x5a430b],[.02,0x0f4a1f]].forEach(([dx,color])=>mesh(new THREE.CylinderGeometry(.0065,.0065,.004,16).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color,roughness:.2,emissive:color,emissiveIntensity:.15}),[dx-.015,-.075,.006],pod));
 const shift=panel([.45,.986,-.055]);mesh(new THREE.CylinderGeometry(.024,.024,.063,20).rotateX(Math.PI/2),m.plastic,[0,0,0],shift);
 mesh(new THREE.TorusGeometry(.0215,.003,8,24),chrome,[0,0,.032],shift);
 const shiftLight=mesh(new THREE.SphereGeometry(.019,20,10,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0x3a0906,roughness:.15,emissive:0xff2a10,emissiveIntensity:0}),[0,0,.030],shift);
 // --- Suede three-spoke wheel on a quick-release hub, yellow centring stripe.
 bar([.52,.85,-.34],[.21,.87,-.34],.025,steel);
 const wheel=panel([.22,.88,-.34]);wheel.name='Volante_animado';wheel.rotation.z=.035;
 const wheelTurn=new THREE.Group();wheel.add(wheelTurn);
 const rim=new THREE.TorusGeometry(.173,.018,14,72),ruv=rim.attributes.uv;for(let i=0;i<ruv.count;i++)ruv.setXY(i,ruv.getX(i)*2*Math.PI*.173,ruv.getY(i)*2*Math.PI*.018);
 mesh(rim,m.suede,[0,0,0],wheelTurn);
 mesh(new THREE.TorusGeometry(.173,.0187,10,8,.12),yellow,[0,0,0],wheelTurn).rotation.z=Math.PI/2-.06;
 for(const angle of [Math.PI/6,Math.PI*5/6,Math.PI*1.5]){
  const spoke=box([Math.cos(angle)*.088,Math.sin(angle)*.088,-.005],[.15,.025,.008],m.aluminium,wheelTurn);spoke.rotation.z=angle;
 }
 mesh(new THREE.CylinderGeometry(.034,.034,.024,32).rotateX(Math.PI/2),m.shell,[0,0,.006],wheelTurn);
 mesh(new THREE.CylinderGeometry(.026,.029,.03,24).rotateX(Math.PI/2),chrome,[0,0,-.02],wheel); // quick release
 mesh(new THREE.CircleGeometry(.021,32),new THREE.MeshStandardMaterial({map:embroidery('99',{width:128,height:128,color:'#e8e8e2',background:'#101214'}),roughness:.4}),[0,0,.0185],wheelTurn);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(new THREE.SphereGeometry(.003,6,4),chrome,[Math.cos(a)*.027,Math.sin(a)*.027,.021],wheelTurn);}
 const phone=createFamilyPhone();wheelTurn.add(phone.root);
 // --- Red LCD speed readout and the labelled overhead switch bank.
 const displayPanel=panel([.44,.92,.24]);box([0,0,0],[.108,.06,.04],m.plastic,displayPanel);
 mesh(boxUV(new THREE.BoxGeometry(.094,.047,.004)),m.shell,[0,0,.021],displayPanel);
 const displayCanvas=document.createElement('canvas');displayCanvas.width=256;displayCanvas.height=128;const dc=displayCanvas.getContext('2d');
 const displayTexture=new THREE.CanvasTexture(displayCanvas);displayTexture.colorSpace=THREE.SRGBColorSpace;displayTexture.anisotropy=4;
 mesh(new THREE.PlaneGeometry(.086,.039),new THREE.MeshBasicMaterial({map:displayTexture}),[0,0,.0235],displayPanel);
 mesh(new THREE.PlaneGeometry(.086,.039),m.glass,[0,0,.0245],displayPanel);
 const switches=panel([.28,1.335,-.39]);box([0,0,0],[.26,.060,.026],m.plastic,switches);
 decal(labelStrip(['IGN','BOMBA','VENT','FARÓIS','LIMP','AUX','PARTIDA'],{width:1024,height:64,font:26}),[0,-.021,.0135],.25,.0156,switches);
 for(let i=0;i<6;i++){const x=-.104+i*.034;mesh(new THREE.TorusGeometry(.007,.002,6,12),chrome,[x,.004,.018],switches);bar([x,-.003,.018],[x,.011,.027],.0025,chrome,switches);}
 // Ignition under a red flip guard; the start button is a red push button.
 const guard=box([-.104,.004,.026],[.018,.024,.016],new THREE.MeshPhysicalMaterial({color:0xc0141c,roughness:.35,transparent:true,opacity:.82,clearcoat:.6}),switches);guard.rotation.x=-.5;
 mesh(new THREE.CylinderGeometry(.008,.009,.009,20).rotateX(Math.PI/2),red,[.100,.004,.017],switches);
 mesh(new THREE.TorusGeometry(.0095,.0022,8,20),chrome,[.100,.004,.014],switches);
 // Battery cut-off switch on the dash with its scrutineering sticker.
 const cutoff=panel([.587,.72,.13]);
 mesh(new THREE.CylinderGeometry(.021,.021,.008,24).rotateX(Math.PI/2),m.plastic,[0,0,.004],cutoff);
 mesh(boxUV(new THREE.BoxGeometry(.034,.011,.012)),red,[0,0,.013],cutoff);
 decal(cutOffSticker(),[0,.046,.002],.044,.039,cutoff,{transparent:true});
 decal(labelStrip(['CORTA-CORRENTE'],{width:256,height:40,font:22,background:'#b3121a',color:'#ffffff'}),[0,-.031,.002],.06,.0094,cutoff);

 // Driver controls. Each moving part is a pivot group the seated driver animates;
 // the *Grip/contact anchors are where a glove or boot sole meets it.
 // Tall five-speed H lever on the tunnel, leather boot and gate pattern on the knob.
 const shifter=new THREE.Group();shifter.name='Cambio_H_animado';shifter.position.set(.095,.512,.02);root.add(shifter);
 mesh(new THREE.TorusGeometry(.047,.006,8,28).rotateX(Math.PI/2),chrome,[0,.004,0],shifter);
 const boot=new THREE.Group();shifter.add(boot);mesh(boxUV(new THREE.CylinderGeometry(.017,.046,.075,18,3,true)),m.seatVinyl,[0,.0375,0],boot);
 const lever=new THREE.Group();lever.name='Alavanca_cambio';shifter.add(lever);
 bar([0,0,0],[0,SHIFT_LEVER,0],.0085,chrome,lever);
 mesh(new THREE.SphereGeometry(.027,20,14),m.shell,[0,SHIFT_LEVER,0],lever);
 const patternTexture=canvasTexture(128,128,(pc)=>{
  pc.fillStyle='#101213';pc.fillRect(0,0,128,128);pc.strokeStyle='#d9dad4';pc.lineWidth=4;pc.beginPath();
  for(const x of [34,64,94]){pc.moveTo(x,34);pc.lineTo(x,94);}pc.moveTo(34,64);pc.lineTo(94,64);pc.stroke();
  pc.fillStyle='#e8e8e2';pc.font='bold 22px Arial';pc.textAlign='center';pc.textBaseline='middle';
  [['1',34,20],['3',64,20],['5',94,20],['2',34,110],['4',64,110],['R',94,110]].forEach(([t,x,y])=>pc.fillText(t,x,y));
 });
 // Canvas top faces forward (+X) when seen from the seat.
 mesh(new THREE.CircleGeometry(.019,24).rotateX(-Math.PI/2).rotateY(-Math.PI/2),new THREE.MeshBasicMaterial({map:patternTexture}),[0,SHIFT_LEVER+.0262,0],lever);
 const knobGrip=new THREE.Object3D();knobGrip.position.set(0,SHIFT_LEVER-.034,0);lever.add(knobGrip);
 function setShifter(lane,throwPosition){
  lever.rotation.set(lane*SHIFT_LANE,0,-throwPosition*SHIFT_THROW-SHIFT_LEAN);
  boot.rotation.set(lever.rotation.x*.5,0,lever.rotation.z*.5);
 }
 // Hydraulic fly-off handbrake beside the shifter: pulled back toward the driver.
 const handbrake=new THREE.Group();handbrake.name='Freio_de_mao_hidraulico';handbrake.position.set(.06,.512,.105);root.add(handbrake);
 box([0,.012,0],[.075,.024,.05],m.aluminium,handbrake);
 mesh(new THREE.CylinderGeometry(.01,.01,.05,12).rotateZ(Math.PI/2),steel,[-.05,.022,0],handbrake);
 bar([-.075,.022,0],[-.09,-.015,0],.004,m.plastic,handbrake);
 mesh(new THREE.CylinderGeometry(.008,.008,.058,10).rotateX(Math.PI/2),silver,[0,.022,0],handbrake);
 const handbrakeLever=new THREE.Group();handbrakeLever.name='Alavanca_freio_de_mao';handbrakeLever.position.y=.022;handbrake.add(handbrakeLever);
 bar([0,0,0],[0,.30,0],.0095,steel,handbrakeLever);
 mesh(tubeUV(new THREE.CylinderGeometry(.0165,.0165,.105,16),.0165,.105),m.rubber,[0,.235,0],handbrakeLever);
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
  box([0,0,0],[.012,height,width],m.aluminium,face);
  for(let i=-1;i<=1;i++)box([-.0068,i*height*.3,0],[.002,.006,width*.88],m.rubber,face);
  const contact=new THREE.Object3D();contact.position.x=-.008;face.add(contact);
  pedals[name]={pivot,contact,travel:PEDAL_TRAVEL[name]};
 }
 const footrest=new THREE.Group();footrest.name='Apoio_pe_esquerdo';footrest.position.set(.70,.43,-.585);footrest.rotation.z=-.7;root.add(footrest);
 box([0,0,0],[.012,.16,.085],m.tread,footrest);
 const restContact=new THREE.Object3D();restContact.position.set(-.008,.02,0);footrest.add(restContact);
 function setPedals(clutch,brake,throttle){for(const [name,value] of Object.entries({clutch,brake,throttle}))pedals[name].pivot.rotation.z=clamp(value,0,1)*pedals[name].travel;}
 setShifter(...GATE[1]);setHandbrake(0);
 const controls={shifter,lever,knobGrip,handbrake,handbrakeLever,handbrakeGrip,pedals,footrest,restContact,
  parts:[shifter,handbrake,footrest,...Object.values(pedals).map(p=>p.pivot)],
  apply(pose){setShifter(...pose.lever);setHandbrake(pose.handbrake);setPedals(pose.clutch,pose.brake,pose.throttle);},
  info:()=>({lever:[lever.rotation.x,lever.rotation.z],handbrake:handbrakeLever.rotation.z,pedals:Object.fromEntries(Object.entries(pedals).map(([k,p])=>[k,p.pivot.rotation.z/p.travel]))})};

 // Exposed cables and the passenger-side extinguisher in aluminium straps.
 for(let i=0;i<4;i++)bar([.54,.76,.22+i*.10],[.31,.35,.14+i*.09],.003,m.plastic);
 const extinguisher=new THREE.Group();extinguisher.position.set(.45,.40,.48);extinguisher.rotation.x=Math.PI/2;root.add(extinguisher);
 mesh(new THREE.CylinderGeometry(.067,.067,.34,32),m.extinguisher,[0,0,0],extinguisher);
 for(const y of [-.17,.17])mesh(new THREE.SphereGeometry(.067,32,10,0,Math.PI*2,0,Math.PI/2).scale(1,.35,1).rotateX(y<0?Math.PI:0),m.extinguisher,[0,y,0],extinguisher);
 // Label faces up and toward the seat (see the cylinder's theta convention).
 mesh(new THREE.CylinderGeometry(.0678,.0678,.19,32,1,true,Math.PI*1.25-1.15,2.3),new THREE.MeshStandardMaterial({map:extinguisherLabel(),roughness:.4,envMapIntensity:.5}),[0,.01,0],extinguisher);
 mesh(new THREE.CylinderGeometry(.016,.02,.05,20),chrome,[0,.215,0],extinguisher);
 const gaugeDial=mesh(new THREE.CircleGeometry(.011,20),new THREE.MeshBasicMaterial({map:canvasTexture(64,64,(ctx)=>{ctx.fillStyle='#f4f4ee';ctx.fillRect(0,0,64,64);ctx.fillStyle='#2e9b46';ctx.beginPath();ctx.moveTo(32,32);ctx.arc(32,32,30,-2.4,-.7);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(32,32);ctx.lineTo(46,14);ctx.stroke();})}),[-.02,.215,.0],extinguisher);gaugeDial.rotation.y=-Math.PI/2;
 box([0,.25,-.012],[.012,.02,.06],m.plastic,extinguisher);
 box([.45,.316,.48],[.11,.012,.3],m.aluminium);
 for(const y of [-.1,.09]){mesh(new THREE.CylinderGeometry(.071,.071,.024,32,1,true),m.aluminium,[0,y,0],extinguisher);box([.071,y,0],[.012,.024,.05],m.aluminium,extinguisher);}
 // Functional rear-view mirror: the texture is filled by the game renderer.
 const mirrorTarget=new THREE.WebGLRenderTarget(768,192);
 const mirror=panel([.34,1.337,.035]);box([0,0,0],[.58,.093,.023],m.plastic,mirror);
 const mirrorGeo=new THREE.PlaneGeometry(.555,.077);const uv=mirrorGeo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,1-uv.getX(i));
 mesh(mirrorGeo,new THREE.MeshBasicMaterial({map:mirrorTarget.texture,toneMapped:false}),[0,0,.014],mirror);
 const rearCamera=new THREE.PerspectiveCamera(48,4,.1,2200);
 // The fixed shell, cage, nets, rivets and seat become one mesh per material:
 // a fraction of the draw calls, in both the colour and the shadow passes.
 function mergeStatic(parent){
  const byMaterial=new Map();
  for(const o of [...parent.children]){
   if(!o.isMesh)continue;
   o.updateMatrix();const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix);
   if(!byMaterial.has(o.material))byMaterial.set(o.material,[]);byMaterial.get(o.material).push(g);parent.remove(o);o.geometry.dispose();
  }
  for(const [material,list] of byMaterial){mesh(mergeGeometries(list),material,[0,0,0],parent);for(const g of list)g.dispose();}
 }
 mergeStatic(root);mergeStatic(seat);
 let lastSpeed=-1;
 function drawDisplay(speed){
  dc.fillStyle='#160504';dc.fillRect(0,0,256,128);
  drawSegments(dc,String(speed).padStart(3,'0'),40,16,82,'#ff3a2c','rgba(255,58,44,.09)');
  dc.fillStyle='#ff5a48';dc.font='700 17px Arial';dc.textAlign='right';dc.fillText('KM/H',246,120);
  displayTexture.needsUpdate=true;
 }
 function update(car,dt,powertrain){
  const speed=Math.hypot(car.vx,car.vy)*3.6,gear=Math.min(5,1+Math.floor(speed/42));
  const rpm=powertrain?.rpm??(speed<2?1100:Math.min(7800,1800+(speed%42)/42*5700));
  wheelTurn.rotation.z=steeringWheelAngle(car.steerVisual??car.steer);
  if(m.envMap&&Number.isFinite(car.heading))for(const material of reflective)material.envMapRotation.y=car.heading;
  tach.rotation.z=needleAngle(rpm/1000,TACH);
  oil.rotation.z=needleAngle(3.8+rpm/8000*1.2,OIL);
  water.rotation.z=needleAngle(86,WATER);
  shiftLight.material.emissiveIntensity=rpm>6700?3:0;
  if(Math.round(speed)!==lastSpeed){lastSpeed=Math.round(speed);drawDisplay(Math.min(999,lastSpeed));}
  const phoneArrived=phone.update(root.visible?dt:0);
  return {speed,rpm,gear,steering:wheelTurn.rotation.z,phoneArrived};
 }
 return {root,wheel,wheelTurn,controls,eye:new THREE.Vector3(-.39,1.08,.015),update,mirrorTarget,rearCamera,resetPhone:()=>phone.reset(),
  info:()=>({reference:'carro/carro_14_interna.JPG',steering:wheelTurn.rotation.z,speed:lastSpeed,mirror:[768,192],visible:root.visible,phone:phone.info(),controls:controls.info(),
   materials:reflective.length,cabinReflections:!!m.envMap,seat:seat.children.length})};
}
