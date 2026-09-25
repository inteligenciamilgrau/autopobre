import {circuitId} from './circuits.js';
export const PREFERENCES_KEY='opala99-preferences-v1';
export const CAMERA_MODES=Object.freeze(['chase','close','hood','cockpit','aerial','orbit']);
const liveries=['assinaturas_omp','seiva_danilo'];
export function normalizePreferences(value){
 const source=value&&typeof value==='object'?value:{};
 return {
  immersive:typeof source.immersive==='boolean'?source.immersive:true,
  livery:liveries.includes(source.livery)?source.livery:'assinaturas_omp',
  camera:CAMERA_MODES.includes(source.camera)?source.camera:'chase',
  circuit:circuitId(source.circuit),
  // Car damage and wear (power, brakes, grip) is an opt-in realism setting.
  damage:typeof source.damage==='boolean'?source.damage:false,
  // Lakes with reflections and wind ripples cost an extra scene render per frame: opt-in.
  realisticWater:typeof source.realisticWater==='boolean'?source.realisticWater:false,
  // The cockpit view shows the V06 body round the controls; true keeps the old box interior.
  classicInterior:typeof source.classicInterior==='boolean'?source.classicInterior:false
 };
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export class PlayerPreferences {
 constructor(storage=browserStorage()){
  this.storage=storage;let saved;
  try{saved=JSON.parse(storage?.getItem(PREFERENCES_KEY)||'null');}catch{}
  this.values=normalizePreferences(saved);
 }
 update(patch){
  this.values=normalizePreferences({...this.values,...patch});
  try{this.storage?.setItem(PREFERENCES_KEY,JSON.stringify(this.values));}catch{}
 }
}
