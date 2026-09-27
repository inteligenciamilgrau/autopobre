// Rival racecraft: racing line, pit-wall margins, seeded grids, tow, and full races on both circuits.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar} from '../teste/physics.js';
import {RaceField,racingLine,ACE_STYLE} from '../teste/race-field.js';
import {RIVAL_ROSTER,ACE_NUMBER} from '../teste/race-roster.js';
import {pitGeometry,wallContact} from '../teste/pit-lane.js';
import {createCurveloData} from '../teste/curvelo-data.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));data.meta.id='interlagos';
const a=data.samples,n=a.length,line=racingLine(data);

// The line uses the road: outside-inside-outside, bounded by the asphalt, far less bent than the centreline.
assert(line.off.every((d,i)=>d>=line.lo[i]-1e-9&&d<=line.hi[i]+1e-9),'racing line stays inside its bounds');
assert(line.off.every((d,i)=>Math.abs(d)<a[i][4]/2-.8),'racing line keeps the car body on the asphalt');
assert(line.off.filter((d,i)=>Math.abs(d)>.7*(a[i][4]/2)).length>n*.2,'racing line reaches the edges through the corners');
// Hairpins gain little, but the faster corners open up (Sol, Descida do Lago, Junção).
const tightest=(k,c)=>{let m=0;for(let j=-40;j<=40;j++)m=Math.max(m,Math.abs(k[(c.apex+j+n)%n]));return 1/m;};
assert(line.corners.filter(c=>tightest(line.curve,c)>1.15*tightest(line.centre,c)).length>=4,'racing line opens the faster corners');
assert(line.corners.length>=8&&line.corners.length<=12,'Interlagos reads as its named corners, not curvature noise');
// Beside the pit exit wall the line and the passing lanes leave the car body 40 cm of air.
const geo=pitGeometry(data);
for(let i=0;i<n;i++){const p=a[i],heading=Math.atan2(p[8],p[7]);for(const d of [line.hi[i],line.laneHi[i],line.lo[i],line.laneLo[i]])assert(!wallContact(geo,p[1]+p[9]*d,p[2]+p[10]*d,heading),`no wall at s ${p[0].toFixed(0)} offset ${d.toFixed(2)}`);}

// A seed replays a race; different seeds give different qualifying grids and personalities.
const grid=seed=>new RaceField(data,{seed}).rivals.map(r=>r.slot).join(',');
assert.equal(grid(7),grid(7));
assert(new Set([1,2,3,4,5].map(grid)).size>=4,'qualifying shuffles the grid between races');
const unseeded=new RaceField(data);unseeded.reset(0);const first=unseeded.raceSeed;unseeded.reset(0);assert.notEqual(unseeded.raceSeed,first,'each game start draws a new race');

// The tow: less air in a wake means more speed at the end of a straight.
function straight(draft){const c=new TestCar(data);c.pitGeo=null;c.sample=()=>({i:0,u:0,s:500,d:0,z:0,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:true});c.reset();c.x=c.y=c.heading=0;c.surface=c.sample();c.vx=42;
 for(let i=0;i<120*6;i++){c.draft=draft;c.step({throttle:1,brake:0,left:0,right:0,reverse:0,handbrake:0},1/120);}return c.vx;}
assert(straight(.3)>straight(0)+1,'slipstream adds speed on a straight');

// Full races: everyone finishes, the field spreads, rivals tow, attack, defend and rarely collide.
function race(circuit,seed){
 const player=new TestCar(circuit);player.resetGrid();const field=new RaceField(circuit,{seed});field.reset(player.surface.s,{grid:true});
 player.x=10000;player.y=10000;player.surface=player.sample(player.x,player.y);
 const modes=new Set();let peak=0,draft=0,steps=0,offroad=0;
 while(field.rivals.some(r=>!r.finished)&&steps<120*900){
  field.step(player,1/120,3);steps++;
  for(const r of field.rivals){modes.add(r.mode);peak=Math.max(peak,Math.hypot(r.car.vx,r.car.vy)*3.6);draft=Math.max(draft,r.tow);if(!r.car.surface.onRoad)offroad++;}
 }
 const best=field.rivals.map(r=>r.car.best);
 return {finished:field.rivals.every(r=>r.finished),best:[Math.min(...best),Math.max(...best)],peak,draft,modes:[...modes],collisions:field.collisions,passes:field.rivals.reduce((s,r)=>s+r.passes,0),offroad:offroad/(steps*field.rivals.length),seconds:steps/120};
}
const interlagos=race(data,1),curvelo=race((()=>{const c=createCurveloData();c.meta.id='curvelo';return c;})(),1);
for(const [name,r] of [['interlagos',interlagos],['curvelo',curvelo]]){
 assert(r.finished,name+': all fourteen rivals finish three laps');
 assert(r.best[1]-r.best[0]>1,name+': lap times differ between drivers');
 assert(r.modes.includes('pass'),name+': rivals attack');
 assert(r.draft>.1,name+': rivals run in each other\'s tow');
 assert(r.offroad<.02,name+': rivals stay on the asphalt');
 assert(r.collisions<40,name+': contact happens, but not constantly');
}
assert(interlagos.modes.includes('defend'),'rivals cover the inside when attacked');
assert(interlagos.best[0]>113&&interlagos.best[1]<140,'Interlagos pace sits between the car limit and the old convoy');
assert(interlagos.peak>190,'no artificial speed limiter on the straights');

// Recon lap: the Opala 99 races with the same racecraft (heroInput) from the back of the grid,
// passes cars and finishes near the front, on the asphalt and off the walls. Its own dice leave
// the rivals' seeded race exactly as it is.
function heroRace(seed){
 const car=new TestCar(data);car.resetGrid();const field=new RaceField(data,{seed});field.reset(car.surface.s,{grid:true});
 let offroad=0,walls=0,steps=0,position=null;
 for(;steps<120*480&&position===null;steps++){
  car.step(field.heroInput(car,1/120),1/120);if(car.wallImpactSpeed>4)walls++;field.step(car,1/120,3);if(!car.surface.onRoad)offroad++;
  if(car.laps>=3)position=1+field.rivals.filter(r=>r.finished).length;
 }
 return {position,best:car.best,offroad:offroad/steps,walls,passes:field.hero.passes};
}
const hero=heroRace(5);
assert(hero.position!==null&&hero.position<=6,'the recon driver finishes three laps in the top six from the back');
assert(hero.passes>=3&&hero.walls===0&&hero.offroad<.005,'the recon driver passes cleanly, on the asphalt');
assert(hero.best<122,'the recon driver laps near the front-runners\' pace');
// "Koyzinho Indestrutível" (the race option, RaceField ace): off by default, Koyzinho keeps his own
// style. On, he is the ace: last rival slot on every grid, just ahead of the player; alone at
// Interlagos well under the player's well-driven 1:53, with no unforced errors; from the back he
// wins a seeded race cleanly, and contacts never stun him.
assert.equal(RIVAL_ROSTER.find(e=>e.number===ACE_NUMBER)?.shortName,'Koyzinho Bechtold');
assert(new RaceField(data,{seed:1}).rivals.every(r=>!r.style.ace),'off by default: no ace in the field');
const aceOf=f=>f.rivals.find(q=>q.entry.number===ACE_NUMBER);
for(const seed of [1,2,3,4,5]){const f=new RaceField(data,{seed,ace:true});f.reset(0,{grid:true});const r=aceOf(f);assert.equal(r.slot,RIVAL_ROSTER.length-1,'the ace starts from the last rival slot');assert.equal(r.style,ACE_STYLE);assert.equal(Math.min(...f.rivals.map(q=>q.progress)),r.progress,'nobody but the player starts behind the ace');}
function aceSolo(){
 const player=new TestCar(data);player.resetGrid();const f=new RaceField(data,{seed:1,ace:true});f.reset(player.surface.s,{grid:true});player.x=player.y=10000;player.surface=player.sample(player.x,player.y);
 const r=aceOf(f);f.rivals=[r];let offroad=0,steps=0;
 while(!r.finished&&steps<120*300){f.step(player,1/120,2);steps++;if(!r.car.surface.onRoad)offroad++;}
 return {best:r.car.best,offroad,mistakes:r.mistakes};
}
const aceAlone=aceSolo();
assert(aceAlone.best<112.5&&aceAlone.offroad===0&&aceAlone.mistakes===0,'the ace laps Interlagos alone under 1:52.5, on the asphalt, without errors');
function aceRace(seed){
 const player=new TestCar(data);player.resetGrid();const f=new RaceField(data,{seed,ace:true});f.reset(player.surface.s,{grid:true});player.x=player.y=10000;player.surface=player.sample(player.x,player.y);
 const r=aceOf(f);let offroad=0,walls=0,stun=0,steps=0;
 while(f.rivals.some(q=>!q.finished)&&steps<120*900){f.step(player,1/120,3);steps++;if(!r.car.surface.onRoad)offroad++;if(r.car.wallImpactSpeed>2)walls++;stun=Math.max(stun,r.stun);}
 const order=f.rivals.filter(q=>q.finished).sort((a,b)=>a.finishTime-b.finishTime);
 return {position:order.indexOf(r)+1,best:r.car.best,offroad,walls,stun};
}
const ace=aceRace(4);
assert(ace.position===1&&ace.offroad===0&&ace.walls===0,'from the back of the grid the ace wins, on the asphalt and off the walls');
assert.equal(ace.stun,0,'contacts never stun the ace');
console.log(JSON.stringify({passed:true,interlagos,curvelo,hero,aceAlone,ace},null,1));
