import {CIRCUITS} from './circuits.js';
import {RIVAL_ROSTER,PLAYER_ENTRY} from './race-roster.js';

// Campeonato Old Stock do jogo: todas as pistas, uma corrida única em cada, pontos pela
// posição de chegada e uma classificação geral com os 15 carros do grid. The table and the
// calendar are the game's own, not an official regulation. Progress lives in this browser.
export const CHAMPIONSHIP_ROUNDS=Object.freeze(['interlagos','cascavel','piracicaba','curvelo']);
// Every finishing position scores, so a comeback from the back still counts.
export const CHAMPIONSHIP_POINTS=Object.freeze([25,20,16,13,11,10,9,8,7,6,5,4,3,2,1]);
export const CHAMPIONSHIP_KEY='opala99-championship-v1';
export const pointsFor=position=>CHAMPIONSHIP_POINTS[position-1]??0;

const finite=value=>Number.isFinite(value)&&value>0?value:null;
const validRow=r=>r&&typeof r.number==='string'&&Number.isInteger(r.position)&&r.position>0&&Number.isFinite(r.points);
function validState(s){
 return !!s&&s.version===1&&Array.isArray(s.rounds)&&s.rounds.length===CHAMPIONSHIP_ROUNDS.length&&s.rounds.every((id,i)=>id===CHAMPIONSHIP_ROUNDS[i])
  &&Array.isArray(s.results)&&s.results.length<=s.rounds.length&&s.results.every((r,i)=>r&&r.circuit===s.rounds[i]&&Array.isArray(r.rows)&&r.rows.every(validRow))
  &&Number.isInteger(s.laps)&&s.laps>0;
}

// Overall standings: points, then wins, podiums, best finish and the last round's order.
export function championshipStandings(state){
 const drivers=new Map(),add=(number,name,shortName)=>{if(!drivers.has(number))drivers.set(number,{number,name,shortName:shortName??name,points:0,wins:0,podiums:0,best:Infinity,rounds:[],player:false});return drivers.get(number);};
 for(const entry of RIVAL_ROSTER)add(entry.number,entry.name,entry.shortName);
 const player=add(PLAYER_ENTRY.number,state?.pilot||PLAYER_ENTRY.name,state?.pilot||PLAYER_ENTRY.shortName);player.player=true;
 for(const [k,round] of (state?.results??[]).entries())for(const r of round.rows){
  const d=add(r.number,r.name,r.name);d.points+=r.points;if(r.position===1)d.wins++;if(r.position<=3)d.podiums++;d.best=Math.min(d.best,r.position);d.rounds[k]={position:r.position,points:r.points};
 }
 const last=d=>d.rounds.at(-1)?.position??Infinity;
 return [...drivers.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||b.podiums-a.podiums||a.best-b.best||last(a)-last(b)||a.number.localeCompare(b.number,'pt-BR',{numeric:true}))
  .map((d,i)=>({...d,position:i+1}));
}

export class Championship {
 constructor(storage=null){this.storage=storage;this.state=this.load();}
 load(){try{const s=JSON.parse(this.storage?.getItem(CHAMPIONSHIP_KEY)||'null');return validState(s)?s:null;}catch{return null;}}
 save(){try{if(this.state)this.storage?.setItem(CHAMPIONSHIP_KEY,JSON.stringify(this.state));else this.storage?.removeItem(CHAMPIONSHIP_KEY);}catch{}}
 get started(){return !!this.state;}
 get finished(){return !!this.state&&this.state.results.length>=this.state.rounds.length;}
 get active(){return !!this.state&&!this.finished;}
 // Index of the round still to be raced (equals the number of rounds already scored).
 get round(){return this.state?.results.length??0;}
 get total(){return CHAMPIONSHIP_ROUNDS.length;}
 get nextCircuit(){return this.active?this.state.rounds[this.round]:null;}
 get laps(){return this.state?.laps??null;}
 start(pilot,laps){this.state={version:1,pilot,laps,rounds:[...CHAMPIONSHIP_ROUNDS],results:[],started:new Date().toISOString()};this.save();return this.state;}
 reset(){this.state=null;this.save();}
 // Scores a finished race (rows in finishing order, as in race-results.js resultRows) once:
 // only the round due, at its circuit. Returns the summary shown on the result sheet.
 record(round,circuit,rows,pilot){
  if(!this.active||round!==this.round||circuit!==this.nextCircuit||!rows?.length)return null;
  if(pilot)this.state.pilot=pilot;
  const scored=rows.map((r,i)=>({number:String(r.number),name:r.player?(pilot||r.name):r.name,position:i+1,points:pointsFor(i+1),bestLap:finite(r.bestLap),totalTime:r.finished?finite(r.totalTime):null,finished:!!r.finished,player:!!r.player}));
  this.state.results.push({circuit,laps:this.state.laps,rows:scored,date:new Date().toISOString()});this.save();
  return this.summary(round);
 }
 standings(){return championshipStandings(this.state);}
 // What a scored round meant: its points, the standings after it and what comes next.
 summary(round=this.round-1){
  const result=this.state?.results[round];if(!result)return null;
  const standings=this.standings(),player=standings.find(d=>d.player),next=this.nextCircuit;
  return {round:round+1,total:this.total,circuit:result.circuit,circuitName:CIRCUITS[result.circuit].name,rows:result.rows,
   points:new Map(result.rows.map(r=>[r.number,r.points])),standings,player,final:this.finished,next,nextName:next?CIRCUITS[next].name:null,champion:this.finished?standings[0]:null};
 }
}
