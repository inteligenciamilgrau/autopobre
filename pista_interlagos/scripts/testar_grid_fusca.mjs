// The Copa Fusca's field (teste/race-roster.js FUSCA_CHOICES): the user's list of numbers and colours
// (2026-10-06), the pace in the order of the top 15, the 99 (Cristiano Canto's) in the seat of the car the player
// takes, the 1x1 in that field, a championship in Fuscas with its own drivers, a race of it, and the Opala's Old
// Stock field as it was.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar,FUSCA_BODY} from '../teste/physics.js';
import {RaceField,styleForLevel,levelRating} from '../teste/race-field.js';
import {RIVAL_ROSTER,CAR_CHOICES,OPALA_99_RIVAL,FUSCA_CHOICES,FUSCA_ROSTER,FUSCA_99_RIVAL,rosterOf,carEntry,rivalEntry,fieldRoster,duelRivalFor,duelDefault,playerGridSlot,AI_LEVELS,luminance} from '../teste/race-roster.js';
import {Championship,championshipKey,COPA_FUSCA_2026} from '../teste/championship.js';
const interlagos=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));interlagos.meta.id='interlagos';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
const report={};

// The list: number, name and colours (first: body, second: fenders; a one-colour car has both alike), in the top
// 15's order.
const LIST=[['20','Arthur Fischer','branco','vermelho'],['86','Caio Gomes','cinza','cinza'],['77','Felipe Martins','azul escuro','azul claro'],
 ['29','Stanley','salmão','salmão'],['18','Thiagão','verde claro','azul'],['3','Rogério Gaspar','preto','rosa'],['33','Fernando Moraes','amarelo','verde claro'],
 ['5','Eduardo Belisario','cinza','cinza'],['99','Cristiano','cinza','preto'],['39','Erli Camargo','branco','vermelho'],['11','Caio Mahana','branco','salmão'],
 ['4','Thiago Benício','vermelho','vermelho'],['9','Marcos Fortuna','preto','preto'],['79','Zé Dias','branco','vermelho'],['49','Robertão','cinza','preto']];
// A colour's name, from its hue, saturation and lightness.
function colourName(hex){
 const r=(hex>>16&255)/255,g=(hex>>8&255)/255,b=(hex&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
 const s=d===0?0:d/(1-Math.abs(2*l-1));let h=0;
 if(d)h=max===r?60*(((g-b)/d+6)%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
 if(l<.12)return 'preto';if(l>.85&&s<.25)return 'branco';if(s<.12)return 'cinza';
 if(h<12||h>=345)return 'vermelho';if(h<30)return l>.6?'salmão':'laranja';if(h>=40&&h<65)return 'amarelo';
 if(h>=70&&h<160)return l>.5?'verde claro':'verde';if(h>=190&&h<250)return l<.3?'azul escuro':l>.6?'azul claro':'azul';
 if(h>=300)return 'rosa';return `?${Math.round(h)}`;
}
assert.equal(FUSCA_CHOICES.length,15);assert.equal(new Set(FUSCA_CHOICES.map(e=>e.number)).size,15);
assert.deepEqual(FUSCA_CHOICES.map(e=>[e.number,e.shortName,colourName(e.color),colourName(e.stripe)]),LIST);
assert.deepEqual(FUSCA_CHOICES.map(e=>e.rank),LIST.map((_,i)=>i+1));
assert.equal(carEntry('4','fusca').graphic,'raio','Benício: the lightning bolt');assert(FUSCA_CHOICES.every(e=>e.number==='4'||!e.graphic));
// On the dark track map every car reads: a black car by its fenders, an all-black one in light grey.
for(const e of FUSCA_CHOICES)assert(luminance(e.mark)>.15,`#${e.number} on the map`);
assert.equal(carEntry('9','fusca').mark,0xb5bbc4);assert.equal(carEntry('3','fusca').mark,carEntry('3','fusca').stripe);

// The pace follows the top 15: the Fácil rating falls with every place, the harder levels' skill never rises, from
// Fischer's 10 to Robertão's 5; errors and a personality for each, a style at every level.
for(let i=1;i<15;i++){assert(FUSCA_CHOICES[i].rating<FUSCA_CHOICES[i-1].rating,`rating ${i}`);assert(FUSCA_CHOICES[i].skill<=FUSCA_CHOICES[i-1].skill,`skill ${i}`);}
assert.equal(carEntry('20','fusca').skill,10);assert.equal(carEntry('49','fusca').skill,5);
for(const e of FUSCA_CHOICES){
 assert(e.rating>=.3&&e.rating<=.95&&e.level>=70&&e.level<=98&&e.errors>=1&&e.errors<=3&&e.styleIndex>=0&&e.styleIndex<=4,`#${e.number}`);
 assert(['Super','Light','Sênior'].includes(e.category)&&e.points>0,`#${e.number} class`);
 for(const level of AI_LEVELS){const s=styleForLevel(e,level);assert(Number.isFinite(s.cornerGrip)&&Number.isFinite(s.braking)&&Number.isFinite(levelRating(e,level)),`#${e.number} ${level}`);}
}

// The field: 14 rivals, the 99 being Cristiano's; the player's car taken, the 99 in its seat.
assert.equal(FUSCA_99_RIVAL.name,'Cristiano Canto');assert.equal(FUSCA_ROSTER.length,14);assert(!FUSCA_ROSTER.includes(FUSCA_99_RIVAL));
assert.equal(rosterOf('fusca').rivals,FUSCA_ROSTER);assert.equal(rosterOf('kombi').rivals,RIVAL_ROSTER);
assert.equal(carEntry('99','fusca'),FUSCA_99_RIVAL);assert.equal(rivalEntry('99','fusca'),null);
assert.equal(fieldRoster('99','fusca'),FUSCA_ROSTER);assert.equal(fieldRoster('73','fusca'),FUSCA_ROSTER,'an Opala number is no Fusca');
for(const car of FUSCA_ROSTER.map(e=>e.number)){
 const field=fieldRoster(car,'fusca'),i=FUSCA_ROSTER.findIndex(e=>e.number===car);
 assert.equal(field[i],FUSCA_99_RIVAL);assert(field.every((e,k)=>k===i||e===FUSCA_ROSTER[k]));
}
// The 1x1: Fischer unless picked; the taken car's own driver gives the 99; an Opala number the default.
assert.equal(duelDefault('fusca'),'20');assert.equal(duelRivalFor('99','20','fusca'),'20');assert.equal(duelRivalFor('20','20','fusca'),'99');
assert.equal(duelRivalFor('99','73','fusca'),'20');assert.equal(duelRivalFor('33','49','fusca'),'49');

// The Opala's field as it was: the Old Stock drivers, the 99 Stevan Gaipo's; shared numbers stay apart.
assert.equal(fieldRoster('99'),RIVAL_ROSTER);assert.equal(carEntry('99'),OPALA_99_RIVAL);assert.equal(CAR_CHOICES[0],OPALA_99_RIVAL);
assert.equal(carEntry('9').shortName,'Marco Maragno');assert.equal(carEntry('9','fusca').shortName,'Marcos Fortuna');
assert.equal(duelRivalFor('99','73'),'73');assert.equal(duelRivalFor('99','20'),'73','a Fusca number is no Opala');

// A championship: the Copa Fusca's standings are its drivers (from the start); a save from when the cup raced the
// Old Stock's drivers in Fuscas starts again; another calendar keeps the model it started in.
{
 const storage=memory(),cup=new Championship(storage,'corrida','copafusca2026');
 assert.equal(cup.model,'fusca');
 const names=cup.standings().filter(d=>!d.player).map(d=>d.number).sort();assert.deepEqual(names,FUSCA_ROSTER.map(e=>e.number).sort());
 if(cup.available){
  cup.start('Ana',3,'opala');assert.equal(cup.state.model,'fusca','the cup races Fuscas whatever the tab');
  const rows=[...fieldRoster('33','fusca').map(e=>({number:e.number,name:e.name,bestLap:130,totalTime:400,finished:true})),{number:'33',name:'Ana',bestLap:131,totalTime:401,finished:true,player:true}];
  assert(cup.record(0,COPA_FUSCA_2026[0].circuit,rows,'Ana'));
  const table=cup.standings();assert.equal(table[0].number,'20');assert.equal(table[0].shortName,'Arthur Fischer');
  assert(table.some(d=>d.number==='99'&&d.shortName==='Cristiano'),'Cristiano scores in the 99');assert(table.some(d=>d.number==='33'&&!d.player&&d.points===0),'Moraes sat it out');
  assert.equal(new Championship(storage,'corrida','copafusca2026').state.results.length,1,'kept');
 }
 const old={version:1,mode:'corrida',calendar:'copafusca2026',pilot:'Ana',laps:3,rounds:COPA_FUSCA_2026.map(r=>r.circuit),results:[{circuit:COPA_FUSCA_2026[0].circuit,laps:3,rows:[{number:'73',name:'Konrad Viehmann',position:1,points:25},{number:'99',name:'Ana',position:2,points:20,player:true}]}]};
 storage.setItem(championshipKey('corrida','copafusca2026'),JSON.stringify(old));
 assert.equal(new Championship(storage,'corrida','copafusca2026').state,null,'the Old Stock drivers in a Copa Fusca start again');
 const all=new Championship(storage,'corrida','todas');all.preferredModel='fusca';assert.equal(all.model,'fusca');
 assert(all.standings().some(d=>d.number==='20'&&d.shortName==='Arthur Fischer'));
 all.start('Ana',3,'fusca');all.preferredModel='opala';assert.equal(all.model,'fusca','started in Fuscas, stays in them');
 const again=new Championship(storage,'corrida','todas');assert.equal(again.model,'fusca');
 const story=new Championship(storage,'historia','todas');story.start('Ana',3);assert.equal(story.model,'opala');
 assert(story.standings().some(d=>d.number==='73'));
}

// Two laps of the cup at Interlagos, the player in Moraes's #33 (parked off the grid's path): the 99 in his seat,
// everyone at the flag, the top five of the list ahead of the last five on average.
{
 const data=interlagos,player=new TestCar(data).setBody(FUSCA_BODY);player.resetGrid(playerGridSlot());
 const field=new RaceField(data,{seed:7,roster:fieldRoster('33','fusca'),body:FUSCA_BODY});field.reset(player.surface.s,{grid:true});
 const seat=FUSCA_ROSTER.findIndex(e=>e.number==='33');assert.equal(field.rivals[seat].entry,FUSCA_99_RIVAL);
 for(const r of field.rivals)r.car.awaitingStart=false;
 player.x+=player.surface.lx*30;player.y+=player.surface.ly*30;player.surface=player.sample(player.x,player.y);
 let steps=0;while(steps<120*420&&field.rivals.some(r=>!r.finished&&!r.retired)){field.step(player,1/120,2);steps++;}
 const order=[...field.rivals].sort((a,b)=>(a.finishTime??Infinity)-(b.finishTime??Infinity));
 assert(order.every(r=>r.finished),'all at the flag');
 const place=number=>order.findIndex(r=>r.entry.number===number)+1,mean=list=>list.reduce((a,n)=>a+place(n),0)/list.length;
 const top=['20','86','77','29','18'],low=['11','4','9','79','49'];
 assert(mean(top)<mean(low),`top five ${mean(top)} vs last five ${mean(low)}`);
 report.race={seconds:+(steps/120).toFixed(1),order:order.map(r=>r.entry.number),fastest:+Math.min(...field.rivals.map(r=>r.car.best??Infinity)).toFixed(2),cristiano:place('99')};
}
console.log(JSON.stringify(report));
console.log('testar_grid_fusca: ok');
