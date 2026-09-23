const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Fictional service lane on the inside of Curvelo's main straight.
export function pitLane(data,s){
 if(data.meta.id!=='curvelo')return null;
 const u=(s+150)%1250;if(u>300)return null;
 const blend=smooth(u/80)*(1-smooth((u-220)/80));
 return {offset:20*blend,halfWidth:3.3,u,entry:u<80,exit:u>220};
}
export function inPitBox(surface){return !!surface.pit&&surface.s>=10&&surface.s<=30&&Math.abs(surface.d-20)<2.2;}

// Surveyed pit lane (Interlagos): its own centre line, paved band, profile and walls.
// Segments are bucketed in a coarse grid so every surface query stays cheap.
const CELL=20,cache=new WeakMap();
const key=(ix,iy)=>ix*65536+iy;
function bucket(grid,x0,y0,x1,y1,value){
 for(let ix=Math.floor(x0/CELL);ix<=Math.floor(x1/CELL);ix++)for(let iy=Math.floor(y0/CELL);iy<=Math.floor(y1/CELL);iy++){
  const k=key(ix,iy);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(value);
 }
}
export function pitGeometry(data){
 if(!data.pit)return null;
 if(cache.has(data))return cache.get(data);
 const P=data.pit,c=Object.fromEntries(P.columns.map((name,i)=>[name,i])),a=P.samples,grid=new Map(),L=data.meta.reconstructed_xy_m;
 for(let i=0;i+1<a.length;i++){
  const p=a[i],q=a[i+1],reach=Math.max(-p[c.lo],p[c.hi],-q[c.lo],q[c.hi])+6;
  bucket(grid,Math.min(p[c.x],q[c.x])-reach,Math.min(p[c.y],q[c.y])-reach,Math.max(p[c.x],q[c.x])+reach,Math.max(p[c.y],q[c.y])+reach,i);
 }
 const walls=[],wallGrid=new Map();
 for(const wall of P.walls)for(let i=0;i+1<wall.points.length;i++){
  const [x1,y1,,t1]=wall.points[i],[x2,y2,,t2]=wall.points[i+1],half=(t1+t2)/4,segment={x1,y1,x2,y2,half,name:wall.name};
  walls.push(segment);bucket(wallGrid,Math.min(x1,x2)-4-half,Math.min(y1,y2)-4-half,Math.max(x1,x2)+4+half,Math.max(y1,y2)+4+half,segment);
 }
 const geo={c,a,grid,walls,wallGrid,length:P.length_m,limit:P.limit,lapLength:L,entryMainS:P.entry_main_s,exitMainS:P.exit_main_s};
 cache.set(data,geo);return geo;
}
// Nearest pit-lane station, or null away from it. d is positive to the lane's left.
export function locatePit(geo,x,y){
 const list=geo.grid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return null;
 const {a,c}=geo;let best=Infinity,hit=-1,hu=0;
 for(const i of list){
  const p=a[i],q=a[i+1],dx=q[c.x]-p[c.x],dy=q[c.y]-p[c.y],len2=dx*dx+dy*dy;
  let u=((x-p[c.x])*dx+(y-p[c.y])*dy)/len2;u=u<0?0:u>1?1:u;
  const ex=x-p[c.x]-u*dx,ey=y-p[c.y]-u*dy,d2=ex*ex+ey*ey;
  if(d2<best){best=d2;hit=i;hu=u;}
 }
 if(hit<0)return null;
 const p=a[hit],q=a[hit+1],mix=k=>p[k]+(q[k]-p[k])*hu;
 const tx=mix(c.tx),ty=mix(c.ty),n=Math.hypot(tx,ty),ux=tx/n,uy=ty/n,lx=-uy,ly=ux;
 const px=mix(c.x),py=mix(c.y),along=(x-px)*ux+(y-py)*uy,d=(x-px)*lx+(y-py)*ly,s=mix(c.s)+along;
 // Beyond the first or last station the lane has ended.
 if(s<0||s>geo.length)return null;
 let m0=p[c.main_s],m1=q[c.main_s];const L=geo.lapLength;if(m1-m0<-L/2)m1+=L;
 const grade=mix(c.grade),bank=mix(c.bank);
 return {i:hit,u:hu,s,d,lo:mix(c.lo),hi:mix(c.hi),laneLo:mix(c.lane_lo),laneHi:mix(c.lane_hi),z:mix(c.z)+grade*along,bank,grade,tx:ux,ty:uy,lx,ly,mainS:((m0+(m1-m0)*hu)%L+L)%L};
}
export function pitLimit(geo,surface){
 const lim=geo?.limit;return lim&&surface.pit&&surface.pitS>=lim.from&&surface.pitS<=lim.to?lim.kmh/3.6:null;
}
// Deepest overlap between the car footprint and the pit walls, if any.
export function wallContact(geo,x,y,heading){
 const list=geo.wallGrid.get(key(Math.floor(x/CELL),Math.floor(y/CELL)));if(!list)return null;
 const fx=Math.cos(heading),fy=Math.sin(heading);let best=null;
 for(const w of list){
  const dx=w.x2-w.x1,dy=w.y2-w.y1,len2=dx*dx+dy*dy||1e-9;let u=((x-w.x1)*dx+(y-w.y1)*dy)/len2;u=u<0?0:u>1?1:u;
  const cx=w.x1+u*dx,cy=w.y1+u*dy;let nx=x-cx,ny=y-cy;const dist=Math.hypot(nx,ny);if(dist>3.5+w.half)continue;
  if(dist<1e-6){nx=-dy;ny=dx;}const nl=Math.hypot(nx,ny);nx/=nl;ny/=nl;
  // Footprint half-extent of the car (2.38 x 0.93 m) along the contact normal.
  const extent=2.38*Math.abs(nx*fx+ny*fy)+.93*Math.abs(-nx*fy+ny*fx),depth=extent+w.half-dist;
  if(depth>0&&(!best||depth>best.depth))best={depth,nx,ny,name:w.name};
 }
 return best;
}
