// Modo Corrida's car screen (teste/car-select.js) without the browser: the field when the player takes
// another team's car (the 99 in its seat, race-roster.js fieldRoster), the 1x1's rival, a race with
// the 99 driven by Stevan Gaipo, and the championship keeping the player's rows apart.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar} from '../teste/physics.js';
import {RaceField,styleForLevel,levelRating} from '../teste/race-field.js';
import {RIVAL_ROSTER,OPALA_99_RIVAL,CAR_CHOICES,carEntry,fieldRoster,duelRivalFor,playerGridSlot,AI_LEVELS,DUEL_DEFAULT} from '../teste/race-roster.js';
import {Championship,championshipStandings} from '../teste/championship.js';
import * as THREE from '../teste/node_modules/three/build/three.module.js';
import {CinematicIntro} from '../teste/intro-cinematic.js';
const interlagos=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));interlagos.meta.id='interlagos';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const report={};

// The choices: the 99 first, then the 14 rivals, one card per number.
assert.equal(CAR_CHOICES.length,15);assert.equal(CAR_CHOICES[0],OPALA_99_RIVAL);
assert.equal(new Set(CAR_CHOICES.map(e=>e.number)).size,15);
assert.equal(carEntry('99'),OPALA_99_RIVAL);assert.equal(carEntry('73').shortName,'Konrad Viehmann');assert.equal(carEntry('98'),null);
// The 99 as a rival: its own colours, a rating and a style at every level.
assert.equal(OPALA_99_RIVAL.color,0x17191b);assert.equal(OPALA_99_RIVAL.mark,OPALA_99_RIVAL.stripe,'a black car reads by its stripe on the map');
assert(Number.isFinite(OPALA_99_RIVAL.rating)&&OPALA_99_RIVAL.rating>.2&&OPALA_99_RIVAL.rating<.6,`99 rating ${OPALA_99_RIVAL.rating}`);
for(const level of AI_LEVELS){const s=styleForLevel(OPALA_99_RIVAL,level);assert(Number.isFinite(s.cornerGrip)&&Number.isFinite(s.braking)&&Number.isFinite(levelRating(OPALA_99_RIVAL,level)),level);}

// The field: the 99 in the seat of the car taken, everything else in place; the 99's own car changes nothing.
assert.equal(fieldRoster('99'),RIVAL_ROSTER);assert.equal(fieldRoster('98'),RIVAL_ROSTER);
for(const car of RIVAL_ROSTER.map(e=>e.number)){
 const field=fieldRoster(car),i=RIVAL_ROSTER.findIndex(e=>e.number===car);
 assert.equal(field.length,RIVAL_ROSTER.length);assert.equal(field[i],OPALA_99_RIVAL);
 assert(field.every((e,k)=>k===i||e===RIVAL_ROSTER[k]));assert(!field.some(e=>e.number===car),`#${car} is the player's`);
}
// The 1x1's rival: the one asked for; the player's own car's driver becomes the 99; the 99 against the 99 falls back.
assert.equal(duelRivalFor('99','19'),'19');assert.equal(duelRivalFor('73','19'),'19');
assert.equal(duelRivalFor('73','73'),'99');assert.equal(duelRivalFor('73','99'),'99');assert.equal(duelRivalFor('99','99'),DUEL_DEFAULT);

// A whole field with the player in #73: the 99 starts from its qualifying slot, raced like any rival.
{
 const data=interlagos,L=data.meta.reconstructed_xy_m,player=new TestCar(data);player.resetGrid(playerGridSlot());
 const plain=new RaceField(data,{seed:7});plain.reset(player.surface.s,{grid:true});
 const field=new RaceField(data,{seed:7,roster:fieldRoster('73')});field.reset(player.surface.s,{grid:true});
 assert.equal(field.rivals.length,RIVAL_ROSTER.length);
 const seat=RIVAL_ROSTER.findIndex(e=>e.number==='73'),stevan=field.rivals[seat];
 assert.equal(stevan.entry,OPALA_99_RIVAL);assert.equal(stevan.rosterIndex,seat);
 for(const [k,r] of field.rivals.entries())assert.equal(r.rosterIndex,k);
 // The roster is taken at every reset, like the level: back to the 99, the field is the usual one again.
 field.roster=RIVAL_ROSTER;field.reset(player.surface.s,{grid:true,seed:7});
 assert.deepEqual(field.rivals.map(r=>[r.entry.number,r.slot,r.car.x,r.car.y]),plain.rivals.map(r=>[r.entry.number,r.slot,r.car.x,r.car.y]));
 // Race two laps (the player's car parked off the grid's path): the 99 finishes among the others.
 field.roster=fieldRoster('73');field.reset(player.surface.s,{grid:true,seed:7});
 for(const r of field.rivals)r.car.awaitingStart=false;
 player.x+=player.surface.lx*30;player.y+=player.surface.ly*30;player.surface=player.sample(player.x,player.y);
 let steps=0;while(steps<120*400&&field.rivals.some(r=>!r.finished&&!r.retired)){field.step(player,1/120,2);steps++;}
 const order=[...field.rivals].sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity)),place=order.indexOf(field.rivals[seat])+1;
 assert(field.rivals[seat].finished,'the 99 takes the flag');assert(field.rivals[seat].car.best>0);
 report.race={laps:2,seconds:+(steps/120).toFixed(1),stevanPlace:place,stevanBest:+field.rivals[seat].car.best.toFixed(2),fastest:+Math.min(...field.rivals.map(r=>r.car.best??Infinity)).toFixed(2),finished:order.filter(r=>r.finished).length};
}
// The 1x1 in #73 against its own driver: the 99 alone on the pole, in #73's place among the models.
{
 const data=interlagos,player=new TestCar(data);player.resetGrid(playerGridSlot(1));
 const field=new RaceField(data,{seed:2,roster:fieldRoster('73')});field.reset(player.surface.s,{grid:true,entrants:[duelRivalFor('73','73')]});
 assert.equal(field.rivals.length,1);assert.equal(field.rivals[0].entry,OPALA_99_RIVAL);assert.equal(field.rivals[0].rosterIndex,RIVAL_ROSTER.findIndex(e=>e.number==='73'));
}
// The championship: the player's rows stay the player's in any car; the 99 raced by Stevan and the
// driver whose car was taken keep their own.
{
 const champ=new Championship(memory());champ.start('Ana',3);
 const rows=(car,place)=>{const field=fieldRoster(car).map(e=>({number:e.number,name:e.name,bestLap:80,totalTime:250,finished:true}));field.splice(place-1,0,{number:car,name:'Ana',player:true,bestLap:79,totalTime:249,finished:true});return field;};
 champ.record(0,'interlagos',rows('99',1),'Ana');
 const s=champ.record(1,'cascavel',rows('73',1),'Ana'),standings=s.standings,me=standings.find(d=>d.player);
 assert.equal(me.points,50,'two wins, the 99 and then #73');assert.equal(me.number,'73','shown with the latest car');assert.equal(me.wins,2);
 assert.equal(standings.filter(d=>d.player).length,1);
 const konrad=standings.find(d=>!d.player&&d.number==='73'),stevan=standings.find(d=>!d.player&&d.number==='99');
 assert(konrad&&konrad.rounds[1]===undefined&&konrad.rounds[0].points>0,'Konrad sat the second round out');
 assert(stevan&&stevan.rounds[0]===undefined&&stevan.rounds[1].points>0,'Stevan raced the 99 in the second round');
 assert.equal(stevan.shortName,'Stevan Gaipo','the AI 99 shows its short name, as the other rivals');
 assert.equal(s.points.get('73'),25);assert.equal(s.points.get('99'),20);
 // Rounds saved before the car screen (the player as #99) read as before.
 const old=championshipStandings({results:[{circuit:'interlagos',rows:rows('99',2).map((r,i)=>({...r,position:i+1,points:25-i}))}],pilot:'Ana'});
 assert.equal(old.filter(d=>d.player).length,1);assert.equal(old.find(d=>d.player).number,'99');assert(!old.some(d=>!d.player&&d.number==='99'));
}
// The last round's order breaks a tie: whoever sat that round out (Konrad, his car taken) comes after
// whoever raced it (Stevan in the 99), not compared with a round of his own.
{
 const row=(number,name)=>({number,name,position:3,points:16,bestLap:80,totalTime:250,finished:true});
 const tied=championshipStandings({results:[{circuit:'interlagos',rows:[row('73','Konrad Viehmann')]},{circuit:'cascavel',rows:[row('99',OPALA_99_RIVAL.name)]}],pilot:'Ana'});
 const at=number=>tied.findIndex(d=>!d.player&&d.number===number);
 assert(at('99')<at('73'),'Stevan raced the last round, Konrad sat it out');
}
// The race intro names the car the player races: the 1x1 against the 99 and the closing shot of #73.
{
 const intro=new CinematicIntro(),v=(x,y,z)=>new THREE.Vector3(x,y,z);intro.kind='race';
 const captions=context=>{intro.context=()=>({car:v(0,0,0),forward:v(1,0,0),inward:v(0,0,3),center:k=>v(k,0,0),pilot:'Ana',position:2,grid:2,laps:3,practice:false,...context});return intro.build().map(s=>s.caption);};
 const duel=captions({number:'73',duel:carEntry(duelRivalFor('73','73'))});
 assert.equal(duel[1][1],'#73 × #99 Stevan Gaipo');assert.equal(duel[2][0],'OPALA #73');
 assert.equal(captions({number:'99',duel:carEntry('73')})[1][1],'#99 × #73 Konrad Viehmann');
 report.intro=duel.map(c=>c.slice(0,2).join(' · '));
}
console.log(JSON.stringify(report,null,1));
console.log('testar_carros: ok');
