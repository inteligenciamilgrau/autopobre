import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {structureMaterial} from './landscape.js';

// Pit lane of Interlagos from data.pit: the lane and its painted gore and merge,
// markings, the pit wall with its debris fence, the walls along the exit road
// and the garage block with its membrane canopy (heights from the 2017 LiDAR).
// Buildings are simplified volumes; lane geometry follows the 20 cm orthophoto.
function canvasTexture(draw,w,h){
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;return map;
}
function geometryFrom(positions,uvs,indices,extra){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 if(uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 for(const [name,values,size] of extra??[])g.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
 if(indices)g.setIndex(indices);g.computeVertexNormals();return g;
}
export function createInterlagosPit(data,roadSurface,textures){
 const pit=data.pit,c=Object.fromEntries(pit.columns.map((k,i)=>[k,i])),a=pit.samples,n=a.length;
 const root=new THREE.Group();root.name='Pit_lane_Interlagos';const obstacles=[];
 const at=(p,d,lift=0)=>new THREE.Vector3(p[c.x]+p[c.lx]*d,p[c.z]+p[c.bank]*d+lift,-(p[c.y]+p[c.ly]*d));
 const index=s=>{let lo=0,hi=n-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m][c.s]<=s)lo=m;else hi=m-1;}return lo;};
 const lerp=(s)=>{const i=Math.min(n-2,index(s)),p=a[i],q=a[i+1],u=Math.max(0,Math.min(1,(s-p[c.s])/(q[c.s]-p[c.s])));return p.map((v,k)=>v+(q[k]-v)*u);};
 const mat=(name,color,extra={})=>new THREE.MeshStandardMaterial({name,color,roughness:.9,...extra});
 // --- Asphalt: lane, painted gore at the entry and the kerbed merge at the exit.
 {
  const positions=[],uvs=[],road=[],indices=[];
  for(let i=0;i<n;i++){
   const p=a[i],mid=(p[c.lane_lo]+p[c.lane_hi])/2,width=p[c.lane_hi]-p[c.lane_lo];
   for(const d of [p[c.lo],p[c.hi]]){const v=at(p,d,.035);positions.push(v.x,v.y,v.z);uvs.push(v.x/2.1,v.z/2.1);road.push(d-mid,6000+p[c.s],width,0);}
   if(i){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=geometryFrom(positions,uvs,indices,[['roadData',road,4]]);
  // Pushed back a little: where the lanes touch, the track's own surface wins.
  const material=roadSurface.material.clone();material.onBeforeCompile=roadSurface.material.onBeforeCompile;material.customProgramCacheKey=roadSurface.material.customProgramCacheKey;
  material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;
  const asphalt=new THREE.Mesh(g,material);asphalt.name='Asfalto_pit_lane';asphalt.receiveShadow=true;root.add(asphalt);
 }
 // --- Paint.
 const white=mat('Pintura_pit',0xece8d8,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const yellow=mat('Pintura_box',0xf0c419,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const paints={white:[],yellow:[]};
 function stripe(list,from,to,offset,width,step=2){
  const positions=[],indices=[];let k=0;
  for(let s=from;s<=to+1e-6;s+=step){
   const p=lerp(Math.min(s,to)),d=offset(p);for(const e of [d-width/2,d+width/2]){const v=at(p,e,.045);positions.push(v.x,v.y,v.z);}
   if(k){const b=(k-1)*2;indices.push(b,b+2,b+1,b+1,b+2,b+3);}k++;
  }
  if(k>1)list.push(geometryFrom(positions,null,indices));
 }
 function across(list,s,from,to,depth){const p0=lerp(s-depth/2),p1=lerp(s+depth/2),v=[at(p0,from(p0),.046),at(p0,to(p0),.046),at(p1,from(p1),.046),at(p1,to(p1),.046)];list.push(geometryFrom(v.flatMap(q=>[q.x,q.y,q.z]),null,[0,2,1,1,2,3]));}
 const end=pit.length_m;
 stripe(paints.white,0,end,p=>p[c.lane_lo]+.07,.14);
 stripe(paints.white,0,end,p=>p[c.lane_hi]-.07,.14);
 // Fast lane / working lane divider in front of the garages.
 stripe(paints.white,pit.garages[0]-6,pit.garages[1]+6,p=>p[c.fast_hi]-.07,.14);
 // Entry line, speed-limit lines and the exit line across the lane.
 const lane=p=>p[c.lane_lo],outer=p=>p[c.lane_hi];
 across(paints.white,1,lane,outer,.5);across(paints.white,pit.limit.from,lane,outer,.6);across(paints.white,pit.limit.to,lane,outer,.6);across(paints.white,pit.wall_end,lane,outer,.5);
 // Garage boxes along the working lane, about 13 m apart.
 const bays=Math.max(1,Math.round((pit.garages[1]-pit.garages[0])/13)),bay=(pit.garages[1]-pit.garages[0])/bays;
 for(let b=0;b<=bays;b++)across(paints.yellow,pit.garages[0]+b*bay,p=>p[c.fast_hi],p=>p[c.lane_hi]-.3,.12);
 for(const [list,material] of [[paints.white,white],[paints.yellow,yellow]]){const g=mergeGeometries(list,false);const m=new THREE.Mesh(g,material);m.receiveShadow=true;m.name=material.name;root.add(m);list.forEach(x=>x.dispose());}
 // Painted chevrons in the gore between the track and the pit entry.
 {
  const map=canvasTexture((ctx,w,h)=>{ctx.fillStyle='#51b89f';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#e8f4d8';ctx.lineWidth=h*.16;for(let k=-1;k<3;k++){ctx.beginPath();ctx.moveTo(0,k*h/2+h*.1);ctx.lineTo(w/2,k*h/2+h*.45);ctx.lineTo(w,k*h/2+h*.1);ctx.stroke();}},128,128);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  const positions=[],uvs=[],indices=[];let k=0;
  for(let s=0;s<=pit.wall_nose;s+=2){const p=lerp(s),from=p[c.lo],to=p[c.lane_lo]-.05;if(to-from<.2&&k===0)continue;
   for(const d of [from,Math.max(from,to)]){const v=at(p,d,.044);positions.push(v.x,v.y,v.z);uvs.push((d-to)/3,s/3);}
   if(k){const b=(k-1)*2;indices.push(b,b+2,b+1,b+1,b+2,b+3);}k++;}
  const gore=new THREE.Mesh(geometryFrom(positions,uvs,indices),mat('Zebrado_entrada_boxes',0xffffff,{map,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  gore.name='Zebrado_entrada_boxes';gore.receiveShadow=true;root.add(gore);
 }
 // "60" painted before the limiter line, readable when arriving.
 {
  const map=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#f2efe2';ctx.font='bold 190px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('60',w/2,h/2+8);},256,256);
  const p=lerp(pit.limit.from-9),mid=(p[c.lane_lo]+p[c.fast_hi])/2,centre=at(p,mid,.047);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(3.2,4.4),new THREE.MeshStandardMaterial({map,transparent:true,roughness:.9,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,depthWrite:false}));
  plane.position.copy(centre);plane.rotation.order='YXZ';plane.rotation.y=Math.atan2(p[c.ty],p[c.tx])-Math.PI/2;plane.rotation.x=-Math.PI/2;plane.name='Pintura_limite_60';root.add(plane);
 }
 // --- Walls: extruded along the surveyed polylines.
 const concrete=structureMaterial(mat('Concreto',0x8f918b,{side:THREE.DoubleSide}),textures),metal=structureMaterial(mat('Metal',0x2c3136,{metalness:.5,roughness:.45}),textures);
 const fenceMap=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(205,212,214,.9)';ctx.lineWidth=2;for(let k=-h;k<w+h;k+=16){ctx.beginPath();ctx.moveTo(k,0);ctx.lineTo(k+h,h);ctx.stroke();ctx.beginPath();ctx.moveTo(k,h);ctx.lineTo(k+h,0);ctx.stroke();}},128,128);
 fenceMap.wrapS=fenceMap.wrapT=THREE.RepeatWrapping;
 const fence=new THREE.MeshStandardMaterial({name:'Alambrado_boxes',map:fenceMap,transparent:true,alphaTest:.3,side:THREE.DoubleSide,roughness:.5,metalness:.4});
 const wallParts=[],fenceParts=[],posts=[];
 for(const wall of pit.walls){
  const pts=wall.points,positions=[],indices=[],fenceSide=wall.fence_side??0;
  const fencePos=[],fenceUv=[],fenceIdx=[];let run=0;
  for(let i=0;i<pts.length;i++){
   const [x,y,z,thickness]=pts[i],half=thickness/2,[x0,y0]=pts[Math.max(0,i-1)],[x1,y1]=pts[Math.min(pts.length-1,i+1)],tx=x1-x0,ty=y1-y0,len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len;
   if(i)run+=Math.hypot(x-pts[i-1][0],y-pts[i-1][1]);
   // Outer faces and top: four corners per station, sunk 0.4 m into the ground.
   for(const [side,h] of [[-1,-.4],[-1,wall.height],[1,wall.height],[1,-.4]])positions.push(x+nx*half*side,z+h,-(y+ny*half*side));
   if(i){const b=(i-1)*4;for(let f=0;f<3;f++)indices.push(b+f,b+f+4,b+f+1,b+f+1,b+f+4,b+f+5);}
   // The debris fence stands on the track-side edge of the wall.
   const fx=x+nx*fenceSide*Math.max(0,half-.15),fy=y+ny*fenceSide*Math.max(0,half-.15);
   if(wall.fence){for(const h of [wall.height,wall.height+wall.fence]){fencePos.push(fx,z+h,-fy);fenceUv.push(run/1.6,h/1.6);}if(i){const b=(i-1)*2;fenceIdx.push(b,b+2,b+1,b+1,b+2,b+3);}
    if(i%2===0)posts.push({x:fx,y:fy,z:z+wall.height+wall.fence/2,h:wall.fence});}
  }
  // End caps.
  for(const [i,sign] of [[0,1],[pts.length-1,-1]]){const b=i*4;indices.push(...(sign>0?[b,b+1,b+2,b,b+2,b+3]:[b,b+2,b+1,b,b+3,b+2]));}
  const solid=geometryFrom(positions,null,indices).toNonIndexed();solid.computeVertexNormals();wallParts.push(solid);
  if(wall.fence)fenceParts.push(geometryFrom(fencePos,fenceUv,fenceIdx));
 }
 const walls=new THREE.Mesh(mergeGeometries(wallParts,false),concrete);walls.name='Muro_boxes';walls.castShadow=walls.receiveShadow=true;root.add(walls);obstacles.push(walls);
 if(fenceParts.length){const f=new THREE.Mesh(mergeGeometries(fenceParts,false),fence);f.name='Alambrado_muro_boxes';root.add(f);}
 if(posts.length){const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,1,.08),metal,posts.length),m=new THREE.Matrix4();posts.forEach((p,i)=>{m.makeScale(1,p.h,1).setPosition(p.x,p.z,-p.y);inst.setMatrixAt(i,m);});inst.name='Postes_alambrado';inst.castShadow=true;inst.computeBoundingSphere();root.add(inst);}
 // --- Garage block: 8 m, ~21 m deep, with a white membrane canopy at ~13.5 m.
 {
  const doors=structureMaterial(mat('Metal',0x39424a,{metalness:.35,roughness:.5}),textures),glass=structureMaterial(mat('Vidros_boxes',0x0d1b20,{roughness:.1,metalness:.4}),textures);
  const membrane=new THREE.MeshStandardMaterial({name:'Cobertura_membrana',color:0xf4f3ee,roughness:.75,side:THREE.DoubleSide});
  const parts={block:[],doors:[],glass:[],canopy:[]},signs=[];
  const box=(list,p,d,s,w,depth,h,z0)=>{const g=new THREE.BoxGeometry(w,h,depth),heading=Math.atan2(p[c.ty],p[c.tx]),o=at(p,d);g.rotateY(heading);g.translate(o.x+p[c.tx]*s,p[c.z]+z0+h/2,o.z-p[c.ty]*s);list.push(g);};
  // Box 99 and the café next to it are open: floor above and back rooms only.
  const b99=pit.box99,open=new Set(b99?[b99.index,b99.index-1]:[]);
  for(let b=0;b<bays;b++){
   const s=pit.garages[0]+(b+.5)*bay,p=lerp(s),front=(open.has(b)?b99.front:p[c.hi])+.35;
   if(open.has(b)){box(parts.block,p,front+10.5,0,bay,21,3,5.2);box(parts.block,p,front+18.75,0,bay,4.5,5.5,-.3);}
   else{box(parts.block,p,front+10.5,0,bay,21,8.2,-.3);box(parts.doors,p,front-.04,0,bay-2.4,.12,4.6,0);}
   box(parts.glass,p,front-.04,0,bay-1.2,.14,1.9,5.3);
   // Canopy: two sloped membrane panels per bay meeting at a ridge across the lane side.
   const heading=Math.atan2(p[c.ty],p[c.tx]),base=p[c.z];
   for(const side of [-1,1]){
    const g=new THREE.PlaneGeometry(bay/2,24);g.rotateX(-Math.PI/2);g.rotateZ(-side*.28);
    g.translate(side*bay/4,base+13.4-.35,0);g.rotateY(heading);const o=at(p,front+10);g.translate(o.x,0,o.z);parts.canopy.push(g);
   }
   signs.push({p,front,label:b===b99?.index?'99':b===b99?.index-1?'TIA':String(b+1).padStart(2,'0')});
  }
  for(const [list,material,name] of [[parts.block,concrete,'Box_garagens'],[parts.doors,doors,'Box_portas'],[parts.glass,glass,'Box_janelas'],[parts.canopy,membrane,'Box_cobertura_membrana']]){
   const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=m.receiveShadow=true;root.add(m);if(name!=='Box_cobertura_membrana')obstacles.push(m);
  }
  // Garage numbers above the doors.
  const numbers=canvasTexture((ctx,w,h)=>{ctx.fillStyle='#1b2a2c';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f4f1e4';ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';signs.forEach((q,i)=>ctx.fillText(q.label,(i%8+.5)*w/8,(Math.floor(i/8)+.5)*h/4));},512,256);
  signs.forEach((q,i)=>{
   const g=new THREE.PlaneGeometry(1.6,.8),uv=g.attributes.uv;for(let k=0;k<uv.count;k++)uv.setXY(k,(i%8+uv.getX(k))/8,1-(Math.floor(i/8)+1-uv.getY(k))/4);
   const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:numbers}));const o=at(q.p,q.front-.12,5);m.position.set(o.x,q.p[c.z]+4.95,o.z);
   m.rotation.y=Math.atan2(q.p[c.ty],q.p[c.tx]);m.name='Numero_box';root.add(m);
  });
 }
 // --- Box 99: the team garage, open for the car, with the Lanchonete da Tia beside it.
 let box=null;
 if(pit.box99){
  const b=pit.box99,p=lerp(b.s),heading=Math.atan2(p[c.ty],p[c.tx]),floorZ=p[c.z]+p[c.bank]*(b.front+b.depth/2);
  const place=(mesh,sv,d,y,turn=0)=>{const r=lerp(sv),o=at(r,d);mesh.position.set(o.x,floorZ+y,o.z);mesh.rotation.y=heading+turn;root.add(mesh);return mesh;};
  const floor=new THREE.Mesh(new THREE.BoxGeometry(2*b.bay-.4,.1,b.depth),mat('Piso_epoxi_box99',0x8f989b,{roughness:.32,metalness:.05}));
  floor.receiveShadow=true;floor.name='Piso_box99';place(floor,(b.s+b.cafe_s)/2,b.front+.35+b.depth/2,0);
  // Yellow bay outline and a big 99 at the entrance.
  const stripe=mat('Faixa_box99',0xf0c419,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  for(const side of [-1,1])place(new THREE.Mesh(new THREE.BoxGeometry(.15,.02,b.depth-1),stripe),b.s+side*(b.bay/2-.6),b.front+.35+b.depth/2,.06);
  const paint=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#f0c419';ctx.font='bold 200px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('99',w/2,h/2+10);},256,256);
  const number=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshStandardMaterial({map:paint,transparent:true,roughness:.5,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
  number.rotation.order='YXZ';number.rotation.x=-Math.PI/2;place(number,b.s,b.front+1.4,.061).name='Pintura_99';
  // Ceiling lights, tyres and a tool chest.
  const light=new THREE.MeshBasicMaterial({color:0xfff6dc});
  for(const sv of [b.s-3.5,b.s+3.5,b.cafe_s])for(const d of [4,9,14])place(new THREE.Mesh(new THREE.BoxGeometry(2.4,.05,.45),light),sv,b.front+d,5.12);
  const rubber=mat('Pneus_box99',0x1c1d1f,{roughness:.8}),tyre=new THREE.CylinderGeometry(.33,.33,.24,20);
  for(const [ds,dd,count] of [[4.9,14.8,5],[4.1,14.9,4],[4.9,13.9,3]])for(let k=0;k<count;k++){const t=place(new THREE.Mesh(tyre,rubber),b.s+ds,b.front+dd,.17+k*.25);t.castShadow=true;}
  const chest=place(new THREE.Mesh(new THREE.BoxGeometry(1.2,1.05,.6),mat('Carrinho_ferramentas',0xb3202a,{roughness:.45,metalness:.3})),b.s+5.5,b.front+9,.58);chest.castShadow=true;
  // Rail between the garage and the café (its collision comes from the data walls).
  const railMat=structureMaterial(mat('Metal',0xc9ced1,{metalness:.6,roughness:.35}),textures);
  for(const [d0,d1] of [[.6,4.3],[5.7,b.depth]]){place(new THREE.Mesh(new THREE.BoxGeometry(.06,.06,d1-d0),railMat),b.s-b.bay/2,b.front+(d0+d1)/2,1.05);for(let d=d0;d<=d1+.01;d+=1.6)place(new THREE.Mesh(new THREE.BoxGeometry(.06,1.05,.06),railMat),b.s-b.bay/2,b.front+d,.53);}
  // Signs over the opening and on the café storefront.
  const board=(text,sub,bg,fg)=>canvasTexture((ctx,w,h)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold 110px sans-serif';ctx.fillText(text,w/2,h*.5);ctx.font='bold 44px sans-serif';ctx.fillText(sub,w/2,h*.85);},1024,256);
  const sign=(map,sv,y,w,h)=>place(new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map})),sv,b.front+.1,y);
  sign(board('BOX 99','AUTO-POBRE RACING · OPALA 99','#d82125','#fff4d8'),b.s,5.75,8.4,2.1).name='Placa_box99';
  sign(board('LANCHONETE DA TIA','CAFÉ · PÃO DE QUEIJO · DOCE DE LEITE','#754627','#ffe2a0'),b.cafe_s,3.1,8,2).name='Placa_lanchonete';
  // Pit stop station: +x into the garage, -z toward the café; the car parks nose in.
  const anchor=at(p,b.front+6);
  box={anchor:{x:anchor.x,y:floorZ+.06,z:anchor.z,heading:heading+Math.PI/2},label:'INTERLAGOS · BOX 99',title:'Cuida do Opala!',name:'Box 99 de Interlagos',
   inBox:surface=>!!surface.pit&&surface.pitS!==null&&Math.abs(surface.pitS-b.s)<b.bay/2-1.3&&surface.pitD>b.front+2&&surface.pitD<b.front+b.depth-1,
   // Walking limits for the rail (with its walkway) and the café storefront, in station coordinates.
   obstacles:[[-3.55,-b.bay/2,1.85,.2],[4.85,-b.bay/2,5.15,.2],[-5.8,-b.bay/2-1.15,.25,1.15]]};
 }
 // --- Signs at the entry and on the pit wall.
 {
  const board=(text,sub,bg,fg)=>canvasTexture((ctx,w,h)=>{ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold 92px sans-serif';ctx.fillText(text,w/2,h*.47);ctx.font='bold 46px sans-serif';ctx.fillText(sub,w/2,h*.82);},512,256);
  const place=(map,s,d,height,w,h,name)=>{const p=lerp(s),o=at(p,d);const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));m.position.set(o.x,p[c.z]+height,o.z);m.rotation.y=Math.atan2(p[c.ty],p[c.tx])-Math.PI/2;m.name=name;root.add(m);
   const pole=new THREE.Mesh(new THREE.BoxGeometry(.12,height-h/2,.12),metal);pole.position.set(o.x,p[c.z]+(height-h/2)/2,o.z);pole.castShadow=true;root.add(pole);};
  place(board('PIT','ENTRADA DOS BOXES','#12463b','#fff6c9'),6,lerpHi(6)+1.4,2.6,2.2,1.1,'Placa_entrada_boxes');
  place(board('60','LIMITE NO PIT LANE','#ffffff','#b0161d'),pit.limit.from-4,lerpHi(pit.limit.from-4)+.8,2.4,1.6,.8,'Placa_limite_60');
  place(board('FIM','LIMITE DE VELOCIDADE','#ffffff','#1b2a2c'),pit.limit.to+2,lerpHi(pit.limit.to+2)+.8,2.4,1.6,.8,'Placa_fim_limite');
  function lerpHi(s){return lerp(s)[c.hi];}
 }
 return {root,obstacles,box,stats:{length:pit.length_m,bays,walls:pit.walls.length,limitKmh:pit.limit.kmh,box99:!!box}};
}
