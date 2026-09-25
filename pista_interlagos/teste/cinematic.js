import * as THREE from 'three';

// Film look for the whole game: the scene is drawn in linear HDR into an
// off-screen target, then ambient occlusion, São Paulo haze, bloom, the sun's
// lens glare, tone mapping and a colour grade are applied in a few screen passes.
// 'full' runs everything (desktop), 'lite' keeps only the haze and the grade
// (phones), 'off' draws straight to the screen as before.
export const CINEMATIC_LEVELS=['full','lite','off'];

// Colour grade and lens, in one place so the look can be tuned without touching the shaders.
export const LOOK={
 exposure:1.0,
 // Eye adaptation: the mean scene brightness it aims for, how far it may push the exposure
 // (dark cockpit, garages) and how fast it follows, per second.
 adaptKey:.125,adaptRange:[.8,1.9],adaptSpeed:1.5,
 // Afternoon white balance: a warm key light, slightly cooler shadows.
 whiteBalance:[1.035,1.0,.955],
 saturation:.9,greenSaturation:.72,contrast:1.12,
 shadowTint:[.978,1.0,1.028],highlightTint:[1.03,1.0,.955],
 vignette:.3,grain:.03,aberration:.0011,
 bloom:.075,bloomThreshold:1.05,bloomKnee:.7,
 // Ambient occlusion: radius in metres, strength and the distance it fades out.
 aoRadius:1.2,aoIntensity:2.2,aoBias:.2,aoFade:[70,160],
 // Aerial perspective: metres of clear air, density of the haze and how fast it thins with height.
 hazeDensity:.00032,hazeFalloff:.012,hazeStart:40,hazeColor:[.62,.69,.76],hazeSun:[1.0,.8,.58],
 flare:.9,streak:.45,
 // 0 picture, 1 occlusion only (for tuning).
 debug:0
};

const vertexShader=`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.0,1.0);}`;
const depthCommon=`
uniform sampler2D tDepth;uniform float cameraNear,cameraFar;uniform vec2 projScale,depthSize;
float viewZAt(vec2 uv){float d=texture2D(tDepth,uv).x;return (cameraNear*cameraFar)/((cameraFar-cameraNear)*d-cameraFar);}
// Positions are rebuilt at depth texel centres, so position and depth always belong to the same pixel.
vec3 viewPosAt(vec2 uv){uv=(floor(uv*depthSize)+.5)/depthSize;float z=viewZAt(uv);return vec3((uv*2.0-1.0)*(-z)/projScale,z);}
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
`;

// Scalable ambient obscurance from the depth buffer alone (normals rebuilt from
// depth), at half resolution; the linear depth rides along for the blur.
const aoShader=`${depthCommon}
uniform vec2 fullTexel;uniform float radius,intensity,bias,frame;uniform vec2 fade;
varying vec2 vUv;
#define SAMPLES 14
void main(){
 float d=texture2D(tDepth,vUv).x;
 if(d>=1.0){gl_FragColor=vec4(1.0,1e5,0.0,1.0);return;}
 vec3 p=viewPosAt(vUv);float dist=-p.z;
 if(dist>fade.y){gl_FragColor=vec4(1.0,dist,0.0,1.0);return;}
 // Normal from depth over a 2-pixel baseline, taking the flatter side at creases.
 vec2 e=fullTexel*2.0;
 vec3 l=viewPosAt(vUv-vec2(e.x,0.0)),r=viewPosAt(vUv+vec2(e.x,0.0)),b=viewPosAt(vUv-vec2(0.0,e.y)),t=viewPosAt(vUv+vec2(0.0,e.y));
 vec3 dx=abs(r.z-p.z)<abs(p.z-l.z)?r-p:p-l,dy=abs(t.z-p.z)<abs(p.z-b.z)?t-p:p-b;
 vec3 n=normalize(cross(dx,dy));
 // World radius grows a little with distance so far scenery keeps some contact shading.
 float rad=radius*(1.0+dist*.012),screenR=min(rad*projScale.y*.5/dist,.12);
 float spin=ign(gl_FragCoord.xy)*6.2831853,sum=0.0;
 for(int i=0;i<SAMPLES;i++){
  float a=(float(i)+.5)/float(SAMPLES),ang=a*37.699+spin;
  vec2 o=vec2(cos(ang),sin(ang))*sqrt(a)*screenR;o.x*=fullTexel.x/fullTexel.y;
  vec3 s=viewPosAt(vUv+o)-p;float len=length(s);
  // Ignore the tiny depth steps between terrain triangles (polygon offset) and grazing noise.
  float lift=dot(s,n)-bias*len-.004*dist;
  sum+=max(lift/max(len,1e-4),0.0)*(1.0-smoothstep(rad*.6,rad*1.4,len));
 }
 float ao=clamp(1.0-sum*intensity/float(SAMPLES),0.0,1.0);
 ao=mix(ao,1.0,smoothstep(fade.x,fade.y,dist));
 gl_FragColor=vec4(ao,dist,0.0,1.0);
}`;
// Depth-aware separable blur of the occlusion.
const blurShader=`uniform sampler2D tInput;uniform vec2 direction;varying vec2 vUv;
void main(){
 vec4 c=texture2D(tInput,vUv);float z=c.g,sum=c.r,weight=1.0;
 for(int i=1;i<=4;i++){for(int k=-1;k<=1;k+=2){
  vec4 s=texture2D(tInput,vUv+direction*float(i*k));
  float w=exp(-float(i*i)*.11)*exp(-abs(s.g-z)/(.02*z+.08));sum+=s.r*w;weight+=w;}}
 gl_FragColor=vec4(sum/weight,z,0.0,1.0);
}`;
// Bloom: soft-threshold prefilter and a dual-filter pyramid.
const prefilterShader=`uniform sampler2D tInput;uniform vec2 texel;uniform float threshold,knee;varying vec2 vUv;
void main(){
 vec3 c=(texture2D(tInput,vUv+texel*vec2(-.5,-.5)).rgb+texture2D(tInput,vUv+texel*vec2(.5,-.5)).rgb+texture2D(tInput,vUv+texel*vec2(-.5,.5)).rgb+texture2D(tInput,vUv+texel*vec2(.5,.5)).rgb)*.25;
 c=min(c,vec3(60.0));
 float br=max(c.r,max(c.g,c.b)),soft=clamp(br-threshold+knee,0.0,2.0*knee);soft=soft*soft/(4.0*knee+1e-4);
 gl_FragColor=vec4(c*max(soft,br-threshold)/max(br,1e-4),1.0);
}`;
const downShader=`uniform sampler2D tInput;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=texture2D(tInput,vUv).rgb*4.0;
 c+=texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb;
 gl_FragColor=vec4(c*.125,1.0);}`;
const upShader=`uniform sampler2D tInput,tBase;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=vec3(0.0);
 c+=texture2D(tInput,vUv+vec2(-texel.x*2.0,0.0)).rgb+texture2D(tInput,vUv+vec2(texel.x*2.0,0.0)).rgb+texture2D(tInput,vUv+vec2(0.0,-texel.y*2.0)).rgb+texture2D(tInput,vUv+vec2(0.0,texel.y*2.0)).rgb;
 c+=(texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb)*2.0;
 gl_FragColor=vec4(c/12.0+texture2D(tBase,vUv).rgb,1.0);}`;
// Depth of field: a quarter-resolution copy of the picture, spread back to half resolution.
const tentShader=`uniform sampler2D tInput;uniform vec2 texel;varying vec2 vUv;
void main(){vec3 c=texture2D(tInput,vUv).rgb*4.0;
 c+=(texture2D(tInput,vUv+vec2(texel.x,0.0)).rgb+texture2D(tInput,vUv-vec2(texel.x,0.0)).rgb+texture2D(tInput,vUv+vec2(0.0,texel.y)).rgb+texture2D(tInput,vUv-vec2(0.0,texel.y)).rgb)*2.0;
 c+=texture2D(tInput,vUv+texel).rgb+texture2D(tInput,vUv-texel).rgb+texture2D(tInput,vUv+vec2(texel.x,-texel.y)).rgb+texture2D(tInput,vUv-vec2(texel.x,-texel.y)).rgb;
 gl_FragColor=vec4(c/16.0,1.0);}`;
// How much of the sun disc is unobstructed (sky pixels around its screen position).
const sunShader=`uniform sampler2D tDepth;uniform vec2 sunUV,aspect;varying vec2 vUv;
void main(){float seen=0.0;
 for(int j=-4;j<=4;j++)for(int i=-4;i<=4;i++){vec2 uv=sunUV+vec2(float(i),float(j))*.0028*aspect;
  seen+=(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)?.35:step(1.0,texture2D(tDepth,uv).x);}
 gl_FragColor=vec4(seen/81.0,0.0,0.0,1.0);}`;

// Mean log luminance of 16x16 screen cells (4x4 samples each).
const lumShader=`uniform sampler2D tInput;varying vec2 vUv;
void main(){float s=0.0;
 for(int j=0;j<4;j++)for(int i=0;i<4;i++){vec3 c=texture2D(tInput,vUv+(vec2(float(i),float(j))-1.5)/64.0).rgb;s+=log(max(dot(c,vec3(.2126,.7152,.0722)),1e-4));}
 gl_FragColor=vec4(s/16.0,0.0,0.0,1.0);}`;
// Centre-weighted mean, eased toward over time: the exposure follows the eye, not every frame.
const adaptShader=`uniform sampler2D tLum,tPrev;uniform float rate;varying vec2 vUv;
void main(){float sum=0.0,wsum=0.0;
 for(int j=0;j<16;j++)for(int i=0;i<16;i++){vec2 uv=(vec2(float(i),float(j))+.5)/16.0;float w=1.0-.7*smoothstep(.15,.7,length((uv-.5)*vec2(1.0,1.3)));sum+=texture2D(tLum,uv).r*w;wsum+=w;}
 float now=sum/wsum,before=texture2D(tPrev,vec2(.5)).r;
 gl_FragColor=vec4(rate>=1.0?now:before+(now-before)*rate,0.0,0.0,1.0);}`;

const compositeShader=`${depthCommon}
uniform sampler2D tColor,tAO,tBloom,tSun,tExposure,tDof;uniform float dofFocus,dofAmount;uniform float adaptKey;uniform vec2 adaptRange;
uniform vec2 resolution,aoSize;uniform mat4 cameraWorld;uniform vec3 camPos,sunDir;uniform vec2 sunUV;uniform float sunFront;
uniform float debugView,exposure,time,speedBlur,aoStrength,bloomStrength,vignette,grain,aberration,saturation,greenSaturation,contrast,flare,streak;
uniform vec3 whiteBalance,shadowTint,highlightTint,hazeColor,hazeSun;uniform float hazeDensity,hazeFalloff,hazeStart,hazeBase;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){vec3 a=v*(v+.0245786)-.000090537,b=v*(.983729*v+.432951)+.238081;return a/b;}
vec3 aces(vec3 c){
 const mat3 i=mat3(vec3(.59719,.076,.0284),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));
 const mat3 o=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));
 return clamp(o*RRTAndODTFit(i*c/.6),0.0,1.0);}
vec3 toSRGB(vec3 c){c=max(c,vec3(0.0));return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(.0031308,c));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
 vec2 uv=vUv,fromCenter=uv-.5;float edge=dot(fromCenter,fromCenter);
 // Lens: slight colour fringing toward the frame edges.
 vec2 ca=fromCenter*edge*aberration*4.0;
 vec3 color=vec3(texture2D(tColor,uv+ca).r,texture2D(tColor,uv).g,texture2D(tColor,uv-ca).b);
 // Speed: radial smear at the edges of the frame.
 if(speedBlur>.001){
  vec3 acc=color;float w=1.0;
  for(int i=1;i<=6;i++){float k=float(i)/6.0;vec2 o=fromCenter*k*speedBlur*.03*smoothstep(.04,.25,edge);acc+=texture2D(tColor,uv-o).rgb*(1.0-k*.5);w+=1.0-k*.5;}
  color=acc/w;
 }
 float d=texture2D(tDepth,uv).x;
 vec3 viewPos=viewPosAt(uv);vec3 ray=normalize(mat3(cameraWorld)*viewPos);
 float dist=d>=1.0?1e5:length(viewPos);
 #ifdef BLOOM
 // Long-lens depth of field (broadcast camera and opening shots only).
 if(dofAmount>.001){float coc=clamp(abs(dist-dofFocus)/(dofFocus*.9)-.25,0.0,1.0)*dofAmount;color=mix(color,texture2D(tDof,uv).rgb,coc);}
 #endif
 #ifdef AO
 if(d<1.0){
  // Joint bilateral upsampling of the half-resolution occlusion.
  vec2 st=uv*aoSize-.5,base=floor(st),f=fract(st);float ao=0.0,wsum=0.0,z=-viewPos.z;
  for(int j=0;j<2;j++)for(int i=0;i<2;i++){
   vec2 c=(base+vec2(float(i),float(j))+.5)/aoSize;vec2 s=texture2D(tAO,c).rg;
   float w=(i==0?1.0-f.x:f.x)*(j==0?1.0-f.y:f.y)*exp(-abs(s.g-z)/(.03*z+.05))+1e-4;ao+=s.r*w;wsum+=w;}
  ao=ao/wsum;color*=mix(1.0,ao,aoStrength);
  if(debugView>.5){gl_FragColor=vec4(vec3(ao),1.0);return;}
 }
 #endif
 // Aerial perspective: height fog integrated along the view ray, lit by the sun.
 float sunAmount=max(dot(ray,sunDir),0.0);
 vec3 haze=mix(hazeColor,hazeSun,pow(sunAmount,6.0)*.75)*mix(1.0,1.18,pow(sunAmount,24.0));
 if(d<1.0){
  float h0=camPos.y-hazeBase,dy=ray.y*dist,falloff=hazeFalloff*dy;
  float optical=hazeDensity*exp(-hazeFalloff*h0)*max(dist-hazeStart,0.0)*(abs(falloff)>.001?(1.0-exp(-falloff))/falloff:1.0);
  color=mix(color,haze,1.0-exp(-optical));
 }
 #ifdef BLOOM
 color+=texture2D(tBloom,uv).rgb*bloomStrength;
 // The sun through the lens: soft glow, an anamorphic streak and ghosts mirrored through the centre.
 float sunSeen=texture2D(tSun,vec2(.5)).r*sunFront;
 if(sunSeen>.001){
  vec2 aspect=vec2(resolution.x/resolution.y,1.0),toSun=(uv-sunUV)*aspect;float r=length(toSun);
  vec3 sunLight=vec3(1.0,.86,.66)*sunSeen;
  color+=sunLight*(exp(-r*9.0)*.35+exp(-r*38.0)*.9)*flare;
  color+=vec3(1.0,.8,.62)*sunSeen*exp(-abs(toSun.y)*170.0)*exp(-abs(toSun.x)*2.4)*streak;
  vec2 axis=vec2(.5)-sunUV;
  for(int i=0;i<4;i++){
   float t=float(i)==0.0?.55:float(i)==1.0?1.1:float(i)==2.0?1.45:1.85;
   vec2 g=((sunUV+axis*t)-uv)*aspect;float size=float(i)==0.0?.035:float(i)==1.0?.07:float(i)==2.0?.022:.11;
   vec3 tint=float(i)==0.0?vec3(.55,.8,1.0):float(i)==1.0?vec3(1.0,.7,.45):float(i)==2.0?vec3(.6,1.0,.7):vec3(.8,.6,1.0);
   color+=tint*sunSeen*flare*.05*(1.0-smoothstep(size*.55,size,length(g)));
  }
 }
 #endif
 float adapted=clamp(adaptKey/exp(texture2D(tExposure,vec2(.5)).r),adaptRange.x,adaptRange.y);
 color*=whiteBalance*exposure*adapted;
 color=aces(color);
 // Grade in display space: split toning, gentle S-curve, softer greens.
 color=toSRGB(color);
 float l=luma(color);
 color*=mix(shadowTint,highlightTint,smoothstep(.15,.75,l));
 color=clamp((color-.5)*contrast+.5,0.0,1.0);
 color=mix(color,color*color*(3.0-2.0*color),.22);
 l=luma(color);
 float green=clamp((color.g-max(color.r,color.b))*4.0,0.0,1.0);
 color=mix(vec3(l),color,saturation*mix(1.0,greenSaturation,green));
 float v=smoothstep(.2,1.05,length(fromCenter*vec2(resolution.x/resolution.y,1.0))*1.05);
 color*=1.0-vignette*v*v;
 // Fine film grain doubles as dithering against banding in the sky.
 float n=ign(gl_FragCoord.xy+fract(time*7.3)*113.0)-.5;
 color+=n*grain*(1.0-l*.6);
 gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;

export function createCinematic(renderer,{mobile=false,level=mobile?'lite':'full'}={}){
 const look={...LOOK};
 const quadScene=new THREE.Scene(),quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
 const triangle=new THREE.BufferGeometry();triangle.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 const quad=new THREE.Mesh(triangle);quad.frustumCulled=false;quadScene.add(quad);
 const pass=(fragmentShader,uniforms,defines={})=>new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,defines,depthTest:false,depthWrite:false,toneMapped:false});
 const target=(options={})=>{const t=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false,...options});t.texture.generateMipmaps=false;t.texture.minFilter=t.texture.magFilter=THREE.LinearFilter;return t;};
 let dofHalf=null,dofQuarter=null,dofBlur=null,hdr=null,aoA=null,aoB=null,sunTarget=null,lumTarget=null,adapt=[null,null],adaptReset=true;const bloom=[];
 const depthUniforms=()=>({tDepth:{value:null},cameraNear:{value:.1},cameraFar:{value:1000},projScale:{value:new THREE.Vector2(1,1)},depthSize:{value:new THREE.Vector2(1,1)}});
 const aoMaterial=pass(aoShader,{...depthUniforms(),fullTexel:{value:new THREE.Vector2()},radius:{value:look.aoRadius},intensity:{value:look.aoIntensity},bias:{value:look.aoBias},frame:{value:0},fade:{value:new THREE.Vector2(...look.aoFade)}});
 const blurMaterial=pass(blurShader,{tInput:{value:null},direction:{value:new THREE.Vector2()}});
 const prefilter=pass(prefilterShader,{tInput:{value:null},texel:{value:new THREE.Vector2()},threshold:{value:look.bloomThreshold},knee:{value:look.bloomKnee}});
 const down=pass(downShader,{tInput:{value:null},texel:{value:new THREE.Vector2()}});
 const up=pass(upShader,{tInput:{value:null},tBase:{value:null},texel:{value:new THREE.Vector2()}});
 const sunMaterial=pass(sunShader,{tDepth:{value:null},sunUV:{value:new THREE.Vector2()},aspect:{value:new THREE.Vector2(1,1)}});
 const compositeUniforms={...depthUniforms(),tColor:{value:null},tAO:{value:null},tBloom:{value:null},tSun:{value:null},
  resolution:{value:new THREE.Vector2()},aoSize:{value:new THREE.Vector2()},cameraWorld:{value:new THREE.Matrix4()},camPos:{value:new THREE.Vector3()},
  sunDir:{value:new THREE.Vector3(0,1,0)},sunUV:{value:new THREE.Vector2()},sunFront:{value:0},time:{value:0},speedBlur:{value:0},
  tDof:{value:null},dofFocus:{value:10},dofAmount:{value:0},tExposure:{value:null},adaptKey:{value:.2},adaptRange:{value:new THREE.Vector2(1,1)},debugView:{value:0},exposure:{value:0},aoStrength:{value:0},bloomStrength:{value:0},vignette:{value:0},grain:{value:0},aberration:{value:0},saturation:{value:1},greenSaturation:{value:1},contrast:{value:1},flare:{value:0},streak:{value:0},
  whiteBalance:{value:new THREE.Vector3()},shadowTint:{value:new THREE.Vector3()},highlightTint:{value:new THREE.Vector3()},hazeColor:{value:new THREE.Vector3()},hazeSun:{value:new THREE.Vector3()},
  hazeDensity:{value:0},hazeFalloff:{value:0},hazeStart:{value:0},hazeBase:{value:0}};
 const tent=pass(tentShader,{tInput:{value:null},texel:{value:new THREE.Vector2()}});
 const lumMaterial=pass(lumShader,{tInput:{value:null}}),adaptMaterial=pass(adaptShader,{tLum:{value:null},tPrev:{value:null},rate:{value:1}});
 const composites={full:pass(compositeShader,compositeUniforms,{AO:'',BLOOM:''}),lite:pass(compositeShader,compositeUniforms)};
 const size=new THREE.Vector2(),sunProjected=new THREE.Vector3(),cameraDirection=new THREE.Vector3();
 let width=0,height=0,frame=0,time=0,previousToneMapping=renderer.toneMapping,previousColorSpace=renderer.outputColorSpace;
 const stats={level,passes:0,width:0,height:0,samples:0,sunVisible:0};

 function allocate(){
  dispose();
  // Multisampling of the HDR frame: 4x up to about 1080p, fewer on very large drawing buffers
  // (a 4x half-float frame at 4K would take hundreds of MB of video memory).
  const pixels=width*height,samples=level!=='full'?0:pixels<2.3e6?4:pixels<5.2e6?2:0;
  hdr=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples,depthTexture:new THREE.DepthTexture(width,height,THREE.FloatType)});
  hdr.texture.minFilter=hdr.texture.magFilter=THREE.LinearFilter;hdr.texture.generateMipmaps=false;
  // Passes that only draw for the player's own view (lake reflections) treat this target as the screen.
  hdr.isMainView=true;stats.samples=samples;
  lumTarget=target();lumTarget.setSize(16,16);lumTarget.texture.minFilter=lumTarget.texture.magFilter=THREE.NearestFilter;
  adapt=[target(),target()];for(const t of adapt)t.setSize(1,1);adaptReset=true;
  if(level!=='full')return;
  const hw=Math.max(1,width>>1),hh=Math.max(1,height>>1);
  aoA=target({type:THREE.HalfFloatType,format:THREE.RGFormat});aoB=target({type:THREE.HalfFloatType,format:THREE.RGFormat});aoA.setSize(hw,hh);aoB.setSize(hw,hh);
  for(const t of [aoA,aoB])t.texture.minFilter=t.texture.magFilter=THREE.NearestFilter;
  for(let i=0,w=hw,h=hh;i<5;i++,w=Math.max(1,w>>1),h=Math.max(1,h>>1)){const a=target(),b=target();a.setSize(w,h);b.setSize(w,h);bloom.push({down:a,up:b,w,h});}
  sunTarget=target({type:THREE.UnsignedByteType});sunTarget.setSize(1,1);
  dofHalf=target();dofHalf.setSize(hw,hh);dofBlur=target();dofBlur.setSize(hw,hh);dofQuarter=target();dofQuarter.setSize(Math.max(1,hw>>1),Math.max(1,hh>>1));
 }
 function dispose(){for(const t of [hdr,aoA,aoB,sunTarget,lumTarget,dofHalf,dofQuarter,dofBlur,...adapt])if(t){t.depthTexture?.dispose();t.dispose();}for(const b of bloom){b.down.dispose();b.up.dispose();}bloom.length=0;hdr=aoA=aoB=sunTarget=lumTarget=dofHalf=dofQuarter=dofBlur=null;adapt=[null,null];}
 function draw(material,output){quad.material=material;renderer.setRenderTarget(output);renderer.render(quadScene,quadCamera);stats.passes++;}
 // Materials compile for the render target they draw into: with the look on, the scene is
 // linear and un-tone-mapped both on screen and off it, so load-time compiles stay valid.
 function applyRendererState(){
  if(level==='off'){renderer.toneMapping=previousToneMapping;renderer.outputColorSpace=previousColorSpace;}
  else{renderer.toneMapping=THREE.NoToneMapping;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;}
 }
 applyRendererState();

 return {
  look,stats,
  get level(){return level;},
  setLevel(value){if(!CINEMATIC_LEVELS.includes(value)||value===level)return level;level=value;stats.level=level;width=height=0;if(level==='off')dispose();applyRendererState();return level;},
  // context: {dt, speed (m/s), mode (camera), hazeBase (m)}
  render(scene,camera,{dt=0,speed=0,mode='chase',hazeBase=0,dof=null}={}){
   if(level==='off'){renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
   renderer.getDrawingBufferSize(size);
   if(size.x!==width||size.y!==height||!hdr){width=size.x;height=size.y;allocate();}
   time+=dt;frame=(frame+1)%64;stats.passes=0;stats.width=width;stats.height=height;
   const info=renderer.info,autoReset=info.autoReset;
   renderer.setRenderTarget(hdr);renderer.render(scene,camera);
   const calls=info.render.calls,triangles=info.render.triangles;info.autoReset=false;
   const projection=camera.projectionMatrix.elements;
   for(const m of [aoMaterial,composites.full,composites.lite]){const u=m.uniforms;u.tDepth.value=hdr.depthTexture;u.cameraNear.value=camera.near;u.cameraFar.value=camera.far;u.projScale.value.set(projection[0],projection[5]);u.depthSize.value.set(width,height);}
   const u=compositeUniforms;
   if(level==='full'){
    const hw=aoA.width,hh=aoA.height;
    aoMaterial.uniforms.fullTexel.value.set(1/width,1/height);aoMaterial.uniforms.frame.value=frame;
    aoMaterial.uniforms.radius.value=look.aoRadius;aoMaterial.uniforms.intensity.value=look.aoIntensity;aoMaterial.uniforms.bias.value=look.aoBias;aoMaterial.uniforms.fade.value.set(...look.aoFade);
    draw(aoMaterial,aoA);
    blurMaterial.uniforms.tInput.value=aoA.texture;blurMaterial.uniforms.direction.value.set(1/hw,0);draw(blurMaterial,aoB);
    blurMaterial.uniforms.tInput.value=aoB.texture;blurMaterial.uniforms.direction.value.set(0,1/hh);draw(blurMaterial,aoA);
    prefilter.uniforms.tInput.value=hdr.texture;prefilter.uniforms.texel.value.set(1/width,1/height);prefilter.uniforms.threshold.value=look.bloomThreshold;prefilter.uniforms.knee.value=look.bloomKnee;
    draw(prefilter,bloom[0].down);
    for(let i=1;i<bloom.length;i++){down.uniforms.tInput.value=bloom[i-1].down.texture;down.uniforms.texel.value.set(1/bloom[i-1].w,1/bloom[i-1].h);draw(down,bloom[i].down);}
    let source=bloom[bloom.length-1].down;
    for(let i=bloom.length-2;i>=0;i--){up.uniforms.tInput.value=source.texture;up.uniforms.tBase.value=bloom[i].down.texture;up.uniforms.texel.value.set(1/bloom[i+1].w,1/bloom[i+1].h);draw(up,bloom[i].up);source=bloom[i].up;}
    // Where the sun is on screen, and whether it is in front of the camera at all.
    camera.getWorldDirection(cameraDirection);
    sunProjected.copy(u.sunDir.value).multiplyScalar(camera.far*.5).add(camera.position).project(camera);
    const front=cameraDirection.dot(u.sunDir.value)>.05&&Math.abs(sunProjected.x)<1.4&&Math.abs(sunProjected.y)<1.4;
    u.sunUV.value.set(sunProjected.x*.5+.5,sunProjected.y*.5+.5);u.sunFront.value=front?1:0;
    sunMaterial.uniforms.tDepth.value=hdr.depthTexture;sunMaterial.uniforms.sunUV.value.copy(u.sunUV.value);sunMaterial.uniforms.aspect.value.set(height/width,1);
    if(front)draw(sunMaterial,sunTarget);
    // Depth of field only when a shot asks for it: {focus: metres, amount: 0..1}.
    u.dofAmount.value=dof?.amount??0;
    if(u.dofAmount.value>.001){
     u.dofFocus.value=Math.max(.5,dof.focus);
     down.uniforms.tInput.value=hdr.texture;down.uniforms.texel.value.set(1/width,1/height);draw(down,dofHalf);
     down.uniforms.tInput.value=dofHalf.texture;down.uniforms.texel.value.set(1/dofHalf.width,1/dofHalf.height);draw(down,dofQuarter);
     tent.uniforms.tInput.value=dofQuarter.texture;tent.uniforms.texel.value.set(1/dofQuarter.width,1/dofQuarter.height);draw(tent,dofBlur);
     u.tDof.value=dofBlur.texture;
    }
    u.tAO.value=aoA.texture;u.tBloom.value=bloom[0].up.texture;u.tSun.value=sunTarget.texture;u.aoSize.value.set(hw,hh);
   }
   // Eye adaptation: scene brightness, eased toward from the previous frame.
   lumMaterial.uniforms.tInput.value=hdr.texture;draw(lumMaterial,lumTarget);
   adaptMaterial.uniforms.tLum.value=lumTarget.texture;adaptMaterial.uniforms.tPrev.value=adapt[0].texture;
   adaptMaterial.uniforms.rate.value=adaptReset?1:1-Math.exp(-Math.min(dt,.1)*look.adaptSpeed);draw(adaptMaterial,adapt[1]);
   adapt.reverse();adaptReset=false;u.tExposure.value=adapt[0].texture;u.adaptKey.value=look.adaptKey;u.adaptRange.value.set(...look.adaptRange);
   u.tColor.value=hdr.texture;u.resolution.value.set(width,height);u.cameraWorld.value.copy(camera.matrixWorld);u.camPos.value.copy(camera.position);u.time.value=time;
   u.debugView.value=look.debug;u.exposure.value=look.exposure;u.aoStrength.value=1;u.bloomStrength.value=look.bloom;u.vignette.value=look.vignette;u.grain.value=look.grain;u.aberration.value=look.aberration;
   u.saturation.value=look.saturation;u.greenSaturation.value=look.greenSaturation;u.contrast.value=look.contrast;u.flare.value=look.flare;u.streak.value=look.streak;
   u.whiteBalance.value.set(...look.whiteBalance);u.shadowTint.value.set(...look.shadowTint);u.highlightTint.value.set(...look.highlightTint);
   u.hazeColor.value.set(...look.hazeColor);u.hazeSun.value.set(...look.hazeSun);u.hazeDensity.value=look.hazeDensity;u.hazeFalloff.value=look.hazeFalloff;u.hazeStart.value=look.hazeStart;u.hazeBase.value=hazeBase;
   // A little smear at speed, only for the cameras that ride with the car.
   const riding=mode==='chase'||mode==='close'||mode==='hood'||mode==='cockpit';
   u.speedBlur.value=level==='full'&&riding?THREE.MathUtils.clamp((speed-34)/45,0,1):0;
   draw(composites[level],null);
   info.render.calls=calls;info.render.triangles=triangles;info.autoReset=autoReset;
   stats.sunVisible=u.sunFront.value;
  },
  // Compile the scene's programs for the off-screen target during loading.
  async compile(scene,camera){
   if(level==='off')return renderer.compileAsync(scene,camera);
   renderer.getDrawingBufferSize(size);if(!hdr||size.x!==width||size.y!==height){width=size.x;height=size.y;allocate();}
   const previous=renderer.getRenderTarget();renderer.setRenderTarget(hdr);
   let pending;try{pending=renderer.compileAsync(scene,camera);}finally{renderer.setRenderTarget(previous);}
   await pending;
  },
  setSun(direction){compositeUniforms.sunDir.value.copy(direction).normalize();},
  dispose(){dispose();for(const m of [aoMaterial,blurMaterial,prefilter,down,up,tent,sunMaterial,lumMaterial,adaptMaterial,composites.full,composites.lite])m.dispose();triangle.dispose();},
  // Reads the adapted mean luminance back from the GPU: for tests and tuning only.
  adaptation(){if(!adapt[0])return null;const out=new Uint16Array(4);renderer.readRenderTargetPixels(adapt[0],0,0,1,1,out);const mean=Math.exp(THREE.DataUtils.fromHalfFloat(out[0]));
   return {mean,scale:THREE.MathUtils.clamp(look.adaptKey/mean,...look.adaptRange)};},
  resetAdaptation(){adaptReset=true;},
  info:()=>({...stats,look:{...look}})
 };
}
