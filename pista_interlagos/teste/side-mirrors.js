import * as THREE from 'three';

// Working door mirrors for the cockpit view (players asked for them). They show the road
// behind from the picture the rear-view mirror already renders (cockpit.js rearCamera: 125°
// wide, from the middle of the cabin), so they cost no extra pass. In the V06 model the round
// back of each mirror housing faces the driver and its "Espelho" glass sits buried inside it,
// so the glass is drawn here: an oval turned to the driver's eye over the housing, filling
// `fill` of the housing's outline as he sees it (the rest shows as a rim), on the door.
// Each glass is set as a driver sets it: its middle shows the road straight back, a few
// degrees out past the car's flank, whatever the eye does; it is somewhat convex (widen) so a
// car alongside stays in it. The reflected ray of every pixel meets the scene `distance`
// metres away and is looked up where the rear camera saw that point: exact for cars about
// that far, a little off for those very close. The glass is written with alpha -1: the film
// look (cinematic.js) then keeps its ambient occlusion off it, which read the glass sunk in its
// housing as a deep dark corner and left it about a third as bright as the rear-view mirror.
export const SIDE_MIRRORS=Object.freeze({outward:.12,down:-.02,widen:3.4,distance:14,reflectance:.82,fill:.84,ahead:.075});
const vertexShader=`varying vec3 vWorld;varying vec2 vGlass;
void main(){vGlass=position.xy;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`;
const fragmentShader=`uniform sampler2D map;uniform mat4 rearViewProjection;uniform vec3 glassNormal,glassCenter,centerRay;uniform float widen,distance,reflectance;
varying vec3 vWorld;varying vec2 vGlass;
void main(){
 float e=length(vGlass);
 vec3 ray=reflect(normalize(vWorld-cameraPosition),glassNormal);ray=normalize(centerRay+(ray-centerRay)*widen);
 vec4 clip=rearViewProjection*vec4(glassCenter+ray*distance,1.);vec2 uv=clamp(clip.xy/max(clip.w,1e-3)*.5+.5,0.,1.);
 gl_FragColor=vec4(texture2D(map,uv).rgb*reflectance*(1.-.6*smoothstep(.9,1.,e)),-1.);
 #include <colorspace_fragment>
}`;
const eyeToGlass=new THREE.Vector3(),back=new THREE.Vector3(),out=new THREE.Vector3(),up=new THREE.Vector3(),basis=new THREE.Matrix3(),viewProjection=new THREE.Matrix4();
export class SideMirrors {
 constructor(texture,look=SIDE_MIRRORS){this.texture=texture;this.look=look;this.glasses=[];this.live=false;}
 // The player's car model (its doors shut) in the sprung body `body`, and the driver's eye
 // there (car frame: +X forward, +Y up, -Z the driver's side). The glasses are flagged
 // "interno", so the rivals cloned from the model drop them; they show only while live.
 attach(model,body,eye){
  this.show(false);for(const g of this.glasses)g.mesh.removeFromParent();this.glasses=[];if(!model)return 0;
  model.updateMatrixWorld(true);const inverse=body.matrixWorld.clone().invert(),found=[];
  model.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)&&o.material.name==='Espelho')found.push(o);});
  const v=new THREE.Vector3(),w=new THREE.Vector3();
  for(const o of found){
   const housing=o.parent?.children.find(s=>s.isMesh&&!Array.isArray(s.material)&&s.material.name==='Pintura_preta');if(!housing)continue;
   o.geometry.computeBoundingBox();const c=o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld).applyMatrix4(inverse),side=Math.sign(c.z)||1;
   // The housing's outline from the eye, in angles about the line to the buried glass
   // (its shell only: the arm to the door runs on inboard).
   const toCar=new THREE.Matrix4().multiplyMatrices(inverse,housing.matrixWorld),pos=housing.geometry.attributes.position;
   const f=c.clone().sub(eye).normalize(),r=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize(),u=new THREE.Vector3().crossVectors(r,f);
   let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(toCar);w.subVectors(v,c);if(Math.abs(w.x)>.16||Math.abs(w.y)>.07||Math.abs(w.z)>.065)continue;
    w.subVectors(v,eye);const along=w.dot(f),a=Math.atan2(w.dot(r),along),b=Math.atan2(w.dot(u),along);x0=Math.min(x0,a);x1=Math.max(x1,a);y0=Math.min(y0,b);y1=Math.max(y1,b);}
   if(!(x1>x0&&y1>y0))continue;
   // The glass: in front of the shell by `ahead`, facing the eye, its size the same angles.
   const d=c.distanceTo(eye)-this.look.ahead,ax=(x0+x1)/2,ay=(y0+y1)/2,dir=f.clone().add(r.clone().multiplyScalar(Math.tan(ax))).add(u.clone().multiplyScalar(Math.tan(ay))).normalize();
   const place=eye.clone().addScaledVector(dir,d),normal=dir.clone().negate(),xAxis=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),normal).normalize(),yAxis=new THREE.Vector3().crossVectors(normal,xAxis);
   const inCar=new THREE.Matrix4().makeBasis(xAxis,yAxis,normal).setPosition(place).scale(new THREE.Vector3(d*Math.tan((x1-x0)/2*this.look.fill),d*Math.tan((y1-y0)/2*this.look.fill),1));
   const material=new THREE.ShaderMaterial({name:'Espelho_retrovisor_'+(side<0?'esquerdo':'direito'),vertexShader,fragmentShader,toneMapped:false,
    uniforms:{map:{value:this.texture},rearViewProjection:{value:new THREE.Matrix4()},glassNormal:{value:new THREE.Vector3(-1,0,0)},glassCenter:{value:new THREE.Vector3()},centerRay:{value:new THREE.Vector3(-1,0,0)},
     widen:{value:this.look.widen},distance:{value:this.look.distance},reflectance:{value:this.look.reflectance}}});
   const mesh=new THREE.Mesh(new THREE.CircleGeometry(1,48),material);mesh.name=material.name;
   // The glass rides the door: its pose in the door's frame.
   new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(body.matrixWorld).multiply(inCar).decompose(mesh.position,mesh.quaternion,mesh.scale);
   mesh.visible=false;mesh.castShadow=false;mesh.userData.interno=true;o.parent.add(mesh);
   this.glasses.push({mesh,material,side,world:new THREE.Vector3()});
  }
  return this.glasses.length;
 }
 show(live){if(live===this.live)return;this.live=live;for(const g of this.glasses)g.mesh.visible=live;}
 // After the rear camera has drawn this frame's picture: eye is the camera looking at the
 // mirrors (world), body the car's sprung body (its matrixWorld), rear the rear camera.
 update(eye,body,rear){
  if(!this.live)return;
  basis.setFromMatrix4(body.matrixWorld);back.set(-1,0,0).applyMatrix3(basis).normalize();up.set(0,1,0).applyMatrix3(basis).normalize();
  viewProjection.multiplyMatrices(rear.projectionMatrix,rear.matrixWorldInverse);
  for(const g of this.glasses){
   const u=g.material.uniforms;g.mesh.updateWorldMatrix(true,false);g.world.setFromMatrixPosition(g.mesh.matrixWorld);
   out.set(0,0,g.side).applyMatrix3(basis).normalize();
   u.centerRay.value.copy(back).addScaledVector(out,this.look.outward).addScaledVector(up,this.look.down).normalize();
   // The glass turned so the eye sees centerRay in its middle: its normal halves the angle.
   eyeToGlass.subVectors(g.world,eye).normalize();u.glassNormal.value.subVectors(eyeToGlass,u.centerRay.value).normalize();
   u.glassCenter.value.copy(g.world);u.rearViewProjection.value.copy(viewProjection);
  }
 }
 info(){return {count:this.glasses.length,live:this.live,sides:this.glasses.map(g=>g.side),size:this.glasses.map(g=>[g.mesh.scale.x,g.mesh.scale.y]),visible:this.glasses.map(g=>g.mesh.visible),centers:this.glasses.map(g=>g.world.toArray())};}
}
