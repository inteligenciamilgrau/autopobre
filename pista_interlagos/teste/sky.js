import * as THREE from 'three';

// Late-afternoon sun from the north-north-west (southern hemisphere), about 27° high:
// long shadows that model the terrain, still bright enough to read the track, and
// behind the main grandstand so its roof keeps the crowd in the shade.
export const SUN_DIRECTION=new THREE.Vector3(-.34,.454,-.824).normalize();
// Linear-space colours shared by the sky dome, the fog and the environment map.
const ZENITH=new THREE.Color(.075,.21,.6),HORIZON=new THREE.Color(.56,.66,.78),GROUND=new THREE.Color(.2,.22,.17);

const vertexShader=`
varying vec3 vDirection;
void main(){
 vDirection=position;
 // Rotation only: the dome is always centred on the camera and drawn at the far plane.
 vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0);
 gl_Position=vec4(clip.xy,clip.w*.99999,clip.w);
}`;
const fragmentShader=`
uniform vec3 sunDirection,zenith,horizon,ground;
uniform float time,cloudCover,environment;
varying vec3 vDirection;
float skyHash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(skyHash(i),skyHash(i+vec2(1,0)),f.x),mix(skyHash(i+vec2(0,1)),skyHash(i+vec2(1,1)),f.x),f.y);}
float skyFbm(vec2 p){float value=0.0,amplitude=.5;for(int i=0;i<CLOUD_OCTAVES;i++){value+=amplitude*skyNoise(p);p=p*2.07+vec2(13.1,7.7);amplitude*=.5;}return value;}
void main(){
 vec3 direction=normalize(vDirection);float h=direction.y,mu=dot(direction,sunDirection);
 vec3 color=mix(horizon,zenith,pow(clamp(h,0.0,1.0),.42));
 // Warm scattering around the sun and a brighter hazy band at the horizon.
 color+=vec3(1.0,.78,.52)*(pow(max(mu,0.0),6.0)*.22+pow(max(mu,0.0),48.0)*.35);
 color=mix(color,horizon*1.08,exp(-max(h,0.0)*14.0)*.55);
 if(h<0.0)color=mix(horizon,ground,smoothstep(0.0,.18,-h)*environment+smoothstep(0.0,.5,-h)*(1.0-environment)*.35);
 if(h>0.0){
  // Clouds projected on a flat layer; offset samples toward the sun give soft self-shadowing.
  vec2 uv=direction.xz/(h+.1)*1.35+vec2(time*.0045,time*.0021);
  float density=skyFbm(uv*1.15),towards=skyFbm(uv*1.15+sunDirection.xz*.11);
  float cover=smoothstep(1.0-cloudCover,1.28-cloudCover,density)*smoothstep(0.0,.16,h);
  float lit=clamp(.62+(density-towards)*4.0,.28,1.12);
  vec3 cloud=mix(vec3(.46,.51,.6),vec3(1.0,.97,.93),lit)+vec3(1.0,.82,.6)*pow(max(mu,0.0),5.0)*.45;
  color=mix(color,cloud,cover*.93);
 }
 color+=vec3(22.0,19.0,15.0)*smoothstep(.99955,.9998,mu)*(1.0-environment*.9);
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function createSky(renderer,scene,{mobile=false}={}){
 const uniforms={
  sunDirection:{value:SUN_DIRECTION.clone()},zenith:{value:ZENITH.clone()},horizon:{value:HORIZON.clone()},ground:{value:GROUND.clone()},
  time:{value:0},cloudCover:{value:.44},environment:{value:0}
 };
 const material=new THREE.ShaderMaterial({name:'Ceu_dinamico',uniforms,vertexShader,fragmentShader,side:THREE.BackSide,depthWrite:false,fog:false,defines:{CLOUD_OCTAVES:mobile?4:6}});
 const dome=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),material);
 dome.name='Ceu';dome.frustumCulled=false;dome.renderOrder=-10;
 scene.add(dome);
 scene.background=null;
 scene.fog=new THREE.Fog(HORIZON.clone(),mobile?420:520,mobile?2400:3300);
 // Image-based lighting: reflections on paint, glass, rails and water come from the same sky.
 const envScene=new THREE.Scene(),envMaterial=material.clone();envMaterial.uniforms.environment.value=1;envMaterial.defines={CLOUD_OCTAVES:4};
 envScene.add(new THREE.Mesh(dome.geometry,envMaterial));
 const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(envScene,.02).texture;
 pmrem.dispose();envMaterial.dispose();
 scene.environment=environment;scene.environmentIntensity=.85;
 return {
  dome,environment,sunDirection:SUN_DIRECTION,horizon:HORIZON,
  update(dt){uniforms.time.value+=dt;},
  info:()=>({clouds:uniforms.cloudCover.value,environment:!!scene.environment,fog:[scene.fog.near,scene.fog.far]})
 };
}
