// Championship (teste/championship.js): points, round order, persistence and standings.
import assert from 'node:assert/strict';
import {Championship,CHAMPIONSHIP_ROUNDS,CHAMPIONSHIP_POINTS,CHAMPIONSHIP_KEY,pointsFor,championshipStandings} from '../teste/championship.js';
import {RIVAL_ROSTER} from '../teste/race-roster.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};};
// A finishing order with the player (#99) at `place` (1-based), rivals in roster order.
const order=(place,rotate=0)=>{const rivals=RIVAL_ROSTER.map((e,i)=>RIVAL_ROSTER[(i+rotate)%RIVAL_ROSTER.length]).map(e=>({number:e.number,name:e.name,bestLap:80,totalTime:250,finished:true}));
 rivals.splice(place-1,0,{number:'99',name:'Piloto',player:true,bestLap:79,totalTime:249,finished:true});return rivals;};

assert.deepEqual(CHAMPIONSHIP_ROUNDS,['interlagos','cascavel','piracicaba','curvelo']);
assert.equal(CHAMPIONSHIP_POINTS.length,15,'every finisher of the 15-car grid scores');
assert.equal(pointsFor(1),25);assert.equal(pointsFor(15),1);assert.equal(pointsFor(16),0);
assert(CHAMPIONSHIP_POINTS.every((p,i)=>i===0||p<CHAMPIONSHIP_POINTS[i-1]),'points fall with the position');

const storage=memory(),champ=new Championship(storage);
assert(!champ.started&&!champ.active&&champ.nextCircuit===null);
champ.start('Ana',3);
assert(champ.active&&champ.round===0&&champ.nextCircuit==='interlagos'&&champ.laps===3);
// Only the round due, at its own circuit, is scored.
assert.equal(champ.record(1,'cascavel',order(1),'Ana'),null);
assert.equal(champ.record(0,'cascavel',order(1),'Ana'),null);
const s1=champ.record(0,'interlagos',order(3),'Ana');
assert(s1&&s1.round===1&&s1.total===4&&!s1.final&&s1.next==='cascavel'&&s1.nextName==='Cascavel');
assert.equal(s1.points.get('99'),16,'third place scores 16');
assert.equal(s1.player.points,16);assert.equal(s1.standings[0].number,RIVAL_ROSTER[0].number);assert.equal(s1.standings[0].points,25);
assert.equal(champ.record(0,'interlagos',order(1),'Ana'),null,'a round is scored once');
// Persistence: a new instance on the same storage resumes at round 2.
const again=new Championship(storage);assert(again.active&&again.round===1&&again.nextCircuit==='cascavel');
// Broken or tampered saves are ignored.
for(const bad of ['{',JSON.stringify({version:1,rounds:['interlagos'],results:[],laps:3}),JSON.stringify({version:1,rounds:CHAMPIONSHIP_ROUNDS,results:[{circuit:'curvelo',rows:[]}],laps:3})]){
 const s=memory();s.setItem(CHAMPIONSHIP_KEY,bad);assert.equal(new Championship(s).state,null,bad.slice(0,40));
}
// Three more rounds: the player wins them all and takes the title (25*3+16 = 91).
again.record(1,'cascavel',order(1,1),'Ana');again.record(2,'piracicaba',order(1,2),'Ana');
const last=again.record(3,'curvelo',order(1,3),'Ana');
assert(last.final&&again.finished&&!again.active&&again.nextCircuit===null&&last.next===null);
assert.equal(last.player.points,91);assert.equal(last.champion.number,'99');assert.equal(last.player.position,1);assert.equal(last.player.wins,3);
const table=again.standings();
assert.equal(table.length,15);assert(table.every((d,i)=>d.position===i+1));
assert(table.every((d,i)=>i===0||d.points<=table[i-1].points),'standings sorted by points');
assert.deepEqual(table.find(d=>d.player).rounds.map(r=>r.position),[3,1,1,1]);
// Ties: equal points (30 each) go to the driver with more wins.
const tie=championshipStandings({pilot:'X',results:[
 {circuit:'interlagos',rows:[{number:'73',name:'A',position:1,points:25},{number:'00',name:'B',position:2,points:20}]},
 {circuit:'cascavel',rows:[{number:'00',name:'B',position:6,points:10},{number:'73',name:'A',position:11,points:5}]}]});
assert.equal(tie[0].points,30);assert.equal(tie[1].points,30);assert.equal(tie[0].number,'73','same points: more wins first');
again.reset();assert(!again.started);assert.equal(storage.getItem(CHAMPIONSHIP_KEY),null);
console.log(JSON.stringify({passed:true,rounds:CHAMPIONSHIP_ROUNDS,points:CHAMPIONSHIP_POINTS,champion:last.champion.number,championPoints:last.player.points}));
