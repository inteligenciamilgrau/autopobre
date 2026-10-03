import assert from 'node:assert/strict';
import {GRAPHICS_LEVELS,GRAPHICS_OPTIONS,GRAPHICS_PRESETS,SHADOW_LEVELS,VIEW_DISTANCES,SCENERY_LEVELS,MIRROR_SIZES,autoLevel,normalizeGraphics,resolveGraphics,setGraphicsValue,chooseGraphicsLevel,debugCorner,FrameLimiter} from '../teste/graphics-settings.js';
import {gpuName} from '../teste/debug-overlay.js';
import {CINEMATIC_FEATURES} from '../teste/cinematic.js';

const rank=(key,value)=>GRAPHICS_OPTIONS[key].choices.findIndex(([v])=>v===value);
// Four levels, each a full set of valid values, and each never lighter than the one below.
assert.deepEqual(GRAPHICS_LEVELS,['baixo','medio','alto','ultra']);
for(const level of GRAPHICS_LEVELS){
 assert.deepEqual(Object.keys(GRAPHICS_PRESETS[level]).sort(),Object.keys(GRAPHICS_OPTIONS).sort(),`${level} sets every option`);
 for(const [key,value] of Object.entries(GRAPHICS_PRESETS[level]))assert.ok(rank(key,value)>=0,`${level}.${key}=${value} is a choice`);
}
for(let i=1;i<GRAPHICS_LEVELS.length;i++)for(const key of Object.keys(GRAPHICS_OPTIONS)){
 const lower=GRAPHICS_LEVELS[i-1],upper=GRAPHICS_LEVELS[i];
 assert.ok(rank(key,GRAPHICS_PRESETS[upper][key])>=rank(key,GRAPHICS_PRESETS[lower][key]),`${upper}.${key} is not lighter than ${lower}.${key}`);
}
// Every choice the engine reads has its engine values.
for(const [key,table] of [['shadows',SHADOW_LEVELS],['viewDistance',VIEW_DISTANCES],['scenery',SCENERY_LEVELS],['mirrors',MIRROR_SIZES]])
 for(const [value] of GRAPHICS_OPTIONS[key].choices)assert.ok(Object.hasOwn(table,value),`${key} ${value} has engine values`);
for(const view of Object.values(VIEW_DISTANCES))assert.ok(view.fog[0]<view.fog[1]&&view.fog[1]<view.far,'fog ends before the far plane');
assert.deepEqual(Object.keys(CINEMATIC_FEATURES).sort(),['ao','lens','motionBlur','samples']);

// Médio is what phones had before the Gráficos tab, Alto what computers had.
const medio=GRAPHICS_PRESETS.medio,alto=GRAPHICS_PRESETS.alto;
assert.equal(autoLevel(true),'medio');assert.equal(autoLevel(false),'alto');
assert.deepEqual([medio.resolution,medio.antialias,medio.post,medio.motionBlur,medio.water],[1,0,'lite',false,'simples']);
assert.deepEqual([SHADOW_LEVELS[medio.shadows].size,SHADOW_LEVELS[medio.shadows].reach,SHADOW_LEVELS[medio.shadows].radius],[1024,55,2]);
assert.deepEqual([VIEW_DISTANCES[medio.viewDistance].fog,VIEW_DISTANCES[medio.viewDistance].far],[[420,2400],6500]);
assert.deepEqual(SCENERY_LEVELS[medio.scenery],{mobile:true,density:1,lod:80});assert.deepEqual(MIRROR_SIZES[medio.mirrors],[510,85]);
assert.deepEqual([alto.resolution,alto.antialias,alto.post,alto.ao,alto.lens,alto.motionBlur,alto.water],[1.5,4,'full',true,true,true,'simples']);
assert.deepEqual([SHADOW_LEVELS[alto.shadows].size,SHADOW_LEVELS[alto.shadows].reach,SHADOW_LEVELS[alto.shadows].radius],[4096,85,2]);
assert.deepEqual([VIEW_DISTANCES[alto.viewDistance].fog,VIEW_DISTANCES[alto.viewDistance].far],[[520,3300],6500]);
assert.deepEqual(SCENERY_LEVELS[alto.scenery],{mobile:false,density:1,lod:130});assert.deepEqual(MIRROR_SIZES[alto.mirrors],[1020,170]);
assert.equal(medio.fpsLimit,0);assert.equal(alto.fpsLimit,0);

// Automático follows the device; changes by hand sit on top of whatever level is in force.
let graphics=normalizeGraphics(undefined);
assert.deepEqual(graphics,{level:'auto',overrides:{}});
assert.equal(resolveGraphics(graphics,{touch:true}).level,'medio');assert.equal(resolveGraphics(graphics,{touch:false}).level,'alto');
graphics=setGraphicsValue(graphics,'water','realista',{touch:false});
assert.deepEqual(graphics,{level:'auto',overrides:{water:'realista'}});
for(const touch of [true,false]){const state=resolveGraphics(graphics,{touch});assert.equal(state.values.water,'realista');assert.deepEqual(state.changed,['water']);assert.equal(state.auto,true);}
// Back to the level's own value: no longer a change.
graphics=setGraphicsValue(graphics,'water','simples',{touch:false});assert.deepEqual(graphics.overrides,{});
// An override equal to the level in force is kept but not shown as a change (Automático on a phone).
graphics={level:'auto',overrides:{post:'lite'}};
assert.deepEqual(resolveGraphics(graphics,{touch:true}).changed,[]);assert.deepEqual(resolveGraphics(graphics,{touch:false}).changed,['post']);
// Two pixel densities the screen draws alike count as the same (a custom test).
graphics=setGraphicsValue({level:'alto',overrides:{}},'resolution',2,{same:(a,b,k)=>k==='resolution'?Math.min(a,1)===Math.min(b,1):a===b});
assert.deepEqual(graphics.overrides,{},'2x and 1.5x on a 1x screen are both the native size');
// Unknown settings or values change nothing; picking a level drops the changes by hand.
const before={level:'ultra',overrides:{shadows:'baixa'}};
assert.equal(setGraphicsValue(before,'shadows','enormes'),before);assert.equal(setGraphicsValue(before,'bloom',true),before);
assert.deepEqual(chooseGraphicsLevel('baixo'),{level:'baixo',overrides:{}});assert.deepEqual(chooseGraphicsLevel('extremo'),{level:'auto',overrides:{}});
assert.deepEqual(resolveGraphics(before).values,{...GRAPHICS_PRESETS.ultra,shadows:'baixa'});
// Old saves: realistic water and the film look become changes to Automático (only without a graphics entry).
assert.deepEqual(normalizeGraphics(undefined,{realisticWater:true,cinematic:'lite'}),{level:'auto',overrides:{water:'realista',post:'lite'}});
assert.deepEqual(normalizeGraphics({level:'medio'},{realisticWater:true}),{level:'medio',overrides:{}});
assert.deepEqual(normalizeGraphics({level:'alto',overrides:{fpsLimit:'30',antialias:8,shadows:'ultra'}}),{level:'alto',overrides:{shadows:'ultra'}});

// The FPS limit holds the average on fast screens and leaves slower ones alone.
function rendered(hz,limit,seconds=10,jitter=.3){
 const cap=new FrameLimiter(limit);let frames=0,seed=7;
 for(let i=1;i<=hz*seconds;i++){seed=(seed*16807)%2147483647;const now=i*1000/hz+(seed/2147483647-.5)*jitter;if(!cap.skip(now))frames++;}
 return frames/seconds;
}
assert.ok(Math.abs(rendered(144,60)-60)<1.5,`60 FPS on 144 Hz: ${rendered(144,60)}`);
assert.ok(Math.abs(rendered(120,60)-60)<1.5,`60 FPS on 120 Hz: ${rendered(120,60)}`);
assert.ok(Math.abs(rendered(60,30)-30)<1,`30 FPS on 60 Hz: ${rendered(60,30)}`);
assert.equal(rendered(60,60),60,'a 60 FPS limit on a 60 Hz screen skips nothing');
assert.equal(rendered(144,0),144,'no limit');
assert.ok(rendered(40,60)===40,'a slow device is never held back');

// The overlay: the corner and the graphics card's name.
assert.equal(debugCorner('auto',true),'tc');assert.equal(debugCorner('auto',false),'tl');assert.equal(debugCorner('br',true),'br');
assert.equal(gpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 5060 (0x00002D05) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'NVIDIA GeForce RTX 5060 · Direct3D11');
assert.equal(gpuName('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)'),'Intel(R) UHD Graphics 620 · Direct3D11');
assert.equal(gpuName('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'),'ANGLE Metal Renderer: Apple M2');
assert.equal(gpuName('Adreno (TM) 650'),'Adreno (TM) 650');assert.equal(gpuName(''),'desconhecida');
console.log('Graphics passed: four ordered levels, Médio/Alto as before, Automático per device, changes by hand, old saves, FPS limit, overlay.');
