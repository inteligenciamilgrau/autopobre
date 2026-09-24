import {TestCar,clamp,wrap,steerLimit,WHEELBASE} from './physics.js?v=20260923-capotagem';
import {RIVAL_ROSTER,GRID_ROW_SPACING} from './race-roster.js';
import {pitGeometry,wallContact,pitLane,curveloPitFrame,CURVELO_PIT} from './pit-lane.js';
const HALF_LENGTH=2.38,HALF_WIDTH=.93,MASS=1250,INERTIA=MASS*(4.76**2+1.86**2)/12;
const axes=c=>[[Math.cos(c.heading),Math.sin(c.heading)],[-Math.sin(c.heading),Math.cos(c.heading)]];
const center=c=>[c.x+.08*Math.cos(c.heading),c.y+.08*Math.sin(c.heading)];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
// Stable personalities: braking envelopes, corner pace, how much road they use (lineUse),
// apex timing in 2 m samples (apex > 0 is later), gap they sit at before a move (followTime),
// appetite to attack, to cover the inside, and lap-to-lap consistency.
export const DRIVER_STYLES=Object.freeze([
 {name:'Freia tarde',maxSpeed:53,cornerGrip:7.6,braking:8.5,brakeResponse:.95,throttleResponse:.65,lookAhead:.53,engineScale:1.08,passDistance:37,passSide:-1,laneRate:1.9,passCooldown:2.4,lineUse:.94,apex:1,followTime:.3,aggression:.85,defend:.5,consistency:.55},
 {name:'Rei das curvas',maxSpeed:51,cornerGrip:8.3,braking:7.2,brakeResponse:.7,throttleResponse:.8,lookAhead:.49,engineScale:1.05,passDistance:33,passSide:1,laneRate:1.6,passCooldown:3.3,lineUse:1,apex:2,followTime:.36,aggression:.55,defend:.4,consistency:.8},
 {name:'Constante',maxSpeed:52,cornerGrip:7.5,braking:6.9,brakeResponse:.48,throttleResponse:.42,lookAhead:.65,engineScale:1.07,passDistance:43,passSide:1,laneRate:1.1,passCooldown:4.8,lineUse:.96,apex:0,followTime:.45,aggression:.35,defend:.3,consistency:.95},
 {name:'Atacante',maxSpeed:54,cornerGrip:8,braking:8,brakeResponse:.82,throttleResponse:.9,lookAhead:.54,engineScale:1.1,passDistance:40,passSide:-1,laneRate:2.2,passCooldown:1.9,lineUse:.97,apex:1,followTime:.24,aggression:1,defend:.85,consistency:.6},
 {name:'Foguete de reta',maxSpeed:56,cornerGrip:7.2,braking:7.5,brakeResponse:.75,throttleResponse:.72,lookAhead:.61,engineScale:1.14,passDistance:46,passSide:1,laneRate:1.4,passCooldown:3.7,lineUse:.9,apex:-1,followTime:.34,aggression:.65,defend:.7,consistency:.75},
].map(Object.freeze));
export function styleForDriver(entry){
 const base=DRIVER_STYLES[entry.styleIndex],r=entry.rating;
 // On the racing line these grip levels leave a well-driven player car (about 1:53 at
 // Interlagos) some seconds in hand over the fastest rivals.
 return {...base,maxSpeed:base.maxSpeed*(.96+.06*r),cornerGrip:base.cornerGrip*(.89+.1*r),braking:base.braking*(.93+.06*r),engineScale:1+(base.engineScale-1)*(.7+.5*r),passCooldown:base.passCooldown+(1-r)*.5};
}
// Four separating axes describe the full, rotated body, including side contacts.
export function bodyContact(a,b){
 const aa=axes(a),bb=axes(b),ac=center(a),bc=center(b),delta=[bc[0]-ac[0],bc[1]-ac[1]];
 if(Math.hypot(...delta)>5.2)return null;
 let depth=Infinity,normal;
 for(const axis of [...aa,...bb]){
  const radius=x=>HALF_LENGTH*Math.abs(dot(axis,x[0]))+HALF_WIDTH*Math.abs(dot(axis,x[1]));
  const overlap=radius(aa)+radius(bb)-Math.abs(dot(delta,axis));if(overlap<=0)return null;
  if(overlap<depth){depth=overlap;const sign=dot(delta,axis)>=0?1:-1;normal=axis.map(v=>v*sign);}
 }
 // Average clipped corners gives a stable face contact, or a corner for glancing blows.
 const corners=(c,ax)=>[-1,1].flatMap(l=>[-1,1].map(w=>c.map((v,i)=>v+l*HALF_LENGTH*ax[0][i]+w*HALF_WIDTH*ax[1][i])));
 const inside=(p,c,ax)=>Math.abs(dot([p[0]-c[0],p[1]-c[1]],ax[0]))<=HALF_LENGTH+.001&&Math.abs(dot([p[0]-c[0],p[1]-c[1]],ax[1]))<=HALF_WIDTH+.001;
 const points=[...corners(ac,aa).filter(p=>inside(p,bc,bb)),...corners(bc,bb).filter(p=>inside(p,ac,aa))];
 const point=points.length?[0,1].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length):ac.map((v,i)=>(v+bc[i])/2);
 return {depth,normal,point};
}
export function resolveContact(a,b){
 const hit=bodyContact(a,b);if(!hit)return null;
 const {normal:n,point:p}=hit,ra=[p[0]-a.x,p[1]-a.y],rb=[p[0]-b.x,p[1]-b.y];
 const velocity=(c,r)=>[c.vx-c.yaw*r[1],c.vy+c.yaw*r[0]];
 const va=velocity(a,ra),vb=velocity(b,rb),rv=vb.map((v,i)=>v-va[i]),closing=-dot(rv,n);
 const impulse=(j,axis)=>{a.vx-=axis[0]*j/MASS;a.vy-=axis[1]*j/MASS;b.vx+=axis[0]*j/MASS;b.vy+=axis[1]*j/MASS;a.yaw=clamp(a.yaw-cross(ra,axis)*j/INERTIA,-3,3);b.yaw=clamp(b.yaw+cross(rb,axis)*j/INERTIA,-3,3);};
 if(closing>0){const j=1.12*closing/(2/MASS+cross(ra,n)**2/INERTIA+cross(rb,n)**2/INERTIA);impulse(j,n);const tangent=[-n[1],n[0]],friction=clamp(-dot(rv,tangent)/(2/MASS+cross(ra,tangent)**2/INERTIA+cross(rb,tangent)**2/INERTIA),-j*.3,j*.3);impulse(friction,tangent);}
 const correction=(hit.depth+.002)/2;a.x-=n[0]*correction;a.y-=n[1]*correction;b.x+=n[0]*correction;b.y+=n[1]*correction;
 return {...hit,speed:Math.max(0,closing)};
}
// --- Racing line: centreline offsets that minimise curvature inside the asphalt (the
// classic outside-inside-outside), its bends, and the corners along it. Once per circuit.
const G=9.81,BRAKE_FULL=11,LINE_MARGIN=1.3,KERB_ROOM=.45,LANE_MARGIN=1.1,CAR_GAP=2.45,CORNER_CURVE=1/260;
const lines=new WeakMap();
export function racingLine(data){
 if(lines.has(data))return lines.get(data);
 const a=data.samples,n=a.length,off=new Float64Array(n),lo=new Float64Array(n),hi=new Float64Array(n),laneLo=new Float64Array(n),laneHi=new Float64Array(n),geo=pitGeometry(data);
 for(let i=0;i<n;i++){
  const p=a[i],heading=Math.atan2(p[8],p[7]),half=p[4]/2;
  // Where the pit wall runs beside the asphalt, the whole car body keeps 40 cm off it.
  const clear=side=>{let d=half+1;while(d>0&&geo&&wallContact(geo,p[1]+p[9]*side*(d+.4),p[2]+p[10]*side*(d+.4),heading))d-=.25;return d;};
  const left=clear(1),right=clear(-1);
  laneLo[i]=-Math.min(half-LANE_MARGIN,right);laneHi[i]=Math.min(half-LANE_MARGIN,left);
  // A wheel may ride a surveyed kerb (13 right, 14 left), so the line gets a little more room there.
  lo[i]=-Math.min(half-LINE_MARGIN+(p[13]?KERB_ROOM:0),right);hi[i]=Math.min(half-LINE_MARGIN+(p[14]?KERB_ROOM:0),left);
 }
 const X=i=>a[i][1]+a[i][9]*off[i],Y=i=>a[i][2]+a[i][10]*off[i];
 // Each point slides along its normal to where its bend matches its neighbours'
 // (biharmonic relaxation), from 48 m stencils down to 6 m, clamped to the road.
 for(const [k,passes] of [[24,150],[12,150],[6,120],[3,100]])for(let pass=0;pass<passes;pass++)for(let i=0;i<n;i++){
  const m1=(i-k+n)%n,p1=(i+k)%n,m2=(i-2*k+2*n)%n,p2=(i+2*k)%n;
  const ex=(4*(X(m1)+X(p1))-X(m2)-X(p2))/6-X(i),ey=(4*(Y(m1)+Y(p1))-Y(m2)-Y(p2))/6-Y(i);
  off[i]=clamp(off[i]+.6*(ex*a[i][9]+ey*a[i][10]),lo[i],hi[i]);
 }
 // Signed curvature (left positive) over 20 m chords, lightly averaged against survey noise.
 const curvature=(px,py)=>{
  const raw=new Float64Array(n),out=new Float64Array(n);
  for(let i=0;i<n;i++){const m=(i-5+n)%n,p=(i+5)%n,ax=px(i)-px(m),ay=py(i)-py(m),bx=px(p)-px(i),by=py(p)-py(i);raw[i]=2*(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)*Math.hypot(px(p)-px(m),py(p)-py(m)));}
  for(let i=0;i<n;i++){let sum=0;for(let j=-3;j<=3;j++)sum+=raw[(i+j+n)%n];out[i]=sum/7;}
  return out;
 };
 const curve=curvature(X,Y),centre=curvature(i=>a[i][1],i=>a[i][2]),ds=data.meta.reconstructed_xy_m/n;
 // Corners are runs of real bend on the line; each sample knows the corner it is in,
 // or the next one, and how far away its turn-in is.
 const bend=i=>Math.abs(curve[(i+n)%n])>CORNER_CURVE,corners=[],owner=new Int32Array(n).fill(-1);
 let start=0;while(start<n&&bend(start))start++;
 for(let t=1;t<=n;t++){
  const i=(start+t)%n;if(!bend(i))continue;
  // A short straighter gap (under 24 m) inside one bend does not start a new corner.
  const prev=corners.at(-1),gap=prev?(i-prev.end+n)%n:n;
  if(!prev||gap>12||Math.sign(curve[i])!==prev.dir)corners.push({start:i,apex:i,dir:Math.sign(curve[i]),end:i});
  const c=corners.at(-1);c.end=i;owner[i]=corners.length-1;if(Math.abs(curve[i])>Math.abs(curve[c.apex])){c.apex=i;c.dir=Math.sign(curve[i]);}
 }
 const cornerAt=new Int32Array(n).fill(-1),cornerDist=new Float64Array(n);
 for(let t=2*n-1,id=-1,run=0;t>=0;t--){const i=t%n;if(owner[i]>=0){id=owner[i];run=0;}else run++;if(t<n){cornerAt[i]=id;cornerDist[i]=run*ds;}}
 const line={off,lo,hi,laneLo,laneHi,curve,centre,corners,cornerAt,cornerDist,ds};lines.set(data,line);return line;
}
// --- In-lap: after the flag a rival runs one more lap, takes the pit lane and parks on the
// working lane. Cars line up in the order they arrive, the first furthest down the garage row,
// so nobody pulls over beside a parked car; Box 99, the café bay and the way out stay clear.
const COOL_PACE=24,PIT_PACE=22,PIT_LIMIT=15.5,INLAP_MERGE=220,SLOT_GAP=6.6,routes=new WeakMap();
export function pitRoute(data){
 if(routes.has(data))return routes.get(data);
 const L=data.meta.reconstructed_xy_m,a=data.samples,curvelo=!data.pit&&data.meta.id==='curvelo',frame=data.pit??(curvelo?curveloPitFrame(data):null);
 if(!frame){routes.set(data,null);return null;}
 const track=s=>{s=((s%L)+L)%L;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][0]<=s)lo=m;else hi=m-1;}const p=a[lo],q=a[(lo+1)%a.length],u=(s-p[0])/((lo===a.length-1?L:q[0])-p[0]);return p.map((v,k)=>v+(q[k]-v)*u);};
 // Stations along the lane (u from its entry): centre, direction, and the centres of the fast
 // lane and of the working lane on the garage side (d to the lane's left).
 let st,entryS,u0,limit;
 if(curvelo){
  // Curvelo's service lane is an offset of the main straight, 300 m from its entry (pitLane).
  entryS=L-150;u0=150;limit={from:60,to:300};st=[];
  for(let u=0;u<=300;u+=2){const p=track(u-150),lane=pitLane(data,u-150),blend=lane.offset/CURVELO_PIT.offset;st.push({u,x:p[1]+p[9]*lane.offset,y:p[2]+p[10]*lane.offset,fast:-lane.halfWidth/2*blend,work:lane.halfWidth/2});}
  st.forEach((q,i)=>{const p=st[Math.max(0,i-1)],r=st[Math.min(st.length-1,i+1)],len=Math.hypot(r.x-p.x,r.y-p.y);q.tx=(r.x-p.x)/len;q.ty=(r.y-p.y)/len;});
 }else{
  const c=Object.fromEntries(frame.columns.map((k,i)=>[k,i]));entryS=frame.entry_main_s;u0=0;limit=frame.limit;
  st=frame.samples.map(p=>{const n=Math.hypot(p[c.tx],p[c.ty]);return {u:p[c.s],x:p[c.x],y:p[c.y],tx:p[c.tx]/n,ty:p[c.ty]/n,fast:(p[c.lane_lo]+p[c.fast_hi])/2,work:(p[c.fast_hi]+p[c.lane_hi])/2};});
 }
 // Corner speed of each station over 12 m chords, gentle (4.5 m/s² sideways).
 st.forEach((q,i)=>{const p=st[Math.max(0,i-3)],r=st[Math.min(st.length-1,i+3)],turn=Math.abs(wrap(Math.atan2(r.ty,r.tx)-Math.atan2(p.ty,p.tx)))/Math.max(1,r.u-p.u);q.v=Math.min(PIT_PACE,Math.sqrt(4.5/Math.max(turn,1e-4)));});
 const at=u=>{let lo=0,hi=st.length-2;while(lo<hi){const m=(lo+hi+1)>>1;if(st[m].u<=u)lo=m;else hi=m-1;}const p=st[lo],q=st[lo+1],t=clamp((u-p.u)/(q.u-p.u),0,1),mix=k=>p[k]+(q[k]-p[k])*t,n=Math.hypot(mix('tx'),mix('ty'));return {x:mix('x'),y:mix('y'),tx:mix('tx')/n,ty:mix('ty')/n,fast:mix('fast'),work:mix('work')};};
 const e=track(entryS),s0=at(0),entryD=(s0.x-s0.ty*s0.fast-e[1])*e[9]+(s0.y+s0.tx*s0.fast-e[2])*e[10];
 // Parking slots, first taken first: from the end of the garage row back to Box 99's way out,
 // then from before the café back to where the working lane begins. A slot stays clear of the
 // walls a metre either way along the lane (the lane narrows where the garage row ends).
 const b=frame.box99,half=b.bay/2,first=(curvelo?80-u0:frame.garages[0])+2.9,slots=[],geo=pitGeometry(data);
 const clear=u=>[-1.2,-.6,0,.6,1.2].every(du=>{const p=at(u+du);return !wallContact(geo,p.x-p.ty*p.work,p.y+p.tx*p.work,Math.atan2(p.ty,p.tx));});
 const take=(from,to)=>{for(let u=from+u0;u>=to+u0;u-=.2)if(clear(u)&&!(slots.at(-1)-u<SLOT_GAP))slots.push(u);};
 take(frame.garages[1]-2.9,b.s+half+8.5);take(b.cafe_s-half-6.4,first);
 const route={stations:st,at,entryS,entryD,limit,slots:slots.map(u=>({u,d:at(u).work}))};
 routes.set(data,route);return route;
}
// Seeded (mulberry32) so a check or a reference run can replay one race exactly.
function random(seed){let t=seed>>>0;return ()=>{t=t+0x6D2B79F5>>>0;let r=Math.imul(t^t>>>15,1|t);r=r+Math.imul(r^r>>>7,61|r)^r;return ((r^r>>>14)>>>0)/4294967296;};}
const trackGap=(from,to,L)=>{let gap=to.surface.s-from.surface.s;if(gap>L/2)gap-=L;if(gap<-L/2)gap+=L;return gap;};
export class RaceField {
 constructor(data,{onStep,onReset,seed}={}){this.data=data;this.onStep=onStep;this.onReset=onReset;this.seed=seed;this.line=racingLine(data);this.route=pitRoute(data);this.time=0;this.collisions=0;this.cooldowns=new Map();this.reset();}
 reset(startS=0,{grid=false,seed=this.seed}={}){
  this.time=0;this.collisions=0;this.cooldowns.clear();this.nextSlot=0;
  // A fresh seed per start: the same grid never races the same way twice.
  this.raceSeed=seed??Math.floor(Math.random()*4294967296);const rand=this.random=random(this.raceSeed),pick=(lo,hi)=>lo+(hi-lo)*rand();
  this.gridLeadIn=grid?(this.data.meta.reconstructed_xy_m-startS)%this.data.meta.reconstructed_xy_m:0;
  // Qualifying on the day: the grid follows the drivers' level, shuffled by a good or bad session.
  const slots=[];RIVAL_ROSTER.map((entry,i)=>({i,time:-entry.rating+pick(-.18,.18)})).sort((a,b)=>a.time-b.time).forEach((q,slot)=>slots[q.i]=slot);
  this.rivals=RIVAL_ROSTER.map((entry,i)=>{
   const slot=slots[i],style=styleForDriver(entry),progress=(Math.ceil(RIVAL_ROSTER.length/2)-Math.floor(slot/2))*GRID_ROW_SPACING+8-(slot%2)*2;
   const L=this.data.meta.reconstructed_xy_m,s=((startS+progress)%L+L)%L;let index=this.data.samples.findIndex(p=>p[0]>=s);if(index<0)index=0;
   const car=new TestCar(this.data);car.reset(index);car.awaitingStart=grid;car.engineScale=style.engineScale;
   const lane=slot%2?2.2:-2.2;car.x+=car.surface.lx*lane;car.y+=car.surface.ly*lane;car.surface=car.sample(car.x,car.y);
   const rating=entry.rating;
   return {car,entry,style,progress,lastS:car.surface.s,finished:false,finishTime:null,stun:0,
    // Personal line: share of the road used, apex timing and a slow wander of a few decimetres.
    lineUse:clamp(style.lineUse*pick(.95,1.04),.8,1),apex:style.apex+Math.round(pick(-1.4,1.4)),
    wander:{amp:pick(.08,.3)*(1.4-rating),rate:pick(.06,.14)*2*Math.PI,phase:pick(0,2*Math.PI)},
    // Rhythm: grip and braking breathe a little around the day's form.
    rhythm:{amp:.01+.035*(1-style.consistency)*(1.4-rating),rates:[pick(.04,.09),pick(.11,.23)].map(f=>f*2*Math.PI),phases:[pick(0,2*Math.PI),pick(0,2*Math.PI)]},
    // Lights out: reaction time, then a few seconds side by side before settling onto the line.
    reaction:grid?.15+pick(0,.4)*(1.3-rating):0,merge:pick(1.2,3.5),form:1,lap:-1,slot,
    // Race-day form: some days a driver simply has more pace than the standings suggest.
    day:1+pick(-.012,.012),
    lane,blend:1,blendTarget:1,mode:'line',rival:null,passSide:0,modeTime:0,cooldown:pick(1,3),defended:-1,rolled:-1,mistake:null,brakePedal:0,mistakes:0,passes:0,stuck:0,pit:null,yieldSide:0,yieldTime:0};
  });
  this.onReset?.();
 }
 step(player,dt,totalLaps=0){
  this.time+=dt;const impacts=[],commands=[],L=this.data.meta.reconstructed_xy_m,a=this.data.samples,n=a.length,line=this.line,ds=line.ds,t=this.time;
  const bodies=[player,...this.rivals.map(r=>r.car)],driverOf=new Map(this.rivals.map(r=>[r.car,r]));
  // Slipstream: in another car's wake the air resistance drops (physics reads car.draft).
  for(const c of bodies){
   c.draft=0;const fx=Math.cos(c.heading),fy=Math.sin(c.heading);if(c.vx*fx+c.vy*fy<15)continue;
   for(const o of bodies){if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y,f=dx*fx+dy*fy,side=Math.abs(dy*fx-dx*fy);if(f>4&&f<35&&side<1.9)c.draft=Math.max(c.draft,.38*(1-f/35)*(1-side/3.8));}
  }
  // One physics step for a rival, then its race distance and the flag.
  const drive=(r,input)=>{const c=r.car;r.tow=c.draft;c.step(input,dt);commands.push(input);let travel=c.surface.s-r.lastS;if(travel<-L/2)travel+=L;if(travel>L/2)travel-=L;r.progress+=travel;r.lastS=c.surface.s;if(totalLaps&&!r.finished&&r.progress>=L*totalLaps+this.gridLeadIn){r.finished=true;r.finishTime=this.time;}};
  for(const r of this.rivals){
   if(r.pit){drive(r,this.pitInput(r,bodies,dt));continue;}
   const c=r.car,st=r.style,here=c.surface,i=c.index,d=here.d,speed=Math.hypot(c.vx,c.vy),along=c.vx*here.tx+c.vy*here.ty,fx=Math.cos(c.heading),fy=Math.sin(c.heading);
   const lap=Math.floor(Math.max(0,r.progress-this.gridLeadIn)/L);
   if(lap!==r.lap){r.lap=lap;r.form=r.day*(1+(this.random()-.5)*.03*(1.4-st.consistency));}
   r.cooldown=Math.max(0,r.cooldown-dt);r.modeTime+=dt;
   const wander=r.wander.amp*Math.sin(t*r.wander.rate+r.wander.phase),fit=(v,k)=>clamp(v,line.laneLo[k],line.laneHi[k]);
   // Planned offset at sample k: the personal racing line, blended toward a chosen lane.
   const own=k=>clamp(r.lineUse*line.off[(k-r.apex+n)%n]+wander,line.lo[k],line.hi[k]);
   const plan=k=>{const base=own(k);return base+(fit(r.lane,k)-base)*r.blend;};
   // Who is around, with gaps along the track: ahead in our path, behind, alongside.
   let ahead=null,behind=null,emergency=0;const beside=[];
   for(const o of bodies){
    if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y;if(Math.abs(dx)+Math.abs(dy)>150)continue;
    const gap=trackGap(c,o,L),od=o.surface.d,ov=o.vx*o.surface.tx+o.vy*o.surface.ty;
    if(Math.abs(gap)<5.4&&Math.abs(od-d)<4)beside.push({o,gap,od,v:ov});
    if(gap>4.4&&gap<120&&Math.abs(od-plan(o.surface.i))<2.1&&(!ahead||gap<ahead.gap))ahead={o,gap,od,v:ov};
    if(gap<-4.4&&gap>-40&&(!behind||gap>behind.gap))behind={o,gap,od,v:ov};
    // Last-moment braking for a slower body right in front; contacts handle the rest.
    const forward=dx*fx+dy*fy,side=dy*fx-dx*fy,relative=speed-(o.vx*fx+o.vy*fy);
    if(forward>0&&forward<6+Math.max(0,relative)*.8&&Math.abs(side)<2)emergency=Math.max(emergency,clamp((7+relative-forward)/7,.2,1));
   }
   const corner=line.cornerAt[i],bend=line.corners[corner],toCorner=line.cornerDist[i];
   const attack=!!ahead&&ahead.gap<Math.max(12,along*1.1),pressured=!!behind&&behind.gap>-Math.max(8,along*.5);
   if(r.mistake&&r.mistake.corner!==corner)r.mistake=null;
   // Once per braking zone a driver may misjudge it, more so under pressure or on the attack:
   // brakes too late or carries too much speed, and runs wide.
   if(bend&&corner!==r.rolled&&toCorner<140&&toCorner>40&&speed>22&&!r.finished){
    r.rolled=corner;const chance=(.006+.03*(1-r.entry.rating))*(pressured?1.7:1)*(attack?1+.6*st.aggression:1);
    if(this.random()<chance){
     // Either a hesitant corner (early braking, lost time) or an overcooked one that runs wide.
     const over=this.random()<.55?-.35:.35+.45*this.random();r.mistake={corner,grip:st.cornerGrip+(12.2-st.cornerGrip)*over,brake:st.braking+(12.5-st.braking)*over};r.mistakes++;
    }
   }
   // Speed plan: every bend ahead on the planned path caps the speed through the braking curve.
   // On the attack a driver pushes a little; alongside in a move they brake later still.
   const m=r.mistake,rh=r.rhythm,wobble=rh.amp*(.6*Math.sin(t*rh.rates[0]+rh.phases[0])+.4*Math.sin(t*rh.rates[1]+rh.phases[1])),push=(attack?st.aggression:0)+(r.mode==='pass'?1+st.aggression:0);
   const grip=m?m.grip:st.cornerGrip*r.form*(1+wobble)*(1+.02*push),braking=m?m.brake:st.braking*(1+1.5*wobble)*(1+.05*push);
   // maxSpeed is a style target, not a limiter: engine, drag and the tow decide the straights.
   let target=st.maxSpeed*r.form*1.12,bindV=target,bindDist=0;
   for(let j=0,reach=speed*speed/(2*braking)+30;j*ds<reach&&j<n;j+=2){
    const k=(i+j)%n,cl=line.centre[k],mine=r.lineUse*line.curve[(k-r.apex+n)%n]+(1-r.lineUse)*cl,lane=fit(r.lane,k);
    // A parallel lane bends tighter on the inside (curvature / (1 - curvature * offset)); banking helps.
    const kap=mine+(cl/Math.max(.5,1-cl*lane)-mine)*r.blend,lateral=Math.max(2,grip-G*Math.sign(kap)*a[k][5]);
    const vc=Math.sqrt(lateral/Math.max(Math.abs(kap),1e-4)),dist=Math.max(0,j*ds-speed*.12),limit=Math.sqrt(vc*vc+2*braking*dist);
    if(limit<target){target=limit;bindV=vc;bindDist=dist;}
   }
   const free=target;
   // On a straight they tuck into the tow; into corners they leave their own margin.
   const g0=4.9+Math.max(0,along)*st.followTime*(r.mode==='pass'?.4:bend&&toCorner<150?1:.5),closing=ahead?along-ahead.v:0;
   // Held up: close behind a car slower than this driver would go here.
   r.stuck=ahead&&ahead.gap<g0+4&&free>ahead.v+1?(r.stuck??0)+dt:Math.max(0,(r.stuck??0)-2*dt);
   if(r.finished&&totalLaps){
    // Past the flag the driver eases off (about 2.5 m/s²) rather than braking in front of the pack.
    if(r.mode!=='line')Object.assign(r,{mode:'line',rival:null});target=Math.min(target,COOL_PACE+Math.max(0,32-2.5*(t-r.finishTime)));
    const R=this.route,toEntry=R?((R.entryS-here.s)%L+L)%L:Infinity;
    // In-lap: over to the pit side before the entry, then down the lane (pitInput).
    if(toEntry<INLAP_MERGE){r.lane=R.entryD;r.blendTarget=1;if(toEntry<6+speed*.3)r.pit={k:0,u:-toEntry,slot:R.slots[Math.min(this.nextSlot++,R.slots.length-1)],parked:false};}
    else{
     // Blue flag: with a car still racing close behind, keep to the side of the road away
     // from the racing line ahead until it has gone by.
     let chased=false;for(const o of bodies){if(o===c||driverOf.get(o)?.finished)continue;const gap=trackGap(c,o,L);if(gap<-3&&gap>-70&&Math.abs(o.surface.d-d)<12)chased=true;}
     if(chased&&!r.yieldSide){let sum=0;for(let j=0;j<40;j++)sum+=line.off[(i+j)%n];r.yieldSide=Math.abs(sum)>24?-Math.sign(sum):Math.sign(d)||1;}
     r.yieldTime=chased?2.5:Math.max(0,r.yieldTime-dt);if(!r.yieldTime)r.yieldSide=0;
     r.lane=r.yieldSide*99;r.blendTarget=r.yieldSide?1:0;
    }
   }
   else{
    if(r.mode==='line')r.blendTarget=t<r.merge?1:0;
    // Attack when closing (a tow, a better exit) or after being held up for a while. Near a corner
    // only the inside works, and it must start before the braking zone; either side on a straight.
    // Take a lane with room for a whole car and hold it.
    // A stopped or crawling car is an obstacle: go round it on whichever side is free.
    const obstacle=!!ahead&&ahead.v<6&&ahead.gap<35,near=bend&&toCorner<150&&!obstacle,late=near&&toCorner<40&&!(ahead&&ahead.gap<6);
    if(r.mode!=='pass'&&ahead&&r.cooldown===0&&!late&&(ahead.gap<g0+6&&(closing>.8||r.stuck>1.3*(1.4-st.aggression))||ahead.gap<st.passDistance&&closing>4||obstacle)){
     let low=-Infinity,high=Infinity;for(let j=0;j<44;j+=4){const q=(i+j)%n;low=Math.max(low,line.laneLo[q]);high=Math.min(high,line.laneHi[q]);}
     const pref=near?bend.dir:Math.abs(ahead.od)>.8?-Math.sign(ahead.od):st.passSide;
     for(const side of near?[pref]:[pref,-pref]){
      const lane=clamp(ahead.od+side*2.8,low,high);if(Math.abs(lane-ahead.od)<2.3)continue;
      if(bodies.some(o=>{if(o===c||o===ahead.o)return false;const gap=trackGap(c,o,L);return gap>(obstacle?0:-8)&&gap<ahead.gap+20&&Math.abs(o.surface.d-lane)<2.2;}))continue;
      Object.assign(r,{mode:'pass',rival:ahead.o,passSide:side,lane,blendTarget:1,modeTime:0});break;
     }
     if(r.mode!=='pass')r.cooldown=.5;
    }
    if(r.mode==='pass'){
     // Keep the chosen lane; only move further over if the rival drifts toward us.
     const o=r.rival,gap=trackGap(c,o,L),ov=o.vx*o.surface.tx+o.vy*o.surface.ty,clearOf=o.surface.d+r.passSide*2.6;
     r.lane+=clamp(fit(r.passSide>0?Math.max(r.lane,clearOf):Math.min(r.lane,clearOf),i)-r.lane,-st.laneRate*1.5*dt,st.laneRate*1.5*dt);
     const done=gap<-5.5,shut=gap>4.2&&Math.abs(r.lane-o.surface.d)<2.1,fading=gap>10&&along<ov-1.5,lost=gap>st.passDistance+15||r.modeTime>12;
     if(done||shut||fading||lost){if(done)r.passes++;Object.assign(r,{mode:'line',rival:null,blendTarget:0,cooldown:done?1:st.passCooldown,stuck:0});}
    }
    // Defence: with a car close behind before a braking zone, cover the inside, once per corner.
    if(r.mode==='line'&&behind&&bend&&toCorner>30&&toCorner<150&&corner!==r.defended&&behind.gap>-15&&behind.v>along-2){
     r.defended=corner;if(this.random()<st.defend)Object.assign(r,{mode:'defend',lane:.6*(bend.dir>0?line.laneHi[i]:line.laneLo[i]),blendTarget:.35+.5*st.defend,modeTime:0});
    }
    if(r.mode==='defend'&&(corner!==r.defended||toCorner<8||r.modeTime>6))Object.assign(r,{mode:'line',blendTarget:0});
   }
   const spread=Math.max(1.2,Math.abs(fit(r.lane,i)-own(i))),rate=st.laneRate*(r.mode==='pass'?1.6:1)/spread;
   r.blend+=clamp(r.blendTarget-r.blend,-rate*dt,rate*dt);
   // A car we cannot pass yet: close up no faster than we could brake to its speed, then sit at
   // the driver's own following distance, in the tow.
   if(ahead)target=Math.min(target,ahead.v+Math.sqrt(2*.6*braking*Math.max(0,ahead.gap-g0))-Math.max(0,g0-ahead.gap));
   // Steering: pure pursuit of the planned path, never into a car alongside.
   const look=7+speed*st.lookAhead*.6,k=(i+Math.round(look/ds))%n,low=line.laneLo[k]-.3,high=line.laneHi[k]+.3;let aim=plan(k);
   for(const b of beside){
    const side=Math.sign(b.od-d)||1,limit=b.od-side*CAR_GAP;if(side>0?aim>limit:aim<limit)aim=limit;
    // Squeezed against the edge by a car that is ahead: back out of it (the car behind yields).
    if(aim<low||aim>high){aim=clamp(aim,low,high);if(b.gap>.5&&speed>4)target=Math.min(target,Math.max(b.v-1.5,b.v*.9));}
    // Racing etiquette: a car alongside on the inside of the corner, with its nose level or
    // ahead of our middle, has the corner. The player earns the same room as an attacking rival.
    const attacker=b.o===player||driverOf.get(b.o)?.rival===c;
    if(attacker&&bend&&toCorner<60&&side===bend.dir&&b.gap>-2.5&&speed>8)target=Math.min(target,b.v-.8);
   }
   // Rejoin a distant line at a shallow angle (about 7 degrees), never with a swerve.
   const reach=1+.12*look;aim=clamp(aim,d-reach,d+reach);
   const p=a[k],dx=p[1]+p[9]*aim-c.x,dy=p[2]+p[10]*aim-c.y,alpha=wrap(Math.atan2(dy,dx)-c.heading),away=Math.abs(alpha)>Math.PI/2;
   // After a spin the path can lie behind: turn round on full lock, slowly.
   const turn=away?Math.sign(alpha):clamp(Math.atan2(2*WHEELBASE*Math.sin(alpha),Math.hypot(dx,dy))/steerLimit(speed),-1,1);
   if(away)target=Math.min(target,6);
   // Pedals: proportional to the speed error, plus the deceleration the braking curve asks for.
   const slide=along>3?Math.abs(Math.atan2(-c.vx*fy+c.vy*fx-1.117*c.yaw,c.vx*fx+c.vy*fy)):0,need=bindDist>1&&speed>bindV?(speed*speed-bindV*bindV)/(2*bindDist):0;
   let throttle=clamp((target-speed)*st.throttleResponse,0,1)*clamp(1-(slide-.06)*8,0,1);
   const brake=clamp((speed-target)*st.brakeResponse+(target===free&&need>2&&speed>target-1?(need-1.5)/BRAKE_FULL:0),0,1);
   // A released pedal is exactly zero: at rest any brake holds the car (physics hold).
   r.brakePedal+=(brake-r.brakePedal)*(1-Math.exp(-dt*(5+st.brakeResponse*10)));if(r.brakePedal<.005)r.brakePedal=0;
   const input={left:Math.max(0,turn),right:Math.max(0,-turn),throttle,brake:r.brakePedal,reverse:0,handbrake:0};
   if(input.brake>.08)input.throttle=0;
   if(emergency){input.throttle=0;input.brake=Math.max(input.brake,emergency);}
   r.stun=Math.max(0,r.stun-dt);if(r.stun>0){input.throttle=0;input.brake=Math.max(input.brake,.2);}
   // Lights out: each driver reacts in their own time; until then the car is held on the brake.
   if(t<r.reaction){input.throttle=0;input.brake=1;}
   // Wedged against a wall or a car while wanting to go: back out with the wheels turned so the
   // nose swings toward the line, then drive on.
   r.blocked=speed<1.5&&target>4&&t>r.reaction+1?(r.blocked??0)+dt:0;
   if(r.blocked>2.5){r.recover=1.2+this.random();r.blocked=0;}
   if(r.recover>0){r.recover-=dt;Object.assign(input,{reverse:1,throttle:0,brake:0,left:alpha<0?1:0,right:alpha>0?1:0});}
   drive(r,input);
  }
  for(let iteration=0;iteration<4;iteration++)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   if(Math.abs((bodies[i].z??bodies[i].surface.z)-(bodies[j].z??bodies[j].surface.z))>1.6)continue;
   const hit=resolveContact(bodies[i],bodies[j]);if(!hit)continue;
   if(hit.speed>1.6&&this.time-(this.cooldowns.get(`${i}:${j}`)??-10)>.35){this.cooldowns.set(`${i}:${j}`,this.time);this.collisions++;impacts.push({...hit,player:i===0});for(const k of [i,j])if(k>0)this.rivals[k-1].stun=Math.min(1.5,hit.speed*.06);}
  }
  for(const c of bodies){c.surface=c.sample(c.x,c.y);c.index=c.surface.i;}
  if(this.onStep)this.rivals.forEach((r,i)=>this.onStep(r,i,commands[i],dt));
  return impacts;
 }
 // Pit lane after the flag: pure pursuit along the fast lane, over to the working lane for the
 // last 12 m before the slot, 56 km/h in the limit zone and a car length behind the car in front.
 pitInput(r,bodies,dt){
  const c=r.car,R=this.route,st=R.stations,P=r.pit,slot=P.slot,speed=Math.hypot(c.vx,c.vy),fx=Math.cos(c.heading),fy=Math.sin(c.heading),hold={left:0,right:0,throttle:0,brake:1,reverse:0,handbrake:0};
  if(P.parked)return hold;
  let best=Infinity;for(let k=Math.max(0,P.k-3);k<Math.min(st.length,P.k+12);k++){const q=st[k],dd=(c.x-q.x)**2+(c.y-q.y)**2;if(dd<best){best=dd;P.k=k;}}
  const q=st[P.k],u=P.u=q.u+(c.x-q.x)*q.tx+(c.y-q.y)*q.ty,left=slot.u-u;
  // Speed: bends and the limit zone ahead through a gentle braking curve, then the stop.
  let target=Math.sqrt(2*2.2*Math.max(0,left-.3));
  for(let k=P.k;k<Math.min(st.length,P.k+60);k++){const s=st[k],v=R.limit&&s.u>=R.limit.from-2&&s.u<=R.limit.to?Math.min(s.v,PIT_LIMIT):s.v;target=Math.min(target,Math.sqrt(v*v+2*3.5*Math.max(0,s.u-u-speed*.1)));}
  for(const o of bodies){if(o===c)continue;const dx=o.x-c.x,dy=o.y-c.y,forward=dx*fx+dy*fy,side=dy*fx-dx*fy;if(forward>0&&forward<40&&Math.abs(side)<2.3)target=Math.min(target,Math.max(0,o.vx*fx+o.vy*fy)+Math.sqrt(2*3*Math.max(0,forward-6.3)));}
  if(speed<.5&&(left<1.5||target<.3)){P.parked=left<1.5;return hold;}
  const look=u+4+speed*.3,p=R.at(look),t=clamp((look-slot.u+12)/10,0,1),lane=p.fast+(p.work-p.fast)*t*t*(3-2*t),tx=p.x-p.ty*lane,ty=p.y+p.tx*lane,alpha=wrap(Math.atan2(ty-c.y,tx-c.x)-c.heading);
  const turn=clamp(Math.atan2(2*WHEELBASE*Math.sin(alpha),Math.hypot(tx-c.x,ty-c.y))/steerLimit(speed),-1,1);
  const input={left:Math.max(0,turn),right:Math.max(0,-turn),throttle:clamp((target-speed)*.6,0,1),brake:clamp((speed-target)*.7,0,1),reverse:0,handbrake:0};
  // Wedged against a wall: back out with the wheels turned, then go on.
  r.blocked=speed<1.2&&target>3?(r.blocked??0)+dt:0;if(r.blocked>2.5){r.recover=1.2;r.blocked=0;}
  if(r.recover>0){r.recover-=dt;Object.assign(input,{reverse:1,throttle:0,brake:0,left:alpha<0?1:0,right:alpha>0?1:0});}
  return input;
 }
 info(){return {collisions:this.collisions,rivals:this.rivals.map(r=>({number:r.entry.number,name:r.entry.name,level:r.entry.level,style:r.style.name,x:r.car.x,y:r.car.y,heading:r.car.heading,speed:Math.hypot(r.car.vx,r.car.vy),progress:r.progress,finished:r.finished,pit:r.pit?(r.pit.parked?'parked':'lane'):null,mode:r.mode,blend:r.blend,draft:r.tow,mistakes:r.mistakes,passes:r.passes}))};}
}
