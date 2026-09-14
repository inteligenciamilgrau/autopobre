import assert from 'node:assert/strict';
import {PlayerPreferences,PREFERENCES_KEY} from '../teste/player-preferences.js';
const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
let preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos'});
preferences.update({immersive:false,livery:'seiva_danilo',camera:'cockpit'});
preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:false,livery:'seiva_danilo',camera:'cockpit',circuit:'interlagos'});
preferences.update({circuit:'curvelo'});
assert.equal(new PlayerPreferences(storage).values.circuit,'curvelo');
preferences.update({circuit:'../../private'});
assert.equal(new PlayerPreferences(storage).values.circuit,'interlagos');
preferences.update({immersive:true});
assert.equal(new PlayerPreferences(storage).values.immersive,true);
assert.equal(new PlayerPreferences(storage).values.camera,'cockpit');
for(const corrupted of ['not json','null','[]','42','{"immersive":"false","livery":"../../private","camera":"bad"}']){
 data.set(PREFERENCES_KEY,corrupted);
 assert.deepEqual(new PlayerPreferences(storage).values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos'});
}
const denied=new PlayerPreferences({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});
assert.doesNotThrow(()=>denied.update({immersive:false,camera:'orbit'}));
assert.equal(denied.values.immersive,false);
console.log('Preferences passed: defaults, both modes, independent fields, invalid data and unavailable storage.');
