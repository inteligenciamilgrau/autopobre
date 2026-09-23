import * as THREE from 'three';
import {SUSPENSION_WHEELS,HULL,CG_HEIGHT,clamp} from './physics.js';

// The Opala in a lake: water drags on the tyres and on the hull, the wheels throw
// spray and leave rings and churned water, and the body hitting the surface splashes.
// Physics frame: x, y horizontal, z up; particles are written in three.js axes.
const LOW_HULL=HULL.slice(0,9),GRAVITY=9.81;
// Quadratic water drag, .5*rho*Cd*A/mass, scaled down to ~30% so a car driven into
// a lake stops within a few lengths instead of as if it hit a wall.
const DRAG=.5*1000/1250*.3,TYRE_DIAMETER=.63;

export class LakeContact {
 constructor({water,mobile=false,onSound=null}){
  this.water=water;this.onSound=onSound;this.mobile=mobile;
  this.capacity=mobile?260:720;this.cursor=0;
  const n=this.capacity;
  this.p=new Float32Array(n*3);this.v=new Float32Array(n*3);this.age=new Float32Array(n).fill(9);this.life=new Float32Array(n).fill(1);
  this.size=new Float32Array(n);this.alpha=new Float32Array(n);this.floor=new Float32Array(n);
  this.geometry=new THREE.BufferGeometry();
  this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
  this.geometry.setAttribute('drop',new THREE.BufferAttribute(new Float32Array(n*2),2).setUsage(THREE.DynamicDrawUsage));
  this.material=new THREE.ShaderMaterial({name:'Respingos_do_lago',transparent:true,depthWrite:false,uniforms:{viewport:{value:900}},
   vertexShader:`attribute vec2 drop;uniform float viewport;varying float vAlpha,vMist;
    void main(){vec4 p=modelViewMatrix*vec4(position,1.);vMist=step(.25,drop.x);
     // Drops right in front of the lens would fill the screen: they fade out instead.
     vAlpha=drop.y*smoothstep(.8,2.5,-p.z);
     gl_Position=projectionMatrix*p;gl_PointSize=clamp(drop.x*viewport*projectionMatrix[1][1]/max(.2,-p.z),1.,mix(24.,90.,vMist));}`,
   // Flying drops read as bright specks with a soft edge; the larger points are thin spray mist.
   fragmentShader:`varying float vAlpha,vMist;
    void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;
     float a=vAlpha*mix(smoothstep(1.,.15,r)*.9,pow(1.-r,2.)*.5,vMist);if(a<.004)discard;
     gl_FragColor=vec4(mix(vec3(.76,.83,.86),vec3(.98,.99,1.),smoothstep(.7,0.,r)*(1.-vMist*.5)),a);}`});
  this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.name='Respingos_do_lago';this.mesh.frustumCulled=false;this.mesh.renderOrder=3;
  this.wheels=SUSPENSION_WHEELS.map(()=>({depth:0,level:0,x:0,y:0,z:0,emit:0}));
  this.hull=0;this.inWater=false;this.rippleClock=0;this.rippleTurn=0;this.soundClock=0;
  this.stats={splashes:0,drops:0,ripples:0,peakDrag:0,drag:0};
 }
 reset(){this.age.fill(9);this.hull=0;this.inWater=false;for(const w of this.wheels){w.depth=0;w.emit=0;}this.write();}
 // Fixed physics step, right after the car has moved.
 step(car,dt){
  const {f,l,u}=car.updateAxes(),speed=Math.hypot(car.vx,car.vy);
  let tyres=0,wet=0,level=null;
  for(let i=0;i<4;i++){
   const w=SUSPENSION_WHEELS[i],c=this.wheels[i];
   c.x=car.x+f[0]*w.x+l[0]*w.y-u[0]*CG_HEIGHT;c.y=car.y+f[1]*w.x+l[1]*w.y-u[1]*CG_HEIGHT;c.z=car.z+f[2]*w.x+l[2]*w.y-u[2]*CG_HEIGHT;
   const surface=this.water.at(c.x,c.y);c.depth=surface?clamp(surface.level-c.z,0,1.5):0;c.level=surface?.level??0;
   if(c.depth>0){tyres+=Math.min(c.depth,TYRE_DIAMETER);wet++;level=surface.level;}
  }
  // Hull: how deep the underbody and sills sit below the surface, on average.
  let hull=0;
  if(level!==null)for(const [px,py,pz] of LOW_HULL){const z=car.z+f[2]*px+l[2]*py+u[2]*pz;hull+=clamp(level-z,0,1.3);}
  hull/=LOW_HULL.length;
  car.wet=this.wheels.map(w=>w.depth);car.wetHull=hull;
  const entering=!this.inWater&&wet>0,hullEntry=this.hull<.03&&hull>=.03;
  this.inWater=wet>0;
  // Water drag: submerged frontal and side areas, tyre by tyre and the body.
  const c=Math.cos(car.heading),s=Math.sin(car.heading);let along=car.vx*c+car.vy*s,across=-car.vx*s+car.vy*c;
  const front=1.7*hull+.22*tyres,side=4.3*hull+.5*tyres;
  if(front>0){
   const before=Math.hypot(along,across);
   along/=1+DRAG*front*Math.abs(along)*dt;across/=1+DRAG*1.3*side*Math.abs(across)*dt;
   car.vx=along*c-across*s;car.vy=along*s+across*c;car.yaw/=1+1.2*side*dt;
   this.stats.drag=(before-Math.hypot(along,across))/dt;this.stats.peakDrag=Math.max(this.stats.peakDrag,this.stats.drag);
  }else this.stats.drag=0;
  // The body hitting the water, or wheels ploughing in fast: a splash, a strong ring and a sound.
  const impact=Math.max(speed*(hullEntry?1:entering?.6:0),hullEntry?-car.vz*1.5:0);
  if(impact>2.5){
   const nose=hullEntry?[car.x+f[0]*1.6,car.y+f[1]*1.6]:[this.wheels[0].x*.5+this.wheels[1].x*.5,this.wheels[0].y*.5+this.wheels[1].y*.5];
   this.burst(nose[0],nose[1],level,car,clamp(impact/10,.3,1.6),hullEntry);
   this.water.ripple(nose[0],nose[1],clamp(impact/8,.4,1.6));this.stats.ripples++;
   this.onSound?.('splash',{strength:clamp(impact/9,.3,1.5)});this.stats.splashes++;
  }
  this.hull=hull;
  if(!wet)return;
  // Rings: bow and wheels in turn, faster while moving (the ring buffer holds ~5 s of them).
  this.rippleClock-=dt;
  if(this.rippleClock<=0){
   const moving=speed>1.2;this.rippleClock=moving?(this.mobile?.4:.2):1.1;
   const sources=[];
   if(hull>.03)sources.push([car.x+f[0]*2.1,car.y+f[1]*2.1,.4+hull]);
   this.wheels.forEach((w,i)=>{if(w.depth>0)sources.push([w.x,w.y,Math.min(1,w.depth*4)*(SUSPENSION_WHEELS[i].front?1:.8)]);});
   const [x,y,k]=sources[this.rippleTurn++%sources.length];
   this.water.ripple(x,y,moving?clamp(.25+speed*.06,.25,1.2)*k:.18*k);this.stats.ripples++;
  }
  // Spray from the tyres, outwards and up, the rear ones also backwards.
  for(let i=0;i<4;i++){
   const w=this.wheels[i],spec=SUSPENSION_WHEELS[i];if(w.depth<=0||speed<1.5)continue;
   w.emit+=Math.min(speed,28)*(spec.front?5:7)*Math.min(1,w.depth*5)*(this.mobile?.45:1)*dt;
   const out=Math.sign(spec.y);
   while(w.emit>=1){
    w.emit--;const q=Math.random(),lift=(1.2+Math.random()*2.8)*(.35+speed/20),fling=(.6+Math.random()*2.2)*(.3+speed/18);
    const back=spec.front?0:Math.random()*speed*.25,mist=speed>10&&Math.random()<.18;
    this.spawn(w.x+l[0]*out*.12,w.y+l[1]*out*.12,w.level+.05,
     car.vx*.55+l[0]*out*fling-f[0]*back+(Math.random()-.5)*.6,car.vy*.55+l[1]*out*fling-f[1]*back+(Math.random()-.5)*.6,lift*(mist?.5:1),
     mist?.3+q*.3:.02+q*.04,mist?.12:.8,w.level);
   }
  }
  this.soundClock-=dt;
  if(speed>2&&this.soundClock<=0){this.soundClock=clamp(.9-speed*.03,.25,.9);this.onSound?.('wade',{strength:clamp(speed/12,.25,1.2)*Math.min(1,tyres)});}
 }
 // A crown of drops around the point where the body met the water.
 burst(x,y,level,car,strength,hull){
  const count=Math.round((hull?200:90)*strength*(this.mobile?.45:1));
  for(let k=0;k<count;k++){
   const a=Math.random()*Math.PI*2,r=Math.random(),out=(1+r*3)*strength,up=(2+Math.random()*4)*strength,mist=Math.random()<.12;
   this.spawn(x+Math.cos(a)*.6,y+Math.sin(a)*.6,level+.05,car.vx*.35+Math.cos(a)*out,car.vy*.35+Math.sin(a)*out,up,mist?.35+r*.35:.025+r*.05,mist?.14:.85,level);
  }
 }
 spawn(x,y,z,vx,vy,vz,size,alpha,floor){
  const i=this.cursor;this.cursor=(this.cursor+1)%this.capacity;this.stats.drops++;
  this.p.set([x,y,z],i*3);this.v.set([vx,vy,vz],i*3);this.age[i]=0;this.life[i]=size>.25?1.1+Math.random()*.6:2.5;this.size[i]=size;this.alpha[i]=alpha;this.floor[i]=floor;
 }
 // Per rendered frame: move the drops and hand them to the GPU.
 update(dt,viewport){
  this.material.uniforms.viewport.value=viewport;if(dt<=0)return;
  const air=Math.exp(-dt*.7);
  for(let i=0;i<this.capacity;i++){
   if(this.age[i]>=this.life[i])continue;this.age[i]+=dt;
   const k=i*3,mist=this.size[i]>.25;
   this.v[k]*=air;this.v[k+1]*=air;this.v[k+2]=this.v[k+2]*air-GRAVITY*(mist?.25:1)*dt;
   this.p[k]+=this.v[k]*dt;this.p[k+1]+=this.v[k+1]*dt;this.p[k+2]+=this.v[k+2]*dt;
   // A drop that falls back into the lake is gone; mist just fades.
   if(!mist&&this.p[k+2]<this.floor[i]&&this.v[k+2]<0)this.age[i]=this.life[i];
  }
  this.write();
 }
 write(){
  const {position,drop}=this.geometry.attributes;
  for(let i=0;i<this.capacity;i++){
   const k=i*3,live=this.age[i]<this.life[i],t=this.age[i]/this.life[i];
   position.setXYZ(i,this.p[k],this.p[k+2],-this.p[k+1]);
   drop.setXY(i,live?this.size[i]*(this.size[i]>.25?1+t*1.5:1):0,live?this.alpha[i]*(1-t*t):0);
  }
  position.needsUpdate=drop.needsUpdate=true;
 }
 info(){
  let active=0;for(let i=0;i<this.capacity;i++)if(this.age[i]<this.life[i])active++;
  return {inWater:this.inWater,wheels:this.wheels.map(w=>+w.depth.toFixed(3)),hull:+this.hull.toFixed(3),active,capacity:this.capacity,...this.stats};
 }
 dispose(){this.geometry.dispose();this.material.dispose();}
}
