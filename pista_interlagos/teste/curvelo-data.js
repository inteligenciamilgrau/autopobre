// Game reconstruction traced from the CBA layout published 9 August 2024.
// Official: 1,250 m, two turns, one banked up to 16% (atan(.16) = 9.09°).
// Width, curve radii, banking transitions and terrain are approximations.
// See curvelo-fontes.md for sources and the limits of this reconstruction.
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function createCurveloData(){
 // Pixel coordinates of the asphalt centre, in the CBA plan, traversed CCW.
 // The wide right end is the existing banked test loop; left end is the new flat turn.
 const curves=[
  [[290,397],[360,374],[445,350],[493,334]],
  [[493,334],[588,298],[576,207],[508,173]],
  [[508,173],[476,156],[450,155],[422,168]],
  [[422,168],[326,214],[189,277],[114,316]],
  [[114,316],[70,339],[84,390],[112,414]],
  [[112,414],[141,441],[171,436],[208,423]],
  [[208,423],[236,414],[264,406],[290,397]]
 ];
 const dense=[];
 for(const [a,b,c,d] of curves)for(let k=0;k<300;k++){
  const t=k/300,u=1-t;
  dense.push([u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],-(u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1])]);
 }
 dense.push(dense[0]);const lengths=[0];
 for(let i=1;i<dense.length;i++)lengths.push(lengths.at(-1)+Math.hypot(dense[i][0]-dense[i-1][0],dense[i][1]-dense[i-1][1]));
 const factor=1250/lengths.at(-1),points=[];let j=0;
 for(let i=0;i<626;i++){
  const target=i/626*lengths.at(-1);while(lengths[j+1]<target)j++;
  const t=(target-lengths[j])/(lengths[j+1]-lengths[j]);
  points.push([lerp(dense[j][0],dense[j+1][0],t)*factor,lerp(dense[j][1],dense[j+1][1],t)*factor]);
 }
 // Normalize the closed sampled centreline, rather than counting the duplicated seam.
 let distance=0;for(let i=0;i<points.length;i++)distance+=Math.hypot(points[(i+1)%points.length][0]-points[i][0],points[(i+1)%points.length][1]-points[i][1]);
 const origin=points[0].slice(),scale=1250/distance;
 points.forEach(p=>{p[0]=(p[0]-origin[0])*scale;p[1]=(p[1]-origin[1])*scale;});
 let s=0;
 const samples=points.map((p,i)=>{
  const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],dx=next[0]-prev[0],dy=next[1]-prev[1],len=Math.hypot(dx,dy);
  // Smooth entry/exit on the large turn; negative slope raises the outside of a left turn.
  const bank=-.16*smooth((s-165)/65)*(1-smooth((s-490)/70))||0;
  const row=[s,p[0],p[1],3,14,bank,0,dx/len,dy/len,-dy/len,dx/len];
  s+=Math.hypot(next[0]-p[0],next[1]-p[1]);return row;
 });
 const terrain={x0:-650,y0:-550,step:10,nx:131,ny:111,z:[]};
 for(let iy=0;iy<terrain.ny;iy++)for(let ix=0;ix<terrain.nx;ix++){
  const x=terrain.x0+ix*terrain.step,y=terrain.y0+iy*terrain.step;
  let best=Infinity,nearest;
  for(const p of samples){const d=(p[1]-x)**2+(p[2]-y)**2;if(d<best){best=d;nearest=p;}}
  const d=(x-nearest[1])*nearest[9]+(y-nearest[2])*nearest[10];
  const shoulder=3+nearest[5]*Math.max(-12,Math.min(12,d));
  // Preserve a flat paddock, then blend the embankment into fictional surrounding hills.
  const blend=smooth((Math.sqrt(best)-18)/60),hills=1.3*Math.sin(x*.009)*Math.sin(y*.012);
  terrain.z.push(lerp(shoulder,1+hills,blend));
 }
 return {meta:{id:'curvelo',name:'Oval de Curvelo',nominal_m:1250,reconstructed_xy_m:1250,reconstructed_3d_m:1250,samples:samples.length,width_assumed_m:14,bank_max_slope:.16,elevation_surveyed:false,model_revision:'curvelo-v1',sections:[[0,'Reta principal'],[165,'Curva inclinada · até 16%'],[560,'Reta oposta'],[875,'Curva plana'],[1110,'Reta principal']]},columns:['s','x','y','z','width','bank','grade','tx','ty','lx','ly'],samples,terrain};
}
