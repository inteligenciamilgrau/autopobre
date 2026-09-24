import * as THREE from 'three';
import {batteryLabel,dSticker,extinguisherLabel,rearWindowTexture,rtjDecal,canvasTexture} from './cockpit-materials.js';

// Behind the front seats (carro_34, carro_36): the rear seat is gone, leaving the
// painted pan, the battery in the passenger footwell, the extinguisher standing on
// the pan and the cage's X brace, stays and floor bars. Same axes as cockpit.js;
// heights follow the cockpit shell (roof 1.39, belt 0.88).
const REAR_GLASS={top:-.845,topY:1.335,topHalf:.60,bottom:-1.52,bottomY:1.005,bottomHalf:.70};
const QUARTER=[[-.46,.895],[-.46,1.30],[-.84,1.285],[-.93,1.20],[-1.07,.895]];

// Flat patch through a list of points (a fan), UVs in metres on its dominant plane.
function patch(points){
 const p=points.map(q=>new THREE.Vector3(...q)),normal=new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]),p[2].clone().sub(p[0])).normalize();
 const positions=[],uvs=[],ax=Math.abs(normal.x)>Math.abs(normal.z)?'z':'x';
 for(let i=1;i<p.length-1;i++)for(const v of [p[0],p[i],p[i+1]]){positions.push(v.x,v.y,v.z);uvs.push(v[ax],v.y);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();
 return g;
}
// Plane oriented by its right and up axes (the normal faces the viewer).
function orient(object,right,up){const r=new THREE.Vector3(...right).normalize(),u=new THREE.Vector3(...up).normalize();object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,u,new THREE.Vector3().crossVectors(r,u)));return object;}

export function buildRearCabin(kit){
 const {mesh,box,bar,m,chrome,paintBoth}=kit;
 // --- Floor: footwells, tunnel hump, heel riser, bare seat pan, bulkhead and shelf.
 box([-.80,.29,0],[.34,.04,1.49],m.paint);
 // Driveshaft hump from under the seats to the heel riser (the gearbox tunnel is in cockpit.js).
 mesh(kit.tunnel(.165,.78),m.paint,[-.20,.31,0]);
 box([-.975,.385,0],[.012,.19,1.46],m.paint);
 box([-1.18,.47,0],[.41,.02,1.46],m.paint);
 for(const x of [-1.06,-1.28])box([x,.482,0],[.05,.006,1.2],m.paint); // pressed ribs of the pan
 // Worn primer and rust round the extinguisher mounting (carro_34).
 const rust=mesh(new THREE.PlaneGeometry(.30,.22),new THREE.MeshStandardMaterial({map:canvasTexture(256,192,(ctx,w,h)=>{
  for(let i=0;i<14;i++){let x=w/2+(Math.random()-.5)*w*.7,y=h/2+(Math.random()-.5)*h*.6;const rust=Math.random()<.6;
   ctx.fillStyle=rust?`rgba(${130+Math.random()*30|0},${62+Math.random()*25|0},28,${.25+Math.random()*.35})`:`rgba(120,120,116,${.2+Math.random()*.25})`;
   ctx.beginPath();ctx.moveTo(x,y);for(let k=0;k<22;k++){x+=(Math.random()-.5)*22;y+=(Math.random()-.5)*16;ctx.lineTo(x,y);}ctx.closePath();ctx.fill();}
 }),transparent:true,alphaTest:.05,roughness:.85,polygonOffset:true,polygonOffsetFactor:-2}),[-1.06,.4803,.40]);
 rust.rotation.x=-Math.PI/2;rust.castShadow=false;
 box([-1.418,.735,0],[.012,.515,1.46],m.paint).rotation.z=.127;
 box([-1.495,.992,0],[.11,.012,1.40],m.paint);
 for(const side of [-1,1]){
  box([-1.10,.585,side*.745],[.94,.59,.02],m.paint);
  box([-1.10,.885,side*.753],[.94,.018,.045],m.body);
  // Rear wheel tubs beside the pan, arched over the 1.117 m axle.
  mesh(new THREE.SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2).scale(.34,.27,.12),kit.paintSatin,[-1.117,.31,side*.745]);
  // Roof rail over the door and quarter window, and the C-pillar down to the belt.
  box([-.28,1.365,side*.725],[1.16,.06,.13],m.paint);
  const s=side,g=REAR_GLASS;
  mesh(patch([[g.top,g.topY,s*g.topHalf],[-.86,1.335,s*.70],[-.84,1.285,s*.78],[-.93,1.20,s*.78],[-1.07,.895,s*.775],[-1.56,.885,s*.765],[g.bottom,g.bottomY,s*g.bottomHalf]]),paintBoth,[0,0,0]);
  // Smoked quarter window with the backs of the stickers stuck outside.
  const shape=new THREE.Shape(QUARTER.map(([x,y])=>new THREE.Vector2(x,y)));
  mesh(new THREE.ShapeGeometry(shape),m.tint,[0,0,side*.782]);
  const stickerBack=new THREE.MeshStandardMaterial({color:0xd8d6cf,roughness:.9,transparent:true,opacity:.85,depthWrite:false});
  for(const [x,y,w,h,round] of [[-.52,1.0,.06,.06,true],[-.60,.96,.05,.05,true],[-.53,1.09,.07,.035,false],[-.66,1.04,.055,.055,false],[-.72,.95,.045,.045,true],[-.62,1.15,.04,.04,true]]){
   const o=mesh(round?new THREE.CircleGeometry(w/2,24):new THREE.PlaneGeometry(w,h),stickerBack,[x,y,side*.779]);o.castShadow=false;
  }
 }
 // --- Smoked rear window with the vents cut in it and the green "D" sticker.
 const g=REAR_GLASS,glass=new THREE.BufferGeometry();
 glass.setAttribute('position',new THREE.Float32BufferAttribute([g.bottom,g.bottomY,-g.bottomHalf,g.bottom,g.bottomY,g.bottomHalf,g.top,g.topY,g.topHalf,g.top,g.topY,-g.topHalf],3));
 glass.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));glass.setIndex([0,1,2,0,2,3]);glass.computeVertexNormals();
 const rearGlass=mesh(glass,new THREE.MeshPhysicalMaterial({map:rearWindowTexture(),transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:.06,clearcoat:.4,envMapIntensity:.3}),[0,0,0]);rearGlass.castShadow=false;
 const up=[g.top-g.bottom,g.topY-g.bottomY,0],inward=new THREE.Vector3(g.topY-g.bottomY,-(g.top-g.bottom),0).normalize().multiplyScalar(.004);
 const at=(u,v)=>{const half=g.bottomHalf+(g.topHalf-g.bottomHalf)*v;return new THREE.Vector3(g.bottom+(g.top-g.bottom)*v,g.bottomY+(g.topY-g.bottomY)*v,-half+u*2*half).add(inward);};
 const sticker=mesh(new THREE.PlaneGeometry(.10,.09),new THREE.MeshBasicMaterial({map:dSticker(),transparent:true,alphaTest:.1}),at(.083,.87).toArray());
 orient(sticker,[0,0,-1],up);sticker.castShadow=false;
 // Boot lid seen through the glass, with the insurer's lettering near the tail.
 box([-1.84,.955,0],[.62,.04,1.56],m.hood).rotation.z=.055;
 const rtj=mesh(new THREE.PlaneGeometry(.42,.13),new THREE.MeshStandardMaterial({map:rtjDecal(),transparent:true,alphaTest:.1,roughness:.5,polygonOffset:true,polygonOffsetFactor:-2}),[-2.02,.9665,0]);
 orient(rtj,[0,0,1],[1,.055,0]);rtj.castShadow=false;
 // --- Cage: X in the main hoop, rear stays to the turrets, their cross tube and floor bars.
 for(const side of [-1,1]){
  bar([-.63,1.36,side*.59],[-1.62,.85,side*.58],.022);
  bar([-.63,.60,side*.64],[-1.40,.60,side*.70],.02);
 }
 bar([-1.35,.99,-.585],[-1.35,.99,.585],.02);
 bar([-.96,.60,-.666],[-.96,.60,.666],.02);
 // --- Battery in the passenger footwell under a clamp bar (photo 34).
 box([-.80,.314,.42],[.20,.008,.27],m.plastic);
 box([-.80,.405,.42],[.175,.175,.24],m.plastic);
 const top=mesh(new THREE.PlaneGeometry(.23,.17),new THREE.MeshStandardMaterial({map:batteryLabel(),roughness:.7}),[-.80,.4935,.42]);orient(top,[0,0,-1],[-1,0,0]);top.castShadow=false;
 const brass=new THREE.MeshStandardMaterial({color:0xb08d57,metalness:.8,roughness:.4}),clampSteel=new THREE.MeshStandardMaterial({color:0x5b5550,metalness:.6,roughness:.65});
 mesh(new THREE.CylinderGeometry(.009,.01,.02,14),brass,[-.735,.503,.51]);box([-.735,.51,.51],[.05,.018,.036],brass);
 mesh(new THREE.CylinderGeometry(.009,.01,.02,14),m.shell,[-.735,.503,.33]);box([-.735,.51,.33],[.034,.014,.026],m.shell);
 box([-.80,.498,.42],[.22,.006,.03],clampSteel);
 for(const x of [-.905,-.695]){bar([x,.498,.42],[x,.32,.42],.004,clampSteel);mesh(new THREE.CylinderGeometry(.007,.007,.008,6),clampSteel,[x,.505,.42]);}
 box([-.70,.355,.62],[.09,.09,.08],m.shell); // small black box beside the battery
 const cable=(points,r=.007)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,r,8,false),m.plastic,[0,0,0]);
 cable([[-.745,.515,.51],[-.70,.52,.56],[-.64,.34,.62],[-.2,.325,.66],[.3,.325,.60],[.62,.33,.52]]);
 cable([[-.745,.515,.33],[-.70,.50,.28],[-.70,.33,.24],[-.95,.32,.20]],.006);
 // --- Extinguisher standing on the seat pan, strapped to the floor bar (photos 34, 36).
 const ext=new THREE.Group();ext.name='Extintor_PO_ABC';ext.position.set(-1.045,.48,.40);kit.root.add(ext);
 const r=.057;
 mesh(new THREE.CylinderGeometry(r,r,.30,32),m.extinguisher,[0,.17,0],ext);
 for(const [y,flip] of [[.02,true],[.32,false]])mesh(new THREE.SphereGeometry(r,32,10,0,Math.PI*2,0,Math.PI/2).scale(1,.35,1).rotateX(flip?Math.PI:0),m.extinguisher,[0,y,0],ext);
 mesh(new THREE.CylinderGeometry(r+.0008,r+.0008,.2,32,1,true,1.92-1.25,2.5),new THREE.MeshStandardMaterial({map:extinguisherLabel(),roughness:.45,envMapIntensity:.5}),[0,.17,0],ext);
 mesh(new THREE.CylinderGeometry(.018,.022,.06,20),m.shell,[0,.365,0],ext);
 const handle=new THREE.MeshStandardMaterial({color:0xd01820,roughness:.35,metalness:.3});
 const lever=box([.04,.41,0],[.09,.005,.02],handle,ext);lever.rotation.z=.3;
 box([.036,.388,0],[.085,.005,.02],handle,ext).rotation.z=-.06;
 mesh(new THREE.TorusGeometry(.014,.0018,6,16),chrome,[-.022,.392,.022],ext);
 const dial=mesh(new THREE.CircleGeometry(.012,20),new THREE.MeshBasicMaterial({map:canvasTexture(64,64,(ctx)=>{ctx.fillStyle='#f4f4ee';ctx.fillRect(0,0,64,64);ctx.fillStyle='#2e9b46';ctx.beginPath();ctx.moveTo(32,32);ctx.arc(32,32,30,-2.4,-.7);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(32,32);ctx.lineTo(46,14);ctx.stroke();})}),[.012,.36,-.02],ext);dial.rotation.y=Math.PI/2+.6;
 mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-.012,.36,.0],[-.05,.34,.0],[-.06,.2,.02],[-.058,.12,.03]].map(p=>new THREE.Vector3(...p))),24,.006,8,false),m.plastic,[0,0,0],ext);
 for(const y of [.10,.25]){mesh(new THREE.CylinderGeometry(r+.004,r+.004,.022,32,1,true),kit.steel,[0,y,0],ext);box([r+.03,y,0],[.06,.022,.012],kit.steel,ext);}
}
