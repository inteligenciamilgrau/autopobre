import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shutOpenings} from './car-openings.js';
// The ghost Opala (ghost-lap.js replays the lap): the player's model as one see-through shell, cyan,
// brighter where its skin turns away from the camera, with faint bands running up it. It is drawn
// twice, after the other see-through things: first only into the depth buffer, then in colour where
// that depth is its own, so only its outer skin shows (no wheels or seats through the doors). It
// casts no shadow and touches nothing. Beyond NEAR metres from the camera the distant rivals'
// profile takes its place, as their own detail does (a few hundred triangles, not the model's).
// Its lap time is on a plate on the rear bumper (no label over the roof: it hid the road ahead).
const NEAR=45;
// The plate, a Mercosul one a quarter larger (40 x 13 cm) to be read from a few car lengths back:
// metres in the car frame, centred on the bumper's face (the Opala's under its tail lamps, the
// Fusca's blade), just behind the rearmost skin found there on each model.
const PLATE={y:.46,w:.5,h:.16,gap:.012};
const vertexShader=`
#include <common>
#include <fog_pars_vertex>
varying vec3 vNormalView;varying vec3 vToCamera;varying float vHeight;
void main(){
 vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
 vNormalView=normalize(normalMatrix*normal);vToCamera=-mvPosition.xyz;vHeight=position.y;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const fragmentShader=`
uniform vec3 baseColor,rimColor;uniform float opacity,time;
#include <common>
#include <fog_pars_fragment>
varying vec3 vNormalView;varying vec3 vToCamera;varying float vHeight;
void main(){
 vec3 n=normalize(vNormalView);float rim=pow(1.0-abs(dot(n,normalize(vToCamera))),2.2);
 float band=.5+.5*sin(vHeight*30.0-time*4.0),light=.78+.22*max(n.y,0.0);
 gl_FragColor=vec4(mix(baseColor*light,rimColor,rim)*(.9+.1*band),opacity*(.2+.62*rim+.05*band));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;
const forward=new THREE.Vector3(),up=new THREE.Vector3(),side=new THREE.Vector3(),basis=new THREE.Matrix4();
// The rearmost x of the shell behind the plate (its vertices within the plate's outline, seen from behind).
function rearmost(geometry){
 const p=geometry.attributes.position;let x=Infinity;
 for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i))<PLATE.w/2&&Math.abs(p.getY(i)-PLATE.y)<PLATE.h/2)x=Math.min(x,p.getX(i));
 if(x===Infinity){geometry.computeBoundingBox();x=geometry.boundingBox.min.x;}return x;
}
// A float copy of an attribute (a GLB may store it quantized: the transform below would clamp it).
function floats(attribute){const a=new Float32Array(attribute.count*3);for(let i=0;i<attribute.count;i++){a[i*3]=attribute.getX(i);a[i*3+1]=attribute.getY(i);a[i*3+2]=attribute.getZ(i);}return new THREE.BufferAttribute(a,3);}
export class GhostCar {
 constructor(){
  this.root=new THREE.Group();this.root.name='Fantasma';this.root.visible=false;
  this.body=new THREE.Group();this.root.add(this.body);this.triangles=0;this.opacity=0;this.plateText='';
  // One shell per car model ('opala', 'fusca': the one raced shows, use), each with its distant profile or none.
  this.shells=new Map();this.model=null;this.near=this.far=null;
  this.depthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,transparent:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  this.shellMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,fog:true,
   uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{baseColor:{value:new THREE.Color(0x3fc6ff)},rimColor:{value:new THREE.Color(0xc8f6ff).multiplyScalar(1.6)},opacity:{value:0},time:{value:0}}])});
  // Facing back (-x), after the shell: its depth pass hides the plate from ahead.
  this.plateCanvas=document.createElement('canvas');this.plateCanvas.width=512;this.plateCanvas.height=Math.round(512*PLATE.h/PLATE.w);
  this.plateTexture=new THREE.CanvasTexture(this.plateCanvas);this.plateTexture.colorSpace=THREE.SRGBColorSpace;this.plateTexture.anisotropy=8;
  this.plate=new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w,PLATE.h).rotateY(-Math.PI/2),new THREE.MeshBasicMaterial({map:this.plateTexture,transparent:true,depthWrite:false}));
  this.plate.name='Fantasma_placa';this.plate.position.set(0,PLATE.y,0);this.plate.renderOrder=22;this.body.add(this.plate);
 }
 // The shell from the player's model as loaded, its hinged parts shut and wheels at rest (main.js
 // builds it with the body untilted, as the rivals are cloned): one geometry, in the car's own frame.
 // far: the distant profile's geometry (immersive-visuals.js farProxy), in the same frame. The first
 // model built is shown until use() picks another.
 build(template,far=null,model='opala'){
  const root=template.clone(true);shutOpenings(root);root.updateMatrixWorld(true);const parts=[];
  root.traverse(o=>{
   if(!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||o.userData.interno)return;for(let q=o;q;q=q.parent)if(!q.visible)return;
   const g=new THREE.BufferGeometry();g.setAttribute('position',floats(o.geometry.attributes.position));
   if(o.geometry.attributes.normal)g.setAttribute('normal',floats(o.geometry.attributes.normal));else g.computeVertexNormals();
   g.setIndex(o.geometry.index?Array.from(o.geometry.index.array):[...Array(o.geometry.attributes.position.count).keys()]);
   parts.push(g.applyMatrix4(o.matrixWorld));
  });
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)return false;
  geometry.computeBoundingSphere();
  const near=this.shell(geometry,`Fantasma_${model}`),distant=far?this.shell(far,`Fantasma_${model}_distante`):null;
  this.shells.set(model,{near,far:distant,triangles:geometry.index.count/3,plateX:rearmost(geometry)-PLATE.gap});this.use(this.model??model);return true;
 }
 has(model){return this.shells.has(model);}
 // The shell of the car raced now (a model not built yet keeps the one shown).
 use(model){
  const shown=this.shells.get(model);if(!shown)return;this.model=model;
  for(const s of this.shells.values()){s.near.visible=s===shown;if(s.far)s.far.visible=false;}
  this.near=shown.near;this.far=shown.far;this.triangles=shown.triangles;this.plate.position.x=shown.plateX;
 }
 // The two passes of one geometry: depth only first, then the colour where that depth is its own.
 shell(geometry,name){
  const group=new THREE.Group(),depth=new THREE.Mesh(geometry,this.depthMaterial),shell=new THREE.Mesh(geometry,this.shellMaterial);
  depth.renderOrder=20;shell.renderOrder=21;depth.name=name+'_profundidade';shell.name=name+'_casca';group.add(depth,shell);this.body.add(group);return group;
 }
 // distance: from the camera, in metres.
 detail(distance){if(!this.near)return;this.near.visible=!this.far||distance<NEAR;if(this.far)this.far.visible=!this.near.visible;}
 // A pose of ghost-lap.js (physics frame: x forward of the grid, y left, z up) on the model, as
 // main.js places the player's car from TestCar.pose.
 place(p){
  const ch=Math.cos(p.heading),sh=Math.sin(p.heading),cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),cr=Math.cos(p.roll),sr=Math.sin(p.roll);
  forward.set(ch*cp,-sp,-sh*cp);up.set(ch*cr*sp+sh*sr,cr*cp,-(sh*cr*sp-ch*sr));side.crossVectors(forward,up).normalize();
  this.body.position.set(p.x,p.z,-p.y);this.body.quaternion.setFromRotationMatrix(basis.makeBasis(forward,up,side));
 }
 setOpacity(value){this.opacity=value;this.shellMaterial.uniforms.opacity.value=value;this.plate.material.opacity=Math.min(1,value*1.6);this.root.visible=value>.01;}
 update(dt){this.shellMaterial.uniforms.time.value=(this.shellMaterial.uniforms.time.value+dt)%1000;}
 // The lap time on the plate: white, the blue band on top reading FANTASMA where a real one reads BRASIL.
 setPlate(text){
  if(text===this.plateText)return;this.plateText=text;const c=this.plateCanvas,ctx=c.getContext('2d'),w=c.width,h=c.height,band=Math.round(h*.27);
  ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.roundRect(3,3,w-6,h-6,16);ctx.clip();
  ctx.fillStyle='#f4fbff';ctx.fillRect(0,0,w,h);ctx.fillStyle='#1d4f9c';ctx.fillRect(0,0,w,band);ctx.restore();
  ctx.strokeStyle='#14191d';ctx.lineWidth=6;ctx.beginPath();ctx.roundRect(3,3,w-6,h-6,16);ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#ffffff';ctx.font=`bold ${Math.round(band*.62)}px Arial`;ctx.fillText('FANTASMA',w/2,band/2+2,w*.6);
  ctx.fillStyle='#14191d';ctx.font=`bold ${Math.round((h-band)*.72)}px Arial`;ctx.fillText(text,w/2,band+(h-band)/2+3,w*.9);this.plateTexture.needsUpdate=true;
 }
}
