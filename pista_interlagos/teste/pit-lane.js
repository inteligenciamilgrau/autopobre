const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Fictional service lane on the inside of Curvelo's main straight.
export function pitLane(data,s){
 if(data.meta.id!=='curvelo')return null;
 const u=(s+150)%1250;if(u>300)return null;
 const blend=smooth(u/80)*(1-smooth((u-220)/80));
 return {offset:20*blend,halfWidth:3.3,u,entry:u<80,exit:u>220};
}
export function inPitBox(surface){return !!surface.pit&&surface.s>=10&&surface.s<=30&&Math.abs(surface.d-20)<2.2;}
