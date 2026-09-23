import * as THREE from 'three';
import {TestCar} from './physics.js';

// groundMaterial/gravelMap come from the shared landscape; the scene falls back to plain colours.
export function createCurveloScene(data,roadSurface,{groundMaterial=null,gravelMap=null}={}){
 const root=new THREE.Group();root.name='Circuito_Oval_de_Curvelo';
 const car=new TestCar(data),a=data.samples;
 const mat=(color,extras={})=>new THREE.MeshStandardMaterial({color,roughness:.95,...extras});
 const grass=mat(0xffffff,{vertexColors:true}),concrete=mat(0x8f918b,{name:'Concreto'}),white=mat(0xe9e2cb,{polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),dark=mat(0x292e30),roof=mat(0x667477,{name:'Boxes_azul',metalness:.35,roughness:.6});
 function mesh(g,m,name){g.computeVertexNormals();const o=new THREE.Mesh(g,m);o.name=name;o.receiveShadow=true;root.add(o);return o;}
 function strip(start,end,material,name,from=0,to=1250){
  const positions=[],uv=[],indices=[];
  for(let i=0;i<=a.length;i++){
   const p=a[i%a.length];car.index=i%a.length;
   for(const d of [start,end].sort((a,b)=>a-b)){
    const x=p[1]+p[9]*d,y=p[2]+p[10]*d;positions.push(x,car.sample(x,y).z+.008,-y);uv.push(d/2,(i===a.length?1250:p[0])/2);
   }
   if(i&&a[i-1][0]>=from&&a[i-1][0]<=to){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  return mesh(material===roadSurface.material?roadSurface.geometry(g):g,material,name);
 }
 // Terrain is locally sculpted to the same banking used by car/wheel physics.
 const t=data.terrain,positions=[],colors=[],indices=[],vertices=new Map();
 function terrainVertex(x,y){
  const key=x+','+y;if(vertices.has(key))return vertices.get(key);
  car.index=car.nearest(x,y,true).i;const surface=car.sample(x,y),index=positions.length/3;
  // Refine the road/shoulder blend so the terrain cannot bury the banked kerb.
  positions.push(x,surface.z-.09,-y);
  const v=.5+.5*Math.sin(x*.15+Math.sin(y*.07))*Math.cos(y*.12),c=new THREE.Color().setRGB(.20+v*.065,.255+v*.055,.095+v*.03);colors.push(c.r,c.g,c.b);
  vertices.set(key,index);return index;
 }
 for(let iy=0;iy<t.ny-1;iy++)for(let ix=0;ix<t.nx-1;ix++){
  const x=t.x0+ix*t.step,y=t.y0+iy*t.step;
  car.index=car.nearest(x+5,y+5,true).i;
  const divisions=Math.abs(car.sample(x+5,y+5).d)<24?4:1,step=t.step/divisions;
  for(let row=0;row<divisions;row++)for(let col=0;col<divisions;col++){
   const px=x+col*step,py=y+row*step;
   const v0=terrainVertex(px,py),v1=terrainVertex(px+step,py),v2=terrainVertex(px,py+step),v3=terrainVertex(px+step,py+step);
   indices.push(v0,v1,v2,v1,v3,v2);
  }
 }
 const terrain=new THREE.BufferGeometry();terrain.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.setIndex(indices);mesh(terrain,groundMaterial??grass,'Terreno_Cerrado_aproximado');
 const shoulder=mat(0x545658);strip(-8.4,-7,shoulder,'Acostamento_externo');strip(7,8.4,shoulder,'Acostamento_interno');
 strip(-7,7,roadSurface.material,'Asfalto_Curvelo');
 for(const side of [-1,1])strip(side*6.75,side*6.89,white,'Linha_borda');
 // Flat turn: external asphalt apron followed by a broad gravel trap.
 strip(-11.5,-8.4,mat(0x66686a),'Escape_asfaltado',880,1100);
 const gravel=strip(-30,-11.5,mat(gravelMap?0xd6ccb6:0xb09c71,{vertexColors:true,map:gravelMap}),'Caixa_de_brita',890,1085);
 const gravelColors=[];for(let i=0;i<gravel.geometry.attributes.position.count;i++){const c=.75+.2*Math.sin(i*5.1)**2;gravelColors.push(c,c,c);}gravel.geometry.setAttribute('color',new THREE.Float32BufferAttribute(gravelColors,3));
 function box(x,y,z,w,h,d,m,name,heading=0){const o=mesh(new THREE.BoxGeometry(w,h,d),m,name);o.position.set(x,y,z);o.rotation.y=heading;o.castShadow=true;return o;}
 const p=a[0],heading=Math.atan2(p[8],p[7]);
 const point=(s,offset)=>{const p=a.reduce((best,q)=>Math.abs(q[0]-s)<Math.abs(best[0]-s)?q:best,a[0]);return {x:p[1]+p[9]*offset,y:3+p[5]*offset,z:-p[2]-p[10]*offset,heading:Math.atan2(p[8],p[7])};};
 // Two rows of checkers across the actual timing line, including on the minimap.
 for(let row=0;row<2;row++)for(let col=0;col<20;col++){
  const d=-7+(col+.5)*.7,s=(row-.5)*.7;
  box(p[1]+p[7]*s+p[9]*d,3.08,-p[2]-p[8]*s-p[10]*d,.7,.02,.7,(row+col)%2?dark:white,'Linha_chegada',heading);
 }
 for(let i=0;i<8;i++){const q=point(1250-12-i*8, i%2?2.4:-2.4);box(q.x,3.078,q.z,.1,.02,2.1,white,'Marca_grid',q.heading);}
 for(const d of [-10,10])box(p[1]+p[9]*d,6,-p[2]-p[10]*d,.25,6,.25,dark,'Portico_poste');
 const sign=box(0,8.6,0,.45,1.5,20,dark,'Portico_Curvelo',heading);
 function label(text,w,h){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#172b27';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#ffdb32';ctx.font='bold 67px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,64,960);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));}
 const title=label('CURVELO · AUTO-POBRE RACING',18,1.25);title.rotation.y=-Math.PI/2;title.position.x=-.24;sign.add(title);
 // Stands on the opposite straight; the garages stand on the infield behind the service
 // lane (pit-building.js).
 for(let step=0;step<6;step++){
  const b=point(710,19+step*1.3);box(b.x,b.y+.4+step*.65,b.z,65,.65,1.5,step%2?white:concrete,'Arquibancada_Curvelo',b.heading);
 }
 const tower=point(1190,-42);box(tower.x,7,tower.z,8,8,7,white,'Torre_cronometragem',tower.heading);box(tower.x,11.3,tower.z,9,.4,8,roof,'Torre_cobertura',tower.heading);
 return root;
}
