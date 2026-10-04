import * as THREE from 'three';

// Late-afternoon sun from the north-north-west (southern hemisphere), about 27° high:
// long shadows that model the terrain, still bright enough to read the track, and
// behind the main grandstand so its roof keeps the crowd in the shade.
export const SUN_DIRECTION=new THREE.Vector3(-.34,.454,-.824).normalize();
// Linear-space colours shared by the sky dome, the fog and the environment map.
const ZENITH=new THREE.Color(.085,.235,.52),HORIZON=new THREE.Color(.57,.67,.79),GROUND=new THREE.Color(.19,.205,.155);
const SKY_DETAIL=Object.freeze({basico:{octaves:3,layers:1},leve:{octaves:4,layers:1},completo:{octaves:6,layers:2},denso:{octaves:7,layers:2}});
const detailFor=value=>SKY_DETAIL[typeof value==='boolean'?(value?'leve':'completo'):value]??SKY_DETAIL.completo;

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
 vec3 direction=normalize(vDirection);float h=direction.y,mu=dot(direction,sunDirection),towardSun=max(mu,0.0),transmission=1.0;
 vec3 color=mix(horizon,zenith,pow(clamp(h,0.0,1.0),.45));
 // Directional aerial scattering: neutral blue overhead, pearl-grey distance and
 // warm light only near the sun. The opposite horizon stays cool rather than orange.
 float aureole=.014/pow(max(1.0-.94*mu,.065),1.35);
 color+=vec3(1.0,.82,.62)*(pow(towardSun,6.0)*.14+aureole*.45);
 vec3 horizonLight=horizon+vec3(.11,.065,.02)*pow(towardSun,4.0);
 color=mix(color,horizonLight,exp(-max(h,0.0)*12.0)*.5);
 if(h<0.0)color=mix(horizon,ground,smoothstep(0.0,.18,-h)*environment+smoothstep(0.0,.5,-h)*(1.0-environment)*.35);
 if(h>0.0){
  #if CLOUD_LAYERS > 1
  // Thin high-altitude cirrus: stretched, separate drift and very low opacity.
  // Only the detailed scenery profiles evaluate this extra layer.
  vec2 high=direction.xz/(h+.18)*vec2(1.5,6.0)+vec2(time*.0014,-time*.0007);
  float wisps=skyNoise(high)*.57+skyNoise(high*2.4+19.0)*.28+skyNoise(high*5.7)*.15;
  float cirrus=smoothstep(.53,.79,wisps)*smoothstep(.02,.25,h)*.23;
  color=mix(color,vec3(.91,.94,1.0)+vec3(.19,.12,.045)*pow(towardSun,6.0),cirrus);
  #endif
  // Lower cumulus: independent broad masses, sun-facing rims and shaded interiors.
  // The offset density approximates light travelling through each cloud mass.
  vec2 uv=direction.xz/(h+.105)*1.55+vec2(time*.0032,time*.0013);
  float density=skyFbm(uv),towards=skyFbm(uv+sunDirection.xz*.16);
  float horizonFade=smoothstep(.012,.18,h);
  float cover=smoothstep(1.0-cloudCover,1.22-cloudCover,density)*horizonFade;
  float thickness=smoothstep(1.01-cloudCover,1.32-cloudCover,density);
  float lit=clamp(.67+(density-towards)*3.8-thickness*.13,.23,1.0);
  vec3 cloud=mix(vec3(.34,.405,.52),vec3(1.08,1.06,1.01),lit);
  float silver=pow(towardSun,10.0)*(1.0-smoothstep(.3,.86,cover))*cover;
  cloud+=vec3(1.0,.85,.65)*(silver*1.7+pow(towardSun,5.0)*.14);
  color=mix(color,cloud,cover*.97);
  transmission=exp(-cover*7.0);
 }
 // A cloud also occludes the solar disc; otherwise it glowed on top of dark clouds.
 color+=vec3(22.0,19.0,15.0)*smoothstep(.99965,.99986,mu)*(1.0-environment*.9)*transmission;
 gl_FragColor=vec4(color,1.0);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function createSky(renderer,scene,{mobile=false,detail=mobile?'leve':'completo'}={}){
 const uniforms={
  sunDirection:{value:SUN_DIRECTION.clone()},zenith:{value:ZENITH.clone()},horizon:{value:HORIZON.clone()},ground:{value:GROUND.clone()},
  time:{value:0},cloudCover:{value:.53},environment:{value:0}
 };
 const quality=detailFor(detail);
 const material=new THREE.ShaderMaterial({name:'Ceu_dinamico',uniforms,vertexShader,fragmentShader,side:THREE.BackSide,depthWrite:false,fog:false,defines:{CLOUD_OCTAVES:quality.octaves,CLOUD_LAYERS:quality.layers}});
 const dome=new THREE.Mesh(new THREE.SphereGeometry(1,48,24),material);
 dome.name='Ceu';dome.frustumCulled=false;dome.renderOrder=-10;
 scene.add(dome);
 scene.background=null;
 scene.fog=new THREE.Fog(HORIZON.clone(),mobile?420:520,mobile?2400:3300);
 // Image-based lighting: reflections on paint, glass, rails and water come from the same sky.
 const envScene=new THREE.Scene(),envMaterial=material.clone();envMaterial.uniforms.environment.value=1;envMaterial.defines={CLOUD_OCTAVES:4,CLOUD_LAYERS:2};
 envScene.add(new THREE.Mesh(dome.geometry,envMaterial));
 const pmrem=new THREE.PMREMGenerator(renderer),environmentTarget=pmrem.fromScene(envScene,.025),environment=environmentTarget.texture;
 pmrem.dispose();envMaterial.dispose();
 scene.environment=environment;scene.environmentIntensity=.82;
 return {
  dome,environment,sunDirection:SUN_DIRECTION,horizon:HORIZON,
  update(dt){uniforms.time.value+=dt;},
  // The boolean API remains valid; scenery names also distinguish Básico and Ultra.
  setDetail(value){const next=detailFor(value);if(material.defines.CLOUD_OCTAVES!==next.octaves||material.defines.CLOUD_LAYERS!==next.layers){material.defines.CLOUD_OCTAVES=next.octaves;material.defines.CLOUD_LAYERS=next.layers;material.needsUpdate=true;}},
  dispose(){scene.remove(dome);dome.geometry.dispose();material.dispose();if(scene.environment===environment)scene.environment=null;environmentTarget.dispose();},
  info:()=>({clouds:uniforms.cloudCover.value,cloudOctaves:material.defines.CLOUD_OCTAVES,cloudLayers:material.defines.CLOUD_LAYERS,environment:!!scene.environment,fog:[scene.fog.near,scene.fog.far]})
 };
}
