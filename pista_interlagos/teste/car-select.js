import * as THREE from 'three';
import {rosterOf,carEntry,MODEL_NAMES,CAR_MODELS,CAR_MODEL_DEFAULT,PLAYER_CAR_DEFAULT,luminance,cssColor as css} from './race-roster.js';
import {carWorkshop,FAR_PROFILE} from './immersive-visuals.js';
import {fuscaCar,fuscaDispose,FUSCA_PROFILE,BOLT,BOLT_SHAPE} from './fusca.js';
import {setCarEnvironment} from './car-finish.js';
// Modo Corrida's car screen (#cars, between the opening and the track screen): two tabs, the Opala and the
// Fusca (fusca.js), each with its grid's 15 cars as cards (the Opala's Old Stock field, the Fusca's Copa Fusca one,
// race-roster.js) and the chosen one turning in a small studio. The studio is drawn by the game's own renderer on the page's canvas, which
// shows through the screen's open middle (carros.css); the car is the race model, painted as the rivals
// are (ImmersiveVisuals.rivalCar, fuscaCar), so it is what races.
// Card icon: the car's side view (the distant rivals' model, immersive-visuals.js FAR_PROFILE, or the
// Fusca's, FUSCA_PROFILE), metres to a 100×34 box, nose to the right; in the second colour the Opala's stripe
// along the waist or the Fusca's fenders (trim), the number on the door. The Opala's windows sit a little inside the body's outline (the 3D ones are wider
// than the body instead).
const P=pts=>pts.map(([x,y])=>`${((x+2.5)*20).toFixed(1)},${((1.55-y)*20).toFixed(1)}`).join(' ');
const wheelSpots=profile=>profile.axles.map(x=>[(x+2.5)*20,(1.55-profile.wheel)*20,profile.wheel*23.4]);
const ICONS={
 opala:{body:P(FAR_PROFILE.body),glass:P([[.86,.9],[.08,1.34],[-.95,1.34],[-1.62,.98]]),trim:[P([[-2.38,.56],[2.46,.56],[2.46,.67],[-2.37,.67]])],wheels:wheelSpots(FAR_PROFILE),number:[57,22]},
 fusca:{body:P(FUSCA_PROFILE.body),glass:P(FUSCA_PROFILE.glass),trim:FUSCA_PROFILE.fenders.map(P),wheels:wheelSpots(FUSCA_PROFILE),number:[(FUSCA_PROFILE.number[0]+2.5)*20,(1.55-FUSCA_PROFILE.number[1])*20+3.5]}};
// Built as elements, not markup: the number goes in as text and the colours as attributes, whatever
// the entry holds.
const svgNode=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
function carIcon(entry,model){
 const dark=luminance(entry.color)>.55,icon=ICONS[model],f=v=>v.toFixed(1);
 const svg=svgNode('svg',{viewBox:'0 0 100 34','aria-hidden':'true'});
 svg.append(svgNode('polygon',{points:icon.body,fill:css(entry.color)}),...icon.trim.map(points=>svgNode('polygon',{points,fill:css(entry.stripe)})),svgNode('polygon',{points:icon.glass,fill:'#17232a'}));
 for(const [x,y,r] of icon.wheels)svg.append(svgNode('circle',{cx:f(x),cy:f(y),r:f(r),fill:'#0d0f0f'}),svgNode('circle',{cx:f(x),cy:f(y),r:f(r*.42),fill:'#8d9396'}));
 // A livery's drawing (fusca.js BOLT, BOLT_SHAPE): the lightning bolt along the side, under the number.
 if(entry.graphic==='raio'&&model==='fusca'){const left=(BOLT.x-BOLT.w/2+2.5)*20,top=(1.55-BOLT.y-BOLT.h/2)*20;
  svg.append(svgNode('polygon',{points:BOLT_SHAPE.map(([u,v])=>`${f(left+u*BOLT.w*20)},${f(top+v*BOLT.h*20)}`).join(' '),fill:'#ffb21a',stroke:'#121314','stroke-width':'.5'}));}
 const number=svgNode('text',{x:f(icon.number[0]),y:f(icon.number[1]),'text-anchor':'middle','font-family':'Arial,sans-serif','font-size':'10.5','font-weight':'900','font-style':'italic',fill:dark?'#141716':'#f4f3ee',stroke:dark?'#f4f3ee':'#141716','stroke-width':'.7','paint-order':'stroke'});
 number.textContent=entry.number;svg.append(number);return svg;
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
  // wanted/shown: 'model:number' of the car asked for and of the one built; template: the Opala's model, fusca the Fusca's.
  this.yaw=-.55;this.handUntil=0;this.time=0;this.car=null;this.shown=null;this.wanted=null;this.template=null;this.fusca=null;this.environment=null;
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
 drop(){if(!this.car)return;this.car.removeFromParent();if(this.car.userData.own)fuscaDispose(this.car);else this.workshop.disposeCar(this.car,this.template);this.car=null;this.shown=null;}
 ready(model){return !!(model==='fusca'?this.fusca:this.template);}
 build(){
  const [model,number]=this.wanted.split(':'),entry=carEntry(number,model);if(!this.ready(model)||!entry||this.wanted===this.shown)return;
  this.drop();
  this.car=model==='fusca'?fuscaCar(this.fusca,entry):this.workshop.rivalCar(this.template,entry.color,entry.number,'',{stripe:entry.stripe,finish:entry.finish,livery99:entry.number==='99'});
  this.turntable.add(this.car);this.shown=this.wanted;
 }
 // rect: where the stage shows on the page (CSS pixels); the car is framed there.
 render(renderer,dt,rect){
  this.time+=dt;if(this.time>this.handUntil)this.yaw+=dt*.32;this.turntable.rotation.y=this.yaw;
  // The cars share their materials with the race's (car-finish.js): here they reflect the studio's soft
  // boxes, not the circuit's map (the race takes its own back at its next frame, car-reflections.js).
  if(!this.environment)this.bake(renderer);setCarEnvironment(this.environment,'estudio');if(this.wanted!==this.shown)this.build();
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
// root: the #cars screen. values: the chosen car's number in each model's field ({opala, fusca}); model: the tab
// shown ('opala' or 'fusca'). onPick(number, model), onModel(model) (main.js then loads the Fusca's model:
// setFusca), onNext(), onBack().
// In a multiplayer room (setRoom) the cars other pilots have show their names and cannot be taken, and
// everyone races the Opala (the tabs hide).
export class CarSelect {
 constructor({root,values={},model=CAR_MODEL_DEFAULT,carRoot,onPick,onModel,onNext,onBack}){
  this.root=root;this.model=CAR_MODELS.includes(model)?model:CAR_MODEL_DEFAULT;
  this.values=Object.fromEntries(CAR_MODELS.map(m=>[m,carEntry(values[m],m)?values[m]:PLAYER_CAR_DEFAULT]));this.onPick=onPick;this.onModel=onModel;this.studio=new Studio(carRoot);this.live=false;
  this.room=null;this.taken=new Map();this.asked=null;this.guest=null;this.failure=null;this.tell('');
  const $=id=>root.querySelector('#'+id);this.stage=$('carStage');this.status=$('carStageStatus');this.tabs=$('carModels');this.note=root.querySelector('.car-note');
  for(const tab of this.tabs.querySelectorAll('[data-model]'))tab.onclick=()=>this.setModel(tab.dataset.model);
  this.tabs.addEventListener('keydown',e=>{const step={ArrowLeft:-1,ArrowRight:1}[e.key];if(!step)return;e.preventDefault();
   const next=CAR_MODELS[(CAR_MODELS.indexOf(this.model)+step+CAR_MODELS.length)%CAR_MODELS.length];this.setModel(next);this.tabs.querySelector(`[data-model="${next}"]`).focus();});
  this.cards=$('carCards');this.fillCards();
  // Arrows walk the cards (up and down a row of the grid), Enter goes on to the tracks.
  this.cards.addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();onNext();return;}
   const keys={ArrowLeft:-1,ArrowRight:1,ArrowUp:-this.columns(),ArrowDown:this.columns()},step=keys[e.key];if(!step)return;e.preventDefault();
   // Past the cars other pilots have in a room; a step past the ends stops at the first or last free card.
   const choices=rosterOf(this.model).choices,cur=choices.findIndex(c=>c.number===this.value),last=choices.length-1,free=i=>!this.taken.has(choices[i].number);
   let i=cur+step;while(i>=0&&i<=last&&!free(i))i+=step;
   if(i<0||i>last){i=Math.max(0,Math.min(last,i));while(i!==cur&&!free(i))i-=Math.sign(step);}
   if(i===cur)return;const next=choices[i];
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
 // The car chosen in the tab shown.
 get value(){return this.values[this.model];}
 set value(number){this.values[this.model]=number;}
 // The cards in the tab's model.
 fillCards(){
  this.cards.replaceChildren(...rosterOf(this.model).choices.map(entry=>{
   const b=document.createElement('button');b.type='button';b.dataset.car=entry.number;b.setAttribute('role','radio');
   const label=document.createElement('span');label.textContent=entry.shortName;b.append(carIcon(entry,this.model),label);
   b.title=`#${entry.number} · ${entry.name}`;b.onclick=()=>this.pick(entry.number);return b;
  }));
  this.cards.setAttribute('aria-label',this.model==='fusca'?'Fuscas da Copa Fusca':'Carros do grid');
 }
 pick(number){
  if(!carEntry(number,this.model))return;
  if(this.taken.has(number)){this.tell(`O #${number} está com ${this.taken.get(number)}. Escolha outro carro.`,number);this.show();return;}
  this.tell('');this.value=number;this.show();this.onPick?.(number,this.model);
 }
 // The tabs: the Opala or the Fusca, each with its own field and its own car chosen.
 setModel(model,{silent=false}={}){
  if(!CAR_MODELS.includes(model)||model===this.model)return;
  this.model=model;this.fillCards();this.show();if(!silent)this.onModel?.(model);
 }
 // The Fusca's model arrived (main.js loads it when its tab is chosen).
 setFusca(template){const s=this.studio;if(s.fusca===template)return;if(s.car?.userData.own)s.drop();s.fusca=template;this.show();}
 // The room's note; one about a car someone else has goes when that car changes hands (setRoom).
 tell(text,car=null){this.notice=text;this.noticeCar=car;this.noticeHolder=car&&this.taken.get(car);}
 // A multiplayer room (multiplayer.js, through main.js): taken, the cars other pilots have (number ->
 // name); mine, this window's car once the host has answered its last choice (the room's word wins:
 // the car asked for may have gone to someone else first); asking, the car still being asked for;
 // guest, for a pilot who does not host: whether the host has let it in and whether it waits for the
 // start (its button then waits for the host's race instead of leading to the tracks).
 setRoom({taken,mine,asking,guest=null}){
  this.room??=this.note;this.taken=taken;this.guest=guest;this.tabs.hidden=true;this.setModel('opala',{silent:true});
  if(this.noticeCar&&taken.get(this.noticeCar)!==this.noticeHolder)this.tell('');
  if(this.asked&&!asking&&mine&&mine!==this.asked)this.tell(`O #${this.asked} já estava com outro piloto: você segue no #${mine}.`,this.asked);
  this.asked=asking;
  if(mine&&mine!==this.value)this.value=mine;
  this.show();
 }
 // The model arrived (main.js loads it for the screen): the studio can build the car.
 setTemplate(template){const s=this.studio;if(!s.car?.userData.own)s.drop();s.template=template;this.show();}
 failed(model='opala'){this.failure=model;if(model!==this.model)return;this.status.textContent=`Não foi possível carregar o ${MODEL_NAMES[model]}. A escolha vale mesmo assim.`;this.status.hidden=false;}
 show(){
  // own: the Opala 99, the Auto-Pobre Racing's; the Fusca 99 is Cristiano Canto's.
  const fusca=this.model==='fusca',entry=carEntry(this.value,this.model),$=id=>this.root.querySelector('#'+id),own=entry.number==='99'&&!fusca,name=MODEL_NAMES[this.model];
  this.studio.wanted=`${this.model}:${entry.number}`;
  for(const tab of this.tabs.querySelectorAll('[data-model]')){const on=tab.dataset.model===this.model;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
  $('carsTitle').textContent=`Com qual ${name} você vai correr?`;$('carsMode').textContent=fusca?'MODO CORRIDA · COPA FUSCA':'MODO CORRIDA · OLD STOCK RACE';$('carsKicker').textContent=fusca?'O GRID · 15 FUSCAS':'O GRID · 15 OPALAS';
  for(const b of this.cards.children){
   const on=b.dataset.car===entry.number,holder=this.taken.get(b.dataset.car),label=b.querySelector('span');b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;
   b.classList.toggle('taken',!!holder);b.setAttribute('aria-disabled',String(!!holder));label.textContent=holder??carEntry(b.dataset.car,this.model).shortName;
   b.title=holder?`#${b.dataset.car} · com ${holder}`:`#${b.dataset.car} · ${carEntry(b.dataset.car,this.model).name}`;
  }
  $('carNumber').textContent='#'+entry.number;$('carNumber').style.setProperty('--body',css(entry.color));$('carNumber').style.setProperty('--stripe',css(entry.stripe));
  $('carName').textContent=own?`${name} 99 · Auto-Pobre Racing`:`${name} ${entry.number} · ${entry.shortName}`;
  $('carDetail').textContent=fusca?`Fusca de ${entry.name} · ${entry.category}, ${entry.points} pts na classe em 2026 · ${entry.rank}º do top 15 da Copa Fusca. Você corre no lugar dele${entry.number==='99'?'':'; o Cristiano vai de Fusca 99'}.`
   :own?`O carro do Stevan Gaipo e do Edu Neves, da vaquinha ao grid. ${entry.rank}º no campeonato (${entry.points} pts).`
   :`Carro de ${entry.name}${entry.rank?` · ${entry.rank}º no campeonato (${entry.points} pts)`:''}. Você corre no lugar dele${this.room?'':'; o Stevan Gaipo vai de Opala 99'}.`;
  if(!this.room)this.note.textContent=fusca?'De Fusca, o grid é o da Copa Fusca 2026: os 15 melhores da temporada, cada um com o número e as cores do seu carro (a segunda nos para-lamas) e o ritmo que mostraram nas corridas. Menos motor que os Opalas (no máximo uns 170 km/h), melhor nas curvas e mais manso na saída delas. O piloto do carro escolhido fica de fora e o Cristiano corre com o Fusca 99.'
   :'Todos correm com o mesmo Opala: muda a pintura e o número. O piloto do carro escolhido fica de fora e o Stevan Gaipo corre com o 99.';
  // In a room the note says how the cars are shared, and what became of the last choice.
  if(this.room)this.room.textContent=this.notice||(this.asked?`Pedindo o #${this.asked} ao anfitrião… Vale a partir da próxima largada.`:
   `${this.guest?'Escolha o carro e clique em Aguardar início da corrida: o anfitrião escolhe a pista e dá a largada. ':''}Na sala, cada piloto corre com o carro que escolher, se ninguém estiver com ele; os outros carros correm com a IA. O anfitrião larga em último.`);
  // The way on, big atop the cards as the track screen's Corrida única: the tracks, with the car taken;
  // for a guest, the host's race (once let in: waiting for it, or not).
  const next=$('carsNext'),g=this.guest;
  if(this.room){next.disabled=!!g&&!g.admitted;if(g)next.setAttribute('aria-pressed',String(g.admitted&&g.waiting));else next.removeAttribute('aria-pressed');}
  const label=!g?'Escolher a pista →':!g.admitted?'Esperando o anfitrião aceitar você…':g.waiting?'Aguardando o início da corrida':'Aguardar início da corrida →';
  const hint=!g?`Com o ${name} #${entry.number} · corrida única, treino, 1x1 ou campeonato`:!g.admitted?'':g.waiting?'O anfitrião escolhe a pista e dá a largada · clique para cancelar':`Com o ${name} #${entry.number} · o anfitrião escolhe a pista e dá a largada`;
  if(next.dataset.label!==label+hint){
   next.dataset.label=label+hint;const span=document.createElement('span'),small=document.createElement('small');span.className='mode-label';span.textContent=label;small.id='carsNextDetail';small.textContent=hint;
   next.replaceChildren(span,...hint?[small]:[]);
  }
  const loaded=this.studio.ready(this.model);this.status.hidden=loaded;if(!loaded&&this.failure!==this.model)this.status.textContent=`Carregando o ${name}…`;
 }
 // Every frame while the screen shows (main.js): the studio on the page's canvas.
 render(renderer,dt){
  const live=this.studio.ready(this.model);if(live!==this.live){this.live=live;this.root.classList.toggle('live',live);}
  if(!live)return;
  const rect=this.stage.getBoundingClientRect();this.studio.render(renderer,Math.min(dt,.05),rect);
 }
 info(){return {value:this.value,model:this.model,live:this.live,taken:Object.fromEntries(this.taken),asked:this.asked,guest:this.guest,built:this.studio.shown?.split(':')[1]??null,builtModel:this.studio.shown?.split(':')[0]??null,cards:this.cards.children.length,yaw:this.studio.yaw,meshes:(()=>{let n=0;this.studio.car?.traverse(o=>{if(o.isMesh&&o.visible)n++;});return n;})()};}
}
