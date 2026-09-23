import * as THREE from 'three';

// Canvas-painted surfaces for the Interlagos pits: team garage doors and facade
// glass, the Box 99 workshop, the Lanchonete da Tia and the painted service box.
// Everything is drawn at load time (no image files); phones get half-size canvases.
const SMALL=typeof matchMedia==='function'&&(matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0);
export function canvasTexture(draw,w,h,repeat=false){
 const k=SMALL&&w*h>65536?.5:1,canvas=document.createElement('canvas');canvas.width=Math.round(w*k);canvas.height=Math.round(h*k);
 const ctx=canvas.getContext('2d');ctx.scale(k,k);draw(ctx,w,h);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;if(repeat)map.wrapS=map.wrapT=THREE.RepeatWrapping;return map;
}
export const css=(n,k=1)=>{const r=Math.min(255,Math.round((n>>16&255)*k)),g=Math.min(255,Math.round((n>>8&255)*k)),b=Math.min(255,Math.round((n&255)*k));return `rgb(${r},${g},${b})`;};
// Repeatable pseudo-random numbers: every load paints the same grime.
function random(seed){return ()=>(seed=seed*16807%2147483647)/2147483647;}
function flecks(ctx,w,h,count,seed,colors,size){const r=random(seed);for(let i=0;i<count;i++){ctx.globalAlpha=.06+r()*.2;ctx.fillStyle=colors[i%colors.length];const s=size*(.4+r());ctx.fillRect(r()*w,r()*h,s,s);}ctx.globalAlpha=1;}
function smudges(ctx,w,h,count,seed,color,radius,area=[0,0,w,h]){const r=random(seed);for(let i=0;i<count;i++){const x=area[0]+r()*area[2],y=area[1]+r()*area[3],rad=radius*(.4+r()),g=ctx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);}}
function write(ctx,value,x,y,font,fill,{align='center',stroke=null,width=0,max}={}){ctx.font=font;ctx.textAlign=align;ctx.textBaseline='middle';if(stroke){ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.strokeText(value,x,y,max);}ctx.fillStyle=fill;ctx.fillText(value,x,y,max);}
function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
const BOLD='"Arial Black","Arial Bold",Arial,sans-serif',CHALK='"Segoe Print","Comic Sans MS","Chalkboard SE",cursive';

// Box 99 floor, 12.6 x 15.8 m: grey flake epoxy, painted car bay, tool-wall hatching,
// tyre marks from the door and the 99 by the door (bottom edge = garage door).
export const garageFloor=()=>canvasTexture((ctx,w,h)=>{
 const mx=w/12.6,my=h/15.8,X=x=>(x+6.3)*mx,Y=d=>h-d*my;
 const g=ctx.createLinearGradient(0,h,0,0);g.addColorStop(0,'#7c8386');g.addColorStop(1,'#949b9d');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 flecks(ctx,w,h,30000,7,['#565c5f','#c9cdcf','#2c3134','#9c2a2a','#e8e2d0'],2.4);
 smudges(ctx,w,h,26,3,'rgba(30,34,36,.16)',60,[X(-3),Y(10),6*mx,8*my]);
 // Tyre marks where the Opala rolls in, oil drips where it stands.
 ctx.lineCap='round';for(const x of [-.8,.8]){ctx.strokeStyle='rgba(18,20,22,.2)';ctx.lineWidth=.21*mx;ctx.beginPath();ctx.moveTo(X(x*1.15),Y(0));ctx.bezierCurveTo(X(x*1.05),Y(2.5),X(x),Y(5),X(x),Y(8.4));ctx.stroke();}
 smudges(ctx,w,h,5,19,'rgba(12,14,12,.35)',.35*mx,[X(-.6),Y(6.4),1.2*mx,1.5*my]);
 // Yellow walkway lines 30 cm off the walls, red outline of the car bay.
 ctx.strokeStyle='#e9bd1c';ctx.lineWidth=.1*mx;ctx.strokeRect(X(-6),Y(15.5),12*mx,15.1*my);
 ctx.strokeStyle='#c01c24';ctx.lineWidth=.14*mx;ctx.strokeRect(X(-1.55),Y(9),3.1*mx,6.2*my);
 for(const x of [-1.55,1.55])for(const d of [3.9,7.5]){ctx.fillStyle='#f3efe3';ctx.fillRect(X(x)-.04*mx,Y(d)-.35*my,.08*mx,.7*my);}
 // Hatched zone before the workbench and tool chests.
 ctx.save();ctx.beginPath();ctx.rect(X(4.45),Y(12.4),1.85*mx,9.4*my);ctx.clip();ctx.fillStyle='rgba(20,20,20,.75)';ctx.fillRect(X(4.45),Y(12.4),1.85*mx,9.4*my);
 ctx.strokeStyle='#e9bd1c';ctx.lineWidth=.16*mx;for(let k=-20;k<30;k++){ctx.beginPath();ctx.moveTo(X(4.45),Y(3)-k*.45*my);ctx.lineTo(X(6.3),Y(3)-(k+4)*.45*my);ctx.stroke();}ctx.restore();
 // Numbers readable from the lane, team name toward the back wall.
 write(ctx,'99',X(0),Y(1.7),`900 ${2.4*my}px ${BOLD}`,'rgba(240,196,25,.9)',{stroke:'rgba(20,20,20,.55)',width:.08*my});
 write(ctx,'AUTO-POBRE RACING',X(0),Y(11.9),`900 ${.62*my}px ${BOLD}`,'rgba(245,242,232,.7)');
 write(ctx,'OPALA 99 · INTERLAGOS',X(0),Y(11.1),`bold ${.34*my}px Arial`,'rgba(245,242,232,.55)');
 // Drain channel across the door.
 ctx.fillStyle='#2f3436';ctx.fillRect(0,Y(.42),w,.2*my);ctx.fillStyle='#121517';for(let x=4;x<w;x+=.09*mx)ctx.fillRect(x,Y(.4),.035*mx,.16*my);
},1024,1280);

// Ladrilho hidraulico: 4 x 4 tiles of 20 cm; rosettes form where four tiles meet.
export const cafeFloor=()=>canvasTexture((ctx,w,h)=>{
 const t=w/4;ctx.fillStyle='#e7d9bc';ctx.fillRect(0,0,w,h);
 for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){const x=i*t,y=j*t;ctx.fillStyle='#a43f2b';ctx.beginPath();ctx.arc(x,y,t*.34,0,7);ctx.fill();ctx.fillStyle='#e7d9bc';ctx.beginPath();ctx.arc(x,y,t*.2,0,7);ctx.fill();ctx.fillStyle='#244456';ctx.beginPath();ctx.arc(x,y,t*.09,0,7);ctx.fill();}
 for(let i=0;i<4;i++)for(let j=0;j<4;j++){
  const x=i*t,y=j*t,cx=x+t/2,cy=y+t/2;
  ctx.fillStyle='#244456';ctx.beginPath();ctx.moveTo(cx,cy-t*.22);ctx.lineTo(cx+t*.22,cy);ctx.lineTo(cx,cy+t*.22);ctx.lineTo(cx-t*.22,cy);ctx.closePath();ctx.fill();
  ctx.fillStyle='#d8a442';ctx.beginPath();ctx.arc(cx,cy,t*.07,0,7);ctx.fill();
  ctx.strokeStyle='#244456';ctx.lineWidth=t*.025;ctx.strokeRect(x+t*.14,y+t*.14,t*.72,t*.72);
 }
 ctx.strokeStyle='rgba(120,108,88,.8)';ctx.lineWidth=2;for(let k=0;k<=4;k++){ctx.beginPath();ctx.moveTo(k*t,0);ctx.lineTo(k*t,h);ctx.moveTo(0,k*t);ctx.lineTo(w,k*t);ctx.stroke();}
 flecks(ctx,w,h,2500,5,['#6b5a44','#ffffff'],3);
},512,512,true);

// Cafe walls, 2.6 m wide x 5.2 m: white tiles to 1.4 m, a blue Portuguese border,
// wooden rail and warm plaster above.
export const cafeWall=()=>canvasTexture((ctx,w,h)=>{
 const m=h/5.2,Y=y=>h-y*m,tile=.15*m;
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#e9d7b0');g.addColorStop(1,'#f3e5c6');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);smudges(ctx,w,Y(1.6),30,9,'rgba(160,120,70,.06)',80);
 ctx.fillStyle='#d6bf8f';ctx.fillRect(0,0,w,.18*m);
 const r=random(4);for(let y=0;y<1.35;y+=.15)for(let x=0;x<w;x+=tile){const l=242+Math.round(r()*10);ctx.fillStyle=`rgb(${l},${l},${l-4})`;ctx.fillRect(x+1,Y(y+.15)+1,tile-2,tile-2);}
 ctx.fillStyle='#bcc5c8';for(let y=0;y<=1.35;y+=.15)ctx.fillRect(0,Y(y)-1,w,2);for(let x=0;x<=w;x+=tile)ctx.fillRect(x-1,Y(1.5),2,1.5*m);
 // Border row: blue quatrefoils.
 for(let x=0;x<w;x+=tile){ctx.fillStyle='#f6f4ee';ctx.fillRect(x+1,Y(1.5)+1,tile-2,tile-2);const cx=x+tile/2,cy=Y(1.425);ctx.fillStyle='#2b5fa6';for(const a of [0,1,2,3]){ctx.beginPath();ctx.arc(cx+Math.cos(a*Math.PI/2)*tile*.2,cy+Math.sin(a*Math.PI/2)*tile*.2,tile*.17,0,7);ctx.fill();}ctx.fillStyle='#f6f4ee';ctx.beginPath();ctx.arc(cx,cy,tile*.1,0,7);ctx.fill();ctx.strokeStyle='#2b5fa6';ctx.lineWidth=2;ctx.strokeRect(x+3,Y(1.5)+3,tile-6,tile-6);}
 ctx.fillStyle='#6f4526';ctx.fillRect(0,Y(1.58),w,.08*m);ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(0,Y(1.58),w,.015*m);
 smudges(ctx,w,h,8,21,'rgba(90,70,40,.12)',40,[0,Y(.25),w,.25*m]);
},512,1024,true);

// Garage walls, 2.6 m x 5.2 m: team-red dado with white and yellow lines, light
// composite panels with seams and rivets, dark band under the ceiling.
export const garageWall=()=>canvasTexture((ctx,w,h)=>{
 const m=h/5.2,Y=y=>h-y*m;
 ctx.fillStyle='#dde0e1';ctx.fillRect(0,0,w,h);smudges(ctx,w,h,20,13,'rgba(90,95,100,.07)',90);
 ctx.fillStyle='#b9bec1';for(const x of [0,w/2])ctx.fillRect(x,0,3,h);ctx.fillRect(0,Y(3.1),w,3);
 ctx.fillStyle='#9aa1a5';for(const x of [8,w/2-8,w/2+8,w-8])for(let y=1.4;y<4.8;y+=.45){ctx.beginPath();ctx.arc(x,Y(y),2.2,0,7);ctx.fill();}
 const red=ctx.createLinearGradient(0,Y(1.1),0,h);red.addColorStop(0,'#c01e25');red.addColorStop(1,'#8f141a');ctx.fillStyle=red;ctx.fillRect(0,Y(1.1),w,1.1*m);
 ctx.fillStyle='#f4f1ea';ctx.fillRect(0,Y(1.17),w,.07*m);ctx.fillStyle='#f0c419';ctx.fillRect(0,Y(1.22),w,.03*m);
 ctx.fillStyle='#151719';ctx.fillRect(0,Y(.12),w,.12*m);ctx.fillStyle='#3a4044';ctx.fillRect(0,0,w,.3*m);
 smudges(ctx,w,h,14,17,'rgba(20,20,20,.14)',50,[0,Y(.5),w,.5*m]);
},512,1024,true);

// Shadow board over the workbench, 6 x 1.5 m: pegboard, painted outlines and tools.
export const toolBoard=()=>canvasTexture((ctx,w,h)=>{
 ctx.fillStyle='#8c969b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#cdd4d7';ctx.fillRect(8,8,w-16,h-16);
 ctx.fillStyle='rgba(38,46,50,.5)';for(let y=14;y<h-8;y+=9)for(let x=14;x<w-8;x+=9)ctx.fillRect(x-1,y-1,2.4,2.4);
 const chrome=(stroke=false)=>{ctx.fillStyle=stroke?'#2b3439':'#b7bdc1';ctx.strokeStyle=stroke?'#2b3439':'#687177';};
 const tool=draw=>{ctx.save();ctx.translate(2,2);draw(true);ctx.restore();draw(false);};
 const wrench=(x,y,len)=>tool(s=>{chrome(s);const t=len*.085;ctx.fillRect(x-t/2,y,t,len);ctx.beginPath();ctx.arc(x,y,len*.12,0,7);ctx.fill();ctx.beginPath();ctx.arc(x,y+len,len*.1,0,7);ctx.fill();if(!s){ctx.fillStyle='#cdd4d7';ctx.fillRect(x-len*.04,y-len*.13,len*.08,len*.12);ctx.beginPath();ctx.arc(x,y+len,len*.055,0,7);ctx.fill();}});
 const driver=(x,y,len,color)=>tool(s=>{chrome(s);ctx.fillRect(x-2.5,y+len*.4,5,len*.6);if(!s)ctx.fillStyle=color;round(ctx,x-len*.08,y,len*.16,len*.42,len*.05);ctx.fill();});
 const hammer=(x,y,color)=>tool(s=>{ctx.fillStyle=s?'#2b3439':color;round(ctx,x-7,y+30,14,82,6);ctx.fill();ctx.fillStyle=s?'#2b3439':'#4b5358';ctx.fillRect(x-30,y+12,60,22);});
 const pliers=(x,y,color)=>tool(s=>{ctx.lineCap='round';ctx.strokeStyle=s?'#2b3439':color;ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(x,y+40);ctx.lineTo(x-16,y+110);ctx.moveTo(x,y+40);ctx.lineTo(x+16,y+110);ctx.stroke();ctx.strokeStyle=s?'#2b3439':'#9aa1a5';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(x-5,y+42);ctx.lineTo(x-3,y+6);ctx.moveTo(x+5,y+42);ctx.lineTo(x+3,y+6);ctx.stroke();});
 for(let i=0;i<9;i++)wrench(40+i*30,40+i*3,110+i*10);
 for(let i=0;i<7;i++)driver(330+i*26,34,120,['#d42a2a','#f0c419','#1b1d20','#2f6db5'][i%4]);
 hammer(540,30,'#b3161c');hammer(600,36,'#1d2023');pliers(660,30,'#d42a2a');pliers(705,30,'#2f6db5');pliers(750,34,'#f0c419');
 // Torque wrench, tyre gauge and the pit stop checklist.
 tool(s=>{chrome(s);ctx.fillRect(790,40,9,190);ctx.fillStyle=s?'#2b3439':'#b3161c';round(ctx,786,160,17,70,5);ctx.fill();chrome(s);ctx.beginPath();ctx.arc(794,40,13,0,7);ctx.fill();});
 tool(s=>{ctx.fillStyle=s?'#2b3439':'#1d2023';ctx.beginPath();ctx.arc(840,70,24,0,7);ctx.fill();if(!s){ctx.fillStyle='#f4f1ea';ctx.beginPath();ctx.arc(840,70,18,0,7);ctx.fill();ctx.strokeStyle='#c01e25';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(840,70);ctx.lineTo(852,60);ctx.stroke();}ctx.strokeStyle=s?'#2b3439':'#1d2023';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(840,94);ctx.quadraticCurveTo(830,150,850,200);ctx.stroke();});
 ctx.fillStyle='#8a5a36';round(ctx,880,24,120,170,6);ctx.fill();ctx.fillStyle='#f7f5ef';ctx.fillRect(888,44,104,142);ctx.fillStyle='#9aa1a5';ctx.fillRect(915,18,50,18);
 write(ctx,'CHECKLIST',940,58,'bold 15px Arial','#1d2023');write(ctx,'PIT STOP · 99',940,74,'bold 11px Arial','#b3161c');
 ctx.strokeStyle='#8d959a';ctx.lineWidth=1;for(let i=0;i<6;i++){ctx.strokeRect(896,90+i*15,8,8);ctx.beginPath();ctx.moveTo(910,98+i*15);ctx.lineTo(980,98+i*15);ctx.stroke();}
 ctx.strokeStyle='#1c7a3a';ctx.lineWidth=2.5;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(897,94+i*15);ctx.lineTo(900,97+i*15);ctx.lineTo(905,89+i*15);ctx.stroke();}
 ctx.fillStyle='#c01e25';ctx.beginPath();ctx.arc(1000,215,24,0,7);ctx.fill();write(ctx,'99',1000,216,`900 22px ${BOLD}`,'#fff');
},1024,256);

// Chalk menu over the back counter, from the café's own price list.
export const menuBoard=items=>canvasTexture((ctx,w,h)=>{
 const wood=ctx.createLinearGradient(0,0,w,h);wood.addColorStop(0,'#7a4a2a');wood.addColorStop(1,'#5b351d');ctx.fillStyle=wood;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#1e2a24';ctx.fillRect(30,30,w-60,h-60);smudges(ctx,w,h,60,11,'rgba(255,255,255,.05)',140,[30,30,w-60,h-60]);
 write(ctx,'Cardápio da Tia',w/2,98,`bold 78px ${CHALK}`,'#f4f0e1');
 ctx.strokeStyle='rgba(244,240,225,.8)';ctx.lineWidth=4;ctx.beginPath();for(let x=250;x<=774;x+=8)ctx.lineTo(x,150+Math.sin(x*.08)*4);ctx.stroke();
 items.forEach((item,i)=>{
  const y=225+i*96,price='R$ '+item.price.toFixed(2).replace('.',',');
  write(ctx,item.name,90,y,`bold 52px ${CHALK}`,'#f4f0e1',{align:'left'});const a=90+ctx.measureText(item.name).width+18;
  ctx.font=`bold 52px ${CHALK}`;const b=w-90-ctx.measureText(price).width-18;ctx.fillStyle='rgba(244,240,225,.55)';for(let x=a;x<b;x+=16)ctx.fillRect(x,y+14,5,5);
  write(ctx,price,w-90,y,`bold 52px ${CHALK}`,'#f6d77c',{align:'right'});
 });
 write(ctx,'Uma prosa é de graça, uai!',w/2,h-78,`bold 42px ${CHALK}`,'#f3a9bb');
 // Steaming cup doodle.
 ctx.strokeStyle='#f4f0e1';ctx.lineWidth=4;ctx.strokeRect(64,64,54,42);ctx.beginPath();ctx.arc(126,85,12,-1.4,1.4);ctx.stroke();for(const x of [78,92,106]){ctx.beginPath();ctx.moveTo(x,58);ctx.quadraticCurveTo(x-8,46,x,34);ctx.stroke();}
 ctx.strokeStyle='#f3a9bb';ctx.beginPath();ctx.moveTo(w-110,74);ctx.bezierCurveTo(w-130,50,w-160,80,w-110,110);ctx.bezierCurveTo(w-60,80,w-90,50,w-110,74);ctx.stroke();
},1024,640);

// Roller doors of the closed garages: 4 x 4 atlas; team doors carry the rival's
// colour band, number roundel and name, empty ones stay plain slats.
export function garageDoors(teams){
 const cols=4,rows=4;
 const map=canvasTexture((ctx,w,h)=>{
  const cw=w/cols,ch=h/rows;
  teams.slice(0,cols*rows).forEach((team,i)=>{
   ctx.save();ctx.translate((i%cols)*cw,Math.floor(i/cols)*ch);ctx.beginPath();ctx.rect(0,0,cw,ch);ctx.clip();
   const metal=ctx.createLinearGradient(0,0,0,ch);metal.addColorStop(0,team?'#b9c0c3':'#8f979b');metal.addColorStop(1,team?'#9ea6aa':'#737b80');ctx.fillStyle=metal;ctx.fillRect(0,0,cw,ch);
   if(team){
    ctx.fillStyle=css(team.color);ctx.beginPath();ctx.moveTo(0,ch*.62);ctx.lineTo(cw*.55,ch*.3);ctx.lineTo(cw,ch*.3);ctx.lineTo(cw,ch*.72);ctx.lineTo(cw*.5,ch*.92);ctx.lineTo(0,ch*.95);ctx.closePath();ctx.fill();
    ctx.fillStyle=css(team.color,.55);ctx.beginPath();ctx.moveTo(0,ch*.56);ctx.lineTo(cw*.55,ch*.24);ctx.lineTo(cw,ch*.24);ctx.lineTo(cw,ch*.28);ctx.lineTo(cw*.55,ch*.28);ctx.lineTo(0,ch*.6);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f7f5ef';ctx.beginPath();ctx.arc(cw*.2,ch*.62,ch*.2,0,7);ctx.fill();ctx.strokeStyle='#1d2023';ctx.lineWidth=5;ctx.stroke();
    write(ctx,team.number,cw*.2,ch*.63,`900 ${ch*(team.number.length>2?.17:.22)}px ${BOLD}`,'#1d2023');
    write(ctx,team.name.toUpperCase(),cw*.64,ch*.55,`italic 900 ${ch*.12}px ${BOLD}`,'#ffffff',{stroke:'rgba(0,0,0,.6)',width:6,max:cw*.62});
    write(ctx,'OLD STOCK RACE',cw*.64,ch*.72,`bold ${ch*.065}px Arial`,'#ffffff',{stroke:'rgba(0,0,0,.45)',width:3});
   }else write(ctx,team===null?'':'BOX',cw/2,ch*.18,`bold ${ch*.07}px Arial`,'#3b4246');
   // Slats over the paint.
   for(let y=0;y<ch;y+=11){ctx.fillStyle='rgba(20,24,26,.28)';ctx.fillRect(0,y,cw,2);ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(0,y+2,cw,1.5);}
   const dirt=ctx.createLinearGradient(0,ch*.8,0,ch);dirt.addColorStop(0,'rgba(40,34,28,0)');dirt.addColorStop(1,'rgba(40,34,28,.45)');ctx.fillStyle=dirt;ctx.fillRect(0,0,cw,ch);
   ctx.fillStyle='#2a2f33';ctx.fillRect(cw*.46,ch*.93,cw*.08,ch*.04);
   ctx.restore();
  });
 },2048,1024);
 const uv=i=>[(i%cols)/cols,1-(Math.floor(i/cols)+1)/rows,(i%cols+1)/cols,1-Math.floor(i/cols)/rows];
 return {map,uv,cells:cols*rows};
}

// Glass of the upper floor (one bay, ~11.7 x 2.5 m): sky reflection, mullions,
// lit ceiling and a few people inside.
export const facadeGlass=()=>canvasTexture((ctx,w,h)=>{
 const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#a9bfcb');g.addColorStop(.45,'#4b6674');g.addColorStop(1,'#1d2c34');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='rgba(255,236,196,.28)';for(let x=40;x<w;x+=130)ctx.fillRect(x,h*.2,70,6);
 const r=random(8);for(let i=0;i<9;i++){const x=r()*w,s=.8+r()*.3;ctx.fillStyle=`rgba(18,24,28,${.35+r()*.25})`;ctx.beginPath();ctx.arc(x,h*.5,11*s,0,7);ctx.fill();round(ctx,x-15*s,h*.5+10*s,30*s,h*.5,8);ctx.fill();}
 ctx.fillStyle='rgba(255,255,255,.07)';for(let x=-200;x<w;x+=260){ctx.beginPath();ctx.moveTo(x,h);ctx.lineTo(x+120,0);ctx.lineTo(x+170,0);ctx.lineTo(x+50,h);ctx.closePath();ctx.fill();}
 ctx.fillStyle='#262c30';for(let k=0;k<=8;k++)ctx.fillRect(k*w/8-4,0,8,h);ctx.fillRect(0,h*.3,w,6);ctx.fillRect(0,0,w,8);ctx.fillRect(0,h-10,w,10);
},1024,256);

// Painted service box on the working lane, 7.2 m along the lane x 3.8 m across:
// team red, yellow outline, hatched ends and white wheel marks (right = forward).
export const serviceBox=()=>canvasTexture((ctx,w,h)=>{
 const m=w/7.2,X=s=>(s+3.6)*m,Y=d=>h/2-d*m;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(176,22,28,.42)';ctx.fillRect(0,0,w,h);flecks(ctx,w,h,5000,12,['#000','#fff'],3);
 ctx.save();ctx.beginPath();ctx.rect(X(2.55),0,X(3.6)-X(2.55),h);ctx.rect(0,0,X(-2.55),h);ctx.clip();ctx.strokeStyle='rgba(240,196,25,.95)';ctx.lineWidth=.16*m;for(let k=-10;k<60;k++){ctx.beginPath();ctx.moveTo(k*.4*m,h);ctx.lineTo(k*.4*m+h,0);ctx.stroke();}ctx.restore();
 ctx.strokeStyle='#f0c419';ctx.lineWidth=.14*m;ctx.strokeRect(.07*m,.07*m,w-.14*m,h-.14*m);ctx.fillStyle='#f0c419';for(const s of [-2.55,2.55])ctx.fillRect(X(s)-.05*m,0,.1*m,h);
 ctx.fillStyle='#f4f1e6';for(const s of [1.53,-1.117])for(const d of [-.8,.8]){ctx.fillRect(X(s)-.05*m,Y(d)-.28*m,.1*m,.56*m);ctx.fillRect(X(s)-.3*m,Y(d)+(d>0?-.34:.28)*m,.6*m,.06*m);}
 ctx.save();ctx.translate(X(-3.05),h/2);ctx.rotate(Math.PI/2);write(ctx,'99',0,0,`900 ${1.05*m}px ${BOLD}`,'#f4f1e6',{stroke:'rgba(0,0,0,.35)',width:.05*m});ctx.restore();
 ctx.save();ctx.translate(X(3.07),h/2);ctx.rotate(Math.PI/2);write(ctx,'PARE',0,0,`900 ${.5*m}px ${BOLD}`,'#f4f1e6',{stroke:'rgba(0,0,0,.35)',width:.04*m});ctx.restore();
},1024,540);

// Lollipop discs held in front of the windscreen.
export const lollipop=(label,color)=>canvasTexture((ctx,w,h)=>{
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#f4f1ea';ctx.beginPath();ctx.arc(w/2,h/2,w/2-2,0,7);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(w/2,h/2,w/2-14,0,7);ctx.fill();
 const lines=label.split('\n');lines.forEach((line,i)=>write(ctx,line,w/2,h/2+(i-(lines.length-1)/2)*62,`900 ${lines.length>1?50:62}px ${BOLD}`,'#fff',{max:w-40}));
},256,256);

// Timing screens: running order with the Opala 99 highlighted.
export const timingScreen=(rows,title='CRONOMETRAGEM · INTERLAGOS')=>canvasTexture((ctx,w,h)=>{
 ctx.fillStyle='#0b1116';ctx.fillRect(0,0,w,h);ctx.fillStyle='#16324a';ctx.fillRect(0,0,w,40);write(ctx,title,16,21,'bold 20px Arial','#e9f1f5',{align:'left'});
 rows.forEach((row,i)=>{const y=62+i*27;if(row.me){ctx.fillStyle='#6b1418';ctx.fillRect(0,y-13,w,26);}write(ctx,String(i+1).padStart(2,' '),16,y,'bold 18px Consolas,monospace','#f0c419',{align:'left'});
  ctx.fillStyle=row.color;ctx.fillRect(52,y-9,6,18);write(ctx,row.number,66,y,'bold 18px Consolas,monospace','#ffffff',{align:'left'});write(ctx,row.name.toUpperCase(),116,y,'18px Consolas,monospace','#d8e4ea',{align:'left',max:230});write(ctx,row.time,w-16,y,'18px Consolas,monospace',row.me?'#ffe38a':'#8fe39a',{align:'right'});});
 ctx.fillStyle='rgba(255,255,255,.05)';for(let y=0;y<h;y+=3)ctx.fillRect(0,y,w,1);
},512,320);

// Tyre sidewall for the caps of stacked tyres: rim, spokes and lettering.
export const tyreWall=()=>canvasTexture((ctx,w,h)=>{
 const c=w/2;ctx.fillStyle='#141516';ctx.fillRect(0,0,w,h);ctx.fillStyle='#1d1f21';ctx.beginPath();ctx.arc(c,c,c*.98,0,7);ctx.fill();
 ctx.font=`bold ${w*.07}px Arial`;ctx.fillStyle='#d9d9d4';ctx.textAlign='center';ctx.textBaseline='middle';
 for(const [label,start] of [['AUTO-POBRE',-2.4],['SLICK · 99',.7]])[...label].forEach((ch,i)=>{ctx.save();ctx.translate(c,c);ctx.rotate(start+i*.17);ctx.fillText(ch,0,-c*.8);ctx.restore();});
 const rim=ctx.createRadialGradient(c,c,0,c,c,c*.62);rim.addColorStop(0,'#e7eaec');rim.addColorStop(1,'#8e979c');ctx.fillStyle=rim;ctx.beginPath();ctx.arc(c,c,c*.62,0,7);ctx.fill();
 ctx.fillStyle='#2a2f33';for(let k=0;k<5;k++){const a=k*Math.PI*2/5;ctx.beginPath();ctx.arc(c+Math.cos(a)*c*.36,c+Math.sin(a)*c*.36,c*.13,0,7);ctx.fill();}
 ctx.fillStyle='#5d666b';ctx.beginPath();ctx.arc(c,c,c*.12,0,7);ctx.fill();
},256,256);

// Drinks fridge door: glass with shelves of bottles and cans.
export const fridgeDoor=()=>canvasTexture((ctx,w,h)=>{
 ctx.fillStyle='#c8cfd2';ctx.fillRect(0,0,w,h);ctx.fillStyle='#1f5f3a';ctx.fillRect(0,0,w,56);write(ctx,'GELADINHA',w/2,29,`900 34px ${BOLD}`,'#ffffff');
 ctx.fillStyle='#dfeef2';ctx.fillRect(16,70,w-32,h-90);
 const colors=['#2f8a2f','#5a1d12','#e27a18','#c71f23','#f0d24a','#2f6db5'];for(let row=0;row<4;row++){const y=70+row*(h-90)/4;ctx.fillStyle='#9aa7ac';ctx.fillRect(16,y+(h-90)/4-8,w-32,6);for(let k=0;k<7;k++){ctx.fillStyle=colors[(row*3+k)%colors.length];const x=24+k*31;round(ctx,x,y+22,22,(h-90)/4-32,6);ctx.fill();ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(x+3,y+50,16,14);}}
 ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.moveTo(20,h-20);ctx.lineTo(90,70);ctx.lineTo(140,70);ctx.lineTo(70,h-20);ctx.fill();
 ctx.fillStyle='#8e979c';ctx.fillRect(w-22,h*.35,8,h*.3);
},256,512);

// Small repeatable patterns.
export const gingham=()=>canvasTexture((ctx,w,h)=>{ctx.fillStyle='#f6f2ea';ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(196,32,38,.55)';for(let k=0;k<4;k++){ctx.fillRect(k*w/4,0,w/8,h);ctx.fillRect(0,k*h/4,w,h/8);}},128,128,true);
export const awning=()=>canvasTexture((ctx,w,h)=>{for(let k=0;k<8;k++){ctx.fillStyle=k%2?'#f6f2ea':'#c4232a';ctx.fillRect(k*w/8,0,w/8,h);}ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,h*.8,w,h*.2);},256,64,true);
export const storefrontTiles=()=>canvasTexture((ctx,w,h)=>{ctx.fillStyle='#6e2a1c';ctx.fillRect(0,0,w,h);const r=random(6);for(let y=0;y<h;y+=16)for(let x=0;x<w;x+=16){const k=.8+r()*.35;ctx.fillStyle=css(0xa84a30,k);ctx.fillRect(x+1,y+1,14,14);}},256,256,true);

// Signs: gradient board with a light border and optional stripe.
export const signBoard=(title,sub,bg,fg,{accent='#f0c419',w=1024,h=256}={})=>canvasTexture((ctx,W,H)=>{
 const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,bg);g.addColorStop(1,'rgba(0,0,0,.35)');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.fillStyle=g;ctx.globalAlpha=.5;ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;
 ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=H*.03;ctx.strokeRect(H*.05,H*.05,W-H*.1,H-H*.1);ctx.fillStyle=accent;ctx.fillRect(H*.05,H*.8,W-H*.1,H*.04);
 write(ctx,title,W/2,H*(sub?.42:.5),`900 ${H*(sub?.38:.5)}px ${BOLD}`,fg,{stroke:'rgba(0,0,0,.35)',width:H*.03,max:W*.9});if(sub)write(ctx,sub,W/2,H*.68,`bold ${H*.15}px Arial`,fg,{max:W*.9});
},w,h);

// Curvelo pit-lane road signs: reflective green sheeting, white border and painted
// arrows. 'entrada' (lane peels off to the left), 'bifurcacao' (BOX left, PISTA right)
// and 'saida' (lane merges back to the right).
export const pitLaneSign=kind=>{
 const square=kind==='bifurcacao';
 return canvasTexture((ctx,w,h)=>{
  const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#17604d');g.addColorStop(1,'#0c3a2e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  flecks(ctx,w,h,700,kind.length*31,['#000','#fff'],2);
  round(ctx,16,16,w-32,h-32,28);ctx.strokeStyle='#f4f1ea';ctx.lineWidth=12;ctx.stroke();
  const arrow=(points,color,width=44,head=92)=>{
   ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.lineJoin=ctx.lineCap='round';
   const [x1,y1]=points.at(-2),[x2,y2]=points.at(-1),a=Math.atan2(y2-y1,x2-x1),bx=x2-Math.cos(a)*head*.7,by=y2-Math.sin(a)*head*.7;
   ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1,-1))ctx.lineTo(...p);ctx.lineTo(bx,by);ctx.stroke();
   ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(bx+Math.cos(a+Math.PI/2)*head*.62,by+Math.sin(a+Math.PI/2)*head*.62);ctx.lineTo(bx-Math.cos(a+Math.PI/2)*head*.62,by-Math.sin(a+Math.PI/2)*head*.62);ctx.closePath();ctx.fill();
  };
  if(square){
   // Stem up the middle, splitting into the lane (left) and the track (right).
   arrow([[w/2,h-70],[w/2,h*.56],[w-128,150]],'#f4f1ea',40,84);arrow([[w/2,h*.58],[128,150]],'#f0c419',40,84);
   write(ctx,'BOX',124,h*.8,`900 66px ${BOLD}`,'#f0c419');write(ctx,'PISTA',w-124,h*.8,`900 44px ${BOLD}`,'#f4f1ea');
   return;
  }
  // Arrow on the side the lane goes, text block beside it.
  const exit=kind==='saida',ax=exit?w-250:250,tx=exit?336:w-336;
  arrow([[ax,h-72],[ax,h*.53],[exit?w-120:120,150]],'#f0c419');
  ctx.letterSpacing='4px';
  write(ctx,exit?'SAÍDA':'BOXES',tx,158,`900 138px ${BOLD}`,'#fff4c5',{stroke:'rgba(0,0,0,.3)',width:6,max:530});
  write(ctx,exit?'DOS BOXES':'ENTRADA',tx,276,'bold 64px Arial','#f4f1ea',{max:530});
  ctx.letterSpacing='0px';
  round(ctx,tx-265,344,530,98,18);ctx.fillStyle=exit?'#f0c419':'#b3161c';ctx.fill();
  write(ctx,exit?'CUIDADO · CARROS NA PISTA':'BOX 99 · LANCHONETE DA TIA',tx,394,'bold 40px Arial',exit?'#1d2023':'#fff',{max:500});
 },square?512:1024,512);
};

// Back of the crew suits.
export const crewBack=()=>canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);write(ctx,'99',w/2,h*.42,`900 ${h*.5}px ${BOLD}`,'#f4f1ea',{stroke:'#1d2023',width:6});write(ctx,'AUTO-POBRE',w/2,h*.8,`bold ${h*.13}px Arial`,'#f0c419');},256,256);

// Retro race poster for the café wall.
export const racePoster=()=>canvasTexture((ctx,w,h)=>{
 ctx.fillStyle='#f0d9a4';ctx.fillRect(0,0,w,h);const cx=w/2,cy=h*.46;for(let k=0;k<24;k++){ctx.fillStyle=k%2?'#e9832f':'#f2b53d';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,w,k*Math.PI/12,(k+1)*Math.PI/12);ctx.fill();}
 ctx.fillStyle='#1d2023';ctx.beginPath();ctx.moveTo(w*.08,h*.62);ctx.lineTo(w*.2,h*.52);ctx.lineTo(w*.36,h*.5);ctx.lineTo(w*.48,h*.4);ctx.lineTo(w*.7,h*.4);ctx.lineTo(w*.82,h*.5);ctx.lineTo(w*.93,h*.53);ctx.lineTo(w*.94,h*.62);ctx.closePath();ctx.fill();
 ctx.fillStyle='#8fb8d0';ctx.beginPath();ctx.moveTo(w*.51,h*.42);ctx.lineTo(w*.66,h*.42);ctx.lineTo(w*.75,h*.5);ctx.lineTo(w*.43,h*.5);ctx.closePath();ctx.fill();
 ctx.fillStyle='#c01e25';ctx.fillRect(w*.1,h*.555,w*.83,h*.018);for(const x of [.26,.76]){ctx.fillStyle='#111';ctx.beginPath();ctx.arc(w*x,h*.62,w*.075,0,7);ctx.fill();ctx.fillStyle='#b7bdc1';ctx.beginPath();ctx.arc(w*x,h*.62,w*.035,0,7);ctx.fill();}
 ctx.fillStyle='#f4f1ea';ctx.beginPath();ctx.arc(w*.58,h*.53,w*.045,0,7);ctx.fill();write(ctx,'99',w*.58,h*.532,`900 ${w*.05}px ${BOLD}`,'#1d2023');
 write(ctx,'INTERLAGOS',w/2,h*.13,`900 ${w*.14}px ${BOLD}`,'#1d2023',{max:w*.9});write(ctx,'GRANDE PRÊMIO DO OPALA',w/2,h*.23,`bold ${w*.058}px Arial`,'#8f141a',{max:w*.9});
 ctx.fillStyle='#1d2023';ctx.fillRect(0,h*.78,w,h*.22);write(ctx,'DOMINGO · 10 HORAS',w/2,h*.85,`900 ${w*.07}px ${BOLD}`,'#f2b53d',{max:w*.9});write(ctx,'ARQUIBANCADA A PREÇO DE PÃO DE QUEIJO',w/2,h*.93,`bold ${w*.035}px Arial`,'#f4f1ea',{max:w*.9});
},512,720);

// Plaque on the café counter.
export const plaque=(text,bg='#f7f1dc',fg='#8f141a')=>canvasTexture((ctx,w,h)=>{ctx.fillStyle='#6f4526';ctx.fillRect(0,0,w,h);ctx.fillStyle=bg;ctx.fillRect(8,8,w-16,h-16);text.split('\n').forEach((line,i,all)=>write(ctx,line,w/2,h/2+(i-(all.length-1)/2)*h*.32,`900 ${h*.26}px ${BOLD}`,fg,{max:w-30}));},256,128);
