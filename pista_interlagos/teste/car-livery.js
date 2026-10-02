import * as THREE from 'three';
import {LIVERY_99,TEAM_PAINTS,PLATE_NAMES,teamPaint,numberSticker} from './immersive-visuals.js';
import {OPENINGS} from './car-openings.js';
// The player's Opala in another team's colours (Modo Corrida's car selection, race-roster.js): the 99's
// sponsors, names and numbers hidden, body and stripe repainted, the car's own number where the 99
// carries its 99, and car 70's Old Stock ads on the doors (on their hinges, so they swing with them).
// Done in place on the loaded model, so wheels, hinges, mirrors and cockpit stay as they are, and
// undone (clear) before anything is cloned from it: the rivals, the paddock's Opala, the 99 that
// Stevan Gaipo races, the car screen's studio. Paint and plates as the rivals get them (rivalCar).
export class CarLivery {
 constructor(){this.number='99';this.hidden=[];this.painted=[];this.decals=[];this.materials=[];}
 // entry: the car's race-roster.js entry (null or the 99: the model as loaded). visual: the circuit's
 // ImmersiveVisuals, whose number plates (cast once per model) and door stickers it reuses. doorAds:
 // the material of car 70's ads (main.js, from the track branding).
 apply(model,entry,visual,{doorAds=null}={}){
  this.clear();if(!model||!entry||entry.number==='99')return;
  this.number=entry.number;const paints=new Map(),paint=teamPaint(paints,entry);
  model.traverse(o=>{
   if(!o.isMesh)return;const mats=[o.material].flat();
   if(mats.some(m=>LIVERY_99.test(m.name))){if(o.visible){o.visible=false;this.hidden.push(o);}return;}
   if(mats.some(m=>TEAM_PAINTS.includes(m.name))){this.painted.push([o,o.material]);o.material=Array.isArray(o.material)?mats.map(paint):paint(o.material);}
  });
  this.materials.push(...paints.values());
  if(!visual)return;
  // The rivals' plates fit this model's body (same frame, the 99's stickers hidden alike).
  const sticker=numberSticker(entry.number);this.materials.push(sticker);
  visual.numberPlates(model,model).forEach((g,i)=>{const decal=new THREE.Mesh(g,sticker);decal.name=PLATE_NAMES[i]+entry.number;decal.renderOrder=2;model.add(decal);this.decals.push(decal);});
  if(doorAds&&entry.number==='70'){
   const body=[];model.traverse(o=>{if(o.isMesh&&o.visible)body.push(o);});
   const doors=[OPENINGS.driverDoor,OPENINGS.passengerDoor].map(name=>model.getObjectByName(name)).filter(Boolean);
   for(const decal of visual.doorStickers(model,doorAds,{body})){
    decal.name='OldStock_no_Opala70';this.decals.push(decal);
    // Onto the nearer door's hinge, keeping its place (the doors are shut at the start).
    decal.geometry.computeBoundingSphere();const at=decal.localToWorld(decal.geometry.boundingSphere.center.clone());
    const near=o=>o.getWorldPosition(new THREE.Vector3()).distanceTo(at),door=[...doors].sort((a,b)=>near(a)-near(b))[0];
    door?.attach(decal);
   }
  }
 }
 // Back to the Opala 99 as loaded. The plates' geometries belong to the visuals' cache.
 clear(){
  for(const o of this.hidden)o.visible=true;for(const [o,m] of this.painted)o.material=m;
  for(const decal of this.decals){decal.removeFromParent();if(decal.name.startsWith('OldStock_'))decal.geometry.dispose();}
  for(const m of this.materials){if(m.map?.isCanvasTexture)m.map.dispose();m.dispose();}
  this.hidden=[];this.painted=[];this.decals=[];this.materials=[];this.number='99';
 }
}
