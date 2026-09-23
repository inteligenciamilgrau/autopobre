import {PitStop} from './pitstop.js';
import {pitLane} from './pit-lane.js';
import {createInterlagosPit} from './interlagos-pit.js';
import {CIRCUITS,selectedCircuit,mapProjection} from './circuits.js';
import {createCurveloData} from './curvelo-data.js';
import {createCurveloScene} from './curvelo-scene.js';
import {RaceResults} from './race-results.js';
import {LapRecords,AutomaticRecords} from './lap-records.js';
import {AutomaticAIRecords} from './ai-records.js';
import {PilotPicker,pilotStorage} from './pilot-profile.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,clamp,wrap,recognitionInput,RIGHTING_DELAY} from './physics.js?v=20260923-capotagem';
import {GRID_SIZE,RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
import {createTrackSurface,createGuardrails,createCurbs,createTrackBranding} from './track-surface.js';
import {createCockpit} from './cockpit.js?v=20260923-controls';
import {CameraReturn} from './camera-return.js';
import {createDriver} from './driver.js?v=20260923-controls';
import {SkidMarks} from './skid-marks.js?v=20260923-capotagem';
import {TyreSmoke} from './tyre-smoke.js?v=20260923-capotagem';
import {ImmersiveMode} from './immersive-mode.js';
import {MobileControls} from './mobile-controls.js';
import {setupSettings} from './settings.js';
import {CarAudio} from './car-audio.js?v=20260913-immersive';
import {PlayerPreferences,CAMERA_MODES} from './player-preferences.js';
import {createSky,SUN_DIRECTION} from './sky.js';
import {createLandscape,loadTerrainTextures,buildTrackField,readOrtho,terrainMaterial,structureMaterial,createCrowd} from './landscape.js';
const $=id=>document.getElementById(id);
const touchDevice=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;let mobile;
const preferences=new PlayerPreferences();
let circuit=selectedCircuit(preferences.values.circuit,window.location.search);
preferences.update({circuit:circuit.id});
function showCircuitSelection(){
 document.title=`${circuit.name} · Auto-Pobre Racing`;
 document.querySelector('.wordmark').firstChild.textContent=circuit.name.toUpperCase();
 document.querySelector('.session>span').textContent=circuit.length.toLocaleString('pt-BR')+' m';
 document.querySelector('.maplabel').firstChild.textContent=circuit.label;
 $('circuitDescription').textContent=circuit.description;
 $('circuitSource').textContent=circuit.source+' Reconstrução para jogo; física e instalações simplificadas.';
 document.querySelector('#menu article>p').textContent=circuit.intro;
 for(const button of document.querySelectorAll('[data-circuit]'))button.setAttribute('aria-pressed',String(button.dataset.circuit===circuit.id));
}
showCircuitSelection();
for(const button of document.querySelectorAll('[data-circuit]'))button.onclick=()=>{
 if(sessionStarted||loading||!Object.hasOwn(CIRCUITS,button.dataset.circuit))return;
 circuit=CIRCUITS[button.dataset.circuit];preferences.update({circuit:circuit.id});lapRecords.circuit=circuit.id;
 const url=new URL(window.location.href);url.searchParams.set('circuito',circuit.id);history.replaceState(null,'',url.href);
 showCircuitSelection();updateMenuLabels();
};
let projectMap;
$('immersiveMode').checked=preferences.values.immersive;
$('livery').value=preferences.values.livery;
$('camera').value=preferences.values.camera;
$('carDamage').checked=preferences.values.damage;
$('carDamage').onchange=()=>{preferences.update({damage:$('carDamage').checked});pitstop?.setDamage(preferences.values.damage);};
$('tour').disabled=preferences.values.immersive;
function chooseImmersive(value){
 $('immersiveMode').checked=value;$('tour').disabled=value;
 preferences.update({immersive:value});if(ready)updateMenuLabels();
}
$('immersiveMode').onchange=()=>chooseImmersive($('immersiveMode').checked);
const scene=new THREE.Scene();scene.background=new THREE.Color('#a8c8dd');
let sky,landscape,landscapeField,terrainTextures;
let renderer;
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
// Sky light comes mostly from the environment map; the hemisphere only lifts deep shadows.
scene.add(new THREE.HemisphereLight('#cfe2ff','#4a5236',.75));
const sun=new THREE.DirectionalLight('#fff1dc',3.4);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?1024:2048,touchDevice?1024:2048);Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:300});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;sun.shadow.radius=2;scene.add(sun,sun.target);
const sunOffset=SUN_DIRECTION.clone().multiplyScalar(140);
const loader=new GLTFLoader(),carRoot=new THREE.Group();scene.add(carRoot);
// Sprung mass: body, cabin, cockpit and driver roll and pitch on the suspension;
// the wheels are counter-rotated so they stay planted on the ground.
const carBody=new THREE.Group();carBody.name='Carroceria_suspensao';carRoot.add(carBody);
const suspension={roll:0,rollRate:0,pitch:0,pitchRate:0},bodyPivot=new THREE.Vector3(.3,.38,0),bodyTilt=new THREE.Quaternion(),bodyTiltInverse=new THREE.Quaternion(),bodyEuler=new THREE.Euler(),wheelOffset=new THREE.Vector3();
function springTo(key,target,dt,frequency,damping){const rate=key+'Rate';suspension[rate]+=((target-suspension[key])*frequency*frequency-2*damping*frequency*suspension[rate])*dt;suspension[key]+=suspension[rate]*dt;}
let cockpit,skidMarks,tyreSmoke;
function initializeRenderer(){
 if(renderer)return;
 renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:!touchDevice});renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.5));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 sky=createSky(renderer,scene,{mobile:touchDevice});
 cockpit=createCockpit(renderer);carBody.add(cockpit.root);if(touchDevice)cockpit.mirrorTarget.setSize(384,96);
 skidMarks=new SkidMarks(16384);scene.add(skidMarks.mesh);
 tyreSmoke=new TyreSmoke();scene.add(tyreSmoke.mesh);
}
const carAudio=new CarAudio();
function audioControls(){ for(const key of ['musicVolume','effectsVolume']){$(key).value=Math.round(carAudio[key]*100);$(key+'Value').textContent=`${Math.round(carAudio[key]*100)}%`;} $('volume').value=Math.round(carAudio.volume*100);$('volumeValue').textContent=`${Math.round(carAudio.volume*100)}%`;$('mute').textContent=carAudio.muted?'Ativar som (M)':'Silenciar (M)';$('mute').setAttribute('aria-pressed',String(carAudio.muted)); }
audioControls();
for(const key of ['musicVolume','effectsVolume'])$(key).oninput=e=>{carAudio[key==='musicVolume'?'setMusicVolume':'setEffectsVolume'](Number(e.target.value)/100);carAudio.unlock();if(key==='effectsVolume')carAudio.previewEffects();audioControls();};
document.addEventListener('pointerdown',()=>carAudio.unlock(),{once:true});
document.addEventListener('keydown',()=>carAudio.unlock(),{once:true});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('button').disabled)carAudio.uiClick();});
$('volume').oninput=e=>{carAudio.setVolume(Number(e.target.value)/100);audioControls();};
$('mute').onclick=()=>{carAudio.toggleMute();carAudio.unlock();audioControls();};
let sessionStarted=false,loading=false,loadedCircuit=null;
let pitstop,immersive,car,data,roadSurface,driver,wheels=[],model,carStructure,paused=true,automatic=false,mode='chase',ready=false,loadToken=0,activeLivery='';
const gridPreview=()=>immersive?.active&&['prepare','starting','grid'].includes(immersive.state.phase);
let wasGridPreview=false,previewOrbit=false,previewPhase='';
const keys=new Set(),clock=new THREE.Clock(),matrix=new THREE.Matrix4(),forward=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),desired=new THREE.Vector3(),look=new THREE.Vector3();
const wheelForward=new THREE.Vector3(),wheelUp=new THREE.Vector3(0,1,0),wheelAxle=new THREE.Vector3(),wheelMatrix=new THREE.Matrix4(),wheelTurn=new THREE.Quaternion(),wheelSpin=new THREE.Quaternion(),axleAxis=new THREE.Vector3(0,0,1);
function status(text){$('status').textContent=text;$('status').classList.toggle('hidden',!text);}
function flattenStatic(root){
 const retired=[];root.traverse(ob=>{if(/^(Muro_protecao|Zebras_)/.test(ob.name))retired.push(ob);});retired.forEach(ob=>ob.removeFromParent());
 root.updateMatrixWorld(true);const batches=new Map(),structures=new Map(),standTops=[];
 root.traverse(ob=>{if(!ob.isMesh||ob.isInstancedMesh)return;
  if(Array.isArray(ob.material)){ob.receiveShadow=true;return;}
  let g=ob.geometry.clone().applyMatrix4(ob.matrixWorld);
  if(ob.material.name==='Asfalto'){ob.material=roadSurface.material;g=roadSurface.geometry(g);}
  else ob.material=structureMaterial(ob.material,terrainTextures,structures);
  // Each grandstand step contributes its top face as a row of seats.
  if(/^Arquibancada/.test(ob.name)){const pos=g.attributes.position;let top=-Infinity;for(let i=0;i<pos.count;i++)top=Math.max(top,pos.getY(i));const corners=new Map();for(let i=0;i<pos.count;i++)if(pos.getY(i)>top-.02)corners.set(pos.getX(i).toFixed(2)+':'+pos.getZ(i).toFixed(2),{x:pos.getX(i),y:pos.getY(i),z:pos.getZ(i)});if(corners.size===4)standTops.push([...corners.values()]);}
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
  const g=mergeGeometries(b.gs,false);if(!g)continue;const m=new THREE.Mesh(g,b.mat);m.castShadow=!b.mat.userData.terrain;m.receiveShadow=true;scene.add(m);b.obs.forEach(o=>o.removeFromParent());b.gs.forEach(g=>g.dispose());
 }
 scene.add(root);
 return standTops;
}
async function setLivery(value){
 if(!['assinaturas_omp','seiva_danilo'].includes(value))throw new Error('Pintura inválida');
 const token=++loadToken;status('Carregando Opala 99…');
 $('skinButton').disabled=true;$('skinButton').textContent='Carregando pintura…';$('livery').disabled=true;
 try{
 const gltf=await loader.loadAsync(`./assets/opala99_${value}.glb?v=04-fechamentos`);
 if(token!==loadToken)return;
 if(model)carBody.remove(model);model=gltf.scene;wheels=[];
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;
  for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='Policarbonato_fume'){m.transparent=true;m.opacity=.19;m.depthWrite=false;o.castShadow=false;}
 }if(o.name.startsWith('Roda_')&&o.name.includes('PIVO')){const front=o.name.includes('Dianteira');wheels.push({obj:o,front,index:(front?0:2)+(o.position.z>0?1:0),base:o.quaternion.clone(),basePosition:o.position.clone()});}});
 // These solid Blender panels close the cabin in every view. The detailed
 // cockpit hides the outer model, so retain its floor/bulkheads independently.
 if(carStructure)carBody.remove(carStructure);
 carStructure=new THREE.Group();carStructure.name='Estrutura_cabine_V04';
 model.updateMatrixWorld(true);const structuralParts=[];
 model.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Chapa_fechamento_V04'))structuralParts.push(o);});
 for(const part of structuralParts){const local=part.matrixWorld.clone();carStructure.add(part);local.decompose(part.position,part.quaternion,part.scale);}
 carBody.add(model,carStructure);model.visible=mode!=='cockpit';activeLivery=value;status('');
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
function reset(nearest=false){mobile?.setHandbrake(false);if(nearest)car.reset(car.index);else car.resetGrid();if(immersive&&!immersive.active)immersive.resetField();driver?.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();automatic=false;followInitialized=false;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;updateCar(1);updateCamera(1);}
const names=[[0,'Reta dos boxes'],[280,'S do Senna · T1–T2'],[490,'Curva do Sol · T3'],[700,'Reta Oposta'],[1500,'Descida do Lago · T4–T5'],[1810,'Subida para a Ferradura'],[1990,'Ferradura · T6–T7'],[2230,'Laranjinha · T8'],[2430,'Pinheirinho · T9'],[2660,'Bico de Pato · T10'],[2840,'Mergulho · T11'],[3120,'Junção · T12'],[3250,'Subida dos boxes · T13'],[3570,'Café · T14'],[3960,'T15 · Reta dos boxes']];
function location(s){const sections=data.meta.sections||names;let name=sections[0][1];for(const [d,n] of sections)if(s>=d)name=n;return name;}
const fmt=t=>{if(t===null)return '—';const m=Math.floor(t/60),s=t%60;return `${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;};
function drawMap(){
 const ctx=$('map').getContext('2d'),w=260,h=300;ctx.clearRect(0,0,w,h);
 const xy=p=>projectMap(p[1],p[2]);
 ctx.beginPath();data.samples.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.lineWidth=8;ctx.strokeStyle='#ffffff16';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#b6c5b5';ctx.stroke();
 if(immersive&&(!immersive.active||['prepare','starting','grid','race'].includes(immersive.state.phase))){for(const [i,r] of immersive.rivals.entries()){const [x,y]=projectMap(r.car.x,r.car.y);ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle='#'+r.entry.color.toString(16).padStart(6,'0');ctx.fill();ctx.strokeStyle='#0c1c17';ctx.lineWidth=1.2;ctx.stroke();}}
 if(pitstop){ctx.beginPath();let started=false;const nodes=data.samples.filter(p=>pitLane(data,p[0])).sort((a,b)=>pitLane(data,a[0]).u-pitLane(data,b[0]).u);for(const p of nodes){const d=pitLane(data,p[0]).offset,[x,y]=projectMap(p[1]-p[8]*d,p[2]+p[7]*d);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.strokeStyle='#55e0db';ctx.lineWidth=2;ctx.stroke();const [px,py]=projectMap(pitstop.anchor.x,-pitstop.anchor.z);ctx.fillStyle='#114e43';ctx.fillRect(px-9,py-21,18,16);ctx.fillStyle='#fff5a1';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('P',px,py-9);}
 if(data.pit){const c=data.pit.columns,x=c.indexOf('x'),y=c.indexOf('y');ctx.beginPath();data.pit.samples.forEach((p,i)=>{const [px,py]=projectMap(p[x],p[y]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.lineWidth=1.5;ctx.strokeStyle=car.surface.pit?'#55e0db':'#7fa7a0';ctx.stroke();}
 const [sx,sy]=xy(data.samples[0]);ctx.fillStyle='#ffffff';ctx.fillRect(sx-3,sy-3,6,6);
 const [x,y]=projectMap(car.x,car.y);ctx.save();ctx.translate(x,y);ctx.rotate(-car.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-3,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#e2fb57';ctx.shadowBlur=10;ctx.shadowColor='#d6fa4b';ctx.fill();ctx.restore();
}
const roughRotation=new THREE.Quaternion(),roughEuler=new THREE.Euler(),chaseForward=new THREE.Vector3(1,0,0),chaseTarget=new THREE.Vector3(1,0,0);let roughRide=0;
function updateCar(dt){
 cockpit.root.visible=mode==='cockpit'&&!gridPreview();if(model)model.visible=!cockpit.root.visible;
 const p=car.surface,speed=Math.hypot(car.vx,car.vy),roughTarget=p.onRoad||!car.wheelsDown?0:clamp(speed/22,0,1);
 roughRide=dt>=1?0:roughRide+(roughTarget-roughRide)*(1-Math.exp(-dt*9));
 // Distance-based suspension motion stops at rest and fades on returning to asphalt.
 const bump=roughRide*(Math.sin(car.distance*2.1)*.025+Math.sin(car.distance*4.7)*.012);
 // The physics body carries heave, pitch, roll, jumps and rollovers; the
 // model origin sits on the ground below its centre of mass.
 const pose=car.pose();carRoot.position.set(pose.x,pose.z+bump,-pose.y);
 forward.set(pose.forward[0],pose.forward[2],-pose.forward[1]);up.set(pose.up[0],pose.up[2],-pose.up[1]);right.crossVectors(forward,up).normalize();
 matrix.makeBasis(forward,up,right);
 roughEuler.set(Math.sin(car.distance*2.7)*roughRide*.008,0,Math.sin(car.distance*1.9)*roughRide*.006);
 carRoot.quaternion.setFromRotationMatrix(matrix).multiply(roughRotation.setFromEuler(roughEuler));
 // Springs and anti-roll bars now tilt the physics body; this adds the rest of
 // the visible roll outward in corners, dive under braking and squat under power.
 const rollTarget=clamp((car.latAccel??0)*.0022,-.03,.03),pitchTarget=clamp((car.longAccel??0)*.002,-.025,.015);
 if(dt>=1){suspension.roll=rollTarget;suspension.pitch=pitchTarget;suspension.rollRate=suspension.pitchRate=0;}
 else for(let left=dt;left>1e-6;left-=1/120){const h=Math.min(left,1/120);springTo('roll',rollTarget,h,8.5,.5);springTo('pitch',pitchTarget,h,9.5,.55);}
 setBodyTilt(suspension.roll,suspension.pitch);
 // Cameras and bodywork must use the same rendered orientation.
 forward.set(1,0,0).applyQuaternion(carRoot.quaternion);up.set(0,1,0).applyQuaternion(carRoot.quaternion);right.set(0,0,1).applyQuaternion(carRoot.quaternion);
 // Chase views follow the nose while the car is on its wheels; in a roll they
 // swing slowly toward the direction of travel instead of tumbling with it.
 const tumbling=car.upright<.6;
 if(!tumbling)chaseTarget.copy(forward);else if(speed>2)chaseTarget.set(car.vx,0,-car.vy).normalize();
 chaseForward.lerp(chaseTarget,dt>=1?1:1-Math.exp(-dt*(tumbling?2.5:30))).normalize();
 for(const w of wheels){
  // Fisica: angulo positivo aponta para a esquerda. No GLB: frente +X,
  // cima +Y e esquerda -Z. Construir o eixo de rodagem evita inverter
  // esquerda/direita ao converter os eixos Blender -> glTF.
  const angle=w.front?car.steer:0;
  wheelForward.set(Math.cos(angle),0,-Math.sin(angle));
  wheelAxle.crossVectors(wheelForward,wheelUp);
  wheelTurn.setFromRotationMatrix(wheelMatrix.makeBasis(wheelForward,wheelUp,wheelAxle));
  wheelSpin.setFromAxisAngle(axleAxis,-(w.front?car.spin:car.rearSpin));
  w.obj.quaternion.copy(wheelTurn).multiply(w.base).multiply(wheelSpin).premultiply(bodyTiltInverse);
  // Suspension travel: wheels tuck in over bumps and hang down in the air.
  wheelOffset.copy(w.basePosition);wheelOffset.y+=car.wheelTravel?.[w.index]??0;
  w.obj.position.copy(wheelOffset.sub(bodyPivot).applyQuaternion(bodyTiltInverse).add(bodyPivot));
 }
}
function setBodyTilt(roll,pitch){
 bodyTilt.setFromEuler(bodyEuler.set(roll,0,pitch));bodyTiltInverse.copy(bodyTilt).invert();
 carBody.quaternion.copy(bodyTilt);carBody.position.copy(bodyPivot).sub(wheelOffset.copy(bodyPivot).applyQuaternion(bodyTilt));
}
// Rival templates are cloned from the model: hand them an untilted body and wheels.
function restBodyPose(){
 suspension.roll=suspension.pitch=suspension.rollRate=suspension.pitchRate=0;setBodyTilt(0,0);
 for(const w of wheels){w.obj.quaternion.copy(w.base);w.obj.position.copy(w.basePosition);}
}
function setCameraMode(value){
 if(!cameraModes.includes(value))return;
 const previous=mode;mode=value;followInitialized=false;orbit.enabled=value==='orbit';$('camera').value=value;
 preferences.update({camera:value});
 orbit.enableRotate=!pointerLocked;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;
 if(cockpit)cockpit.root.visible=value==='cockpit';if(model)model.visible=value!=='cockpit';
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
 if(!ready||paused||pitstop?.opened||e.button!==0||immersive?.active&&!immersive.allowsPointer())return;
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
 if(wasLocked&&!pointerLocked&&!pitstop?.opened&&!immersive?.blockingUI())menu(true);
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
 if(pitstop?.opened)return;
 const phase=immersive?.active?immersive.state.phase:'free';if(phase!==previewPhase){previewPhase=phase;previewOrbit=false;}
 if(immersive?.active&&['crowd','podium'].includes(immersive.state.phase)){const p=immersive.visual.hero.getWorldPosition(new THREE.Vector3());sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 const p=carRoot.position,vel=Math.hypot(car.vx,car.vy);
 if(gridPreview()&&!(phase==='prepare'&&previewOrbit)){wasGridPreview=true;camera.fov=58;camera.updateProjectionMatrix();camera.position.copy(p).addScaledVector(forward,-8.5).add(new THREE.Vector3(0,3.5,0));camera.up.set(0,1,0);camera.lookAt(p.clone().addScaledVector(forward,16).add(new THREE.Vector3(0,1,0)));sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 if(wasGridPreview){wasGridPreview=false;followInitialized=false;camera.fov=mode==='cockpit'?74:58;camera.updateProjectionMatrix();}
 const centering=cameraReturn.update(performance.now(),vel,paused),blend=1-Math.exp(-dt*2.8);
 // Speed widens the view a little; rough ground and very high speed add a fine shake.
 const speedFov=(mode==='cockpit'?74:58)+(mode==='aerial'||mode==='orbit'?0:clamp((vel-12)/45,0,1)*(mode==='cockpit'?5:7));
 if(Math.abs(camera.fov-speedFov)>.01){camera.fov=dt>=1?speedFov:camera.fov+(speedFov-camera.fov)*(1-Math.exp(-dt*3));camera.updateProjectionMatrix();}
 const shakeTime=performance.now()/1000,shake=paused||mode==='aerial'||mode==='orbit'?0:roughRide*.05+clamp((vel-42)/18,0,1)*.01;
 if(centering&&isInside()){headLook.yaw*=1-blend;headLook.pitch*=1-blend;}
 if(mode==='cockpit'||mode==='hood'){
  // Fixed local mount keeps the hood/dashboard still relative to the camera.
  const eye=mode==='hood'?hoodEye:cockpit.eye;
  carRoot.updateMatrixWorld(true);camera.position.copy(eye).applyMatrix4(carBody.matrixWorld);
  look.set(Math.cos(headLook.pitch)*Math.cos(headLook.yaw)*20,Math.sin(headLook.pitch)*20-.20,Math.cos(headLook.pitch)*Math.sin(headLook.yaw)*20).add(eye).applyMatrix4(carBody.matrixWorld);
  camera.position.y+=Math.sin(shakeTime*41)*shake*.35;look.y+=Math.sin(shakeTime*29+1.3)*shake*2;
  camera.up.set(0,1,0).transformDirection(carBody.matrixWorld);camera.lookAt(look);
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
 if(mode==='aerial'){desired.copy(p).addScaledVector(chaseForward,-40).add(new THREE.Vector3(0,95,35));look.copy(p).addScaledVector(chaseForward,22);}
 else{desired.copy(p).addScaledVector(chaseForward,-9-Math.min(vel*.035,2)).add(new THREE.Vector3(0,3.8,0));look.copy(p).addScaledVector(chaseForward,13).add(new THREE.Vector3(0,1,0));}
 // Smooth the offset, not the world position: frame-rate changes must not
 // make the car surge back and forth relative to its following camera.
 desired.sub(p);if(!followInitialized){followOffset.copy(desired);followInitialized=true;}else followOffset.lerp(desired,1-Math.exp(-dt*5));
 camera.position.copy(p).add(followOffset);camera.position.y+=Math.sin(shakeTime*37)*shake;camera.position.x+=Math.sin(shakeTime*31+.7)*shake*.6;camera.up.set(0,1,0);camera.lookAt(look);
 }
 sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();
}
const pressed=code=>keys.has(code)||mobile?.pressed.has(code);
function input(){return {ignition:pressed('KeyI')?1:0,throttle:Math.max(pressed('KeyW')||pressed('ArrowUp')?1:0,mobile?.throttle??0),brake:Math.max(pressed('KeyS')||pressed('ArrowDown')?1:0,mobile?.brake??0),left:Math.max(pressed('KeyA')||pressed('ArrowLeft')?1:0,-(mobile?.steering??0)),right:Math.max(pressed('KeyD')||pressed('ArrowRight')?1:0,mobile?.steering??0),reverse:pressed('KeyQ')?1:0,handbrake:pressed('Space')?1:0};}
function pilot(){
 return recognitionInput(car);
}
function hud(){
 const fuel=immersive?.active?immersive.state.fuel:immersive?.freeFuel??12,staged=immersive?.active&&['crowd','podium'].includes(immersive.state.phase);$('fuelGauge').classList.toggle('hidden',!!staged);$('fuelGauge').classList.toggle('reserve',fuel<1);$('fuelVolume').textContent=fuel.toFixed(1)+' L';$('fuelBar').value=fuel;$('fuelStatus').textContent=fuel<=0?(immersive?.active?'TANQUE VAZIO':'VAZIO · R PARA REABASTECER'):fuel<1?'RESERVA':immersive?.active&&immersive.state.tankDetached?'VAZAMENTO':'COMBUSTÍVEL';const p=car.surface,speed=Math.hypot(car.vx,car.vy)*3.6;
 $('speed').textContent=Math.round(speed);$('gear').textContent=carAudio.state.gear;$('rev').style.width=`${carAudio.state.rpm/7400*100}%`;
 $('grade').textContent=`${(p.grade*100).toFixed(1).replace('.',',')}%`;$('bank').textContent=`${(p.bank*100).toFixed(1).replace('.',',')}%`;$('alt').textContent=circuit.altitude===null?'—':`${(p.z+circuit.altitude).toFixed(1)} m`;
 $('lap').textContent=`${Math.min(car.laps+1,immersive.active?1:immersive.freeTotalLaps)} / ${immersive.active?1:immersive.freeTotalLaps}`;$('racePosition').textContent=`${immersive.active?immersive.state.result?.position??immersive.state.position:immersive.freePosition}º / ${GRID_SIZE}`;$('timer').textContent=fmt(car.clock-car.lapStart);$('best').textContent=fmt(car.best);const rejected=car.lastLapValid===false&&car.clock-car.lapStart<10;$('valid').textContent=rejected?(car.lastInvalidReason==='pit'?'Volta não contou · excesso de velocidade nos boxes':'Volta não contou · trecho cortado ou incompleto'):car.lapValid?'Volta válida':car.invalidReason==='pit'?`Volta inválida · ${Math.round(car.pitPenalty?.kmh??0)} km/h nos boxes (máx. 60)`:'Volta inválida · trecho cortado';$('valid').hidden=car.lapValid&&!rejected;$('valid').style.color=car.lapValid&&!rejected?'#e2fb57':'#ffb789';
 $('surface').textContent=automatic?'RECONHECIMENTO AUTOMÁTICO':p.pit&&data.pit?(car.limiter?'PIT LANE · MÁX. 60 km/h':'PIT LANE'):p.onRoad?'ASFALTO · SESSÃO LIVRE':'FORA DA PISTA · ADERÊNCIA REDUZIDA';$('location').textContent=p.pit&&data.pit?'Pit lane · boxes':location(p.s);drawMap();
 // Jumps and crashes take over the surface line while they last.
 const crash=car.upright<.45?(car.overturned>0?`CAPOTADO · FISCAIS DESVIRAM EM ${Math.max(1,Math.ceil(RIGHTING_DELAY-car.overturned))} s`:'CAPOTANDO!'):car.rightedAt!==null&&car.clock-car.rightedAt<3?'FISCAIS DESVIRARAM O CARRO':car.airTime>.25?'NO AR!':car.pitPenalty&&car.clock-car.pitPenalty.clock<3?'EXCESSO DE VELOCIDADE NOS BOXES · VOLTA INVÁLIDA':'';if(crash)$('surface').textContent=crash;
}
let accumulator=0,lastHud=0,renderedFrame=0,mirrorFrame=0,frameImpact=0;
// Adaptive resolution: slower GPUs trade sharpness for a steady frame rate.
const resolution={max:Math.min(devicePixelRatio,touchDevice?1:1.5),min:touchDevice?.6:.7,frame:1/60,timer:0};
function adaptResolution(rawDt){
 if(rawDt>.25)return;resolution.frame+=(rawDt-resolution.frame)*.05;resolution.timer+=rawDt;if(resolution.timer<1.5)return;resolution.timer=0;
 const current=renderer.getPixelRatio(),next=resolution.frame>1/42?Math.max(resolution.min,current-.1):resolution.frame<1/56?Math.min(resolution.max,current+.05):current;
 if(Math.abs(next-current)>.001){renderer.setPixelRatio(next);renderer.setSize(innerWidth,innerHeight,false);}
}
function updateCountdown(){const count=immersive?.active?(immersive.state.phase==='grid'?Math.max(1,Math.ceil(immersive.state.countdown)):0):Math.ceil(immersive?.freeCountdown||0),go=immersive?.goTime>0;const visible=sessionStarted&&!paused&&(count>0||go);$('raceCountdown').hidden=!visible;if(visible){const label=count>0?String(count):'VAI!';if($('countdownNumber').textContent!==label){$('countdownNumber').textContent=label;$('countdownCaption').textContent=count>0?'PREPARE-SE':'BOA CORRIDA!';}}}
// Crossing the line: the lap just run, the best lap and the position, for a few seconds.
let lapSeen=0,lapShown=0;
function lapBanner(dt){
 const banner=$('lapBanner');
 if(car.lapStart!==lapSeen){
  const crossed=car.lapStart>lapSeen&&car.lastLap!==null&&car.lastLapValid!==null;lapSeen=car.lapStart;
  if(crossed){
   const total=immersive?.active?1:immersive?.freeTotalLaps??3,valid=car.lastLapValid,record=valid&&car.laps>1&&car.best===car.lastLap;
   const position=immersive?.active?immersive.state.result?.position??immersive.state.position:immersive?.freePosition;
   $('lapBannerTitle').textContent=valid?`VOLTA ${Math.min(car.laps,total)} DE ${total}`:'VOLTA NÃO CONTOU';
   $('lapBannerTime').textContent=fmt(car.lastLap);
   $('lapBannerNote').textContent=!valid?(car.lastInvalidReason==='pit'?'EXCESSO DE VELOCIDADE NOS BOXES':'TRECHO CORTADO'):record?'NOVA MELHOR VOLTA!':car.lastLap>car.best?`+${(car.lastLap-car.best).toFixed(3).replace('.',',')} s da melhor`:'';
   $('lapBannerBest').textContent=fmt(car.best);$('lapBannerPosition').textContent=position?`${position}º de ${GRID_SIZE}`:'—';
   banner.classList.toggle('record',record);banner.classList.toggle('invalid',!valid);
   // Restart the entrance animation even when two crossings come close together.
   banner.hidden=true;void banner.offsetWidth;banner.hidden=false;lapShown=5;
  }
 }
 if(lapShown>0){lapShown-=dt;if(lapShown<=0)banner.hidden=true;}
}
function frame(){requestAnimationFrame(frame);const rawDt=clock.getDelta(),dt=Math.min(rawDt,.08);mobile?.update(paused,pitstop?.coffee?'crowd':immersive?.active?immersive.state.phase:'race');updateCountdown();if(!ready||!sessionStarted){carAudio.updateScene({},[],dt);return;}
 renderedFrame++;if(!paused&&!document.hidden)adaptResolution(rawDt);
 if(!immersive.active&&immersive.freeResultReady&&!paused){accumulator=0;menu(true);}
 if(!paused){if(automatic)immersive.recordAssisted=true;accumulator+=dt;while(accumulator>=1/120){const command=automatic?pilot():input();if(immersive&&!immersive.active&&immersive.freeFuel<=0&&!pitstop?.coffee){command.throttle=0;command.reverse=0;}if(!pitstop?.beforeStep(command,1/120)&&!immersive?.step(command,1/120)){const before=Math.hypot(car.vx,car.vy);car.step(command,1/120);const impact=Math.max(car.wallImpactSpeed??0,car.crashImpactSpeed??0,before-Math.hypot(car.vx,car.vy));if(impact>4){carAudio.effect('collision');immersive?.wallImpact(impact);frameImpact=Math.max(frameImpact,impact);}immersive?.stepFree(1/120,command);}skidMarks.update(car,command,1/120);accumulator-=1/120;if(!immersive.active&&immersive.freeResultReady){menu(true);break;}}}
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);
 skidMarks.flush();
 tyreSmoke.update(car,skidMarks.wheels,paused?0:dt,renderer.domElement.height);
 const skid=skidMarks.wheels.reduce((sum,w)=>sum+w.strength,0)/4;
 // The same command drives the engine sound and the driver's hands and feet.
 const driveCommand=pitstop?.opened?{throttle:0,brake:1,engineOff:true}:immersive?.audioCommand(automatic?pilot():input())??input();
 carAudio.update(car,driveCommand,skid,paused,mode);
 carAudio.updateScene({...immersive?.audioScene(),speed:Math.hypot(car.vx,car.vy),onRoad:car.surface.onRoad,camera:mode},immersive?.state.takeSounds()??[],dt);
 sky.update(paused?0:dt);landscape?.update(paused?0:dt,camera);
 updateCar(dt);updateCamera(dt);const phoneArrived=cockpit.update(car,paused?0:dt,carAudio.state).phoneArrived;if(phoneArrived)carAudio.notifyPhone();driver.update(car,paused?0:dt,{command:driveCommand,impact:frameImpact,phoneArrived});frameImpact=0;lapBanner(paused?0:dt);lastHud+=dt;if(lastHud>.07){hud();lastHud=0;}
 immersive?.update(paused?0:dt,camera);
 pitstop?.update(paused?0:dt,camera,sessionStarted&&!paused);
 raceResults.update(immersive,paused,$('settings').open);
 $('finishFade').classList.toggle('fading',!paused&&immersive.finishing);$('finishFade').style.opacity=String(!paused?immersive.finishOpacity:0);
 // The results sheet is opaque; avoid spending mobile GPU time behind it.
 if(!raceResults.root.hidden)return;
 // Render the reflection from this frame's car pose before displaying the cockpit.
 // A simulation-time timer made the mirror visibly stutter, especially at low FPS.
 if(mode==='cockpit'&&!gridPreview()){
  cockpit.root.visible=false;driver.root.visible=false;carStructure.visible=false;
  cockpit.rearCamera.position.set(-.65,1.14,0).applyMatrix4(carBody.matrixWorld);
  look.set(-30,1.14,0).applyMatrix4(carBody.matrixWorld);
  cockpit.rearCamera.up.set(0,1,0).transformDirection(carBody.matrixWorld);cockpit.rearCamera.lookAt(look);
  const oldShadowUpdate=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  tyreSmoke.material.uniforms.viewport.value=cockpit.mirrorTarget.height;
  renderer.setRenderTarget(cockpit.mirrorTarget);renderer.render(scene,cockpit.rearCamera);renderer.setRenderTarget(null);
  tyreSmoke.material.uniforms.viewport.value=renderer.domElement.height;
  mirrorFrame=renderedFrame;
  renderer.shadowMap.autoUpdate=oldShadowUpdate;cockpit.root.visible=true;driver.root.visible=true;carStructure.visible=true;
 }
 renderer.render(scene,camera);
}
function renderClassification(){
 const rows=[...(immersive.freeOrder??[])];
 rows.splice(immersive.freePosition-1,0,PLAYER_ENTRY);const list=$('finishingOrder');list.replaceChildren();
 rows.forEach((entry,i)=>{const row=document.createElement('li');row.classList.toggle('player-row',entry.number==='99');row.textContent=`${i+1}º · #${entry.number} ${entry.shortName}`;list.append(row);});
}
function updateMenuLabels(){pilotPicker.root.hidden=sessionStarted;$('circuitPicker').hidden=sessionStarted;const finished=!immersive?.active&&!!immersive?.freeResultReady;$('menu').classList.toggle('race-finished',finished);$('finishingOrder').hidden=!finished;if(finished)renderClassification();document.querySelector('#menu h1').textContent=finished?'Fim de corrida.':`Uma volta em ${circuit.name}.`;document.querySelector('#menu .eyebrow').textContent=finished?'BANDEIRADA / RESULTADO FINAL':'OLD STOCK / TEST DAY';const resume=sessionStarted&&(immersive?.active||!immersive?.freeResultReady)&&$('immersiveMode').checked===!!immersive?.active;$('start').textContent=loading?'Carregando circuito…':resume?'Voltar à pista →':finished?'Correr novamente →':sessionStarted?'Iniciar nova corrida →':'Entrar na pista →';$('restartRace').hidden=!resume;$('settingsResume').hidden=!sessionStarted||(!immersive?.active&&immersive?.freeResultReady);$('settingsRestart').hidden=$('settingsResume').hidden;$('raceResult').hidden=immersive?.active||!immersive?.freeResultReady;if(!immersive?.active&&immersive?.freeResultReady)$('raceResult').textContent=`Bandeirada! ${immersive.freePosition}º de ${GRID_SIZE} · ${immersive.freeTotalLaps} voltas · ${fmt(immersive.finishTime??car.clock)}`;}
function resumeRace(){if(!sessionStarted||(!immersive.active&&immersive.freeResultReady))return;$('settings').close();menu(false);}
$('settingsResume').onclick=resumeRace;
function menu(show){if(!show&&!immersive?.active&&immersive?.freeResultReady)show=true;paused=show;updateMenuLabels();carAudio.setPaused(show);if(!show)carAudio.unlock();if(show&&document.pointerLockElement===$('view'))document.exitPointerLock();cameraReturn.reset(performance.now());$('menu').classList.toggle('hidden',!show);keys.clear();mobile?.clear();status(show?'':automatic?'Reconhecimento automático · W para assumir o volante':'');}
const openSettings=setupSettings(()=>menu(true),returnToMainMenu);
const lapRecords=new LapRecords(circuit.id),raceResults=new RaceResults({onRestart:()=>beginRace(true),onSettings:openSettings,onRecords:mode=>lapRecords.open(mode),onMainMenu:returnToMainMenu});
const pilotPicker=new PilotPicker(),automaticRecords=new AutomaticRecords(pilotStorage()),automaticAIRecords=new AutomaticAIRecords(pilotStorage());
$('recordsButton').onclick=()=>{lapRecords.circuit=circuit.id;lapRecords.open();};
$('settingsButton').onclick=openSettings;
mobile=new MobileControls({enabled:touchDevice,onMenu:openSettings,onCamera:()=>{if(ready)setCameraMode(cameraModes[(cameraModes.indexOf(mode)+1)%cameraModes.length]);},onSkin:cycleLivery,onReset:()=>{if(ready&&!immersive.finishing){if(!immersive?.handleKey('KeyR'))reset(true);}},onUnlock:()=>carAudio.unlock()});
document.addEventListener('keydown',e=>{
 if(lapRecords.dialog.open)return;
 if(pitstop?.opened&&!$('settings').open){if(e.code==='Escape'||e.code==='KeyP')openSettings();else if(pitstop.coffee&&!paused){if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(e.code==='KeyE'&&!e.repeat){e.preventDefault();pitstop.interact();}}return;}
 if($('settings').open){if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}return;}
 if(['INPUT','SELECT'].includes(e.target.tagName)&&!['Escape','KeyP'].includes(e.code))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat||!ready)return;
 if(!paused&&immersive?.handleKey(e.code))return;
 if(e.code==='KeyC')setCameraMode(cameraModes[(cameraModes.indexOf(mode)+1)%cameraModes.length]);
 if(e.code==='KeyR'&&!immersive.finishing)reset(true);
 if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}
 if(e.code==='KeyV')cycleLivery();
 if(e.code==='KeyP')menu(!paused);
 if(e.code==='Escape')menu(true);
 if(automatic&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){automatic=false;status('');}
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('focus',()=>carAudio.setFocused(!document.hidden));window.addEventListener('blur',()=>{carAudio.setFocused(false);keys.clear();mobile?.clear();if(ready)menu(true);});
document.addEventListener('visibilitychange',()=>{carAudio.setFocused(!document.hidden&&document.hasFocus());if(document.hidden&&ready)menu(true);});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer?.setSize(innerWidth,innerHeight,false);mobile?.clear();if(touchDevice&&innerHeight>innerWidth&&ready)menu(true);});
$('orbitButton').onclick=()=>{if(ready)setCameraMode(mode==='orbit'?'chase':'orbit');};
$('cockpitButton').onclick=()=>{if(ready)setCameraMode(mode==='cockpit'?'chase':'cockpit');};
$('skinButton').onclick=cycleLivery;
async function beginRace(restart=false,tour=false){
 if(loading)return;
 const continuing=sessionStarted&&!restart&&!tour&&$('immersiveMode').checked===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 const pilot=continuing?immersive.pilotName:pilotPicker.commit();if(!pilot)return;
 if(!await loadCircuit())return;
 const same=sessionStarted&&$('immersiveMode').checked===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 if(same&&!restart&&!tour){menu(false);return;}
 automaticRecords.start(pilot);immersive.pilotName=pilot;immersive.recordSaveError='';
 pitstop?.reset();automatic=false;
 if($('immersiveMode').checked){immersive.start();}
 else{if(immersive.active)immersive.disable();reset();setCameraMode('chase');updateCar(1);updateCamera(1);}
 if(!immersive.active&&!tour)immersive.beginCountdown();
 sessionStarted=true;automatic=tour&&!immersive.active;menu(false);
}
function returnToMainMenu(){
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);
 pitstop?.reset();$('settings').close();lapRecords.dialog.close();
 if(ready){immersive.disable();reset();}
 sessionStarted=false;automatic=false;raceResults.root.hidden=true;menu(true);showCircuitSelection();
}
$('start').onclick=()=>beginRace();$('restartRace').onclick=()=>beginRace(true);
$('settingsRestart').onclick=()=>{$('settings').close();beginRace(true);};
$('tour').onclick=()=>{if(!$('immersiveMode').checked)beginRace(true,true);};$('menuButton').onclick=openSettings;$('camera').onchange=e=>setCameraMode(e.target.value);$('livery').onchange=async e=>{preferences.update({livery:e.target.value});if(!ready||!sessionStarted)return;try{await setLivery(e.target.value);}catch(err){status('Não foi possível carregar a pintura. Tente novamente.');console.error(err);}};
// Keep the car and audio session; release the previous circuit before loading another.
function clearCircuit(){
 const retired=[];
 if(pitstop){pitstop.reset();pitstop.panel.remove();pitstop.hud.remove();pitstop.walkHud.remove();pitstop.markers.removeFromParent();retired.push(pitstop.markers);pitstop=null;}
 camera.clearViewOffset();
 if(immersive){immersive.dispose();immersive.visual.damage.removeFromParent();retired.push(immersive.visual.damage);immersive=null;}
 if(car)delete car.condition;
 const keepRoots=new Set([carRoot,skidMarks?.mesh,tyreSmoke?.mesh,sun,sun.target,sky?.dome]);
 for(const root of [...scene.children])if(!root.isLight&&!keepRoots.has(root)){scene.remove(root);retired.push(root);}
 const collect=roots=>{const geometries=new Set(),materials=new Set(),textures=new Set();for(const root of roots)root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});return {geometries,materials,textures};};
 const keep=collect([...keepRoots]),old=collect(retired);
 for(const root of retired)root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
 if(roadSurface){old.materials.add(roadSurface.material);for(const value of Object.values(roadSurface.material))if(value?.isTexture)old.textures.add(value);}
 for(const key of ['geometries','materials','textures'])for(const resource of old[key])if(!keep[key].has(resource))resource.dispose();
 for(const proxy of cameraObstacles)if(!old.geometries.has(proxy.geometry))proxy.geometry.dispose();cameraObstacles.length=0;
 landscapeField?.texture.dispose();landscapeField=null;landscape?.dispose();landscape=null;
 roadSurface=null;loadedCircuit=null;raceResults.mode=null;raceResults.snapshot=null;raceResults.root.hidden=true;renderer?.renderLists.dispose();
 if(skidMarks){skidMarks.breakTrails();skidMarks.count=skidMarks.total=skidMarks.cursor=0;skidMarks.geometry.setDrawRange(0,0);}
 tyreSmoke?.reset();accumulator=0;followInitialized=false;
 window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
}
async function loadCircuit(){
 const reuse=ready&&loadedCircuit===circuit.id;
 loading=true;ready=false;if(window.interlagos)window.interlagos.ready=false;$('start').disabled=true;$('tour').disabled=true;$('livery').disabled=true;
 for(const button of document.querySelectorAll('[data-circuit]'))button.disabled=true;
 updateMenuLabels();
 try{
 if(reuse){if(activeLivery!==$('livery').value)await setLivery($('livery').value);ready=true;window.interlagos.ready=true;$('skinButton').disabled=false;return true;}
 initializeRenderer();clearCircuit();showCircuitSelection();

 data=circuit.id==='curvelo'?createCurveloData():await (await fetch('../dados/pista.json')).json();data.meta.id=circuit.id;data.meta.name=circuit.name;projectMap=mapProjection(data.samples);car=new TestCar(data);
 roadSurface=await createTrackSurface(renderer,data);
 if(!driver){driver=await createDriver(cockpit);carBody.add(driver.root);}
 terrainTextures??=await loadTerrainTextures(renderer);landscapeField=buildTrackField(data);let standTops=[];
 if(circuit.id==='curvelo'){
  const groundMaterial=terrainMaterial(terrainTextures,landscapeField,{mobile:touchDevice});groundMaterial.userData.terrain=true;
  standTops=flattenStatic(createCurveloScene(data,roadSurface,{groundMaterial,gravelMap:terrainTextures.gravel}));
  landscape=createLandscape({data,field:landscapeField,mobile:touchDevice,style:'cerrado'});
 }else{
  const track=await loader.loadAsync('../exports/interlagos_pista.glb');let ortho=null;
  // The orthophoto stays as land-cover data and far-distance colour; close up it becomes grass, woods, paving and water.
  track.scene.traverse(o=>{if(!o.isMesh||o.material?.name!=='GeoSampa_Ortofoto_2020')return;const photo=o.material;ortho=readOrtho(photo.map,o.geometry);o.material=terrainMaterial(terrainTextures,landscapeField,{ortho:photo.map,mobile:touchDevice});o.material.userData.terrain=true;photo.map=null;photo.dispose();});
  standTops=flattenStatic(track.scene);
  landscape=createLandscape({data,field:landscapeField,ortho,mobile:touchDevice});
 }
 scene.add(landscape.root);
 const crowd=createCrowd(standTops,{mobile:touchDevice});scene.add(crowd.root);landscape.stats.fans=crowd.count;if(!model||activeLivery!==$('livery').value)await setLivery($('livery').value);
 const guardrails=createGuardrails(data);scene.add(guardrails.root);cameraObstacles.push(guardrails.rails);
 scene.add(createCurbs(data));
 // Surveyed pit lane: entry after the Cafe, garages, exit around the S do Senna.
 let pitLayout=null;if(data.pit){const pitLaneScene=createInterlagosPit(data,roadSurface,terrainTextures);scene.add(pitLaneScene.root);cameraObstacles.push(...pitLaneScene.obstacles);pitLayout=pitLaneScene.box;}
 const branding=await createTrackBranding(data);scene.add(branding.root);
 restBodyPose();
 immersive=new ImmersiveMode({scene,carRoot,car,data,driver,rivalTemplate:model,skidMarks,resetVehicle:()=>reset(),releaseMouse:()=>{keys.clear();mobile?.clear();if(document.pointerLockElement)document.exitPointerLock();},onNormal:()=>{chooseImmersive(false);reset();menu(true);}});
 immersive.onMainMenu=returnToMainMenu;
 // Box 99: Curvelo's service lane, or the surveyed garage at Interlagos.
 if(circuit.id==='curvelo'||pitLayout)pitstop=new PitStop({scene,car,carRoot,driver,mode:immersive,data,roadSurface,layout:pitLayout,onOpen:()=>{automatic=false;keys.clear();mobile?.clear();mobile?.setHandbrake(false);setCameraMode('chase');if(document.pointerLockElement)document.exitPointerLock();},onClose:()=>{keys.clear();mobile?.clear();followInitialized=false;},onSettings:openSettings});
 pitstop?.setDamage(preferences.values.damage);
 const kleber=immersive.visual.rivals.find(o=>o.userData.entry.number==='70');
 const oldStockMaterial=new THREE.MeshBasicMaterial({map:branding.oldStock,polygonOffset:true,polygonOffsetFactor:-2});
 for(const side of [-1,1]){const decal=new THREE.Mesh(new THREE.PlaneGeometry(.64,.43),oldStockMaterial);decal.position.set(.95,.75,side*.941);decal.rotation.y=side<0?Math.PI:0;decal.name='OldStock_no_Opala70';kleber.add(decal);}
 const roster=$('gridRoster');roster.replaceChildren();for(const entry of [...RIVAL_ROSTER,PLAYER_ENTRY]){const row=document.createElement('li');row.textContent=`#${entry.number} · ${entry.name}${entry.number==='99'?' · VOCÊ':` · Ritmo ${entry.level}/100`}`;roster.append(row);}
 // Compile the new programs while the loading label is still shown, instead of
 // freezing the first race frame (D3D shader compilation is slow on Windows).
 updateCar(1);updateCamera(1);try{await renderer.compileAsync(scene,camera);}catch(err){console.warn(err);}
 ready=true;loadedCircuit=circuit.id;setCameraMode(preferences.values.camera);$('skinButton').disabled=false;updateCar(1);cockpit.update(car,0);driver.update(car,0);updateCamera(1);cameraHint();hud();$('start').disabled=false;$('start').textContent='Entrar na pista →';
 window.interlagos={ready:true,circuit:circuit.id,car,telemetry:()=>car.telemetry(),setLivery,reset:()=>reset(),reposition:index=>{car.reset(index);driver.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();updateCar(1);updateCamera(1);},setTour:value=>{if(immersive.active)return;automatic=value;menu(false);},
  immersiveInfo:()=>immersive.info(),pitInfo:()=>pitstop?.info()??null,
  audioInfo:()=>carAudio.info(),mobileInfo:()=>({enabled:touchDevice,steering:mobile?.steering??0,throttle:mobile?.throttle??0,brake:mobile?.brake??0,pressed:[...(mobile?.pressed??[])],pixelRatio:renderer.getPixelRatio()}),
  skidInfo:()=>skidMarks.info(),smokeInfo:()=>tyreSmoke.info(),sceneryInfo:()=>({...landscape.stats,sky:sky.info()}),
  structureInfo:()=>({revision:'v04_fechamentos',parts:carStructure.children.length,visible:carStructure.visible}),
  driverInfo:()=>driver.info(),
  surfaceInfo:()=>({...roadSurface.stats,material:roadSurface.material.name,drawCalls:renderer.info.render.calls}),
  // Interior cameras ride on the sprung body, so report them in its frame.
  cockpitInfo:()=>({...cockpit.info(),eyeLocal:carBody.worldToLocal(camera.position.clone()).toArray(),fov:camera.fov,externalVisible:model.visible,
   renderedFrame,mirrorFrame,mirrorEyeLocal:carBody.worldToLocal(cockpit.rearCamera.position.clone()).toArray()}),
  viewControls:()=>({pointerLocked,lockPending,lockUnavailable,yaw:headLook.yaw,pitch:headLook.pitch,centering:cameraReturn.active,movingSince:cameraReturn.movingSince,lastInput:cameraReturn.lastInput,delayMs:cameraReturn.delayMs}),
  cameraSnapshot:()=>({position:camera.position.toArray(),target:orbit.target.toArray(),car:carRoot.position.toArray(),distance:camera.position.distanceTo(orbit.target),ground:car.sample(camera.position.x,-camera.position.z).z}),
  wheelSnapshot:()=>{carRoot.updateMatrixWorld(true);const inverse=carRoot.getWorldQuaternion(new THREE.Quaternion()).invert();return wheels.map(w=>{const axle=new THREE.Vector3(0,0,1).applyQuaternion(w.obj.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(inverse);return {name:w.obj.name,front:w.front,angle:Math.atan2(axle.x,axle.z),axle:axle.toArray()};});},
  get state(){return {paused,automatic,mode,livery:activeLivery,wheels:wheels.length,drawCalls:renderer.info.render.calls};}};
 return true;
 }catch(err){console.error(err);ready=false;clearCircuit();status('Não foi possível carregar a pista. Clique em começar para tentar novamente.');return false;}
 finally{loading=false;$('start').disabled=false;$('tour').disabled=$('immersiveMode').checked;$('livery').disabled=false;for(const button of document.querySelectorAll('[data-circuit]'))button.disabled=false;updateMenuLabels();}
}
$('start').disabled=false;status('');updateMenuLabels();
window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
frame();
