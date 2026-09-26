import * as THREE from 'three';

// Water around the car as a height field the hull pushes through: linearised
// shallow-water waves, where every crest runs at sqrt(g*depth) (2.9 m/s over the
// 0.85 m basin, slower up the banks). The hull enters as a pressure head equal to its
// draft; under the floor only a thin gap lets water through, and the water the moving
// body sweeps into is shoved just past its edge (plough), so it piles up against the
// bumper and spills round the sides. Faster than the waves the car drags a V behind
// it, like a boat; slower, the pushed mound runs ahead of it. Behind the tail a trough
// fills in, and what the car pushed keeps running and sloshes back after it stops.
// The grid moves with the car in whole cells, so the waves stay where they were made.
// Physics frame: x, y horizontal, z up (three.js z = -y).
// GAP: share of the depth left under a car sitting on the bed (the floor is ~16 cm up).
// SPILL: a crest taller than this above the level breaks and leaves as spray.
const G=9.81,STEP=1/60,SPONGE=10,SHALLOW=.12,FOAM_LIFE=3.5,MUD_LIFE=30,MAX_WAVE=.9,GAP=.15,SPILL=.42;
// Where the swept water lands past the body's edge: distance (m) and share.
const PLOUGH=[.25,.35,.7,.3,1.3,.2,2,.15];
// Highest the shown water may stand inside the body's plan.
const INSIDE=.06;
// Share of the hole left behind the body that the flow around it fills at once.
const CLOSE=.5,FLANK=[-.8,0,.8].flatMap(x=>[.25,.75,-.25,-.75].map(y=>[x,y]));
// Numerical viscosity: a light blur of the surface each tick that only damps ripples a
// cell or two long (grid noise), leaving the real waves alone. Keeps the water volume.
const SMOOTH=.01;
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
// 1 inside [a,b], easing to 0 over `soft` metres centred on each edge.
const box=(t,a,b,soft)=>smooth((t-a)/soft+.5)*smooth((b-t)/soft+.5);

export class LakeWaves {
 constructor(water,{mobile=false}={}){
  this.water=water;this.mobile=mobile;
  this.n=mobile?112:192;this.cell=mobile?.4:.3;
  const n=this.n,cells=n*n;
  for(const key of ['h','v','foam','mud','depth','gap','damp','sponge','push','pushBefore','scratch'])this[key]=new Float32Array(cells);
  this.data=new Float32Array(cells*4);
  // Read in the vertex shader at texel centres only: exact float values, no filtering needed.
  this.texture=new THREE.DataTexture(this.data,n,n,THREE.RGBAFormat,THREE.FloatType);
  this.texture.name='Ondas_do_lago';this.texture.magFilter=this.texture.minFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
  // Shared by every lake material: the patch mesh reads the field, the flat lakes leave its square to it.
  this.uniforms={waveMap:{value:this.texture},waveGrid:{value:new THREE.Vector3(1/n,this.cell,0)},waveRect:{value:new THREE.Vector4()},waveOn:{value:0}};
  this.x0=0;this.y0=0;this.level=0;this.active=false;this.accumulator=0;this.dirty=false;this.quiet=0;this.pressed=false;this.fresh=true;
  this.bodies=[];this.spill={volume:0,x:0,y:0};
  this.stats={steps:0,shifts:0,placed:0,drops:0,height:0,foam:0,mud:0,spilled:0};
 }
 get size(){return this.n*this.cell;}
 // Centre of the grid (x0, y0 is its corner), physics frame.
 get center(){return [this.x0+this.size/2,this.y0+this.size/2];}
 // Start a fresh field around (x, y) at the level of that lake.
 place(x,y,level){
  const {n,cell}=this;
  this.level=level;this.x0=Math.round(x/cell-n/2)*cell;this.y0=Math.round(y/cell-n/2)*cell;
  for(const a of [this.h,this.v,this.foam,this.mud,this.push,this.pushBefore,this.depth])a.fill(0);
  this.survey(null);this.active=true;this.quiet=0;this.dirty=true;this.fresh=true;this.stats.placed++;
 }
 // Slide the grid by whole cells, keeping the water that stays inside.
 shift(dk,dj){
  const n=this.n,k0=Math.max(0,-dk),k1=Math.min(n,n-dk),j0=Math.max(0,-dj),j1=Math.min(n,n-dj);
  for(const a of [this.h,this.v,this.foam,this.mud,this.pushBefore,this.depth]){
   const copy=a.slice();a.fill(0);
   if(k1>k0)for(let j=j0;j<j1;j++)a.set(copy.subarray((j+dj)*n+k0+dk,(j+dj)*n+k1+dk),j*n+k0);
  }
  this.x0+=dk*this.cell;this.y0+=dj*this.cell;this.push.fill(0);
  this.survey({k0,k1,j0,j1});this.dirty=true;this.stats.shifts++;
 }
 // Depth of every new cell (0 on land), then the damping: a sponge along the grid's
 // border so the waves leave it instead of bouncing, and the banks, where they break.
 survey(keep){
  const {n,cell,water,level,depth,damp,sponge}=this;
  for(let j=0;j<n;j++)for(let k=0;k<n;k++){
   const i=j*n+k;
   if(!keep||k<keep.k0||k>=keep.k1||j<keep.j0||j>=keep.j1){
    const w=water.at(this.x0+(k+.5)*cell,this.y0+(j+.5)*cell);
    depth[i]=w&&Math.abs(w.level-level)<.3?Math.max(.04,w.depth):0;
   }
   const edge=Math.min(k,j,n-1-k,n-1-j),d=depth[i];
   sponge[i]=edge<SPONGE?((SPONGE-edge)/SPONGE)**2:0;
   damp[i]=.12+3*sponge[i]+(d>0&&d<SHALLOW?2.5*(1-d/SHALLOW):0);
   if(!d){this.h[i]=this.v[i]=this.foam[i]=this.mud[i]=0;}
  }
 }
 // Keep the grid on the car, trailing it when moving so the wake has room behind.
 // Returns whether the field is running.
 follow(x,y,vx,vy){
  const near=this.water.near(x,y),size=this.size,close=!!near&&near.shore>-size*.3;
  if(close){
   const [cx,cy]=this.center;
   if(!this.active||Math.abs(near.level-this.level)>.3||Math.hypot(x-cx,y-cy)>size*.45)this.place(x,y,near.level);
   else{
    const speed=Math.hypot(vx,vy),lead=Math.min(speed*.8,size*.2),tx=speed>1?x-vx/speed*lead:x,ty=speed>1?y-vy/speed*lead:y;
    if(Math.hypot(tx-cx,ty-cy)>size*.12)this.shift(Math.round((tx-cx)/this.cell),Math.round((ty-cy)/this.cell));
   }
  }else if(this.active&&this.quiet>2){this.active=false;this.dirty=true;}
  return this.active;
 }
 // Fixed-rate integration; `press` lays the car's pressure on the field before each tick.
 step(dt,press){
  if(!this.active)return;
  this.accumulator+=dt;
  while(this.accumulator>=STEP){this.accumulator-=STEP;this.push.fill(0);this.pressed=false;this.bodies.length=0;press?.(this);this.tick(STEP);}
 }
 cellAt(x,y){
  const k=Math.floor((x-this.x0)/this.cell),j=Math.floor((y-this.y0)/this.cell);
  return k<1||j<1||k>=this.n-1||j>=this.n-1?-1:j*this.n+k;
 }
 // The hull: its draft below the surface over the plan of the body, softened at the
 // edges so the water is shoved aside over half a metre instead of by a step.
 // shape: {front, rear, half, soft, bottom} in metres from the centre of mass.
 pressHull(car,{f,l,u},shape,gain=1){
  const {n,cell,push,depth,level}=this,reach=Math.hypot(Math.max(shape.front,shape.rear),shape.half)+shape.soft;
  const k0=Math.max(1,Math.floor((car.x-reach-this.x0)/cell)),k1=Math.min(n-2,Math.ceil((car.x+reach-this.x0)/cell));
  const j0=Math.max(1,Math.floor((car.y-reach-this.y0)/cell)),j1=Math.min(n-2,Math.ceil((car.y+reach-this.y0)/cell));
  let draft=0;
  for(let j=j0;j<=j1;j++)for(let k=k0;k<=k1;k++){
   const i=j*n+k;if(!depth[i])continue;
   const px=this.x0+(k+.5)*cell-car.x,py=this.y0+(j+.5)*cell-car.y,bx=px*f[0]+py*f[1],by=px*l[0]+py*l[1];
   const m=box(bx,-shape.rear,shape.front,shape.soft)*box(by,-shape.half,shape.half,shape.soft);if(m<=0)continue;
   const d=Math.min(1.2,Math.max(0,level-(car.z+f[2]*bx+l[2]*by+u[2]*shape.bottom)));
   if(d*m*gain>push[i])push[i]=d*m*gain;draft=Math.max(draft,d);
  }
  if(draft>0){this.pressed=true;this.bodies.push({x:car.x,y:car.y,f,l,vx:car.vx,vy:car.vy,yaw:car.yaw??0,shape,k0,k1,j0,j1});}
  return draft;
 }
 // Snowplough: the water a moving body sweeps into does not rise in place, it leaves just
 // past the body's edge, the way that part of the body is moving (the bumper shoves it
 // ahead, the flanks aside when the car yaws). It piles up there and spills around.
 // Where the body moves out, the water streaming past its flanks closes in behind it.
 plough(b){
  const {n,cell,h,push:P,pushBefore,depth}=this,s=b.shape,front=s.front+s.soft*.5,rear=-s.rear-s.soft*.5,side=s.half+s.soft*.5;
  for(let j=b.j0;j<=b.j1;j++)for(let k=b.k0;k<=b.k1;k++){
   const i=j*n+k,dp=P[i]-pushBefore[i];if(Math.abs(dp)<=1e-5||!depth[i])continue;
   const px=this.x0+(k+.5)*cell-b.x,py=this.y0+(j+.5)*cell-b.y,wx=b.vx-b.yaw*py,wy=b.vy+b.yaw*px,speed=Math.hypot(wx,wy);if(speed<.3)continue;
   const bx=px*b.f[0]+py*b.f[1],by=px*b.l[0]+py*b.l[1],ux=(wx*b.f[0]+wy*b.f[1])/speed,uy=(wx*b.l[0]+wy*b.l[1])/speed;
   if(dp<0){
    // From a band along each flank, beside the body at this station.
    const take=-dp*CLOSE/FLANK.length;let moved=0;
    for(const [ax,ay] of FLANK){const fx=bx+ax,fy=Math.sign(ay)*side+ay;if(this.splat(b.x+b.f[0]*fx+b.l[0]*fy,b.y+b.f[1]*fx+b.l[1]*fy,-take))moved+=take;}
    h[i]+=moved;continue;
   }
   let t=Infinity;
   if(ux>1e-6)t=Math.min(t,(front-bx)/ux);else if(ux<-1e-6)t=Math.min(t,(rear-bx)/ux);
   if(uy>1e-6)t=Math.min(t,(side-by)/uy);else if(uy<-1e-6)t=Math.min(t,(-side-by)/uy);
   // Spread over the two metres ahead of the edge: the pushed water is a mound, not a ridge.
   t=Math.max(0,t);let moved=0;
   for(let s=0;s<PLOUGH.length;s+=2){const r=t+PLOUGH[s],tx=bx+ux*r,ty=by+uy*r;if(this.splat(b.x+b.f[0]*tx+b.l[0]*ty,b.y+b.f[1]*tx+b.l[1]*ty,dp*PLOUGH[s+1]))moved+=dp*PLOUGH[s+1];}
   h[i]-=moved;
  }
 }
 // Add water at a point, shared bilinearly between the four nearest cells (wet ones only).
 splat(x,y,amount){
  const {n,cell,h,depth}=this,fx=(x-this.x0)/cell-.5,fy=(y-this.y0)/cell-.5,k=Math.floor(fx),j=Math.floor(fy);
  if(k<1||j<1||k>=n-2||j>=n-2)return false;
  const u=fx-k,w=fy-j,i=j*n+k,cells=[i,i+1,i+n,i+n+1],weights=[(1-u)*(1-w),u*(1-w),(1-u)*w,u*w];
  let wet=0;for(let c=0;c<4;c++)if(depth[cells[c]])wet+=weights[c];if(wet<1e-3)return false;
  for(let c=0;c<4;c++)if(depth[cells[c]])h[cells[c]]+=amount*weights[c]/wet;
  return true;
 }
 // The spray the breaking bow wave threw since the last call: volume (m³) and where.
 takeSpill(){const s=this.spill,out={volume:s.volume,x:s.volume?s.x/s.volume:0,y:s.volume?s.y/s.volume:0};s.volume=s.x=s.y=0;return out;}
 // A tyre in the water: a narrow push, chop and the bed's mud stirred up.
 pressWheel(x,y,submerged,speed,dt=STEP){
  const {n,cell,push,depth}=this,r=.45,k0=Math.floor((x-r-this.x0)/cell),k1=Math.ceil((x+r-this.x0)/cell),j0=Math.floor((y-r-this.y0)/cell),j1=Math.ceil((y+r-this.y0)/cell);
  if(submerged<=0)return;
  for(let j=Math.max(1,j0);j<=Math.min(n-2,j1);j++)for(let k=Math.max(1,k0);k<=Math.min(n-2,k1);k++){
   const i=j*n+k;if(!depth[i])continue;
   const dx=this.x0+(k+.5)*cell-x,dy=this.y0+(j+.5)*cell-y,g=Math.exp(-(dx*dx+dy*dy)/(2*.2*.2));if(g<.02)continue;
   const p=Math.min(submerged,.63)*.45*g;if(p>push[i])push[i]=p;
   this.v[i]+=(Math.random()-.5)*Math.min(speed,15)*.02*g;
   this.mud[i]=Math.min(1,this.mud[i]+Math.min(speed,10)*g*dt*.9);
  }
  this.pressed=true;
 }
 // A falling drop: a small dent in the surface.
 drop(x,y,strength){const i=this.cellAt(x,y);if(i<0||!this.depth[i])return;this.v[i]-=strength;this.stats.drops++;this.dirty=true;}
 tick(dt){
  const {n,h,v,depth,push:P,damp,sponge,foam,mud,pushBefore,gap:d}=this,a=G*dt/(this.cell*this.cell),area=this.cell*this.cell;
  if(!this.fresh)for(const b of this.bodies)this.plough(b);
  this.fresh=false;
  // Under the car the water only flows through the gap below the floor, so what the body
  // sweeps up has to go ahead and around it instead of under it.
  for(let i=0;i<n*n;i++){const di=depth[i];d[i]=P[i]>0?Math.max(di*GAP,di-P[i]):di;}
  // Symplectic Euler on d²h/dt² = div(g·depth·grad(h + push)): land faces carry no flux.
  for(let j=1;j<n-1;j++){let i=j*n;for(let k=1;k<n-1;k++){
   i++;const di=d[i];if(!di)continue;
   const e=h[i]+P[i],dl=d[i-1],dr=d[i+1],dd=d[i-n],du=d[i+n];
   const acc=(dl<di?dl:di)*(h[i-1]+P[i-1]-e)+(dr<di?dr:di)*(h[i+1]+P[i+1]-e)+(dd<di?dd:di)*(h[i-n]+P[i-n]-e)+(du<di?du:di)*(h[i+n]+P[i+n]-e);
   v[i]=(v[i]+acc*a)*(1-damp[i]*dt);
  }}
  const fade=Math.exp(-dt/FOAM_LIFE),settle=Math.exp(-dt/MUD_LIFE);
  let height=0,white=0,brown=0;
  for(let i=0;i<n*n;i++){
   const di=depth[i];if(!di)continue;
   let hi=h[i]+v[i]*dt;if(sponge[i])hi*=1-sponge[i]*dt;
   if(hi>SPILL&&!P[i]){const lost=(hi-SPILL)*area,s=this.spill;s.volume+=lost;s.x+=lost*(this.x0+(i%n+.5)*this.cell);s.y+=lost*(this.y0+(Math.floor(i/n)+.5)*this.cell);this.stats.spilled+=lost;hi=SPILL;}
   h[i]=hi=hi>MAX_WAVE?MAX_WAVE:hi<-MAX_WAVE?-MAX_WAVE:hi;
   // Whitewater: where the hull tears through (its push changing under the water) and where
   // a crest grows too tall for the depth and breaks. Stirred mud lingers much longer.
   const crest=hi-Math.max(.09,.55*di);
   foam[i]=Math.min(1.5,foam[i]*fade+Math.abs(P[i]-pushBefore[i])*1.4+(crest>0?crest*dt*14:0));
   mud[i]*=settle;pushBefore[i]=P[i];
   const shown=Math.abs(hi+P[i]);if(shown>height)height=shown;if(foam[i]>white)white=foam[i];if(mud[i]>brown)brown=mud[i];
  }
  // Foam and mud drift apart slowly; the surface loses its grid-sized noise.
  const s=this.scratch;s.set(h);
  for(let j=1;j<n-1;j++){let i=j*n;for(let k=1;k<n-1;k++){i++;if(!depth[i])continue;
   let flow=0;for(const o of [i-1,i+1,i-n,i+n])if(depth[o])flow+=s[o]-s[i];h[i]+=SMOOTH*flow;}}
  for(let j=1;j<n-1;j++){let i=j*n;for(let k=1;k<n-1;k++){i++;if(!depth[i])continue;
   foam[i]+=.06*((foam[i-1]+foam[i+1]+foam[i-n]+foam[i+n])*.25-foam[i]);mud[i]+=.03*((mud[i-1]+mud[i+1]+mud[i-n]+mud[i+n])*.25-mud[i]);}}
  this.quiet=!this.pressed&&height<.004&&white<.02&&brown<.03?this.quiet+dt:0;
  Object.assign(this.stats,{height,foam:white,mud:brown});this.stats.steps++;this.dirty=true;
 }
 // Water height (above the lake level) at a point, bilinear; 0 off the grid and on land.
 heightAt(x,y){
  if(!this.active)return 0;
  const {n,cell,h,depth}=this,fx=(x-this.x0)/cell-.5,fy=(y-this.y0)/cell-.5,k=Math.floor(fx),j=Math.floor(fy);
  if(k<0||j<0||k>=n-1||j>=n-1)return 0;
  const u=fx-k,w=fy-j,i=j*n+k,at=c=>depth[c]?h[c]:0;
  return (at(i)*(1-u)+at(i+1)*u)*(1-w)+(at(i+n)*(1-u)+at(i+n+1)*u)*w;
 }
 // Hydrostatic push of the water on the hull's faces, as accelerations along the car
 // (forward) and across it (left): rho·g·width·(D_behind² - D_ahead²)/2 over its mass.
 // What the bow piles up holds the car back; the returning slosh nudges it after it stops.
 hullPush(car,{f,l},shape,draft,mass){
  if(!this.active||draft<=0)return [0,0];
  const at=(bx,by)=>this.heightAt(car.x+f[0]*bx+l[0]*by,car.y+f[1]*bx+l[1]*by),off=shape.soft*.5+this.cell,face=(a,b,width)=>1000*G*width*(Math.max(0,draft+a)**2-Math.max(0,draft+b)**2)/2/mass;
  let bow=0,stern=0,left=0,right=0;
  for(const s of [-.6,0,.6]){bow+=at(shape.front+off,s*shape.half)/3;stern+=at(-shape.rear-off,s*shape.half)/3;}
  for(const s of [-.6,-.2,.2,.6]){const bx=s>0?s*shape.front:s*shape.rear;left+=at(bx,shape.half+off)/4;right+=at(bx,-shape.half-off)/4;}
  return [face(stern,bow,shape.half*2),face(right,left,shape.front+shape.rear)];
 }
 // Hand the field to the GPU: shown height (the hull's dent filled back in, so the water
 // runs level through the car at rest, but never climbing inside the body: the bow wave
 // stands against the bumper), whitewater and mud, eased to zero at the border.
 sync(){
  const u=this.uniforms;u.waveOn.value=this.active?1:0;
  if(!this.active||!this.dirty)return;this.dirty=false;
  const {n,cell,h,push,foam,mud,depth,data}=this;
  for(let j=0;j<n;j++)for(let k=0;k<n;k++){
   const i=j*n+k,o=i*4;if(!depth[i]){data[o]=data[o+1]=data[o+2]=0;continue;}
   const edge=smooth((Math.min(k,j,n-1-k,n-1-j)-2)/SPONGE);
   const body=push[i]>.02;
   data[o]=(body?Math.min(h[i]+push[i],INSIDE):h[i]+push[i])*edge;data[o+1]=body?0:Math.min(1,foam[i])*edge;data[o+2]=Math.min(1,mud[i])*edge;
  }
  this.texture.needsUpdate=true;
  u.waveRect.value.set(this.x0+1.5*cell,this.y0+1.5*cell,this.x0+(n-1.5)*cell,this.y0+(n-1.5)*cell);
 }
 // Flat grid with one vertex per cell centre, placed by `placePatch`.
 patchGeometry(){return new THREE.PlaneGeometry((this.n-1)*this.cell,(this.n-1)*this.cell,this.n-1,this.n-1).rotateX(-Math.PI/2);}
 placePatch(mesh){const [cx,cy]=this.center;mesh.position.set(cx,this.level,-cy);mesh.updateMatrixWorld();}
 info(){return {active:this.active,n:this.n,cell:this.cell,origin:[this.x0,this.y0],level:this.level,...this.stats};}
 dispose(){this.texture.dispose();}
}

// GLSL for the lake materials. The patch (LAKE_WAVES) is lifted by the field and takes its
// slope, whitewater and mud; the flat lakes discard the square the patch covers.
export const waveVertexCommon=`
#ifdef LAKE_WAVES
uniform sampler2D waveMap;uniform vec3 waveGrid;varying vec3 vWave;varying vec2 vWaveSlope;
#endif`;
// uv runs across the texel centres: texel k sits at uv k/(n-1).
export const waveVertex=`
#ifdef LAKE_WAVES
{vec2 wuv=uv*(1.0-waveGrid.x)+.5*waveGrid.x;vec4 w=texture2D(waveMap,wuv);
 float we=texture2D(waveMap,wuv+vec2(waveGrid.x,0.0)).x-texture2D(waveMap,wuv-vec2(waveGrid.x,0.0)).x;
 float sn=texture2D(waveMap,wuv-vec2(0.0,waveGrid.x)).x-texture2D(waveMap,wuv+vec2(0.0,waveGrid.x)).x;
 transformed.y+=w.x;vWave=w.yzw;vWaveSlope=vec2(we,sn)/(2.0*waveGrid.y);}
#endif`;
export const waveFragmentCommon=`
uniform vec4 waveRect;uniform float waveOn;
#ifdef LAKE_WAVES
varying vec3 vWave;varying vec2 vWaveSlope;
#endif
bool inWaveRect(vec2 xz){vec2 q=vec2(xz.x,-xz.y);return all(greaterThan(q,waveRect.xy))&&all(lessThan(q,waveRect.zw));}`;
export const waveClip=p=>`
#ifdef LAKE_WAVES
if(!inWaveRect(${p}))discard;
#else
if(waveOn>.5&&inWaveRect(${p}))discard;
#endif`;
