import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {createTrackSurface,createGuardrails,createCurbs,TRACK_DETAIL} from '../teste/track-surface.js';

const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
// Textures themselves are browser assets. Mock only the loader so the same material,
// geometry and live quality transitions run without a DOM or graphics driver.
const original=THREE.TextureLoader.prototype.loadAsync;
THREE.TextureLoader.prototype.loadAsync=async()=>new THREE.Texture();
let surface;
try{surface=await createTrackSurface({capabilities:{getMaxAnisotropy:()=>8}},data,{quality:'ultra'});}
finally{THREE.TextureLoader.prototype.loadAsync=original;}
const rails=createGuardrails(data),curbs=createCurbs(data);
const pitMaterial=surface.cloneMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
const railPositions=Array.from(rails.rails.geometry.attributes.position.array);
const reflector=rails.root.getObjectByName('Refletores_velocidade');
const fullCount=reflector.count;
assert(fullCount>100,'speed cues are distributed round the circuit');
assert.equal(rails.root.children.filter(m=>m.isInstancedMesh&&m!==rails.root.getObjectByName('Postes_guardrail')).length,2,'all reflector pairs require only two draws');

for(const quality of ['ultra','baixo','medio','alto','baixo','ultra']){
 surface.setQuality(quality);rails.setQuality(quality);curbs.userData.setQuality(quality);
 const detail=TRACK_DETAIL[quality],mat=surface.material;
 assert.equal(surface.stats.quality,quality);
 assert.equal(mat.defines.ROAD_DETAIL,detail.shader);
 assert.equal(mat.defines.STANDARD,'','preserve Three standard-material shader define');
 assert.equal(pitMaterial.defines.ROAD_DETAIL,detail.shader,'pit-lane clone follows every live quality switch');
 assert.equal(pitMaterial.normalMap,mat.normalMap,'pit-lane clone detaches and restores normal maps with the road');
 assert.equal(pitMaterial.roughnessMap,mat.roughnessMap);
 assert.equal(pitMaterial.onBeforeCompile,mat.onBeforeCompile);
 assert.equal(mat.map.anisotropy,Math.min(detail.anisotropy,8),'anisotropy respects GPU limits');
 assert.equal(Boolean(mat.normalMap),detail.shader>0,'low quality eliminates normal-map sampling');
 assert.equal(Boolean(mat.roughnessMap),detail.shader>0,'low quality eliminates roughness-map sampling');
 assert(mat.detailNormalMap?.isTexture&&mat.detailRoughnessMap?.isTexture,'detached maps remain owned for disposal');
 assert.equal(reflector.count,Math.ceil(fullCount*detail.reflectors));
 assert.equal(reflector.visible,detail.reflectors>0);
 assert.deepEqual(Array.from(rails.rails.geometry.attributes.position.array),railPositions,'quality never changes collision rail geometry');
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
 mat.onBeforeCompile(shader);
 assert(shader.vertexShader.includes('attribute vec4 roadData;'));
 assert(shader.fragmentShader.includes('#if ROAD_DETAIL > 1'),'expensive marks are compiled out on modest GPUs');
 assert.equal(shader.uniforms.grainAnisotropy.value,Math.min(detail.anisotropy,8));
 assert(!shader.fragmentShader.includes('#include <normal_fragment_maps>'),'normal shader hook remains valid for this Three version');
 assert(!shader.fragmentShader.includes('#include <roughnessmap_fragment>'),'roughness shader hook remains valid for this Three version');
 for(const mesh of curbs.children){
  assert.equal(Boolean(mesh.material.normalMap),detail.shader>0);
  assert.equal(Boolean(mesh.material.roughnessMap),detail.shader>0);
 }
}

// A road triangle crosses s=0: surface detail must stay continuous instead of
// interpolating all 4.3 km of wear through a triangle at the finish line.
const p=data.samples.at(-1),q=data.samples[0],g=new THREE.BufferGeometry();
g.setAttribute('position',new THREE.Float32BufferAttribute([p[1],p[3],-p[2],q[1],q[3],-q[2],q[1]+q[9],q[3],-q[2]-q[10]],3));
const before=Array.from(g.attributes.position.array),mapped=surface.geometry(g);
assert.deepEqual(Array.from(mapped.attributes.position.array),before,'asphalt appearance preserves physical vertices');
const coords=mapped.attributes.roadData;
const s=[coords.getY(0),coords.getY(1),coords.getY(2)];
assert(Math.max(...s)-Math.min(...s)<20,'finish seam keeps metre-scale texture continuity');
assert(Array.from(coords.array).every(Number.isFinite));

const maps=new Set(),geometries=new Set(),materials=new Set();
for(const root of [rails.root,curbs])root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)materials.add(object.material);});
materials.add(surface.material);materials.add(pitMaterial);geometries.add(mapped);
for(const mat of materials){for(const value of Object.values(mat))if(value?.isTexture)maps.add(value);mat.dispose();}
for(const map of maps)map.dispose();for(const geometry of geometries)geometry.dispose();
console.log(`Superficie visual: quatro qualidades, transicoes ao vivo, mapas e geometria OK; ${fullCount} refletores instanciados.`);
