import * as THREE from 'three';

// Small, opaque grass blades add parallax at driving height. Only the high scenery
// levels build them: shared geometry, one draw per visible 48 m block, no shadow
// casting or texture/alpha overdraw. All placement uses the same road/water field.
const BLOCK=48;
function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

function tuftGeometry(){
 const rand=random(8841),positions=[],normals=[],colors=[],indices=[];
 for(let i=0;i<7;i++){
  const a=rand()*Math.PI*2,c=Math.cos(a),s=Math.sin(a),x=(rand()-.5)*.8,z=(rand()-.5)*.8;
  const width=.025+rand()*.02,height=.5+rand()*.5,lean=.12+rand()*.16,base=positions.length/3;
  for(const [side,y,bend] of [[-1,0,0],[1,0,0],[-.55,.55,.3],[.55,.55,.3],[0,1,1]]){
   positions.push(x+c*side*width-s*lean*bend,height*y,z+s*side*width+c*lean*bend);
   normals.push(c*.3,.954,s*.3);
   // Dark roots and fresh tips; the overall tint is per instance in linear space.
   const brightness=.42+y*.58;colors.push(brightness,brightness,brightness*.92);
  }
  indices.push(base,base+1,base+2,base+1,base+3,base+2,base+2,base+3,base+4);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
 return geometry;
}

// Cars passing close (speed-particles.js wakeCars, 'Sensação de velocidade' Completa): world x, z
// and velocity x, z of up to WAKE_CARS of them.
export const WAKE_CARS=6;
function grassMaterial(time,reach){
 const material=new THREE.MeshStandardMaterial({name:'Capim_margens',roughness:.94,metalness:0,vertexColors:true,side:THREE.DoubleSide});
 const wake={vergeCars:{value:Array.from({length:WAKE_CARS},()=>new THREE.Vector4())},vergeCarCount:{value:0}};material.userData.wake=wake;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{vergeTime:time,vergeReach:{value:reach}},wake);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float vergeTime,vergeReach;uniform vec4 vergeCars[${WAKE_CARS}];uniform int vergeCarCount;`).replace('#include <begin_vertex>',`#include <begin_vertex>
#ifdef USE_INSTANCING
 vec3 root=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
 float distanceFade=1.0-smoothstep(vergeReach*.6,vergeReach,length(root-cameraPosition));
 // The breeze travels through the verge instead of all blades moving together.
 float gust=sin(root.x*.13+root.z*.17-vergeTime*1.7)*.045+sin(root.x*.7-root.z*.3+vergeTime*3.1)*.016;
 transformed.x+=gust*position.y*position.y;
 transformed.z+=gust*.6*position.y*position.y;
 // A passing car's air: blades lean away from it and along its way, strongest beside it and
 // trailing behind for about half a second, and shiver while they are pushed.
 vec2 wake=vec2(0.0);float shiver=0.0;
 for(int i=0;i<${WAKE_CARS};i++){
  if(i>=vergeCarCount)break;
  vec4 car=vergeCars[i];float speed=length(car.zw);vec2 dir=car.zw/max(speed,.001),rel=root.xz-car.xy;
  float trail=speed*.55+.001,behind=clamp(-dot(rel,dir)/trail,0.0,1.0);vec2 off=rel+dir*behind*trail;float gap=length(off);
  float push=smoothstep(3.0,32.0,speed)*exp(-gap*gap/48.0)*(1.0-behind*.7);
  wake+=(off/max(gap,.3)*.75+dir*.55)*push;shiver+=push;
 }
 float pushed=min(length(wake),1.1);
 if(pushed>.001){
  // World lean of the tip, up to about 40 degrees, taken into the tuft's turned and scaled frame.
  float tall=length(instanceMatrix[1].xyz),wide=length(instanceMatrix[0].xyz);
  vec3 lean=vec3(normalize(wake)*pushed*(.85+.15*sin(vergeTime*23.0+root.x*1.7+root.z*2.3+position.x*9.0)),0.0).xzy*tall;
  lean+=vec3(-lean.z,0.0,lean.x)*sin(vergeTime*31.0+root.x*3.1+position.z*7.0)*min(shiver,1.0)*.5;
  vec3 local=transpose(mat3(instanceMatrix))*lean/(wide*wide);
  transformed.xz+=local.xz*position.y*position.y;
  transformed.y-=pushed*.3*position.y*position.y;
 }
 transformed.y*=distanceFade;
#endif`);
  // Three expands shader chunks after onBeforeCompile. Undo the back-face flip
  // after the include, so both sides keep these blades' upward shading normals.
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
#if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)
 normal*=faceDirection;
 nonPerturbedNormal=normal;
#endif`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
 float grassBack=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),4.0);
 reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[0].color*grassBack*.12;
#endif`);
 };
 material.customProgramCacheKey=()=>'verge-blades-v3';return material;
}

// coverClass follows the circuit's WorldCover mapping: 4 built, 5 bare, 6 water.
export function createVergeVegetation({data,field,ground,vegetated=()=>true,dry=()=>true,density=1,lod=130,time={value:0}}){
 const root=new THREE.Group();root.name='Vegetacao_das_margens';
 const reach=Math.min(145,Math.max(75,lod*.66)),geometry=tuftGeometry(),material=grassMaterial(time,reach);
 const rand=random(499979+data.samples.length),items=[],occupied=new Set(),groups=new Map();
 const spacing=2.15/Math.sqrt(Math.max(.1,density));let next=data.samples[0]?.[0]??0;
 for(const p of data.samples){
  if(p[0]<next)continue;next+=Math.max(1,Math.floor((p[0]-next)/spacing)+1)*spacing;
  for(const side of [-1,1])for(let offset=3.8;offset<17;offset+=spacing){
   const across=side*(p[4]/2+offset+(rand()-.5)*spacing),along=(rand()-.5)*spacing;
   const x=p[1]+p[9]*across+p[7]*along,y=p[2]+p[10]*across+p[8]*along,cell=field.cell(x,y);
   if(cell<0||field.edge[cell]<3||field.edge[cell]>23||field.water[cell]||!dry(x,y,2)||!vegetated(x,y))continue;
   // Irregular clumps leave small bald patches and avoid a planted grid.
   const patch=.5+.5*Math.sin(x*.17+Math.sin(y*.11))*Math.cos(y*.14-x*.035);
   if(rand()>.52+patch*.42)continue;
   const key=Math.floor(x/1.35)+':'+Math.floor(y/1.35);if(occupied.has(key))continue;occupied.add(key);
   const z=ground(x,y);if(!Number.isFinite(z))continue;
   const slope=Math.hypot(ground(x+1,y)-ground(x-1,y),ground(x,y+1)-ground(x,y-1))/2;
   if(!Number.isFinite(slope)||slope>.65)continue;
   const dryness=rand(),height=(.14+Math.min(1,offset/17)*.24)*(.7+rand()*.55);
   const item={x,y,z:z-.035,height,width:.95+rand()*.8,turn:rand()*Math.PI*2,color:[.105+dryness*.05,.19+dryness*.025,.04+dryness*.02]};
   items.push(item);const block=Math.floor(x/BLOCK)+':'+Math.floor(y/BLOCK);if(!groups.has(block))groups.set(block,[]);groups.get(block).push(item);
  }
 }
 const matrix=new THREE.Matrix4(),color=new THREE.Color(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),pos=new THREE.Vector3(),scale=new THREE.Vector3(),blocks=[];
 for(const list of groups.values()){
  const mesh=new THREE.InstancedMesh(geometry,material,list.length);mesh.name='Capim_bloco';mesh.receiveShadow=true;
  list.forEach((item,index)=>{
   matrix.compose(pos.set(item.x,item.z,-item.y),q.setFromAxisAngle(up,item.turn),scale.set(item.width,item.height,item.width));
   mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color.setRGB(...item.color));item.mesh=mesh;item.index=index;
  });
  mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.4;root.add(mesh);
  blocks.push({mesh,center:mesh.boundingSphere.center.clone(),radius:mesh.boundingSphere.radius});
 }
 return {root,count:items.length,reach,update(camera){
  for(const block of blocks)block.mesh.visible=camera.position.distanceToSquared(block.center)<(reach+block.radius)**2;
 },
 // The cars that push the grass this frame (TestCars, nearest first; [] lets it be).
 setCars(cars){
  const {vergeCars,vergeCarCount}=material.userData.wake,n=Math.min(WAKE_CARS,cars.length);
  for(let i=0;i<n;i++){const c=cars[i];vergeCars.value[i].set(c.x,-c.y,c.vx,-c.vy);}
  vergeCarCount.value=n;
 },
 wakeInfo:()=>({cars:material.userData.wake.vergeCarCount.value}),clearAround(points){
  const changed=new Set(),zero=new THREE.Matrix4().makeScale(0,0,0);
  for(const item of items){if(item.removed||!points.some(p=>Math.hypot(item.x-p.x,item.y-p.y)<p.r+.65))continue;item.removed=true;item.mesh.setMatrixAt(item.index,zero);changed.add(item.mesh);}
  for(const mesh of changed)mesh.instanceMatrix.needsUpdate=true;
 },dispose(){geometry.dispose();material.dispose();for(const block of blocks)block.mesh.dispose();}};
}
