import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shutOpenings} from './car-openings.js';
// The ghost Opala (ghost-lap.js replays the lap): the player's model as one see-through shell, cyan,
// brighter where its skin turns away from the camera, with faint bands running up it. It is drawn
// twice, after the other see-through things: first only into the depth buffer, then in colour where
// that depth is its own, so only its outer skin shows (no wheels or seats through the doors). It
// casts no shadow and touches nothing. Beyond NEAR metres from the camera the distant rivals'
// profile takes its place, as their own detail does (a few hundred triangles, not the model's).
const NEAR=45;
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
// A float copy of an attribute (a GLB may store it quantized: the transform below would clamp it).
function floats(attribute){const a=new Float32Array(attribute.count*3);for(let i=0;i<attribute.count;i++){a[i*3]=attribute.getX(i);a[i*3+1]=attribute.getY(i);a[i*3+2]=attribute.getZ(i);}return new THREE.BufferAttribute(a,3);}
export class GhostCar {
 constructor(){
  this.root=new THREE.Group();this.root.name='Fantasma';this.root.visible=false;
  this.body=new THREE.Group();this.root.add(this.body);this.triangles=0;this.opacity=0;this.labelText='';
  // One shell per car model ('opala', 'fusca': the one raced shows, use), each with its distant profile or none.
  this.shells=new Map();this.model=null;this.near=this.far=null;
  this.depthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,transparent:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  this.shellMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,fog:true,
   uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{baseColor:{value:new THREE.Color(0x3fc6ff)},rimColor:{value:new THREE.Color(0xc8f6ff).multiplyScalar(1.6)},opacity:{value:0},time:{value:0}}])});
  this.labelCanvas=document.createElement('canvas');this.labelCanvas.width=512;this.labelCanvas.height=64;
  this.labelTexture=new THREE.CanvasTexture(this.labelCanvas);this.labelTexture.colorSpace=THREE.SRGBColorSpace;
  this.label=new THREE.Sprite(new THREE.SpriteMaterial({map:this.labelTexture,transparent:true,depthWrite:false}));this.label.scale.set(2.9,.36,1);this.label.position.set(0,2.15,0);this.label.renderOrder=22;this.body.add(this.label);
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
  this.shells.set(model,{near,far:distant,triangles:geometry.index.count/3});this.use(this.model??model);return true;
 }
 has(model){return this.shells.has(model);}
 // The shell of the car raced now (a model not built yet keeps the one shown).
 use(model){
  const shown=this.shells.get(model);if(!shown)return;this.model=model;
  for(const s of this.shells.values()){s.near.visible=s===shown;if(s.far)s.far.visible=false;}
  this.near=shown.near;this.far=shown.far;this.triangles=shown.triangles;
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
 setOpacity(value){this.opacity=value;this.shellMaterial.uniforms.opacity.value=value;this.label.material.opacity=Math.min(1,value*1.6);this.root.visible=value>.01;}
 update(dt){this.shellMaterial.uniforms.time.value=(this.shellMaterial.uniforms.time.value+dt)%1000;}
 setLabel(text){
  if(text===this.labelText)return;this.labelText=text;const c=this.labelCanvas,ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='rgba(6,34,46,.78)';ctx.beginPath();ctx.roundRect(2,2,c.width-4,c.height-4,14);ctx.fill();ctx.strokeStyle='#7fdcff';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#c8f6ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 34px Arial';ctx.fillText(text,c.width/2,c.height/2+1,c.width*.92);this.labelTexture.needsUpdate=true;
 }
}
