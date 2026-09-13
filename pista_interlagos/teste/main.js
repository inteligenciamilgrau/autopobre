import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,clamp,wrap,recognitionInput} from './physics.js?v=20260913-burnout';
import {createTrackSurface} from './track-surface.js';
import {createCockpit} from './cockpit.js?v=20260913-family';
import {CameraReturn} from './camera-return.js';
import {createDriver} from './driver.js?v=20260913-inward';
import {SkidMarks} from './skid-marks.js?v=20260913-burnout';
import {TyreSmoke} from './tyre-smoke.js';
import {ImmersiveMode} from './immersive-mode.js';
import {MobileControls} from './mobile-controls.js';
import {setupSettings} from './settings.js';
import {CarAudio} from './car-audio.js?v=20260913-immersive';
import {PlayerPreferences,CAMERA_MODES} from './player-preferences.js';
const $=id=>document.getElementById(id);
const touchDevice=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;let mobile;
const preferences=new PlayerPreferences();
$('immersiveMode').checked=preferences.values.immersive;
$('livery').value=preferences.values.livery;
$('camera').value=preferences.values.camera;
$('tour').disabled=preferences.values.immersive;
function chooseImmersive(value){
 $('immersiveMode').checked=value;$('tour').disabled=value;
 preferences.update({immersive:value});if(ready)updateMenuLabels();
}
$('immersiveMode').onchange=()=>chooseImmersive($('immersiveMode').checked);
const scene=new THREE.Scene();scene.background=new THREE.Color('#a8c8dd');scene.fog=new THREE.Fog('#a8c8dd',700,2100);
const renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:!touchDevice});renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.5));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,6500);
const orbit=new OrbitControls(camera,$('view'));
orbit.enabled=false;orbit.enablePan=false;orbit.minDistance=3.2;orbit.maxDistance=45;
orbit.minPolarAngle=.015;orbit.maxPolarAngle=Math.PI/2;
orbit.rotateSpeed=.8;orbit.zoomSpeed=.8;
const orbitTarget=new THREE.Vector3(),orbitDelta=new THREE.Vector3();
const hoodEye=new THREE.Vector3(1.1,1.25,0),followOffset=new THREE.Vector3();let followInitialized=false;
const cameraObstacles=[],cameraRay=new THREE.Raycaster(),cameraRayDirection=new THREE.Vector3();
const obstacleMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const cameraModes=CAMERA_MODES;
const cameraReturn=new CameraReturn(),orbitSphere=new THREE.Spherical();
const headLook={yaw:0,pitch:0};
let pointerLocked=false,lockPending=false,lockUnavailable=!$('view').requestPointerLock;
const isInside=()=>mode==='cockpit'||mode==='hood';
scene.add(new THREE.HemisphereLight('#d9edff','#60643c',2.4));
const sun=new THREE.DirectionalLight('#fff2d5',3);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?1024:2048,touchDevice?1024:2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:250});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;scene.add(sun,sun.target);
const loader=new GLTFLoader(),carRoot=new THREE.Group();scene.add(carRoot);
const cockpit=createCockpit();carRoot.add(cockpit.root);if(touchDevice)cockpit.mirrorTarget.setSize(384,96);
const skidMarks=new SkidMarks(16384);scene.add(skidMarks.mesh);
const tyreSmoke=new TyreSmoke();scene.add(tyreSmoke.mesh);
const carAudio=new CarAudio();
function audioControls(){ for(const key of ['musicVolume','effectsVolume']){$(key).value=Math.round(carAudio[key]*100);$(key+'Value').textContent=`${Math.round(carAudio[key]*100)}%`;} $('volume').value=Math.round(carAudio.volume*100);$('volumeValue').textContent=`${Math.round(carAudio.volume*100)}%`;$('mute').textContent=carAudio.muted?'Ativar som (M)':'Silenciar (M)';$('mute').setAttribute('aria-pressed',String(carAudio.muted)); }
audioControls();
for(const key of ['musicVolume','effectsVolume'])$(key).oninput=e=>{carAudio[key==='musicVolume'?'setMusicVolume':'setEffectsVolume'](Number(e.target.value)/100);carAudio.unlock();if(key==='effectsVolume')carAudio.previewEffects();audioControls();};
document.addEventListener('pointerdown',()=>carAudio.unlock(),{once:true});
document.addEventListener('keydown',()=>carAudio.unlock(),{once:true});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('button').disabled)carAudio.uiClick();});
$('volume').oninput=e=>{carAudio.setVolume(Number(e.target.value)/100);audioControls();};
$('mute').onclick=()=>{carAudio.toggleMute();carAudio.unlock();audioControls();};
let sessionStarted=false;
let immersive,car,data,roadSurface,driver,wheels=[],model,carStructure,paused=true,automatic=false,mode='chase',ready=false,loadToken=0,activeLivery='';
const gridPreview=()=>immersive?.active&&['prepare','starting','grid'].includes(immersive.state.phase);
let wasGridPreview=false,previewOrbit=false,previewPhase='';
const keys=new Set(),clock=new THREE.Clock(),matrix=new THREE.Matrix4(),forward=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),desired=new THREE.Vector3(),look=new THREE.Vector3();
const wheelForward=new THREE.Vector3(),wheelUp=new THREE.Vector3(0,1,0),wheelAxle=new THREE.Vector3(),wheelMatrix=new THREE.Matrix4(),wheelTurn=new THREE.Quaternion(),wheelSpin=new THREE.Quaternion(),axleAxis=new THREE.Vector3(0,0,1);
function status(text){$('status').textContent=text;$('status').classList.toggle('hidden',!text);}
function flattenStatic(root){
 root.updateMatrixWorld(true);const batches=new Map();
 root.traverse(ob=>{if(!ob.isMesh)return;
  if(Array.isArray(ob.material)){ob.receiveShadow=true;return;}
  let g=ob.geometry.clone().applyMatrix4(ob.matrixWorld);
  if(ob.material.name==='Asfalto'){ob.material=roadSurface.material;g=roadSurface.geometry(g);}
  const key=ob.material.uuid;
  // Proxies so para consulta: os meshes visiveis seguem agrupados por material.
  if(/^(Portico_|Box_|Arquibancada|Muro)/.test(ob.name)){
   const proxy=new THREE.Mesh(g.clone(),obstacleMaterial);proxy.name=ob.name;cameraObstacles.push(proxy);
  }
  // Todos os meshes de um lote precisam dos mesmos atributos.
  g.deleteAttribute('tangent');if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!batches.has(key))batches.set(key,{mat:ob.material,gs:[],obs:[]});const b=batches.get(key);b.gs.push(g);b.obs.push(ob);
 });
 for(const b of batches.values()){
  const g=mergeGeometries(b.gs,false);if(!g)continue;const m=new THREE.Mesh(g,b.mat);m.castShadow=true;m.receiveShadow=true;scene.add(m);b.obs.forEach(o=>o.removeFromParent());b.gs.forEach(g=>g.dispose());
 }
 scene.add(root);
}
async function setLivery(value){
 if(!['assinaturas_omp','seiva_danilo'].includes(value))throw new Error('Pintura inválida');
 const token=++loadToken;status('Carregando Opala 99…');
 $('skinButton').disabled=true;$('skinButton').textContent='Carregando pintura…';$('livery').disabled=true;
 try{
 const gltf=await loader.loadAsync(`./assets/opala99_${value}.glb?v=04-fechamentos`);
 if(token!==loadToken)return;
 if(model)carRoot.remove(model);model=gltf.scene;wheels=[];
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
  for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='Policarbonato_fume'){m.transparent=true;m.opacity=.19;m.depthWrite=false;o.castShadow=false;}
 }if(o.name.startsWith('Roda_')&&o.name.includes('PIVO')){wheels.push({obj:o,front:o.name.includes('Dianteira'),base:o.quaternion.clone()});}});
 // These solid Blender panels close the cabin in every view. The detailed
 // cockpit hides the outer model, so retain its floor/bulkheads independently.
 if(carStructure)carRoot.remove(carStructure);
 carStructure=new THREE.Group();carStructure.name='Estrutura_cabine_V04';
 model.updateMatrixWorld(true);const structuralParts=[];
 model.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Chapa_fechamento_V04'))structuralParts.push(o);});
 for(const part of structuralParts){const local=part.matrixWorld.clone();carStructure.add(part);local.decompose(part.position,part.quaternion,part.scale);}
 carRoot.add(model,carStructure);model.visible=mode!=='cockpit';activeLivery=value;status('');
 preferences.update({livery:value});if(ready)carAudio.effect('paint');
 }finally{
  if(token===loadToken){
   $('skinButton').disabled=!ready;$('livery').disabled=false;
   if(activeLivery)$('livery').value=activeLivery;
   $('skinButton').textContent=`Pintura: ${activeLivery==='seiva_danilo'?'Seiva':'OMP'} (V)`;
   $('skinButton').title=`Trocar para ${activeLivery==='seiva_danilo'?'Assinaturas · OMP':'Seiva · Danilo Veículos'} (V)`;
  }
 }
}
async function cycleLivery(){
 if(!ready||$('skinButton').disabled)return;
 try{await setLivery(activeLivery==='assinaturas_omp'?'seiva_danilo':'assinaturas_omp');}
 catch(err){status('Não foi possível trocar a pintura. Tente novamente.');console.error(err);}
}
function reset(nearest=false){mobile?.setHandbrake(false);car.reset(nearest?car.index:0);if(immersive&&!immersive.active)immersive.resetField();driver?.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();automatic=false;followInitialized=false;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;updateCar(1);updateCamera(1);}
const names=[[0,'Reta dos boxes'],[280,'S do Senna · T1–T2'],[490,'Curva do Sol · T3'],[700,'Reta Oposta'],[1500,'Descida do Lago · T4–T5'],[1810,'Subida para a Ferradura'],[1990,'Ferradura · T6–T7'],[2230,'Laranjinha · T8'],[2430,'Pinheirinho · T9'],[2660,'Bico de Pato · T10'],[2840,'Mergulho · T11'],[3120,'Junção · T12'],[3250,'Subida dos boxes · T13'],[3570,'Café · T14'],[3960,'T15 · Reta dos boxes']];
function location(s){let name=names[0][1];for(const [d,n] of names)if(s>=d)name=n;return name;}
const fmt=t=>{if(t===null)return '—';const m=Math.floor(t/60),s=t%60;return `${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;};
function drawMap(){
 const ctx=$('map').getContext('2d'),w=260,h=300;ctx.clearRect(0,0,w,h);
 const xy=p=>[130+p[1]*.23,156-p[2]*.23];
 ctx.beginPath();data.samples.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.lineWidth=8;ctx.strokeStyle='#ffffff16';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#b6c5b5';ctx.stroke();
 if(immersive&&(!immersive.active||['prepare','starting','grid','race'].includes(immersive.state.phase))){for(const [i,r] of immersive.rivals.entries()){const x=130+r.car.x*.23,y=156-r.car.y*.23;ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle=['#d87558','#7e9fff','#f0cf68','#82c8a9','#e0e5e6'][i];ctx.fill();ctx.strokeStyle='#0c1c17';ctx.lineWidth=1.2;ctx.stroke();}}
 const [sx,sy]=xy(data.samples[0]);ctx.fillStyle='#ffffff';ctx.fillRect(sx-3,sy-3,6,6);
 const x=130+car.x*.23,y=156-car.y*.23;ctx.save();ctx.translate(x,y);ctx.rotate(-car.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-3,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#e2fb57';ctx.shadowBlur=10;ctx.shadowColor='#d6fa4b';ctx.fill();ctx.restore();
}
function updateCar(dt){
 cockpit.root.visible=mode==='cockpit'&&!gridPreview();if(model)model.visible=!cockpit.root.visible;
 const p=car.surface,c=Math.cos(car.heading),s=Math.sin(car.heading);
 carRoot.position.set(car.x,p.z,-car.y);
 forward.set(c,p.gx*c+p.gy*s,-s).normalize();up.set(-p.gx,1,p.gy).normalize();right.crossVectors(forward,up).normalize();up.crossVectors(right,forward).normalize();
 matrix.makeBasis(forward,up,right);const q=new THREE.Quaternion().setFromRotationMatrix(matrix);carRoot.quaternion.slerp(q,dt>=1?1:1-Math.exp(-dt*15));
 // Cameras and bodywork must use the same rendered orientation.
 forward.set(1,0,0).applyQuaternion(carRoot.quaternion);up.set(0,1,0).applyQuaternion(carRoot.quaternion);right.set(0,0,1).applyQuaternion(carRoot.quaternion);
 for(const w of wheels){
  // Fisica: angulo positivo aponta para a esquerda. No GLB: frente +X,
  // cima +Y e esquerda -Z. Construir o eixo de rodagem evita inverter
  // esquerda/direita ao converter os eixos Blender -> glTF.
  const angle=w.front?car.steer:0;
  wheelForward.set(Math.cos(angle),0,-Math.sin(angle));
  wheelAxle.crossVectors(wheelForward,wheelUp);
  wheelTurn.setFromRotationMatrix(wheelMatrix.makeBasis(wheelForward,wheelUp,wheelAxle));
  wheelSpin.setFromAxisAngle(axleAxis,-(w.front?car.spin:car.rearSpin));
  w.obj.quaternion.copy(wheelTurn).multiply(w.base).multiply(wheelSpin);
 }
}
function setCameraMode(value){
 if(!cameraModes.includes(value))return;
 const previous=mode;mode=value;followInitialized=false;orbit.enabled=value==='orbit';$('camera').value=value;
 preferences.update({camera:value});
 orbit.enableRotate=!pointerLocked;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;
 cockpit.root.visible=value==='cockpit';if(model)model.visible=value!=='cockpit';
 document.body.classList.toggle('cockpit-mode',value==='cockpit');
 $('cockpitButton').classList.toggle('active',value==='cockpit');$('cockpitButton').setAttribute('aria-pressed',String(value==='cockpit'));
 camera.fov=value==='cockpit'?74:58;camera.near=value==='cockpit'?.025:.1;camera.updateProjectionMatrix();
 if(value!=='cockpit')camera.up.set(0,1,0);
 $('orbitButton').classList.toggle('active',orbit.enabled);
 $('orbitButton').setAttribute('aria-pressed',String(orbit.enabled));
 cameraHint();
 if(orbit.enabled&&ready&&previous!=='orbit'){
  orbit.target.copy(carRoot.position).add(new THREE.Vector3(0,.85,0));
  // Capo e aerea comecam a orbita numa distancia que enquadra o carro.
  if(previous!=='chase')camera.position.copy(orbit.target).addScaledVector(forward,-7).add(new THREE.Vector3(0,2.8,0));
  orbit.update();
 }
}
function cameraHint(){
 $('cameraHint').textContent=pointerLocked?'Mouse capturado · mova para olhar · Esc libera · retorno após 3 s em movimento':lockUnavailable?'Arraste para girar · retorno após 3 s em movimento':'Clique na pista para capturar o mouse · Esc libera';
}
function lockFailed(){lockPending=false;orbit.enableRotate=true;cameraHint();status('Mouse livre. Clique novamente na pista para tentar capturar.');}
// Ignore the entire touch gesture when it starts near driving controls,
// before either the camera-mode handler or OrbitControls receives it.
const blockedCameraTouches=new Set();
for(const type of ['pointerdown','pointermove','pointerup','pointercancel']){
 $('view').addEventListener(type,e=>{
  if(e.pointerType!=='touch')return;
  if(type==='pointerdown'&&mobile?.blocksCameraGesture(e))blockedCameraTouches.add(e.pointerId);
  if(!blockedCameraTouches.has(e.pointerId))return;
  if(type==='pointerup'||type==='pointercancel')blockedCameraTouches.delete(e.pointerId);
  e.preventDefault();e.stopImmediatePropagation();
 },{capture:true,passive:false});
}
window.addEventListener('blur',()=>blockedCameraTouches.clear());
// Native lock is requested only from a deliberate click on the playing surface.
$('view').addEventListener('pointerdown',e=>{
 if(!ready||paused||e.button!==0||immersive?.active&&!immersive.allowsPointer())return;
 cameraReturn.manual(performance.now());
 const preparing=immersive?.active&&immersive.state.phase==='prepare';if(preparing){previewOrbit=true;setCameraMode('orbit');orbit.target.copy(carRoot.position).add(new THREE.Vector3(0,.85,0));orbit.update();}
 if(!preparing&&e.pointerType==='mouse'&&!lockUnavailable&&$('view').requestPointerLock){
  e.stopImmediatePropagation();
  if(pointerLocked||lockPending)return;
  lockPending=true;
  try{const request=$('view').requestPointerLock();request?.catch(lockFailed);}catch{lockFailed();}
 }else{if(mode!=='orbit')setCameraMode('orbit');$('view').classList.add('dragging');}
},{capture:true});
document.addEventListener('pointerlockchange',()=>{
 const wasLocked=pointerLocked;pointerLocked=document.pointerLockElement===$('view');lockPending=false;
 if(pointerLocked&&paused){document.exitPointerLock();return;}
 orbit.enableRotate=!pointerLocked;document.body.classList.toggle('pointer-locked',pointerLocked);$('view').classList.remove('dragging');
 cameraReturn.manual(performance.now());cameraHint();
 if(pointerLocked)status('');
 if(wasLocked&&!pointerLocked&&!immersive?.blockingUI())menu(true);
});
document.addEventListener('pointerlockerror',lockFailed);
document.addEventListener('mousemove',e=>{
 if(!pointerLocked||paused||(!e.movementX&&!e.movementY))return;
 if(isInside()){
  headLook.yaw=clamp(headLook.yaw+e.movementX*.0025,-1.45,1.45);
  headLook.pitch=clamp(headLook.pitch-e.movementY*.0025,-.60,.45);
 }else{
  if(mode!=='orbit')setCameraMode('orbit');
  orbit.rotateLeft(e.movementX*.0025);orbit.rotateUp(e.movementY*.0025);
 }
 cameraReturn.manual(performance.now());
});
$('view').addEventListener('pointermove',e=>{if(!pointerLocked&&e.buttons)cameraReturn.manual(performance.now());});
window.addEventListener('pointerup',()=>$('view').classList.remove('dragging'));
$('view').addEventListener('pointercancel',()=>$('view').classList.remove('dragging'));
$('view').addEventListener('wheel',e=>{if(ready&&!paused){if(immersive?.active&&immersive.state.phase==='prepare')previewOrbit=true;if(pointerLocked&&isInside()){e.stopImmediatePropagation();return;}if(mode!=='orbit')setCameraMode('orbit');cameraReturn.manual(performance.now());}},{capture:true,passive:true});
function updateCamera(dt){
 const phase=immersive?.active?immersive.state.phase:'free';if(phase!==previewPhase){previewPhase=phase;previewOrbit=false;}
 if(immersive?.active&&['crowd','podium'].includes(immersive.state.phase)){const p=immersive.visual.hero.getWorldPosition(new THREE.Vector3());sun.position.copy(p).add(new THREE.Vector3(-45,90,30));sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 const p=carRoot.position,vel=Math.hypot(car.vx,car.vy);
 if(gridPreview()&&!(phase==='prepare'&&previewOrbit)){wasGridPreview=true;camera.fov=58;camera.updateProjectionMatrix();camera.position.copy(p).addScaledVector(forward,-8.5).add(new THREE.Vector3(0,3.5,0));camera.up.set(0,1,0);camera.lookAt(p.clone().addScaledVector(forward,16).add(new THREE.Vector3(0,1,0)));sun.position.copy(p).add(new THREE.Vector3(-45,90,30));sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 if(wasGridPreview){wasGridPreview=false;followInitialized=false;camera.fov=mode==='cockpit'?74:58;camera.updateProjectionMatrix();}
 const centering=cameraReturn.update(performance.now(),vel,paused),blend=1-Math.exp(-dt*2.8);
 if(centering&&isInside()){headLook.yaw*=1-blend;headLook.pitch*=1-blend;}
 if(mode==='cockpit'||mode==='hood'){
  // Fixed local mount keeps the hood/dashboard still relative to the camera.
  const eye=mode==='hood'?hoodEye:cockpit.eye;
  carRoot.updateMatrixWorld(true);camera.position.copy(eye).applyMatrix4(carRoot.matrixWorld);
  look.set(Math.cos(headLook.pitch)*Math.cos(headLook.yaw)*20,Math.sin(headLook.pitch)*20-.20,Math.cos(headLook.pitch)*Math.sin(headLook.yaw)*20).add(eye).applyMatrix4(carRoot.matrixWorld);
  camera.up.set(0,1,0).transformDirection(carRoot.matrixWorld);camera.lookAt(look);
 } else if(mode==='orbit'){
  orbitTarget.copy(p).add(new THREE.Vector3(0,.85,0));
  orbitDelta.subVectors(orbitTarget,orbit.target);camera.position.add(orbitDelta);orbit.target.copy(orbitTarget);orbit.update();
  if(centering){
   orbitSphere.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));
   const behind=Math.atan2(-forward.x,-forward.z);
   orbitSphere.theta+=wrap(behind-orbitSphere.theta)*blend;
   orbitSphere.phi+=(1.25-orbitSphere.phi)*blend;
   camera.position.copy(orbit.target).add(orbitDelta.setFromSpherical(orbitSphere));orbit.update();
  }
  // Evita entrar no solo nas subidas e nas bordas inclinadas da pista.
  const ground=car.sample(camera.position.x,-camera.position.z).z;
  camera.position.y=Math.max(camera.position.y,ground+.3);
  cameraRayDirection.subVectors(camera.position,orbit.target);
  cameraRay.far=cameraRayDirection.length();cameraRay.set(orbit.target,cameraRayDirection.normalize());
  const obstruction=cameraRay.intersectObjects(cameraObstacles,false)[0];
  if(obstruction)camera.position.copy(orbit.target).addScaledVector(cameraRayDirection,Math.max(.2,obstruction.distance-.3));
  camera.lookAt(orbit.target);
 } else {
 if(mode==='aerial'){desired.copy(p).addScaledVector(forward,-40).add(new THREE.Vector3(0,95,35));look.copy(p).addScaledVector(forward,22);}
 else{desired.copy(p).addScaledVector(forward,-9-Math.min(vel*.035,2)).add(new THREE.Vector3(0,3.8,0));look.copy(p).addScaledVector(forward,13).add(new THREE.Vector3(0,1,0));}
 // Smooth the offset, not the world position: frame-rate changes must not
 // make the car surge back and forth relative to its following camera.
 desired.sub(p);if(!followInitialized){followOffset.copy(desired);followInitialized=true;}else followOffset.lerp(desired,1-Math.exp(-dt*5));
 camera.position.copy(p).add(followOffset);camera.up.set(0,1,0);camera.lookAt(look);
 }
 sun.position.copy(p).add(new THREE.Vector3(-45,90,30));sun.target.position.copy(p);sun.target.updateMatrixWorld();
}
const pressed=code=>keys.has(code)||mobile?.pressed.has(code);
function input(){return {ignition:pressed('KeyI')?1:0,throttle:Math.max(pressed('KeyW')||pressed('ArrowUp')?1:0,mobile?.throttle??0),brake:Math.max(pressed('KeyS')||pressed('ArrowDown')?1:0,mobile?.brake??0),left:Math.max(pressed('KeyA')||pressed('ArrowLeft')?1:0,-(mobile?.steering??0)),right:Math.max(pressed('KeyD')||pressed('ArrowRight')?1:0,mobile?.steering??0),reverse:pressed('KeyQ')?1:0,handbrake:pressed('Space')?1:0};}
function pilot(){
 return recognitionInput(car);
}
function hud(){
 const fuel=immersive?.active?immersive.state.fuel:immersive?.freeFuel??12,staged=immersive?.active&&['crowd','podium'].includes(immersive.state.phase);$('fuelGauge').classList.toggle('hidden',!!staged);$('fuelGauge').classList.toggle('reserve',fuel<1);$('fuelVolume').textContent=fuel.toFixed(1)+' L';$('fuelBar').value=fuel;$('fuelStatus').textContent=fuel<=0?(immersive?.active?'TANQUE VAZIO':'VAZIO · R PARA REABASTECER'):fuel<1?'RESERVA':immersive?.active&&immersive.state.tankDetached?'VAZAMENTO':'COMBUSTÍVEL';const p=car.surface,speed=Math.hypot(car.vx,car.vy)*3.6;
 $('speed').textContent=Math.round(speed);$('gear').textContent=carAudio.state.gear;$('rev').style.width=`${carAudio.state.rpm/7400*100}%`;
 $('grade').textContent=`${(p.grade*100).toFixed(1).replace('.',',')}%`;$('bank').textContent=`${(p.bank*100).toFixed(1).replace('.',',')}%`;$('alt').textContent=`${(p.z+720).toFixed(1)} m`;
 $('lap').textContent=`${Math.min(car.laps+1,immersive.active?1:immersive.freeTotalLaps)} / ${immersive.active?1:immersive.freeTotalLaps}`;$('racePosition').textContent=`${immersive.active?immersive.state.result?.position??immersive.state.position:immersive.freePosition}º / 6`;$('timer').textContent=fmt(car.clock-car.lapStart);$('best').textContent=fmt(car.best);$('valid').textContent=car.lapValid?'Volta válida':'Volta inválida · trecho cortado';$('valid').hidden=car.lapValid;$('valid').style.color=car.lapValid?'#e2fb57':'#ffb789';
 $('surface').textContent=automatic?'RECONHECIMENTO AUTOMÁTICO':p.onRoad?'ASFALTO · SESSÃO LIVRE':'FORA DA PISTA · ADERÊNCIA REDUZIDA';$('location').textContent=location(p.s);drawMap();
}
let accumulator=0,lastHud=0,renderedFrame=0,mirrorFrame=0;
function frame(){requestAnimationFrame(frame);const rawDt=clock.getDelta(),dt=Math.min(rawDt,.08);if(!ready)return;
 renderedFrame++;mobile?.update(paused,immersive?.active?immersive.state.phase:'race');
 if(!paused){accumulator+=dt;while(accumulator>=1/120){const command=automatic?pilot():input();if(immersive&&!immersive.active&&immersive.freeFuel<=0){command.throttle=0;command.reverse=0;}if(!immersive?.step(command,1/120)){const before=Math.hypot(car.vx,car.vy);car.step(command,1/120);const impact=before-Math.hypot(car.vx,car.vy);if(impact>4){carAudio.effect('collision');immersive?.wallImpact(impact);}immersive?.stepFree(1/120,command);}skidMarks.update(car,command,1/120);accumulator-=1/120;if(!immersive.active&&immersive.freeFinished){menu(true);break;}}}
 skidMarks.flush();
 tyreSmoke.update(car,skidMarks.wheels,paused?0:dt,renderer.domElement.height);
 const skid=skidMarks.wheels.reduce((sum,w)=>sum+w.strength,0)/4;
 carAudio.update(car,immersive?.audioCommand(automatic?pilot():input())??input(),skid,paused,mode);
 carAudio.updateScene({...immersive?.audioScene(),speed:Math.hypot(car.vx,car.vy),onRoad:car.surface.onRoad,camera:mode},immersive?.state.takeSounds()??[],dt);
 updateCar(dt);updateCamera(dt);if(cockpit.update(car,paused?0:dt,carAudio.state).phoneArrived)carAudio.notifyPhone();driver.update(car,paused?0:dt);lastHud+=dt;if(lastHud>.07){hud();lastHud=0;}
 immersive?.update(paused?0:dt,camera);
 // Render the reflection from this frame's car pose before displaying the cockpit.
 // A simulation-time timer made the mirror visibly stutter, especially at low FPS.
 if(mode==='cockpit'&&!gridPreview()){
  cockpit.root.visible=false;driver.root.visible=false;carStructure.visible=false;
  cockpit.rearCamera.position.set(-.65,1.14,0).applyMatrix4(carRoot.matrixWorld);
  look.set(-30,1.14,0).applyMatrix4(carRoot.matrixWorld);
  cockpit.rearCamera.up.set(0,1,0).transformDirection(carRoot.matrixWorld);cockpit.rearCamera.lookAt(look);
  const oldShadowUpdate=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  tyreSmoke.material.uniforms.viewport.value=cockpit.mirrorTarget.height;
  renderer.setRenderTarget(cockpit.mirrorTarget);renderer.render(scene,cockpit.rearCamera);renderer.setRenderTarget(null);
  tyreSmoke.material.uniforms.viewport.value=renderer.domElement.height;
  mirrorFrame=renderedFrame;
  renderer.shadowMap.autoUpdate=oldShadowUpdate;cockpit.root.visible=true;driver.root.visible=true;carStructure.visible=true;
 }
 renderer.render(scene,camera);
}
function updateMenuLabels(){const resume=sessionStarted&&(immersive?.active||!immersive?.freeFinished)&&$('immersiveMode').checked===!!immersive?.active;$('start').textContent=resume?'Voltar à pista →':sessionStarted?'Iniciar nova corrida →':'Entrar na pista →';$('restartRace').hidden=!resume;$('settingsResume').hidden=!sessionStarted||(!immersive?.active&&immersive?.freeFinished);$('settingsRestart').hidden=$('settingsResume').hidden;$('raceResult').hidden=immersive?.active||!immersive?.freeFinished;if(!immersive?.active&&immersive?.freeFinished)$('raceResult').textContent=`Bandeirada! ${immersive.freePosition}º de 6 · ${immersive.freeTotalLaps} voltas · ${fmt(car.clock)}`;}
function resumeRace(){if(!sessionStarted||(!immersive.active&&immersive.freeFinished))return;$('settings').close();menu(false);}
$('settingsResume').onclick=resumeRace;
function menu(show){paused=show;updateMenuLabels();carAudio.setPaused(show);if(!show)carAudio.unlock();if(show&&document.pointerLockElement===$('view'))document.exitPointerLock();cameraReturn.reset(performance.now());$('menu').classList.toggle('hidden',!show);keys.clear();mobile?.clear();status(show?'':automatic?'Reconhecimento automático · W para assumir o volante':'');}
const openSettings=setupSettings(()=>menu(true));
$('settingsButton').onclick=openSettings;
mobile=new MobileControls({enabled:touchDevice,onMenu:openSettings,onCamera:()=>{if(ready)setCameraMode(cameraModes[(cameraModes.indexOf(mode)+1)%cameraModes.length]);},onSkin:cycleLivery,onReset:()=>{if(ready){if(!immersive?.handleKey('KeyR'))reset(true);}},onUnlock:()=>carAudio.unlock()});
document.addEventListener('keydown',e=>{
 if($('settings').open){if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}return;}
 if(['INPUT','SELECT'].includes(e.target.tagName)&&!['Escape','KeyP'].includes(e.code))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat||!ready)return;
 if(!paused&&immersive?.handleKey(e.code))return;
 if(e.code==='KeyC')setCameraMode(cameraModes[(cameraModes.indexOf(mode)+1)%cameraModes.length]);
 if(e.code==='KeyR')reset(true);
 if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}
 if(e.code==='KeyV')cycleLivery();
 if(e.code==='KeyP')menu(!paused);
 if(e.code==='Escape')menu(true);
 if(automatic&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){automatic=false;status('');}
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('focus',()=>carAudio.setFocused(!document.hidden));window.addEventListener('blur',()=>{carAudio.setFocused(false);keys.clear();mobile?.clear();if(ready)menu(true);});
document.addEventListener('visibilitychange',()=>{carAudio.setFocused(!document.hidden&&document.hasFocus());if(document.hidden&&ready)menu(true);});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);mobile?.clear();if(touchDevice&&innerHeight>innerWidth&&ready)menu(true);});
$('orbitButton').onclick=()=>{if(ready)setCameraMode(mode==='orbit'?'chase':'orbit');};
$('cockpitButton').onclick=()=>{if(ready)setCameraMode(mode==='cockpit'?'chase':'cockpit');};
$('skinButton').onclick=cycleLivery;
function beginRace(restart=false){
 const same=sessionStarted&&$('immersiveMode').checked===immersive.active&&!(!immersive.active&&immersive.freeFinished);
 if(same&&!restart){menu(false);return;}
 automatic=false;
 if($('immersiveMode').checked){immersive.start();}
 else{if(immersive.active)immersive.disable();reset();setCameraMode('chase');updateCar(1);updateCamera(1);}
 sessionStarted=true;menu(false);
}
$('start').onclick=()=>beginRace();$('restartRace').onclick=()=>beginRace(true);
$('settingsRestart').onclick=()=>{$('settings').close();beginRace(true);};
$('tour').onclick=()=>{if(!ready||$('immersiveMode').checked)return;if(immersive?.active)immersive.disable();reset();sessionStarted=true;automatic=true;menu(false);};$('menuButton').onclick=openSettings;$('camera').onchange=e=>setCameraMode(e.target.value);$('livery').onchange=async e=>{try{await setLivery(e.target.value);}catch(err){status('Falha ao carregar a pintura. Abra o teste pelo INICIAR_TESTE.cmd.');console.error(err);}};
try{
 data=await (await fetch('../dados/pista.json')).json();car=new TestCar(data);
 roadSurface=await createTrackSurface(renderer,data);
 driver=await createDriver(cockpit.wheel,cockpit.wheelTurn);carRoot.add(driver.root);
 const track=await loader.loadAsync('../exports/interlagos_pista.glb');flattenStatic(track.scene);await setLivery($('livery').value);
 immersive=new ImmersiveMode({scene,carRoot,car,data,driver,rivalTemplate:model,skidMarks,resetVehicle:()=>reset(),releaseMouse:()=>{keys.clear();mobile?.clear();if(document.pointerLockElement)document.exitPointerLock();},onNormal:()=>{chooseImmersive(false);reset();menu(true);}});
 ready=true;setCameraMode(preferences.values.camera);$('skinButton').disabled=false;updateCar(1);cockpit.update(car,0);driver.update(car,0);updateCamera(1);cameraHint();hud();$('start').disabled=false;$('start').textContent='Entrar na pista →';
 window.interlagos={ready:true,car,telemetry:()=>car.telemetry(),setLivery,reset:()=>reset(),reposition:index=>{car.reset(index);driver.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();updateCar(1);updateCamera(1);},setTour:value=>{if(immersive.active)return;automatic=value;menu(false);},
  immersiveInfo:()=>immersive.info(),
  audioInfo:()=>carAudio.info(),mobileInfo:()=>({enabled:touchDevice,steering:mobile?.steering??0,throttle:mobile?.throttle??0,brake:mobile?.brake??0,pressed:[...(mobile?.pressed??[])],pixelRatio:renderer.getPixelRatio()}),
  skidInfo:()=>skidMarks.info(),smokeInfo:()=>tyreSmoke.info(),
  structureInfo:()=>({revision:'v04_fechamentos',parts:carStructure.children.length,visible:carStructure.visible}),
  driverInfo:()=>driver.info(),
  surfaceInfo:()=>({...roadSurface.stats,material:roadSurface.material.name,drawCalls:renderer.info.render.calls}),
  cockpitInfo:()=>({...cockpit.info(),eyeLocal:carRoot.worldToLocal(camera.position.clone()).toArray(),fov:camera.fov,externalVisible:model.visible,
   renderedFrame,mirrorFrame,mirrorEyeLocal:carRoot.worldToLocal(cockpit.rearCamera.position.clone()).toArray()}),
  viewControls:()=>({pointerLocked,lockPending,lockUnavailable,yaw:headLook.yaw,pitch:headLook.pitch,centering:cameraReturn.active,movingSince:cameraReturn.movingSince,lastInput:cameraReturn.lastInput,delayMs:cameraReturn.delayMs}),
  cameraSnapshot:()=>({position:camera.position.toArray(),target:orbit.target.toArray(),car:carRoot.position.toArray(),distance:camera.position.distanceTo(orbit.target),ground:car.sample(camera.position.x,-camera.position.z).z}),
  wheelSnapshot:()=>{carRoot.updateMatrixWorld(true);const inverse=carRoot.getWorldQuaternion(new THREE.Quaternion()).invert();return wheels.map(w=>{const axle=new THREE.Vector3(0,0,1).applyQuaternion(w.obj.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(inverse);return {name:w.obj.name,front:w.front,angle:Math.atan2(axle.x,axle.z),axle:axle.toArray()};});},
  get state(){return {paused,automatic,mode,livery:activeLivery,wheels:wheels.length,drawCalls:renderer.info.render.calls};}};
 frame();
}catch(err){console.error(err);status('Não foi possível carregar. Inicie pelo arquivo INICIAR_TESTE.cmd.');$('start').textContent='Falha ao carregar';}
