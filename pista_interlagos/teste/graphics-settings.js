// Graphics quality, the settings' Gráficos tab: four levels for phones and computers and, under
// them, every setting by hand. A level is a full set of values; the player's own changes are kept
// as overrides on top of it, so "Automático" (Médio on phones, Alto on computers) with realistic
// water stays that on either device. No DOM here: the panel is graphics-panel.js, the engine
// side is applyGraphics in main.js.
export const GRAPHICS_LEVELS=Object.freeze(['baixo','medio','alto','ultra']);
export const GRAPHICS_LEVEL_NAMES=Object.freeze({auto:'Automático',baixo:'Baixo',medio:'Médio',alto:'Alto',ultra:'Ultra'});
// The level "Automático" stands for on this device.
export const autoLevel=touch=>touch?'medio':'alto';

// Each setting: its group in the panel, its name, a line on what it costs, and its choices
// (value, label) from the lightest to the heaviest. 'next' marks the ones taken at the next start.
export const GRAPHICS_OPTIONS=Object.freeze({
 resolution:{group:'imagem',label:'Densidade de pixels',hint:'Quantos pixels a placa de vídeo desenha por ponto da tela. É o ajuste que mais pesa.',choices:[[.5,'0,5×'],[.75,'0,75×'],[1,'1×'],[1.25,'1,25×'],[1.5,'1,5×'],[2,'2×']]},
 dynamicResolution:{group:'imagem',label:'Resolução dinâmica',hint:'Baixa a densidade sozinha quando o FPS cai e volta quando sobra fôlego.',choices:[[false,'Desligada'],[true,'Ligada']]},
 fpsLimit:{group:'imagem',label:'Limite de FPS',hint:'Segurar o FPS poupa bateria e esquenta menos o celular.',choices:[[30,'30 FPS'],[60,'60 FPS'],[0,'Sem limite']]},
 antialias:{group:'imagem',label:'Antisserrilhado (MSAA)',hint:'Suaviza os degraus nas bordas. No visual Simples vale ao recarregar a página.',choices:[[0,'Desligado'],[2,'2×'],[4,'4×']]},
 shadows:{group:'luz',label:'Sombras',hint:'Resolução e alcance das sombras do sol em volta do carro.',choices:[['off','Desligadas'],['baixa','Baixas'],['media','Médias'],['alta','Altas'],['ultra','Ultra']]},
 post:{group:'luz',label:'Visual de cinema',hint:'Neblina de São Paulo, cor de filme e ajuste de exposição. Simples desenha direto na tela.',choices:[['off','Simples'],['lite','Leve'],['full','Completo']]},
 ao:{group:'luz',label:'Oclusão de ambiente',hint:'Sombra de contato nos cantos e sob os carros. Só no visual Completo.',choices:[[false,'Desligada'],[true,'Ligada']]},
 lens:{group:'luz',label:'Brilho e lente',hint:'Brilho das luzes fortes, reflexo do sol na lente e foco das câmeras de TV. Só no visual Completo.',choices:[[false,'Desligado'],[true,'Ligado']]},
 motionBlur:{group:'luz',label:'Desfoque de velocidade',hint:'Borra as bordas da imagem em alta velocidade, nas câmeras que andam com o carro.',choices:[[false,'Desligado'],[true,'Ligado']]},
 scenery:{group:'mundo',label:'Cenário e vegetação',hint:'Quantidade de árvores e casas, folhagem e detalhe do terreno. Vale na próxima largada.',next:true,choices:[['basico','Básico'],['leve','Leve'],['completo','Completo'],['denso','Denso']]},
 viewDistance:{group:'mundo',label:'Distância de visão',hint:'Até onde o horizonte aparece antes de sumir na neblina.',choices:[['curta','Curta'],['media','Média'],['longa','Longa'],['maxima','Máxima']]},
 water:{group:'mundo',label:'Água dos lagos',hint:'Realista reflete árvores, casas e céu e ondula com o vento: desenha a cena mais uma vez.',choices:[['simples','Simples'],['realista','Realista']]},
 mirrors:{group:'mundo',label:'Retrovisores',hint:'Resolução do espelho na câmera interna: desenha a pista para trás a cada quadro.',choices:[['off','Desligados'],['baixa','Baixa'],['media','Média'],['alta','Alta']]}
});
export const GRAPHICS_GROUPS=Object.freeze([['imagem','Imagem'],['luz','Luz e efeitos'],['mundo','Mundo']]);

// Médio is what phones always had and Alto what computers had, before this tab existed.
export const GRAPHICS_PRESETS=Object.freeze({
 baixo:Object.freeze({resolution:.75,dynamicResolution:true,fpsLimit:60,antialias:0,shadows:'off',post:'off',ao:false,lens:false,motionBlur:false,scenery:'basico',viewDistance:'curta',water:'simples',mirrors:'baixa'}),
 medio:Object.freeze({resolution:1,dynamicResolution:true,fpsLimit:0,antialias:0,shadows:'baixa',post:'lite',ao:false,lens:false,motionBlur:false,scenery:'leve',viewDistance:'media',water:'simples',mirrors:'media'}),
 alto:Object.freeze({resolution:1.5,dynamicResolution:true,fpsLimit:0,antialias:4,shadows:'alta',post:'full',ao:true,lens:true,motionBlur:true,scenery:'completo',viewDistance:'longa',water:'simples',mirrors:'alta'}),
 ultra:Object.freeze({resolution:2,dynamicResolution:true,fpsLimit:0,antialias:4,shadows:'ultra',post:'full',ao:true,lens:true,motionBlur:true,scenery:'denso',viewDistance:'maxima',water:'realista',mirrors:'alta'})
});

// What each choice means to the engine (main.js applyGraphics, landscape.js).
// Sun shadows: map size in pixels, metres covered round the car and the PCF softness.
export const SHADOW_LEVELS=Object.freeze({off:null,baixa:{size:1024,reach:55,radius:2},media:{size:2048,reach:70,radius:2},alta:{size:4096,reach:85,radius:2},ultra:{size:8192,reach:120,radius:3}});
// Fog from near to far (metres) and the camera's far plane; past 'far' everything is fog colour.
export const VIEW_DISTANCES=Object.freeze({curta:{fog:[300,1600],far:1900},media:{fog:[420,2400],far:6500},longa:{fog:[520,3300],far:6500},maxima:{fog:[700,4600],far:9000}});
// Scenery: the light build (mobile), trees and houses per area, and how near a tree shows its full crown.
export const SCENERY_LEVELS=Object.freeze({basico:{mobile:true,density:.7,lod:55},leve:{mobile:true,density:1,lod:80},completo:{mobile:false,density:1,lod:130},denso:{mobile:false,density:1.3,lod:220}});
// Cockpit mirror picture in pixels (null: not drawn).
export const MIRROR_SIZES=Object.freeze({off:null,baixa:[340,57],media:[510,85],alta:[1020,170]});

const isChoice=(key,value)=>GRAPHICS_OPTIONS[key].choices.some(([v])=>v===value);
// {level: 'auto' or one of the four, overrides: {setting: value}}. Settings saved before this tab
// (the lake water and the film look) become overrides of "Automático".
export function normalizeGraphics(value,legacy={}){
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value:null;
 const level=['auto',...GRAPHICS_LEVELS].includes(source?.level)?source.level:'auto';
 const given=source?(source.overrides&&typeof source.overrides==='object'?source.overrides:{}):{
  ...(legacy?.realisticWater===true?{water:'realista'}:{}),
  ...(['full','lite','off'].includes(legacy?.cinematic)?{post:legacy.cinematic}:{})
 };
 const overrides={};
 for(const key of Object.keys(GRAPHICS_OPTIONS))if(Object.hasOwn(given,key)&&isChoice(key,given[key]))overrides[key]=given[key];
 return {level,overrides};
}
// The values in force: the level's, then the player's changes. 'changed' lists the settings that
// differ from the level.
export function resolveGraphics(graphics,{touch=false}={}){
 const level=graphics.level==='auto'?autoLevel(touch):graphics.level,base=GRAPHICS_PRESETS[level],values={...base},changed=[];
 for(const [key,value] of Object.entries(graphics.overrides))if(value!==base[key]){values[key]=value;changed.push(key);}
 return {level,auto:graphics.level==='auto',values,changed};
}
// One setting changed by hand: kept as an override unless it is the level's own value
// (same: a custom test, e.g. two pixel densities this screen draws alike).
export function setGraphicsValue(graphics,key,value,{touch=false,same=(a,b)=>a===b}={}){
 if(!Object.hasOwn(GRAPHICS_OPTIONS,key)||!isChoice(key,value))return graphics;
 const level=graphics.level==='auto'?autoLevel(touch):graphics.level,overrides={...graphics.overrides};
 if(same(value,GRAPHICS_PRESETS[level][key],key))delete overrides[key];else overrides[key]=value;
 return {level:graphics.level,overrides};
}
// Picking a level drops the changes made by hand.
export const chooseGraphicsLevel=level=>({level:['auto',...GRAPHICS_LEVELS].includes(level)?level:'auto',overrides:{}});

// The performance overlay (debug-overlay.js): off, the FPS line or the full panel, and where it sits.
export const DEBUG_OVERLAY_MODES=Object.freeze([['off','Desligada'],['fps','Só o FPS'],['full','Completa']]);
export const DEBUG_OVERLAY_CORNERS=Object.freeze([['auto','Automático'],['tl','Canto superior esquerdo'],['tc','Topo, ao centro'],['tr','Canto superior direito'],['bl','Canto inferior esquerdo'],['br','Canto inferior direito']]);
// 'auto': top left on computers; phones have the map there, so the top centre.
export const debugCorner=(corner,touch)=>corner==='auto'?(touch?'tc':'tl'):corner;

// The FPS limit: frames still come at the screen's rate and the early ones are skipped, on a fixed
// grid so the average holds (60 on a 144 Hz screen). limit 0: every frame.
export class FrameLimiter {
 constructor(limit=0){this.limit=limit;this.last=0;}
 skip(now){
  if(!this.limit)return false;const interval=1000/this.limit,elapsed=now-this.last;
  // A frame up to 1 ms early still counts for its slot; the grid moves on by whole slots.
  if(elapsed<interval-1)return true;this.last=elapsed>interval*3?now:this.last+Math.max(1,Math.floor((elapsed+1)/interval))*interval;return false;
 }
}
