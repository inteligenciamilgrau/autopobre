import assert from 'node:assert/strict';
import {PlayerPreferences,PREFERENCES_KEY} from '../teste/player-preferences.js';
const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
let preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos',damage:false,realisticWater:false,classicInterior:false,cinematic:'auto',laps:3});
preferences.update({immersive:false,livery:'seiva_danilo',camera:'cockpit'});
preferences=new PlayerPreferences(storage);
assert.deepEqual(preferences.values,{immersive:false,livery:'seiva_danilo',camera:'cockpit',circuit:'interlagos',damage:false,realisticWater:false,classicInterior:false,cinematic:'auto',laps:3});
preferences.update({circuit:'curvelo'});
assert.equal(new PlayerPreferences(storage).values.circuit,'curvelo');
preferences.update({circuit:'../../private'});
assert.equal(new PlayerPreferences(storage).values.circuit,'interlagos');
preferences.update({immersive:true});
assert.equal(new PlayerPreferences(storage).values.immersive,true);
assert.equal(new PlayerPreferences(storage).values.camera,'cockpit');
// Car damage is opt-in and survives a reload; anything but a boolean falls back to off.
preferences.update({damage:true});assert.equal(new PlayerPreferences(storage).values.damage,true);
preferences.update({damage:'yes'});assert.equal(new PlayerPreferences(storage).values.damage,false);
// Realistic lake water is opt-in too, stored on its own and kept after a reload.
preferences.update({realisticWater:true});assert.equal(new PlayerPreferences(storage).values.realisticWater,true);assert.equal(new PlayerPreferences(storage).values.damage,false);
preferences.update({damage:true});assert.equal(new PlayerPreferences(storage).values.realisticWater,true);
preferences.update({realisticWater:'on'});assert.equal(new PlayerPreferences(storage).values.realisticWater,false);
// The classic cockpit interior is opt-in: the V06 body round the controls is the default.
preferences.update({classicInterior:true});assert.equal(new PlayerPreferences(storage).values.classicInterior,true);
preferences.update({classicInterior:'yes'});assert.equal(new PlayerPreferences(storage).values.classicInterior,false);
for(const corrupted of ['{"damage":1}','{"realisticWater":1}','not json','null','[]','42','{"immersive":"false","livery":"../../private","camera":"bad"}','{"circuit":{"toString":42}}']){
 data.set(PREFERENCES_KEY,corrupted);
 assert.deepEqual(new PlayerPreferences(storage).values,{immersive:true,livery:'assinaturas_omp',camera:'chase',circuit:'interlagos',damage:false,realisticWater:false,classicInterior:false,cinematic:'auto',laps:3});
}
const denied=new PlayerPreferences({getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}});
assert.doesNotThrow(()=>denied.update({immersive:false,camera:'orbit'}));
assert.equal(denied.values.immersive,false);
// Race length: 3 laps unless the player picks another whole number from 1 to 20.
preferences.update({laps:5});assert.equal(new PlayerPreferences(storage).values.laps,5);
preferences.update({laps:1});assert.equal(new PlayerPreferences(storage).values.laps,1);
for(const bad of [0,21,2.5,'4',null,-3])assert.equal((preferences.update({laps:bad}),new PlayerPreferences(storage).values.laps),3,`laps ${bad} falls back to 3`);
console.log('Preferences passed: defaults, both modes, independent fields, invalid data and unavailable storage.');
// Film look: auto by default, only the known levels are kept.
preferences.update({cinematic:'lite'});assert.equal(new PlayerPreferences(storage).values.cinematic,'lite');
preferences.update({cinematic:'cinema'});assert.equal(new PlayerPreferences(storage).values.cinematic,'auto');
