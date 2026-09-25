import {PitStop} from './pitstop.js';
import {pitLane} from './pit-lane.js';
import {createInterlagosPit} from './interlagos-pit.js';
import {createCurveloPit} from './pit-building.js';
import {CIRCUITS,selectedCircuit,mapProjection} from './circuits.js';
import {createCurveloData} from './curvelo-data.js';
import {createCurveloScene} from './curvelo-scene.js';
import {RaceResults} from './race-results.js';
import {LapRecords,AutomaticRecords,trackRecords} from './lap-records.js';
import {AutomaticAIRecords} from './ai-records.js';
import {PilotPicker,pilotStorage} from './pilot-profile.js';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {TestCar,clamp,wrap,recognitionInput,RIGHTING_DELAY} from './physics.js?v=20260923-capotagem';
import {GRID_SIZE,RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';
import {createTrackSurface,createGuardrails,createCurbs,createTrackBranding} from './track-surface.js';
import {createCockpit} from './cockpit.js?v=20260923-interior-fotos';
import {CarOpenings} from './car-openings.js';
import {CameraReturn,LookBack,turnHead,neckTwist,HEAD_YAW_COCKPIT,HEAD_YAW_HOOD} from './camera-return.js';
import {createDriver} from './driver.js?v=20260923-controls';
import {SkidMarks} from './skid-marks.js?v=20260923-capotagem';
import {TyreSmoke} from './tyre-smoke.js?v=20260923-capotagem';
import {ImmersiveMode} from './immersive-mode.js';
import {MobileControls} from './mobile-controls.js';
import {setupSettings} from './settings.js';
import {CarAudio} from './car-audio.js?v=20260913-immersive';
import {PlayerPreferences,CAMERA_MODES,LAPS} from './player-preferences.js';
import {createSky,SUN_DIRECTION} from './sky.js';
import {createCinematic} from './cinematic.js';
import {createLandscape,loadTerrainTextures,buildTrackField,readOrtho,terrainMaterial,structureMaterial,createCrowd} from './landscape.js';
import {LakeContact} from './lake-contact.js';
import {fitGround,applyGroundHeights,groundHeight} from './track-clearance.js';
import {createGrandstands} from './interlagos-stands.js';
import {createTrackside} from './trackside.js';
import {updatePeople} from './pit-crew.js';
import {TvCamera} from './tv-camera.js';
import {CinematicIntro} from './intro-cinematic.js';
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
$('livery').value=preferences.values.livery;
$('camera').value=preferences.values.camera;
$('carDamage').checked=preferences.values.damage;
$('carDamage').onchange=()=>{preferences.update({damage:$('carDamage').checked});pitstop?.setDamage(preferences.values.damage);};
$('realisticWater').checked=preferences.values.realisticWater;
$('realisticWater').onchange=()=>{preferences.update({realisticWater:$('realisticWater').checked});landscape?.setRealisticWater(preferences.values.realisticWater);};
// Race length (both modes, every circuit): taken at the next start, so a race under way keeps its own.
{const laps=$('raceLaps');for(let n=LAPS.min;n<=LAPS.max;n++)laps.add(new Option(`${n} volta${n>1?'s':''}${n===LAPS.standard?' (padrão)':''}`,String(n)));laps.value=String(preferences.values.laps);
 laps.onchange=()=>{preferences.update({laps:Number(laps.value)});if(immersive)immersive.laps=preferences.values.laps;};}
$('classicInterior').checked=preferences.values.classicInterior;
$('classicInterior').onchange=()=>{preferences.update({classicInterior:$('classicInterior').checked});if(ready)cabinVisibility();};
// Film look level (cinematic.js): auto, full, lite or off.
$('cinematicLevel').value=preferences.values.cinematic;
$('cinematicLevel').onchange=()=>{preferences.update({cinematic:$('cinematicLevel').value});cinematic?.setLevel(cinematicLevel());};
// The opening menu picks the mode: Modo Corrida (free race) or Modo História (immersive).
function chooseImmersive(value){
 preferences.update({immersive:value});if(ready)updateMenuLabels();
}
const scene=new THREE.Scene();scene.background=new THREE.Color('#a8c8dd');
let sky,landscape,landscapeField,terrainTextures,lakeContact=null,cinematic,trackside=null,tvCamera=null;const tvVelocity=new THREE.Vector3();
// Film-style opening shots before the free race's 3-2-1 and when the story begins.
const intro=new CinematicIntro();let introHidden=null;
let renderer;
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,6500);
const orbit=new OrbitControls(camera,$('view'));
const ORBIT_MAX_DISTANCE=45;
orbit.enabled=false;orbit.enablePan=false;orbit.minDistance=3.2;orbit.maxDistance=ORBIT_MAX_DISTANCE;
orbit.minPolarAngle=.015;orbit.maxPolarAngle=Math.PI/2;
orbit.rotateSpeed=.8;orbit.zoomSpeed=.8;
const orbitTarget=new THREE.Vector3(),orbitDelta=new THREE.Vector3();
const hoodEye=new THREE.Vector3(1.1,1.25,0),followOffset=new THREE.Vector3();let followInitialized=false;
const cameraObstacles=[],cameraRay=new THREE.Raycaster(),cameraRayDirection=new THREE.Vector3();
const obstacleMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const cameraModes=CAMERA_MODES;
const cameraReturn=new CameraReturn(),orbitSphere=new THREE.Spherical(),orbitHome=new THREE.Spherical(),orbitSeen=new THREE.Spherical();
// Framing the orbit inherited: turn and tilt away from "looking at the car", about the vertical so the horizon stays level.
// Also whether it keeps the chase speed widening, and the camera the mouse turned into the orbit.
const orbitAim={yaw:0,pitch:0},orbitHomeAim={yaw:0,pitch:0},aimToCar=new THREE.Vector3(),aimView=new THREE.Vector3();let orbitSpeedFov=false,orbitFrom=null;
function aimOffset(toCar,view,out){
 out.yaw=wrap(Math.atan2(view.x,view.z)-Math.atan2(toCar.x,toCar.z));out.pitch=Math.asin(clamp(view.y,-1,1))-Math.asin(clamp(toCar.y,-1,1));return out;
}
function aimOrbit(){
 aimToCar.subVectors(orbit.target,camera.position).normalize();
 const yaw=Math.atan2(aimToCar.x,aimToCar.z)+orbitAim.yaw,pitch=clamp(Math.asin(clamp(aimToCar.y,-1,1))+orbitAim.pitch,-1.5,1.5);
 camera.lookAt(aimView.set(Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)).add(camera.position));
}
// Far from the car (an orbit that began in the aerial view) the camera stays high, above the trees.
// Set before every orbit update, or the previous orbit's limit would move the next one.
function orbitTilt(){orbit.maxPolarAngle=Math.PI/2-clamp((camera.position.distanceTo(orbit.target)-ORBIT_MAX_DISTANCE)/60,0,1)*.5;}
const headLook={yaw:0,pitch:0};
// B held in the cockpit looks back; headView is the look actually drawn (mouse look blended with it).
// cockpitView is a debug pose for interior photos (interlagos.setCockpitView); null in play.
const lookBack=new LookBack(),headView={yaw:0,pitch:0},headEye=new THREE.Vector3(),twist=[0,0,0];
let cockpitView=null,photoHidDriver=false;const photoEye=new THREE.Vector3();
// Recon lap: N (or the Piloto button) hands the cameras to the next car on track, to watch the lap
// with another driver; 0 is the player's own Opala.
let watched=0;const watchForward=new THREE.Vector3(1,0,0),watchTarget=new THREE.Vector3();
let pointerLocked=false,lockPending=false,lockUnavailable=!$('view').requestPointerLock;
const isInside=()=>mode==='cockpit'||mode==='hood';
// Look-back (B or the touch button): driving from the cockpit only, not on foot, in the pit stop or menus.
const lookBackAllowed=()=>mode==='cockpit'&&ready&&!paused&&!cockpitView&&!pitstop?.opened&&!immersive?.onFoot()&&!gridPreview()&&!$('settings').open;
// Sky light comes mostly from the environment map; the hemisphere only lifts deep shadows.
// Late-afternoon key light: warm sun, a weaker sky fill so shade keeps its depth.
scene.add(new THREE.HemisphereLight('#c4d8f2','#4c4a38',.52));
const sun=new THREE.DirectionalLight('#ffe2bf',3.7);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?1024:4096,touchDevice?1024:4096);const shadowReach=touchDevice?55:85;Object.assign(sun.shadow.camera,{left:-shadowReach,right:shadowReach,top:shadowReach,bottom:-shadowReach,near:1,far:340});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;sun.shadow.radius=2;scene.add(sun,sun.target);
const sunOffset=SUN_DIRECTION.clone().multiplyScalar(140);
const loader=new GLTFLoader(),carRoot=new THREE.Group();scene.add(carRoot);
// Sprung mass: body, cabin, cockpit and driver roll and pitch on the suspension;
// the wheels are counter-rotated so they stay planted on the ground.
const carBody=new THREE.Group();carBody.name='Carroceria_suspensao';carRoot.add(carBody);
// Doors, hood, trunk lid and filler caps of the V06 Opala, on their hinges (car-openings.js).
const openings=new CarOpenings();
// Which interior shows (cockpit.js setView). The game's controls sit in the V06 body, as in its
// Blender scene: its structure is the cabin's floor and walls, and from outside the seat and
// controls show through the windows. The classic setting keeps the old box interior in the
// cockpit view instead. The driver drops with the controls he holds.
function cabinVisibility(){
 const inside=mode==='cockpit'&&!gridPreview()&&!watchedRival(),classic=preferences.values.classicInterior;
 if(cockpit){cockpit.root.visible=inside||!!model;cockpit.setView({inside,classic});if(driver)driver.root.position.y=cockpit.drop();}
 if(model){model.visible=!inside||!classic;carStructure.visible=!(inside&&classic);}
}
const suspension={roll:0,rollRate:0,pitch:0,pitchRate:0},bodyPivot=new THREE.Vector3(.3,.38,0),bodyTilt=new THREE.Quaternion(),bodyTiltInverse=new THREE.Quaternion(),bodyEuler=new THREE.Euler(),wheelOffset=new THREE.Vector3();
function springTo(key,target,dt,frequency,damping){const rate=key+'Rate';suspension[rate]+=((target-suspension[key])*frequency*frequency-2*damping*frequency*suspension[rate])*dt;suspension[key]+=suspension[rate]*dt;}
let cockpit,skidMarks,tyreSmoke;
// The two TVs in Box 99's garage and the team stand's monitors show this track's records (the mode
// being played, and the other mode's best laps on the stand); they are
// checked every 1.5 s and redrawn only when the lists change (a new record, the other mode).
let recordTvs=null,recordTvsKey='',recordTvsAt=0;
function updateRecordTvs(now){
 if(!recordTvs||now<recordTvsAt)return;recordTvsAt=now+1500;
 const kind=immersive?.active?'immersive':'normal',otherKind=kind==='immersive'?'normal':'immersive',read=m=>trackRecords(pilotStorage(),circuit.id,m,immersive?.pilotName);
 const lists=read(kind),other={mode:otherKind,lap:read(otherKind).lap},key=JSON.stringify([circuit.id,kind,lists,other]);
 if(key!==recordTvsKey){recordTvsKey=key;recordTvs.showRecords({title:`RECORDES · ${circuit.name.toUpperCase()}`,mode:kind,laps:LAPS.standard,...lists,other});}
}
function initializeRenderer(){
 if(renderer)return;
 renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:!touchDevice});renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.5));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 sky=createSky(renderer,scene,{mobile:touchDevice});
 // Film look: linear HDR scene, then occlusion, haze, bloom, lens and grade (cinematic.js).
 cinematic=createCinematic(renderer,{mobile:touchDevice,level:cinematicLevel()});cinematic.setSun(SUN_DIRECTION);
 cockpit=createCockpit(renderer);carBody.add(cockpit.root);if(touchDevice)cockpit.mirrorTarget.setSize(384,64);
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
// The story's grid countdown is shown from behind the car; the engine start before it
// ('starting') is played in the cockpit (ImmersiveMode switches the view).
const gridPreview=()=>immersive?.active&&immersive.state.phase==='grid';
let wasGridPreview=false;
const keys=new Set(),clock=new THREE.Clock(),matrix=new THREE.Matrix4(),forward=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),desired=new THREE.Vector3(),look=new THREE.Vector3();
const wheelForward=new THREE.Vector3(),wheelUp=new THREE.Vector3(0,1,0),wheelAxle=new THREE.Vector3(),wheelMatrix=new THREE.Matrix4(),wheelTurn=new THREE.Quaternion(),wheelSpin=new THREE.Quaternion(),axleAxis=new THREE.Vector3(0,0,1);
function status(text){$('status').textContent=text;$('status').classList.toggle('hidden',!text);}
function flattenStatic(root){
 // The GLB's walls, kerbs and step-only grandstands are rebuilt from the data (Curvelo's stands stay).
 // GLTFLoader drops the dot from Blender's numbered names: Arquibancada.001 arrives as Arquibancada001.
 const retired=[];root.traverse(ob=>{if(/^(Muro_protecao|Zebras_|Arquibancada\d*$)/.test(ob.name))retired.push(ob);});retired.forEach(ob=>ob.removeFromParent());
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
 const gltf=await loader.loadAsync(`./assets/opala99_${value}.glb?v=06-pecas-separadas`);
 if(token!==loadToken)return;
 if(model)carBody.remove(model);model=gltf.scene;wheels=[];
 // Meshes inside the shut body (engine bay, trunk, hinges: glTF extra "interno") cast no shadow.
 model.traverse(o=>{if(o.isMesh){o.castShadow=!o.userData.interno;o.receiveShadow=true;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.name==='Policarbonato_fume'){m.transparent=true;m.opacity=.19;m.depthWrite=false;o.castShadow=false;}
   // Blender's glass (transmission: the V06 headlamp lenses, turn signals, translucent plastics) would make
   // three.js draw the whole scene a second time every frame; here they are plain see-through materials.
   if(m.transmission>0){m.transparent=true;m.opacity=Math.min(m.opacity,1-.65*m.transmission);m.transmission=0;m.depthWrite=false;}}
 }if(o.name.startsWith('Roda_')&&o.name.includes('PIVO')){const front=o.name.includes('Dianteira');wheels.push({obj:o,front,index:(front?0:2)+(o.position.z>0?1:0),base:o.quaternion.clone(),basePosition:o.position.clone()});}});
 openings.attach(model);
 // These solid Blender panels close the cabin seen from outside. The detailed
 // cockpit has its own floor, walls and rear cabin, so they hide with the body
 // (their belt-high sheet over the rear seat would cover the interior).
 if(carStructure)carBody.remove(carStructure);
 carStructure=new THREE.Group();carStructure.name='Estrutura_cabine_V04';
 model.updateMatrixWorld(true);const structuralParts=[];
 model.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Chapa_fechamento_V04'))structuralParts.push(o);});
 for(const part of structuralParts){const local=part.matrixWorld.clone();carStructure.add(part);local.decompose(part.position,part.quaternion,part.scale);}
 carBody.add(model,carStructure);cabinVisibility();activeLivery=value;status('');
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
// At the box the crew and the pilot on foot (action key) open the hinged parts; what was opened by
// hand shuts as the car moves off.
function updateOpenings(dt){if(Math.hypot(car.vx,car.vy)>1.5)openings.release('manual');openings.update(dt);}
// nearest (R key): only the player's car goes back on track; rivals, laps and fuel carry on.
function reset(nearest=false){mobile?.setHandbrake(false);openings.closeAll(true);if(nearest)car.recover();else{car.resetGrid();if(immersive&&!immersive.active)immersive.resetField();cockpit.resetPhone();}driver?.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();automatic=false;followInitialized=false;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;lookBack.reset();updateCar(1);updateCamera(1);}
const names=[[0,'Reta dos boxes'],[280,'S do Senna · T1–T2'],[490,'Curva do Sol · T3'],[700,'Reta Oposta'],[1500,'Descida do Lago · T4–T5'],[1810,'Subida para a Ferradura'],[1990,'Ferradura · T6–T7'],[2230,'Laranjinha · T8'],[2430,'Pinheirinho · T9'],[2660,'Bico de Pato · T10'],[2840,'Mergulho · T11'],[3120,'Junção · T12'],[3250,'Subida dos boxes · T13'],[3570,'Café · T14'],[3960,'T15 · Reta dos boxes']];
function location(s){const sections=data.meta.sections||names;let name=sections[0][1];for(const [d,n] of sections)if(s>=d)name=n;return name;}
const fmt=t=>{if(t===null)return '—';const m=Math.floor(t/60),s=t%60;return `${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;};
function drawMap(){
 const ctx=$('map').getContext('2d'),w=260,h=300;ctx.clearRect(0,0,w,h);
 const xy=p=>projectMap(p[1],p[2]);
 ctx.beginPath();data.samples.forEach((p,i)=>{const [x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.lineWidth=8;ctx.strokeStyle='#ffffff16';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#b6c5b5';ctx.stroke();
 if(immersive&&(!immersive.active||['starting','grid','race'].includes(immersive.state.phase))){for(const [i,r] of immersive.rivals.entries()){const [x,y]=projectMap(r.car.x,r.car.y);ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle='#'+r.entry.color.toString(16).padStart(6,'0');ctx.fill();ctx.strokeStyle='#0c1c17';ctx.lineWidth=1.2;ctx.stroke();}}
 if(pitstop){ctx.beginPath();let started=false;const nodes=data.samples.filter(p=>pitLane(data,p[0])).sort((a,b)=>pitLane(data,a[0]).u-pitLane(data,b[0]).u);for(const p of nodes){const d=pitLane(data,p[0]).offset,[x,y]=projectMap(p[1]-p[8]*d,p[2]+p[7]*d);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);}ctx.strokeStyle='#55e0db';ctx.lineWidth=2;ctx.stroke();const [px,py]=projectMap(pitstop.anchor.x,-pitstop.anchor.z);ctx.fillStyle='#114e43';ctx.fillRect(px-9,py-21,18,16);ctx.fillStyle='#fff5a1';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('P',px,py-9);}
 if(data.pit){const c=data.pit.columns,x=c.indexOf('x'),y=c.indexOf('y');ctx.beginPath();data.pit.samples.forEach((p,i)=>{const [px,py]=projectMap(p[x],p[y]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.lineWidth=1.5;ctx.strokeStyle=car.surface.pit?'#55e0db':'#7fa7a0';ctx.stroke();}
 const [sx,sy]=xy(data.samples[0]);ctx.fillStyle='#ffffff';ctx.fillRect(sx-3,sy-3,6,6);
 const [x,y]=projectMap(car.x,car.y);ctx.save();ctx.translate(x,y);ctx.rotate(-car.heading);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4);ctx.lineTo(-3,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fillStyle='#e2fb57';ctx.shadowBlur=10;ctx.shadowColor='#d6fa4b';ctx.fill();ctx.restore();
}
const roughRotation=new THREE.Quaternion(),roughEuler=new THREE.Euler(),chaseForward=new THREE.Vector3(1,0,0),chaseTarget=new THREE.Vector3(1,0,0);let roughRide=0;
function updateCar(dt){
 cabinVisibility();
 const p=car.surface,speed=Math.hypot(car.vx,car.vy),roughTarget=p.onRoad||!car.wheelsDown?0:clamp(speed/22,0,1);
 roughRide=dt>=1?0:roughRide+(roughTarget-roughRide)*(1-Math.exp(-dt*9));
 // Distance-based suspension motion stops at rest and fades on returning to asphalt.
 const bump=roughRide*(Math.sin(car.distance*2.1)*.025+Math.sin(car.distance*4.7)*.012);
 // The physics body carries heave, pitch, roll, jumps and rollovers; the
 // model origin sits on the ground below its centre of mass.
 const pose=car.pose(renderAhead());carRoot.position.set(pose.x,pose.z+bump,-pose.y);
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
 // Only a follow view already drawn for this car is worth keeping when the orbit takes over.
 const previous=mode,keepView=ready&&value==='orbit'&&previous!=='orbit'&&(followInitialized||wasGridPreview);
 mode=value;orbitFrom=null;followInitialized=false;if(value==='tv')tvCamera?.reset();orbit.enabled=value==='orbit';$('camera').value=value;
 preferences.update({camera:value});
 orbit.enableRotate=!pointerLocked;cameraReturn.reset(performance.now());headLook.yaw=headLook.pitch=0;lookBack.reset();
 cabinVisibility();
 document.body.classList.toggle('cockpit-mode',value==='cockpit');
 $('cockpitButton').classList.toggle('active',value==='cockpit');$('cockpitButton').setAttribute('aria-pressed',String(value==='cockpit'));
 if(!keepView)camera.fov=value==='cockpit'?74:58;camera.near=value==='cockpit'?.025:.1;camera.updateProjectionMatrix();
 if(value!=='cockpit')camera.up.set(0,1,0);
 $('orbitButton').classList.toggle('active',orbit.enabled);
 $('orbitButton').setAttribute('aria-pressed',String(orbit.enabled));
 cameraHint();
 if(orbit.enabled&&ready&&previous!=='orbit'){
  orbit.target.copy(carRoot.position).add(new THREE.Vector3(0,.85,0));
  // A orbita continua a vista externa atual: mesma posicao, enquadramento e campo de visao.
  // De dentro do carro, recua atras dele na direcao do olhar e mira o carro.
  if(!keepView){
   if(previous==='hood'||previous==='cockpit')camera.getWorldDirection(orbitDelta);else orbitDelta.copy(forward);
   if(orbitDelta.setY(0).lengthSq()<1e-6)orbitDelta.copy(forward).setY(0);
   camera.position.copy(orbit.target).addScaledVector(orbitDelta.normalize(),-7).add(new THREE.Vector3(0,2.8,0));
  }
  // A aerea fica alem do alcance normal: a orbita comeca na mesma distancia.
  orbit.maxDistance=keepView&&previous==='aerial'?Math.max(ORBIT_MAX_DISTANCE,camera.position.distanceTo(orbit.target)):ORBIT_MAX_DISTANCE;
  camera.getWorldDirection(aimView);orbitTilt();orbit.update();
  if(keepView)aimOffset(aimToCar.subVectors(orbit.target,camera.position).normalize(),aimView,orbitAim);else orbitAim.yaw=orbitAim.pitch=0;
  aimOrbit();orbitSeen.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));orbitSpeedFov=keepView&&(previous==='chase'||previous==='close');
 }
}
// Mouse, wheel and touch turn the current view into the orbit; C still moves on from that view.
function orbitFromView(){if(mode==='orbit')return;const from=mode;setCameraMode('orbit');orbitFrom=from;}
function nextCameraMode(){
 const step=m=>cameraModes[(cameraModes.indexOf(m)+1)%cameraModes.length],next=step(orbitFrom??mode);
 return next===mode?step(next):next;
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
 if(e.pointerType==='mouse'&&!lockUnavailable&&$('view').requestPointerLock){
  e.stopImmediatePropagation();
  if(pointerLocked||lockPending)return;
  lockPending=true;
  try{const request=$('view').requestPointerLock();request?.catch(lockFailed);}catch{lockFailed();}
 }else{orbitFromView();$('view').classList.add('dragging');}
},{capture:true});
document.addEventListener('pointerlockchange',()=>{
 const wasLocked=pointerLocked;pointerLocked=document.pointerLockElement===$('view');lockPending=false;
 if(pointerLocked&&paused){document.exitPointerLock();return;}
 orbit.enableRotate=!pointerLocked;document.body.classList.toggle('pointer-locked',pointerLocked);$('view').classList.remove('dragging');
 cameraReturn.manual(performance.now());cameraHint();
 if(pointerLocked)status('');
 // Escape releases the lock without a keydown: that opens the menu. The pause (P) releasing it,
 // or the window going to another app, only pauses with the track on screen.
 if(wasLocked&&!pointerLocked&&!held&&!pitstop?.opened&&!immersive?.blockingUI()){if(document.hasFocus()&&!document.hidden)menu(true);else hold(true);}
});
document.addEventListener('pointerlockerror',lockFailed);
document.addEventListener('mousemove',e=>{
 // On foot (pit stop, story-mode paddock) and on the podium the mouse belongs to that camera.
 if(!pointerLocked||paused||pitstop?.opened||immersive?.ownsMouse()||(!e.movementX&&!e.movementY))return;
 if(isInside()){
  // The cockpit turns right round; while B holds the look back, the look to return to stays put.
  if(!lookBack.held)turnHead(headLook,e.movementX,e.movementY,mode==='cockpit'?HEAD_YAW_COCKPIT:HEAD_YAW_HOOD);
 }else{
  orbitFromView();
  orbit.rotateLeft(e.movementX*.0025);orbit.rotateUp(e.movementY*.0025);
 }
 cameraReturn.manual(performance.now());
});
$('view').addEventListener('pointermove',e=>{if(!pointerLocked&&e.buttons)cameraReturn.manual(performance.now());});
window.addEventListener('pointerup',()=>$('view').classList.remove('dragging'));
$('view').addEventListener('pointercancel',()=>$('view').classList.remove('dragging'));
$('view').addEventListener('wheel',e=>{if(ready&&!paused&&!pitstop?.opened&&!immersive?.ownsMouse()){if(pointerLocked&&isInside()){e.stopImmediatePropagation();return;}orbitFromView();cameraReturn.manual(performance.now());}},{capture:true,passive:true});
// The rival the cameras watch in the recon lap (null: the player's own car).
function watchedRival(){
 if(!watched||!automatic||!immersive||immersive.active)return null;
 const obj=immersive.visual.rivals[watched-1],rival=immersive.rivals[watched-1];
 return obj&&rival?{obj,car:rival.car,entry:obj.userData.entry}:null;
}
function watchNext(step=1){
 if(!ready||!automatic||immersive.active)return;
 const n=immersive.visual.rivals.length+1;watched=((watched+step)%n+n)%n;
 followInitialized=false;tvCamera?.reset();headLook.yaw=headLook.pitch=0;lookBack.reset();
 const rival=watchedRival();if(rival)watchForward.set(1,0,0).applyQuaternion(rival.obj.quaternion);
 cabinVisibility();hud();
}
// Follow cameras sit behind the smoothed heading and look ahead of the car.
const followsCar=m=>m==='chase'||m==='close'||m==='aerial';
function followPose(m,p,vel,ahead=chaseForward){
 if(m==='aerial'){desired.copy(p).addScaledVector(ahead,-40).add(new THREE.Vector3(0,95,35));look.copy(p).addScaledVector(ahead,22);}
 else if(m==='close'){desired.copy(p).addScaledVector(ahead,-5.6-Math.min(vel*.02,1)).add(new THREE.Vector3(0,2.2,0));look.copy(p).addScaledVector(ahead,9).add(new THREE.Vector3(0,.9,0));}
 else{desired.copy(p).addScaledVector(ahead,-9-Math.min(vel*.035,2)).add(new THREE.Vector3(0,3.8,0));look.copy(p).addScaledVector(ahead,13).add(new THREE.Vector3(0,1,0));}
}
function updateCamera(dt){
 if(pitstop?.opened)return;
 if(immersive?.active&&['crowd','podium'].includes(immersive.state.phase)&&!immersive.inCar){const p=immersive.visual.hero.getWorldPosition(new THREE.Vector3());sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 const rival=watchedRival(),subject=rival?.car??car,p=rival?rival.obj.position:carRoot.position,vel=Math.hypot(subject.vx,subject.vy);
 // A watched rival's nose, smoothed as chaseForward is for the player's car.
 if(rival){rival.obj.updateMatrixWorld(true);watchTarget.set(1,0,0).applyQuaternion(rival.obj.quaternion);if(subject.upright<.6&&vel>2)watchTarget.set(subject.vx,0,-subject.vy).normalize();watchForward.lerp(watchTarget,dt>=1?1:1-Math.exp(-dt*30)).normalize();}
 const ahead=rival?watchForward:chaseForward,heading=rival?watchTarget:forward;if(immersive?.visual)immersive.visual.focus=rival?.obj.position??null;
 if(gridPreview()){wasGridPreview=true;camera.fov=58;camera.updateProjectionMatrix();camera.position.copy(p).addScaledVector(forward,-8.5).add(new THREE.Vector3(0,3.5,0));camera.up.set(0,1,0);camera.lookAt(p.clone().addScaledVector(forward,16).add(new THREE.Vector3(0,1,0)));sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();return;}
 if(wasGridPreview){wasGridPreview=false;followInitialized=false;camera.fov=mode==='cockpit'?74:58;camera.updateProjectionMatrix();}
 // Holding B counts as looking around: the 3 s return waits until it is let go.
 const photo=mode==='cockpit'&&!rival?cockpitView:null,lookingBack=lookBackAllowed()&&pressed('KeyB');
 if(lookingBack)cameraReturn.manual(performance.now());
 const centering=cameraReturn.update(performance.now(),vel,paused),blend=1-Math.exp(-dt*2.8);
 // Speed widens the view a little; rough ground and very high speed add a fine shake.
 const speedFov=photo?photo.fov:(mode==='cockpit'?74:58)+(mode==='aerial'||mode==='orbit'&&!orbitSpeedFov?0:clamp((vel-12)/45,0,1)*(mode==='cockpit'?5:7));
 if(mode!=='tv'&&Math.abs(camera.fov-speedFov)>.01){camera.fov=dt>=1||photo?speedFov:camera.fov+(speedFov-camera.fov)*(1-Math.exp(-dt*3));camera.updateProjectionMatrix();}
 const shakeTime=performance.now()/1000,shake=photo||paused||mode==='aerial'||mode==='orbit'?0:roughRide*.05+clamp((vel-42)/18,0,1)*.01;
 if(centering&&isInside()){headLook.yaw*=1-blend;headLook.pitch*=1-blend;}
 lookBack.update(dt,lookingBack,headLook,headView);
 if(mode==='cockpit'||mode==='hood'){
  // Fixed local mount keeps the hood/dashboard still relative to the camera; turned far
  // round in the cockpit, the head leans in toward the middle of the car.
  neckTwist(mode==='cockpit'&&!photo?headView.yaw:0,twist);
  // A watched rival carries both cameras at the same places in its own body, beside its driver.
  const mount=rival?rival.obj.matrixWorld:carBody.matrixWorld;
  const view=photo??headView,eye=photo?photoEye:mode==='hood'?hoodEye:headEye.fromArray(twist).add(cockpit.eye),drop=photo?0:.20;
  carRoot.updateMatrixWorld(true);camera.position.copy(eye).applyMatrix4(mount);
  look.set(Math.cos(view.pitch)*Math.cos(view.yaw)*20,Math.sin(view.pitch)*20-drop,Math.cos(view.pitch)*Math.sin(view.yaw)*20).add(eye).applyMatrix4(mount);
  camera.position.y+=Math.sin(shakeTime*41)*shake*.35;look.y+=Math.sin(shakeTime*29+1.3)*shake*2;
  camera.up.set(0,1,0).transformDirection(mount);camera.lookAt(look);if(photo?.roll)camera.rotateZ(photo.roll);
 } else if(mode==='orbit'){
  orbitTarget.copy(p).add(new THREE.Vector3(0,.85,0));
  orbitDelta.subVectors(orbitTarget,orbit.target);camera.position.add(orbitDelta);orbit.target.copy(orbitTarget);
  orbitTilt();orbit.update();
  orbitSphere.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));
  // A sideways framing only fits the view it came from: turning the orbit by hand lets it go,
  // or the car would slide off to the side as the camera comes down towards the horizon.
  orbitAim.yaw*=Math.exp(-4*(Math.abs(wrap(orbitSphere.theta-orbitSeen.theta))*Math.sin(orbitSphere.phi)+Math.abs(orbitSphere.phi-orbitSeen.phi)));
  if(centering){
   // The mouse only looked around a follow camera: return to that camera's own place. Otherwise go behind the car.
   if(followsCar(orbitFrom)){
    followPose(orbitFrom,p,vel,ahead);
    // That camera frames the road ahead, not the car: blend the aim to its framing too.
    aimOffset(aimToCar.subVectors(orbit.target,desired).normalize(),aimView.subVectors(look,desired).normalize(),orbitHomeAim);
    orbitAim.yaw+=wrap(orbitHomeAim.yaw-orbitAim.yaw)*blend;orbitAim.pitch+=(orbitHomeAim.pitch-orbitAim.pitch)*blend;
    orbitHome.setFromVector3(desired.sub(orbit.target));
   }
   else orbitHome.set(Math.min(orbitSphere.radius,ORBIT_MAX_DISTANCE),1.25,Math.atan2(-heading.x,-heading.z));
   orbitSphere.theta+=wrap(orbitHome.theta-orbitSphere.theta)*blend;
   orbitSphere.phi+=(orbitHome.phi-orbitSphere.phi)*blend;
   orbitSphere.radius+=(orbitHome.radius-orbitSphere.radius)*blend;orbit.maxDistance=Math.max(ORBIT_MAX_DISTANCE,orbitSphere.radius);
   camera.position.copy(orbit.target).add(orbitDelta.setFromSpherical(orbitSphere));orbit.update();
  }
  // Evita entrar no solo nas subidas e nas bordas inclinadas da pista.
  const ground=car.sample(camera.position.x,-camera.position.z).z;
  camera.position.y=Math.max(camera.position.y,ground+.3);
  cameraRayDirection.subVectors(camera.position,orbit.target);
  cameraRay.far=cameraRayDirection.length();cameraRay.set(orbit.target,cameraRayDirection.normalize());
  // An orbit that began in the aerial view keeps flying up there; only the nearer orbits come in past walls.
  const obstruction=orbit.maxDistance>ORBIT_MAX_DISTANCE?null:cameraRay.intersectObjects(cameraObstacles,false)[0];
  if(obstruction)camera.position.copy(orbit.target).addScaledVector(cameraRayDirection,Math.max(.2,obstruction.distance-.3));
  aimOrbit();orbitSeen.setFromVector3(orbitDelta.subVectors(camera.position,orbit.target));
 } else if(mode==='tv'){
  tvCamera.update(camera,p,subject.surface.s,tvVelocity.set(subject.vx,0,-subject.vy),dt);
 } else {
 followPose(mode,p,vel,ahead);
 // Smooth the offset, not the world position: frame-rate changes must not
 // make the car surge back and forth relative to its following camera.
 desired.sub(p);if(!followInitialized){followOffset.copy(desired);followInitialized=true;}else followOffset.lerp(desired,1-Math.exp(-dt*5));
 camera.position.copy(p).add(followOffset);camera.position.y+=Math.sin(shakeTime*37)*shake;camera.position.x+=Math.sin(shakeTime*31+.7)*shake*.6;camera.up.set(0,1,0);camera.lookAt(look);
 }
 sun.position.copy(p).add(sunOffset);sun.target.position.copy(p);sun.target.updateMatrixWorld();
}
const pressed=code=>keys.has(code)||mobile?.pressed.has(code);
function input(){return {ignition:pressed('KeyI')?1:0,throttle:Math.max(pressed('KeyW')||pressed('ArrowUp')?1:0,mobile?.throttle??0),brake:Math.max(pressed('KeyS')||pressed('ArrowDown')?1:0,mobile?.brake??0),left:Math.max(pressed('KeyA')||pressed('ArrowLeft')?1:0,-(mobile?.steering??0)),right:Math.max(pressed('KeyD')||pressed('ArrowRight')?1:0,mobile?.steering??0),reverse:pressed('KeyQ')?1:0,handbrake:pressed('Space')?1:0};}
// The recon lap races the Opala 99 with the rivals' racecraft (RaceField.heroInput). Each physics
// step asks for a new command; the sound and the driver's hands reuse the last one.
let heroCommand=null;
function pilot(step=0){
 if(step||!heroCommand)heroCommand=immersive&&!immersive.active?immersive.field.heroInput(car,step||1/120):recognitionInput(car);
 return {...heroCommand};
}
function hud(){
 const fuel=immersive?.active?immersive.state.fuel:immersive?.freeFuel??12,staged=immersive?.active&&['crowd','podium'].includes(immersive.state.phase);$('fuelGauge').classList.toggle('hidden',!!staged);$('fuelGauge').classList.toggle('reserve',fuel<1);$('fuelVolume').textContent=fuel.toFixed(1)+' L';$('fuelBar').value=fuel;$('fuelStatus').textContent=fuel<=0?(immersive?.active?'TANQUE VAZIO':'VAZIO · R PARA REABASTECER'):fuel<1?'RESERVA':immersive?.active&&immersive.state.tankDetached?'VAZAMENTO':'COMBUSTÍVEL';const p=car.surface,watch=watchedRival(),shown=watch?.car??car,speed=Math.hypot(shown.vx,shown.vy)*3.6;
 $('speed').textContent=Math.round(speed);$('gear').textContent=watch?watch.car.gear:carAudio.state.gear;$('rev').style.width=`${(watch?watch.car.rpm:carAudio.state.rpm)/7400*100}%`;
 // Recon lap: the Piloto button (N) names the driver the cameras watch; speed and gear are that car's.
 const touring=automatic&&!immersive.active;$('watchButton').hidden=!touring;if(touring)$('watchButton').textContent=watch?`Piloto: #${watch.entry.number} ${watch.entry.shortName} (N)`:'Piloto: você (N)';
 $('grade').textContent=`${(p.grade*100).toFixed(1).replace('.',',')}%`;$('bank').textContent=`${(p.bank*100).toFixed(1).replace('.',',')}%`;$('alt').textContent=circuit.altitude===null?'—':`${(p.z+circuit.altitude).toFixed(1)} m`;
 $('lap').textContent=`${Math.min(car.laps+1,immersive.active?immersive.storyLaps:immersive.freeTotalLaps)} / ${immersive.active?immersive.storyLaps:immersive.freeTotalLaps}`;$('racePosition').textContent=`${immersive.active?immersive.state.result?.position??immersive.state.position:immersive.freePosition}º / ${GRID_SIZE}`;$('timer').textContent=fmt(car.clock-car.lapStart);$('best').textContent=fmt(car.best);const rejected=car.lastLapValid===false&&car.clock-car.lapStart<10;$('valid').textContent=rejected?(car.lastInvalidReason==='pit'?'Volta não contou · excesso de velocidade nos boxes':'Volta não contou · trecho cortado ou incompleto'):car.lapValid?'Volta válida':car.invalidReason==='pit'?`Volta inválida · ${Math.round(car.pitPenalty?.kmh??0)} km/h nos boxes (máx. 60)`:'Volta inválida · trecho cortado';$('valid').hidden=car.lapValid&&!rejected;$('valid').style.color=car.lapValid&&!rejected?'#e2fb57':'#ffb789';
 $('surface').textContent=automatic?(watch?`RECONHECIMENTO · #${watch.entry.number} ${watch.entry.shortName.toUpperCase()}`:'RECONHECIMENTO AUTOMÁTICO'):p.pit&&data.pit?(car.limiter?'PIT LANE · MÁX. 60 km/h':'PIT LANE'):p.onRoad?'ASFALTO · SESSÃO LIVRE':'FORA DA PISTA · ADERÊNCIA REDUZIDA';$('location').textContent=p.pit&&data.pit?'Pit lane · boxes':location(p.s);drawMap();
 // Jumps and crashes take over the surface line while they last.
 const crash=car.upright<.45?(car.overturned>0?`CAPOTADO · FISCAIS DESVIRAM EM ${Math.max(1,Math.ceil(RIGHTING_DELAY-car.overturned))} s`:'CAPOTANDO!'):car.rightedAt!==null&&car.clock-car.rightedAt<3?'FISCAIS DESVIRARAM O CARRO':car.airTime>.25?'NO AR!':car.pitPenalty&&car.clock-car.pitPenalty.clock<3?'EXCESSO DE VELOCIDADE NOS BOXES · VOLTA INVÁLIDA':'';if(crash)$('surface').textContent=crash;
 else if(mobile.handbrake)$('surface').textContent=touchDevice?'FREIO DE MÃO PUXADO':'FREIO DE MÃO PUXADO · ESPAÇO SOLTA';
}
// Automated browsers (the checks) skip it unless the page asks with ?intro=1; ?intro=0 turns it off.
function introWanted(){const asked=new URLSearchParams(window.location.search).get('intro');return asked==='1'||(asked!=='0'&&!navigator.webdriver);}
function introContext(){
 if(!ready||!car)return null;
 const s=car.surface.s,a=data.samples,L=data.meta.reconstructed_xy_m,probe=new TestCar(data);
 // Track centre line k metres ahead of the car, on the road surface.
 const center=k=>{const t=((s+k)%L+L)%L,i=Math.max(0,a.findIndex(q=>q[0]>=t)),p=a[i];probe.index=i;return new THREE.Vector3(p[1],probe.sample(p[1],p[2]).z,-p[2]);};
 const here=center(0),position=immersive.active?immersive.state.position:immersive.freePosition;
 return {car:carRoot.position.clone(),forward:forward.clone(),inward:here.sub(carRoot.position),center,pilot:immersive.pilotName||'Stevan',position,grid:GRID_SIZE,laps:immersive.active?immersive.storyLaps:immersive.freeTotalLaps,
  circuit:circuit.name,venue:circuit.id==='interlagos'?'Autódromo José Carlos Pace':circuit.label,weather:circuit.id==='interlagos'?'São Paulo · 16h40 · 27 °C · pista seca':'Fim de tarde · 26 °C · pista seca',
  hero:immersive.visual?.hero?immersive.visual.hero.getWorldPosition(new THREE.Vector3()):carRoot.position.clone(),
  // People face their local +x.
  heroForward:immersive.visual?.hero?new THREE.Vector3(1,0,0).applyQuaternion(immersive.visual.hero.getWorldQuaternion(new THREE.Quaternion())):forward.clone()};
}
intro.onEnd=kind=>{
 // Back to the player's own camera; the 3-2-1 beeps now.
 if(!immersive)return;
 if(kind==='race'&&!immersive.active&&immersive.freeCountdown>0)immersive.state.emitSound('countdown');
 camera.fov=mode==='cockpit'?74:58;camera.updateProjectionMatrix();followInitialized=false;
 if(introHidden){for(const o of introHidden)o.visible=true;introHidden=null;}
};
// Visual quality: ?cinema=full|lite|off overrides the saved choice; 'auto' is lite on phones.
function cinematicLevel(){const asked=new URLSearchParams(window.location.search).get('cinema')??preferences.values.cinematic;return ['full','lite','off'].includes(asked)?asked:touchDevice?'lite':'full';}
// The haze thins with height above the circuit's mean ground level.
let hazeData=null,hazeLevel=0;
function hazeBase(){if(hazeData!==data){hazeData=data;const z=data?.terrain?.z;hazeLevel=z?.length?z.reduce((a,b)=>a+b,0)/z.length:0;}return hazeLevel;}
let accumulator=0,lastHud=0,renderedFrame=0,mirrorFrame=0,frameImpact=0;
// Time since the last 1/120 s physics step: cars are drawn where they are at this frame.
const renderAhead=()=>clamp(accumulator,0,1/120);
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
   const total=immersive?.active?immersive.storyLaps:immersive?.freeTotalLaps??3,valid=car.lastLapValid,record=valid&&car.laps>1&&car.best===car.lastLap;
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
function frame(){requestAnimationFrame(frame);const rawDt=clock.getDelta(),dt=Math.min(rawDt,.08);mobile?.update(paused,pitstop?.coffee?'crowd':immersive?.active?immersive.state.phase:'race');if(touchDevice)document.body.classList.toggle('can-look-back',lookBackAllowed());updateCountdown();if(!ready||!sessionStarted){carAudio.updateScene({},[],dt);return;}
 renderedFrame++;if(!paused&&!document.hidden)adaptResolution(rawDt);
 if(intro.active&&automatic)intro.stop();
 if(intro.active&&!immersive.active&&immersive.freeCountdown>0){immersive.freeCountdown=3;$('raceCountdown').hidden=true;}
 if(!immersive.active&&immersive.freeResultReady&&!paused){accumulator=0;menu(true);}
 // The sound is heard from the rival the recon lap watches (N), otherwise from the player's car.
 const heard=watchedRival()?.car??car;
 if(!paused){if(automatic)immersive.recordAssisted=true;accumulator+=dt;while(accumulator>=1/120){const command=automatic?pilot(1/120):input();if(immersive&&!immersive.active&&immersive.freeFuel<=0&&!pitstop?.coffee){command.throttle=0;command.reverse=0;}if(!pitstop?.beforeStep(command,1/120)&&!immersive?.step(command,1/120)){const before=Math.hypot(car.vx,car.vy);car.step(command,1/120);const impact=Math.max(car.wallImpactSpeed??0,car.crashImpactSpeed??0,before-Math.hypot(car.vx,car.vy));if(impact>4){if(heard===car)carAudio.effect('collision');immersive?.wallImpact(impact);frameImpact=Math.max(frameImpact,impact);}const heardBefore=Math.hypot(heard.vx,heard.vy);immersive?.stepFree(1/120,command);if(heard!==car&&Math.max(heard.wallImpactSpeed??0,heard.crashImpactSpeed??0,heardBefore-Math.hypot(heard.vx,heard.vy))>4)carAudio.effect('collision');}lakeContact?.step(car,1/120);skidMarks.update(car,command,1/120);accumulator-=1/120;if(!immersive.active&&immersive.freeResultReady){menu(true);break;}}}
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);updateRecordTvs(performance.now());
 skidMarks.flush();
 tyreSmoke.update(car,skidMarks.wheels,paused?0:dt,renderer.domElement.height);lakeContact?.update(paused?0:dt,renderer.domElement.height);
 const skid=skidMarks.wheels.reduce((sum,w)=>sum+w.strength,0)/4;
 // The same command drives the engine sound and the driver's hands and feet.
 const driveCommand=pitstop?.opened?{throttle:0,brake:1,engineOff:true}:immersive?.audioCommand(automatic?pilot():input())??input();
 const rivalSound=heard!==car?immersive.rivalSound(heard):null;
 carAudio.update(heard,rivalSound?.command??driveCommand,rivalSound?.skid??skid,paused,mode);
 carAudio.updateScene({...immersive?.audioScene(heard),speed:Math.hypot(heard.vx,heard.vy),onRoad:heard.surface.onRoad,camera:mode},immersive?.state.takeSounds()??[],dt);
 sky.update(paused?0:dt);landscape?.update(paused?0:dt,camera);
 // A watched rival is posed by immersive.update below: its camera follows after that.
 updateOpenings(paused?0:dt);updateCar(dt);if(!watchedRival())updateCamera(dt);const phoneArrived=cockpit.update(car,paused?0:dt,heard===car?carAudio.state:null).phoneArrived;if(phoneArrived)carAudio.notifyPhone();driver.update(car,paused?0:dt,{command:driveCommand,impact:frameImpact,phoneArrived});frameImpact=0;lapBanner(paused?0:dt);lastHud+=dt;if(lastHud>.07){hud();lastHud=0;}
 if(immersive?.visual)immersive.visual.renderAhead=renderAhead();immersive?.update(paused?0:dt,camera);if(watchedRival())updateCamera(dt);
 pitstop?.update(paused?0:dt,camera,sessionStarted&&!paused);
 // Marshals, cameramen, crews, the terrace and the café idle; passing cars catch their eye.
 updatePeople(paused?0:dt,camera,[carRoot,...(immersive?.visual?.rivals??[])]);
 raceResults.update(immersive,paused,$('settings').open);
 $('finishFade').classList.toggle('fading',!paused&&immersive.finishing);$('finishFade').style.opacity=String(!paused?immersive.finishOpacity:0);
 // The broadcast camera shows the race without the game's floating name tags.
 if(mode==='tv')for(const rival of immersive.visual.rivals)if(rival.userData.nameLabel)rival.userData.nameLabel.visible=false;
 if(intro.update(paused?0:dt,camera,paused)){
  sun.position.copy(carRoot.position).add(sunOffset);sun.target.position.copy(carRoot.position);sun.target.updateMatrixWorld();
  // Name tags and money signs are game interface: the opening shots go without them.
  if(!introHidden){introHidden=[];scene.traverse(o=>{if(o.isSprite&&o.visible)introHidden.push(o);});}
  for(const o of introHidden)o.visible=false;
 }
 // The results sheet is opaque; avoid spending mobile GPU time behind it.
 if(!raceResults.root.hidden)return;
 // Render the reflection from this frame's car pose before displaying the cockpit.
 // A simulation-time timer made the mirror visibly stutter, especially at low FPS.
 const watchedCar=watchedRival();
 if(mode==='cockpit'&&!gridPreview()&&!watchedCar){
  // The mirror sees the road behind, not the body round it (the classic view hides it anyway).
  const bodyShown=!!model?.visible;cockpit.root.visible=false;driver.root.visible=false;if(model)model.visible=false;
  cockpit.rearCamera.position.set(-.65,1.14,0).applyMatrix4(carBody.matrixWorld);
  look.set(-30,1.14,0).applyMatrix4(carBody.matrixWorld);
  cockpit.rearCamera.up.set(0,1,0).transformDirection(carBody.matrixWorld);cockpit.rearCamera.lookAt(look);
  const oldShadowUpdate=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
  tyreSmoke.material.uniforms.viewport.value=cockpit.mirrorTarget.height;
  renderer.setRenderTarget(cockpit.mirrorTarget);renderer.render(scene,cockpit.rearCamera);renderer.setRenderTarget(null);
  tyreSmoke.material.uniforms.viewport.value=renderer.domElement.height;
  mirrorFrame=renderedFrame;
  renderer.shadowMap.autoUpdate=oldShadowUpdate;cockpit.root.visible=true;driver.root.visible=true;if(model)model.visible=bodyShown;
 }
 // Long lenses (broadcast camera, opening shots) get depth of field focused on their subject.
 const subject=watchedCar?.car??car,dof=intro.active?intro.dof:mode==='tv'?{focus:camera.position.distanceTo(watchedCar?.obj.position??carRoot.position),amount:.35}:null;
 cinematic.render(scene,camera,{dt:paused?0:dt,speed:Math.hypot(subject.vx,subject.vy),mode,hazeBase:hazeBase(),dof});
}
function renderClassification(){
 const rows=[...(immersive.freeOrder??[])];
 rows.splice(immersive.freePosition-1,0,PLAYER_ENTRY);const list=$('finishingOrder');list.replaceChildren();
 rows.forEach((entry,i)=>{const row=document.createElement('li');row.classList.toggle('player-row',entry.number==='99');row.textContent=`${i+1}º · #${entry.number} ${entry.shortName}`;list.append(row);});
}
// A paused session that #start can resume (a finished free race can only be run again).
function resumable(){return sessionStarted&&(immersive?.active||!immersive?.freeResultReady);}
function updateMenuLabels(){pilotPicker.root.hidden=sessionStarted;$('circuitPicker').hidden=sessionStarted;const finished=!immersive?.active&&!!immersive?.freeResultReady;$('menu').classList.toggle('race-finished',finished);$('finishingOrder').hidden=!finished;if(finished)renderClassification();document.querySelector('#menu h1').textContent=finished?'Fim de corrida.':`Uma volta em ${circuit.name}.`;document.querySelector('#menu .eyebrow').textContent=finished?'BANDEIRADA / RESULTADO FINAL':'OLD STOCK / TEST DAY';const resume=resumable(),loadingStory=loading&&!resume&&preferences.values.immersive;$('start').textContent=loading&&!loadingStory?'Carregando circuito…':resume?'Voltar à pista →':finished?'Correr novamente →':'Modo Corrida →';$('storyStart').textContent=loadingStory?'Carregando circuito…':'Modo História →';$('storyStart').hidden=resume;$('restartRace').hidden=!resume;$('settingsResume').hidden=!sessionStarted||(!immersive?.active&&immersive?.freeResultReady);$('settingsRestart').hidden=$('settingsResume').hidden;$('raceResult').hidden=immersive?.active||!immersive?.freeResultReady;if(!immersive?.active&&immersive?.freeResultReady)$('raceResult').textContent=`Bandeirada! ${immersive.freePosition}º de ${GRID_SIZE} · ${immersive.freeTotalLaps} voltas · ${fmt(immersive.finishTime??car.clock)}`;}
function resumeRace(){if(!sessionStarted||(!immersive.active&&immersive.freeResultReady))return;$('settings').close();menu(false);}
$('settingsResume').onclick=resumeRace;
// P, or the window losing focus (another app, a screenshot tool), freezes the race and keeps it
// on screen under a small badge; Escape opens the menu.
let held=false;
function hold(on){
 if(!ready||on===held||on&&paused)return;
 held=on;paused=on;carAudio.setPaused(on);if(!on)carAudio.unlock();
 if(on&&document.pointerLockElement===$('view'))document.exitPointerLock();
 keys.clear();mobile?.clear();cameraReturn.reset(performance.now());$('pauseBadge').hidden=!on;
}
$('pauseBadge').onclick=()=>hold(false);
function menu(show){held=false;$('pauseBadge').hidden=true;if(!show&&!immersive?.active&&immersive?.freeResultReady)show=true;paused=show;updateMenuLabels();carAudio.setPaused(show);if(!show)carAudio.unlock();if(show&&document.pointerLockElement===$('view'))document.exitPointerLock();cameraReturn.reset(performance.now());$('menu').classList.toggle('hidden',!show);keys.clear();mobile?.clear();status(show?'':automatic?'Reconhecimento automático · W para assumir o volante':'');}
const openSettings=setupSettings(()=>menu(true),returnToMainMenu);
const lapRecords=new LapRecords(circuit.id),raceResults=new RaceResults({onRestart:()=>beginRace(true),onSettings:openSettings,onRecords:mode=>lapRecords.open(mode),onMainMenu:returnToMainMenu,
 // Closing the sheet opens the podium: that click also gives the mouse to its free camera.
 onPodium:()=>{if(immersive){immersive.podiumCamera=true;immersive.mouseFree=false;immersive.captureMouse();}}});
const pilotPicker=new PilotPicker(),automaticRecords=new AutomaticRecords(pilotStorage()),automaticAIRecords=new AutomaticAIRecords(pilotStorage());
$('recordsButton').onclick=()=>{lapRecords.circuit=circuit.id;lapRecords.open();};
$('settingsButton').onclick=openSettings;
mobile=new MobileControls({enabled:touchDevice,onMenu:openSettings,onCamera:()=>{if(ready)setCameraMode(nextCameraMode());},onSkin:cycleLivery,onReset:()=>{if(ready&&!immersive.finishing){if(!immersive?.handleKey('KeyR'))reset(true);}},onUnlock:()=>carAudio.unlock()});
document.addEventListener('keydown',e=>{
 if(lapRecords.dialog.open)return;
 if(pitstop?.opened&&!$('settings').open){if(e.code==='Escape')openSettings();else if(e.code==='KeyP')hold(!held);else if(!paused){if(pitstop.coffee&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}if(!e.repeat&&pitstop.handleKey(e.code))e.preventDefault();}return;}
 if($('settings').open){if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}return;}
 if(['INPUT','SELECT'].includes(e.target.tagName)&&!['Escape','KeyP'].includes(e.code))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code!=='Space')keys.add(e.code);if(e.repeat||!ready)return;
 if(!paused&&immersive?.handleKey(e.code)){e.preventDefault();return;}
 // Space pulls the handbrake and leaves it pulled until the next press, like the touch button.
 if(e.code==='Space'&&!paused)mobile.setHandbrake(!mobile.handbrake);
 if(e.code==='KeyC')setCameraMode(nextCameraMode());
 if(e.code==='KeyN')watchNext(e.shiftKey?-1:1);
 if(e.code==='KeyR'&&!immersive.finishing)reset(true);
 if(e.code==='KeyM'){carAudio.toggleMute();audioControls();}
 if(e.code==='KeyV')cycleLivery();
 // P pauses on the track (from the menu it resumes, as before); Escape opens the menu.
 if(e.code==='KeyP'){if(held||!paused)hold(!held);else menu(false);}
 if(e.code==='Escape')menu(true);
 // Taking the wheel ends the recon lap: the cameras come back to the player's car.
 if(automatic&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){automatic=false;status('');if(watched){watched=0;followInitialized=false;tvCamera?.reset();}}
});document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('focus',()=>carAudio.setFocused(!document.hidden));window.addEventListener('blur',()=>{carAudio.setFocused(false);keys.clear();mobile?.clear();hold(true);});
document.addEventListener('visibilitychange',()=>{carAudio.setFocused(!document.hidden&&document.hasFocus());if(document.hidden)hold(true);});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer?.setSize(innerWidth,innerHeight,false);mobile?.clear();if(touchDevice&&innerHeight>innerWidth&&ready)menu(true);});
$('orbitButton').onclick=()=>{if(ready)setCameraMode(mode==='orbit'?'chase':'orbit');};
$('cockpitButton').onclick=()=>{if(ready)setCameraMode(mode==='cockpit'?'chase':'cockpit');};
$('skinButton').onclick=cycleLivery;
$('watchButton').onclick=()=>watchNext(1);
async function beginRace(restart=false,tour=false,story=preferences.values.immersive){
 if(loading)return;
 const continuing=sessionStarted&&!restart&&!tour&&story===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 const pilot=continuing?immersive.pilotName:pilotPicker.commit();if(!pilot)return;
 if(story!==preferences.values.immersive)chooseImmersive(story);
 if(!await loadCircuit())return;
 const same=sessionStarted&&preferences.values.immersive===immersive.active&&!(!immersive.active&&immersive.freeResultReady);
 if(same&&!restart&&!tour){menu(false);return;}
 automaticRecords.start(pilot);immersive.pilotName=pilot;immersive.recordSaveError='';
 pitstop?.reset();automatic=false;watched=0;
 if(preferences.values.immersive){immersive.start();}
 else{if(immersive.active)immersive.disable();reset();setCameraMode('chase');updateCar(1);updateCamera(1);}
 if(!immersive.active&&!tour)immersive.beginCountdown();
 sessionStarted=true;automatic=tour&&!immersive.active;menu(false);
}
function returnToMainMenu(){
 automaticRecords.update(immersive);automaticAIRecords.update(immersive);
 pitstop?.reset();$('settings').close();lapRecords.dialog.close();
 if(ready){immersive.disable();reset();}
 sessionStarted=false;automatic=false;watched=0;raceResults.root.hidden=true;menu(true);showCircuitSelection();
}
// Paused: #start resumes the running session. Otherwise each button starts its own mode.
$('start').onclick=()=>beginRace(false,false,resumable()&&preferences.values.immersive);
$('storyStart').onclick=()=>beginRace(false,false,true);
$('restartRace').onclick=()=>beginRace(true);
$('settingsRestart').onclick=()=>{$('settings').close();beginRace(true);};
$('tour').onclick=()=>{$('settings').close();beginRace(true,true,false);};$('menuButton').onclick=openSettings;$('camera').onchange=e=>setCameraMode(e.target.value);$('livery').onchange=async e=>{preferences.update({livery:e.target.value});if(!ready||!sessionStarted)return;try{await setLivery(e.target.value);}catch(err){status('Não foi possível carregar a pintura. Tente novamente.');console.error(err);}};
// Keep the car and audio session; release the previous circuit before loading another.
function clearCircuit(){
 intro.stop();const retired=[];
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
 tyreSmoke?.reset();lakeContact=null;accumulator=0;followInitialized=false;
 window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
}
async function loadCircuit(){
 const reuse=ready&&loadedCircuit===circuit.id;
 loading=true;ready=false;if(window.interlagos)window.interlagos.ready=false;$('start').disabled=true;$('storyStart').disabled=true;$('tour').disabled=true;$('livery').disabled=true;
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
  // The ground is the one the car drives on, lowered wherever it would rise through asphalt, kerbs, pit floors or stands.
  const groundFit=fitGround(data);
  track.scene.traverse(o=>{if(!o.isMesh||o.material?.name!=='GeoSampa_Ortofoto_2020')return;const photo=o.material;ortho=readOrtho(photo.map,o.geometry);if(!applyGroundHeights(o.geometry,data,groundFit.heights))console.warn('Terreno do GLB fora da grade de pista.json; relevo sem ajuste.');o.material=terrainMaterial(terrainTextures,landscapeField,{ortho:photo.map,mobile:touchDevice});o.material.userData.terrain=true;photo.map=null;photo.dispose();});
  // Lakes come out of the orthophoto: their beds, already dug in the physics ground, are dug into the
  // visible terrain too, before flattenStatic copies it into the static batches.
  landscape=createLandscape({data,field:landscapeField,ortho,mobile:touchDevice});
  if(landscape.digLakeBeds(groundFit.heights))track.scene.traverse(o=>{if(o.material?.userData.terrain)applyGroundHeights(o.geometry,data,groundFit.heights);});
  if(landscape.stats.water){lakeContact=new LakeContact({water:landscape.water,mobile:touchDevice,onSound:(name,options)=>carAudio.effect(name,options)});scene.add(lakeContact.mesh);}
  const legacyStands=flattenStatic(track.scene).length;
  const stands=createGrandstands(data,terrainTextures,(x,y)=>groundHeight(data.terrain,groundFit.heights,x,y));scene.add(stands.root);cameraObstacles.push(...stands.obstacles);standTops=stands.rows;
  Object.assign(landscape.stats,{ground:groundFit.stats,stands:stands.stats,legacyStands});
 }
 scene.add(landscape.root);
 const crowd=createCrowd(standTops,{mobile:touchDevice});scene.add(crowd.root);landscape.stats.fans=crowd.count;if(!model||activeLivery!==$('livery').value)await setLivery($('livery').value);
 const guardrails=createGuardrails(data);scene.add(guardrails.root);cameraObstacles.push(guardrails.rails);
 scene.add(createCurbs(data));
 // Surveyed pit lane: entry after the Cafe, garages, exit around the S do Senna.
 let pitLayout=null;if(data.pit){const pitLaneScene=createInterlagosPit(data,roadSurface,terrainTextures);scene.add(pitLaneScene.root);cameraObstacles.push(...pitLaneScene.obstacles);pitLayout=pitLaneScene.box;}
 // Curvelo: the same garage row and Box 99, on the infield behind its service lane.
 else if(circuit.id==='curvelo'){const pitScene=createCurveloPit(data,terrainTextures);scene.add(pitScene.root);cameraObstacles.push(...pitScene.obstacles);pitLayout=pitScene.box;}
 recordTvs=pitLayout?.showRecords?pitLayout:null;recordTvsKey='';recordTvsAt=0;
 const branding=await createTrackBranding(data);scene.add(branding.root);
 // Race-day dressing: sponsor banners on the rails, marshal posts and TV towers (trackside.js).
 trackside=createTrackside(data);scene.add(trackside.root);landscape.clearAround(trackside.clearings);landscape.stats.trackside=trackside.stats;
 // Broadcast view: the towers and low verge cameras film the car with a long lens.
 const tvProbe=new TestCar(data),tvObstacles=[...cameraObstacles];branding.root.traverse(o=>{if(o.isMesh)tvObstacles.push(o);});
 tvCamera=new TvCamera(data,trackside.towers,(x,y,i)=>{tvProbe.index=i;return tvProbe.sample(x,y).z;},tvObstacles);
 landscape.clearAround(tvCamera.cameras.filter(c=>!c.tower).map(c=>({x:c.position.x,y:-c.position.z,r:3.5})));
 restBodyPose();
 immersive=new ImmersiveMode({scene,carRoot,car,data,driver,rivalTemplate:model,skidMarks,layout:pitLayout,obstacles:cameraObstacles,setView:setCameraMode,getView:()=>mode,resetVehicle:()=>reset(),releaseMouse:()=>{keys.clear();mobile?.clear();if(document.pointerLockElement)document.exitPointerLock();},onNormal:()=>{chooseImmersive(false);reset();menu(true);}});
 immersive.onMainMenu=returnToMainMenu;immersive.laps=preferences.values.laps;immersive.visual.viewCamera=camera;
 // Sessions started from the menu open with the cinematic intro (the 3-2-1 waits for it).
 const beginCountdown=immersive.beginCountdown.bind(immersive),startStory=immersive.start.bind(immersive);
 immersive.beginCountdown=()=>{beginCountdown();if(paused&&!automatic&&introWanted()){immersive.state.sounds=immersive.state.sounds.filter(sound=>sound.name!=='countdown');intro.play('race',introContext);}};
 immersive.start=()=>{startStory();if(paused&&introWanted())intro.play('story',introContext);};
 const disableStory=immersive.disable.bind(immersive);immersive.disable=()=>{intro.stop();disableStory();};
 // Box 99: Curvelo's service lane, or the surveyed garage at Interlagos.
 if(circuit.id==='curvelo'||pitLayout)pitstop=new PitStop({scene,car,carRoot,driver,mode:immersive,data,roadSurface,layout:pitLayout,obstacles:cameraObstacles,openings,onOpen:()=>{automatic=false;keys.clear();mobile?.clear();mobile?.setHandbrake(false);setCameraMode('chase');if(document.pointerLockElement)document.exitPointerLock();},onClose:()=>{keys.clear();mobile?.clear();followInitialized=false;},onSettings:openSettings});
 pitstop?.setDamage(preferences.values.damage);
 landscape.setRealisticWater(preferences.values.realisticWater);
 const kleber=immersive.visual.rivals.find(o=>o.userData.entry.number==='70');
 const oldStockMaterial=new THREE.MeshBasicMaterial({map:branding.oldStock,polygonOffset:true,polygonOffsetFactor:-2});
 for(const side of [-1,1]){const decal=new THREE.Mesh(new THREE.PlaneGeometry(.64,.43),oldStockMaterial);decal.position.set(.95,.75,side*.941);decal.rotation.y=side<0?Math.PI:0;decal.name='OldStock_no_Opala70';kleber.add(decal);}
 const roster=$('gridRoster');roster.replaceChildren();for(const entry of [...RIVAL_ROSTER,PLAYER_ENTRY]){const row=document.createElement('li');row.textContent=`#${entry.number} · ${entry.name}${entry.number==='99'?' · VOCÊ':` · Ritmo ${entry.level}/100`}`;roster.append(row);}
 // Compile the new programs while the loading label is still shown, instead of
 // freezing the first race frame (D3D shader compilation is slow on Windows).
 updateCar(1);updateCamera(1);try{await cinematic.compile(scene,camera);await landscape.compileWater(renderer,scene,camera);}catch(err){console.warn(err);}
 ready=true;loadedCircuit=circuit.id;setCameraMode(preferences.values.camera);$('skinButton').disabled=false;updateCar(1);cockpit.update(car,0);driver.update(car,0);updateCamera(1);cameraHint();hud();$('start').disabled=false;
 window.interlagos={ready:true,circuit:circuit.id,car,renderAhead,telemetry:()=>car.telemetry(),setLivery,reset:()=>reset(),reposition:index=>{car.reset(index);driver.reset();skidMarks.breakTrails();tyreSmoke.reset();carAudio.reset();cockpit.resetPhone();updateCar(1);updateCamera(1);},setTour:value=>{if(immersive.active)return;automatic=value;menu(false);},
  immersiveInfo:()=>immersive.info(),pitInfo:()=>pitstop?.info()??null,
  audioInfo:()=>carAudio.info(),mobileInfo:()=>({enabled:touchDevice,steering:mobile?.steering??0,throttle:mobile?.throttle??0,brake:mobile?.brake??0,pressed:[...(mobile?.pressed??[])],pixelRatio:renderer.getPixelRatio()}),
  cinematicInfo:()=>({...cinematic.info(),adaptation:cinematic.adaptation()}),tvInfo:()=>tvCamera.info(),tvCamera:()=>tvCamera,introInfo:()=>intro.info(),skipIntro:()=>intro.stop(),setCinematic:level=>cinematic.setLevel(level),cinematicLook:patch=>Object.assign(cinematic.look,patch||{}),
  skidInfo:()=>skidMarks.info(),smokeInfo:()=>tyreSmoke.info(),sceneryInfo:()=>({...landscape.stats,sky:sky.info()}),waterInfo:()=>landscape.waterInfo(),lakeInfo:()=>lakeContact?.info()??null,waterAt:(x,y)=>landscape.water.at(x,y),
  structureInfo:()=>({revision:'v04_fechamentos',parts:carStructure.children.length,visible:carStructure.visible}),
  openingsInfo:()=>openings.info(),holdOpening:(name,on=true)=>openings.hold(name,'teste',on),
  // materials: those shown on the rival (whatever its distance detail), numbers: its own number decals.
  rivalParts:()=>{const rival=immersive.visual.rivals[0],names=[],shown=new Set();let meshes=0;rival?.traverse(o=>{names.push(o.name);if(!o.isMesh)return;meshes++;let seen=true;for(let q=o;q&&q!==rival;q=q.parent)if(!q.visible&&q!==rival.userData.detail)seen=false;if(seen)for(const m of [o.material].flat())shown.add(m.name);});return {motor:names.includes('Motor_CONJUNTO'),tanque:names.includes('Tanque_combustivel_CONJUNTO'),meshes,materials:[...shown],numbers:names.filter(n=>n.startsWith('Numero_')).length};},
  driverInfo:()=>driver.info(),
  rivalDrivers:()=>immersive.visual.rivals.map(o=>o.userData.driver?{...o.userData.driver.info(),shown:o.userData.detail.visible&&o.visible}:null),
  watchInfo:()=>{const r=watchedRival();return {watched,number:r?.entry.number??null,camera:camera.position.toArray(),target:r?r.obj.position.toArray():carRoot.position.toArray(),rpm:(r?.car??car).rpm};},
  surfaceInfo:()=>({...roadSurface.stats,material:roadSurface.material.name,drawCalls:renderer.info.render.calls}),
  // Interior cameras ride on the sprung body, so report them in its frame.
  cockpitInfo:()=>({...cockpit.info(),eyeLocal:carBody.worldToLocal(camera.position.clone()).toArray(),fov:camera.fov,externalVisible:model.visible,
   renderedFrame,mirrorFrame,mirrorEyeLocal:carBody.worldToLocal(cockpit.rearCamera.position.clone()).toArray()}),
  viewControls:()=>({pointerLocked,lockPending,lockUnavailable,yaw:headLook.yaw,pitch:headLook.pitch,centering:cameraReturn.active,movingSince:cameraReturn.movingSince,lastInput:cameraReturn.lastInput,delayMs:cameraReturn.delayMs,
   lookBack:{held:lookBack.held,allowed:lookBackAllowed(),amount:lookBack.amount,side:lookBack.side,viewYaw:headView.yaw,viewPitch:headView.pitch,eyeShift:[...twist]},photo:cockpitView&&structuredClone(cockpitView)}),
  // Interior photography: a fixed cockpit-local pose {eye:[x,y,z],yaw,pitch,fov,hideDriver,roll?} replaces the
  // head look (no clamps, shake or speed widening) while in the cockpit camera; null returns to play.
  setCockpitView:view=>{
   if(view){
    const eye=view.eye??cockpit.eye.toArray(),number=value=>typeof value==='number'&&Number.isFinite(value);
    if(!Array.isArray(eye)||eye.length!==3||!eye.every(number)||![view.yaw??0,view.pitch??0,view.roll??0,view.fov??74].every(number))throw new Error('setCockpitView: eye [x,y,z], yaw, pitch e fov numéricos');
    cockpitView={eye:[...eye],yaw:view.yaw??0,pitch:view.pitch??0,roll:view.roll??0,fov:clamp(view.fov??74,5,150),hideDriver:!!view.hideDriver};photoEye.fromArray(eye);if(view.eye)photoEye.y+=cockpit.drop(); // poses follow the cabin
   }else cockpitView=null;
   // The driver's group also carries the wheel, levers and pedals he works: only his body is hidden.
   const hide=!!cockpitView?.hideDriver;if(hide!==photoHidDriver){const controls=new Set([cockpit.wheel,...cockpit.controls.parts]);for(const part of driver.root.children)if(!controls.has(part))part.visible=!hide;photoHidDriver=hide;}
   if(!cockpitView){camera.fov=mode==='cockpit'?74:58;camera.updateProjectionMatrix();}
   lookBack.reset();return cockpitView&&structuredClone(cockpitView);
  },
  cameraSnapshot:()=>({position:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),fov:camera.fov,roll:Math.asin(clamp(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion).y,-1,1)),target:orbit.target.toArray(),car:carRoot.position.toArray(),distance:camera.position.distanceTo(orbit.target),ground:car.sample(camera.position.x,-camera.position.z).z}),
  wheelSnapshot:()=>{carRoot.updateMatrixWorld(true);const inverse=carRoot.getWorldQuaternion(new THREE.Quaternion()).invert();return wheels.map(w=>{const axle=new THREE.Vector3(0,0,1).applyQuaternion(w.obj.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(inverse);return {name:w.obj.name,front:w.front,angle:Math.atan2(axle.x,axle.z),axle:axle.toArray()};});},
  get state(){return {paused,automatic,mode,livery:activeLivery,wheels:wheels.length,drawCalls:renderer.info.render.calls};}};
 return true;
 }catch(err){console.error(err);ready=false;clearCircuit();status('Não foi possível carregar a pista. Clique em começar para tentar novamente.');return false;}
 finally{loading=false;$('start').disabled=false;$('storyStart').disabled=false;$('tour').disabled=false;$('livery').disabled=false;for(const button of document.querySelectorAll('[data-circuit]'))button.disabled=false;updateMenuLabels();}
}
$('start').disabled=false;$('storyStart').disabled=false;status('');updateMenuLabels();
window.interlagos={ready:false,audioInfo:()=>carAudio.info()};
frame();
