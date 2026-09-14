import {circuitId} from './circuits.js';
export const PREFERENCES_KEY='opala99-preferences-v1';
export const CAMERA_MODES=Object.freeze(['chase','hood','cockpit','aerial','orbit']);
const liveries=['assinaturas_omp','seiva_danilo'];
export function normalizePreferences(value){
 const source=value&&typeof value==='object'?value:{};
 return {
  immersive:typeof source.immersive==='boolean'?source.immersive:true,
  livery:liveries.includes(source.livery)?source.livery:'assinaturas_omp',
  camera:CAMERA_MODES.includes(source.camera)?source.camera:'chase',
  circuit:circuitId(source.circuit)
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
