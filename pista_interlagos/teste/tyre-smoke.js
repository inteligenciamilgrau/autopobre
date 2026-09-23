import * as THREE from 'three';

// A bounded, single-draw-call cloud. Particles stay in world space behind the car.
// Rubber smoke on asphalt; brown dust when the tyres run on grass or dirt.
export class TyreSmoke {
 constructor(capacity=256){
  this.capacity=capacity;this.cursor=0;this.total=0;this.emit=[0,0,0,0];
  this.particles=Array.from({length:capacity},()=>({age:9,life:1}));
  this.geometry=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['puff',2],['dust',1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*size),size).setUsage(THREE.DynamicDrawUsage));
  this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{viewport:{value:900}},
   vertexShader:`attribute vec2 puff;attribute float dust;uniform float viewport;varying float opacity,vDust;
    void main(){vec4 p=modelViewMatrix*vec4(position,1.);opacity=puff.y;vDust=dust;
     gl_Position=projectionMatrix*p;gl_PointSize=clamp(puff.x*viewport*projectionMatrix[1][1]/max(.2,-p.z),1.,256.);}`,
   fragmentShader:`varying float opacity,vDust;
    void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);
     float cloud=.83+.12*sin(p.x*11.+sin(p.y*8.))+.05*sin(p.y*21.+p.x*7.);
     float a=opacity*pow(max(0.,1.-r*r),2.)*cloud;
     if(a<.003)discard;gl_FragColor=vec4(mix(vec3(.76+.12*(1.-r)),vec3(.5,.42,.31)*(.85+.2*(1.-r)),vDust),a);}`});
  this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.name='Fumaca_dos_pneus';this.mesh.frustumCulled=false;this.mesh.renderOrder=2;
 }
 reset(){for(const p of this.particles)p.age=p.life;this.emit.fill(0);this.geometry.attributes.puff.array.fill(0);this.geometry.attributes.puff.needsUpdate=true;}
 update(car,wheels,dt,viewport){
  this.material.uniforms.viewport.value=viewport;
  if(dt<=0)return;
  const c=Math.cos(car.heading),s=Math.sin(car.heading);
  for(let i=0;i<wheels.length;i++){
   const w=wheels[i],x=car.x+c*w.x-s*w.y,y=car.y+s*w.x+c*w.y,p=car.sample(x,y),speed=Math.hypot(car.vx,car.vy);
   // Under water (LakeContact sets car.wet) there is no dust: the lake throws spray instead.
   const down=!car.wheelLoad||car.wheelLoad[i]>0,scraping=!!car.hullContact&&!p.onRoad&&speed>3&&!(car.wetHull>.02),dust=!p.onRoad&&!(car.wet?.[i]>.01)&&(speed>4&&down||scraping);
   // Tyres throw dust only while touching the ground; a body sliding over soil raises its own cloud.
   const intensity=!down&&!scraping?0:dust?Math.max(down?Math.min(.75,(speed-4)/22)*(w.front?.45:1):0,scraping?Math.min(.9,speed/15):0):p.onRoad?Math.max(0,w.strength-.12):0;
   this.emit[i]+=intensity*(dust?20:32)*dt;
   while(this.emit[i]>=1){
    this.emit[i]--;const q=this.particles[this.cursor];this.cursor=(this.cursor+1)%this.capacity;this.total++;
    Object.assign(q,{x:x+(Math.random()-.5)*.18,y:p.z+.10,z:-y+(Math.random()-.5)*.18,
     vx:car.vx*.08+(Math.random()-.5)*.4,vy:.35+Math.random()*.25,vz:-car.vy*.08+(Math.random()-.5)*.4,
     age:0,life:(dust?2.6:2)+Math.random()*1.1,size:(dust?.45:.28)+Math.random()*.18,strength:intensity,dust:dust?1:0});
   }
  }
  const {position,puff}=this.geometry.attributes;
  for(let i=0;i<this.capacity;i++){
   const p=this.particles[i];p.age+=dt;
   if(p.age>=p.life){puff.setXY(i,0,0);continue;}
   this.geometry.attributes.dust.setX(i,p.dust??0);
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
   const t=p.age/p.life;
   position.setXYZ(i,p.x,p.y,p.z);puff.setXY(i,p.size+p.age*.75,p.strength*.5*Math.min(1,t*12)*(1-t));
  }
  position.needsUpdate=puff.needsUpdate=this.geometry.attributes.dust.needsUpdate=true;
 }
 info(){return {active:this.particles.filter(p=>p.age<p.life).length,total:this.total,capacity:this.capacity,drawCalls:1};}
 dispose(){this.geometry.dispose();this.material.dispose();}
}
