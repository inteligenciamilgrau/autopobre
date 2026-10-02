import * as THREE from 'three';
import {CAR_CHOICES,carEntry,luminance,cssColor as css} from './race-roster.js';
import {carWorkshop,FAR_PROFILE} from './immersive-visuals.js';
// Modo Corrida's car screen (#cars, between the opening and the track screen): the grid's 15 Opalas
// as cards and the chosen one turning in a small studio. The studio is drawn by the game's own
// renderer on the page's canvas, which shows through the screen's open middle (carros.css); the car
// is the race model, painted as the rivals are (ImmersiveVisuals.rivalCar), so it is what races.
// Card icon: the side view of the distant rivals' model (immersive-visuals.js FAR_PROFILE), metres to a
// 100×34 box, nose to the right; the stripe along the waist, the number on the door. The windows sit
// a little inside the body's outline (the 3D ones are wider than the body instead).
const P=pts=>pts.map(([x,y])=>`${((x+2.5)*20).toFixed(1)},${((1.55-y)*20).toFixed(1)}`).join(' ');
const BODY=P(FAR_PROFILE.body);
const GLASS=P([[.86,.9],[.08,1.34],[-.95,1.34],[-1.62,.98]]);
const STRIPE=P([[-2.38,.56],[2.46,.56],[2.46,.67],[-2.37,.67]]);
const WHEELS=FAR_PROFILE.axles.map(x=>[(x+2.5)*20,(1.55-FAR_PROFILE.wheel)*20]);
function carIcon(entry){
 const shade=luminance(entry.color),ink=shade>.55?'#141716':'#f4f3ee';
 return `<svg viewBox="0 0 100 34" aria-hidden="true"><polygon points="${BODY}" fill="${css(entry.color)}"/><polygon points="${STRIPE}" fill="${css(entry.stripe)}"/><polygon points="${GLASS}" fill="#17232a"/>`+
  WHEELS.map(([x,y])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.4" fill="#0d0f0f"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.1" fill="#8d9396"/>`).join('')+
  `<text x="57" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="10.5" font-weight="900" font-style="italic" fill="${ink}" stroke="${shade>.55?'#f4f3ee':'#141716'}" stroke-width=".7" paint-order="stroke">${entry.number}</text></svg>`;
}
function gradient(stops,size=256,radial=false){
 const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),g=radial?ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2):ctx.createLinearGradient(0,0,0,size);
 for(const [at,color] of stops)g.addColorStop(at,color);ctx.fillStyle=g;ctx.fillRect(0,0,size,size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// The studio: a dark green backdrop, a floor fading into it, soft boxes for the paint's reflections
// (a small room baked into an environment map) and a key light. The car turns on its own; dragging
// the stage turns it by hand for a while.
class Studio {
 constructor(carRoot){
  this.workshop=carWorkshop(carRoot);this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(26,1,.1,200);
  this.scene.background=gradient([[0,'#20403a'],[.55,'#10231f'],[1,'#060d0c']]);
  this.turntable=new THREE.Group();this.scene.add(this.turntable);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(9,64).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x1d2a27,roughness:.62,metalness:.1,transparent:true,alphaMap:gradient([[0,'#fff'],[.55,'#fff'],[1,'#000']],256,true),depthWrite:false}));
  this.scene.add(floor);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(5.6,2.5).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:gradient([[0,'rgba(0,0,0,.85)'],[.6,'rgba(0,0,0,.45)'],[1,'rgba(0,0,0,0)']],128,true),transparent:true,depthWrite:false}));
  shadow.position.y=.004;this.turntable.add(shadow);
  const key=new THREE.DirectionalLight(0xfff1dc,1.6);key.position.set(4,7,5);this.scene.add(key,new THREE.HemisphereLight(0xcfe3ff,0x1b1a14,.35));
  this.yaw=-.55;this.handUntil=0;this.time=0;this.car=null;this.number=null;this.wanted=null;this.template=null;this.environment=null;
 }
 // The room that lights the paint: a ceiling soft box, two side panels and a dim back wall.
 bake(renderer){
  const room=new THREE.Scene(),panel=(w,h,p,r,level)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(level,level,level),side:THREE.DoubleSide}));m.position.set(...p);m.rotation.set(...r);room.add(m);};
  room.add(new THREE.Mesh(new THREE.BoxGeometry(24,12,24),new THREE.MeshBasicMaterial({color:0x26322f,side:THREE.BackSide})));
  panel(14,7,[0,5.8,0],[Math.PI/2,0,0],5);panel(7,3.4,[-11.5,3,1],[0,Math.PI/2,0],2.6);panel(7,3.4,[11.5,3,-2],[0,-Math.PI/2,0],1.6);panel(10,2.4,[0,2.6,-11.5],[0,0,0],1.1);
  const pmrem=new THREE.PMREMGenerator(renderer);this.environment=pmrem.fromScene(room,.04).texture;pmrem.dispose();
  room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.scene.environment=this.environment;
 }
 // Throws away the car shown (what was made for it; the race car's own stay).
 drop(){if(!this.car)return;this.car.removeFromParent();this.workshop.disposeCar(this.car,this.template);this.car=null;}
 build(){
  const entry=carEntry(this.wanted);if(!this.template||!entry||entry.number===this.number)return;
  this.drop();
  this.car=this.workshop.rivalCar(this.template,entry.color,entry.number,'',{stripe:entry.stripe,finish:entry.finish,livery99:entry.number==='99'});
  this.turntable.add(this.car);this.number=entry.number;
 }
 // rect: where the stage shows on the page (CSS pixels); the car is framed there.
 render(renderer,dt,rect){
  this.time+=dt;if(this.time>this.handUntil)this.yaw+=dt*.32;this.turntable.rotation.y=this.yaw;
  if(!this.environment)this.bake(renderer);if(this.wanted!==this.number)this.build();
  const size=renderer.getSize(new THREE.Vector2()),W=size.x,H=size.y,c=this.camera,half=Math.tan(THREE.MathUtils.degToRad(c.fov/2));
  // Far enough for the car (about 5 m seen three-quarters on, 1.6 m high) to fill most of the stage.
  const d=THREE.MathUtils.clamp(Math.max(5*H/(2*half*.9*Math.max(1,rect.width)),1.7*H/(2*half*.66*Math.max(1,rect.height))),6,40);
  const target=new THREE.Vector3(0,.62,0),el=.2,az=.62;c.position.set(Math.cos(el)*Math.cos(az)*d,.62+Math.sin(el)*d,Math.cos(el)*Math.sin(az)*d);c.lookAt(target);
  c.aspect=W/H;c.setViewOffset(W,H,W/2-(rect.left+rect.width/2),H/2-(rect.top+rect.height*.5),W,H);c.updateProjectionMatrix();
  const saved={tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,space:renderer.outputColorSpace,target:renderer.getRenderTarget(),autoClear:renderer.autoClear};
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setRenderTarget(null);renderer.autoClear=true;
  renderer.render(this.scene,c);
  renderer.toneMapping=saved.tone;renderer.toneMappingExposure=saved.exposure;renderer.outputColorSpace=saved.space;renderer.setRenderTarget(saved.target);renderer.autoClear=saved.autoClear;
 }
 turn(dx){this.yaw+=dx*.009;this.handUntil=this.time+2.5;}
}
// root: the #cars screen. value: the chosen car's number. onPick(number), onNext(), onBack().
export class CarSelect {
 constructor({root,value,carRoot,onPick,onNext,onBack}){
  this.root=root;this.value=carEntry(value)?value:CAR_CHOICES[0].number;this.onPick=onPick;this.studio=new Studio(carRoot);this.studio.wanted=this.value;this.live=false;
  const $=id=>root.querySelector('#'+id);this.stage=$('carStage');this.status=$('carStageStatus');
  this.cards=$('carCards');this.cards.replaceChildren(...CAR_CHOICES.map(entry=>{
   const b=document.createElement('button');b.type='button';b.dataset.car=entry.number;b.setAttribute('role','radio');
   b.innerHTML=carIcon(entry);const label=document.createElement('span');label.textContent=entry.shortName;b.append(label);
   b.title=`#${entry.number} · ${entry.name}`;b.onclick=()=>this.pick(entry.number);return b;
  }));
  // Arrows walk the cards (up and down a row of the grid), Enter goes on to the tracks.
  this.cards.addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();onNext();return;}
   const keys={ArrowLeft:-1,ArrowRight:1,ArrowUp:-this.columns(),ArrowDown:this.columns()},step=keys[e.key];if(!step)return;e.preventDefault();
   const i=CAR_CHOICES.findIndex(c=>c.number===this.value),next=CAR_CHOICES[Math.max(0,Math.min(CAR_CHOICES.length-1,i+step))];
   this.pick(next.number);this.cards.querySelector(`[data-car="${next.number}"]`).focus();
  });
  $('carsNext').onclick=()=>onNext();$('carsBack').onclick=()=>onBack();
  // Dragging the stage turns the car.
  let drag=null;
  this.stage.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX};this.stage.setPointerCapture(e.pointerId);this.stage.classList.add('dragging');});
  this.stage.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;this.studio.turn(e.clientX-drag.x);drag.x=e.clientX;});
  const end=e=>{if(drag?.id===e.pointerId){drag=null;this.stage.classList.remove('dragging');}};this.stage.addEventListener('pointerup',end);this.stage.addEventListener('pointercancel',end);
  this.show();
 }
 columns(){return getComputedStyle(this.cards).gridTemplateColumns.split(' ').length||1;}
 pick(number){if(!carEntry(number))return;this.value=number;this.studio.wanted=number;this.show();this.onPick?.(number);}
 // The model arrived (main.js loads it for the screen): the studio can build the car.
 setTemplate(template){const s=this.studio;s.drop();s.template=template;s.number=null;this.show();}
 failed(){this.status.textContent='Não foi possível carregar o Opala. A escolha vale mesmo assim.';this.status.hidden=false;}
 show(){
  const entry=carEntry(this.value),$=id=>this.root.querySelector('#'+id),own=entry.number==='99';
  for(const b of this.cards.children){const on=b.dataset.car===entry.number;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}
  $('carNumber').textContent='#'+entry.number;$('carNumber').style.setProperty('--body',css(entry.color));$('carNumber').style.setProperty('--stripe',css(entry.stripe));
  $('carName').textContent=own?'Opala 99 · Auto-Pobre Racing':`Opala ${entry.number} · ${entry.shortName}`;
  $('carDetail').textContent=own?`O carro do Stevan Gaipo e do Edu Neves, da vaquinha ao grid. ${entry.rank}º no campeonato (${entry.points} pts).`
   :`Carro de ${entry.name}${entry.rank?` · ${entry.rank}º no campeonato (${entry.points} pts)`:''}. Você corre no lugar dele; o Stevan Gaipo vai de Opala 99.`;
  this.status.hidden=!!this.studio.template;if(!this.studio.template)this.status.textContent='Carregando o Opala…';
 }
 // Every frame while the screen shows (main.js): the studio on the page's canvas.
 render(renderer,dt){
  const live=!!this.studio.template;if(live!==this.live){this.live=live;this.root.classList.toggle('live',live);}
  if(!live)return;
  const rect=this.stage.getBoundingClientRect();this.studio.render(renderer,Math.min(dt,.05),rect);
 }
 info(){return {value:this.value,live:this.live,built:this.studio.number,yaw:this.studio.yaw,meshes:(()=>{let n=0;this.studio.car?.traverse(o=>{if(o.isMesh&&o.visible)n++;});return n;})()};}
}
