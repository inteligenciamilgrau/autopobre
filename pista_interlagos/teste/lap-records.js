import {CIRCUITS,circuitId} from './circuits.js';
import {readAIRecords} from './ai-records.js';
import {formatTime} from './race-results.js';
const KEY='autopobre-records-v1';
const validTime=t=>Number.isFinite(t)&&t>0&&t<86400;
export const cleanName=name=>String(name??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,32);
export function readRecords(storage){
 try{const data=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(r=>r&&typeof r.name==='string'&&['normal','immersive'].includes(r.mode)&&cleanName(r.name)&&validTime(r.bestLap)&&(r.bestRace===null||validTime(r.bestRace)&&r.bestLap<=r.bestRace)).slice(0,200).map(r=>({circuit:circuitId(r.circuit),name:cleanName(r.name),mode:r.mode,bestLap:r.bestLap,bestRace:r.bestRace,date:typeof r.date==='string'?r.date:''})):[];}catch{return [];}
}
export function saveRecord(storage,{name,mode,bestLap,bestRace=null,circuit='interlagos'}){
 if(typeof circuit!=='string'||!Object.hasOwn(CIRCUITS,circuit))throw new Error('Circuito inválido.');
 name=cleanName(name);if(!name||!['normal','immersive'].includes(mode)||!validTime(bestLap)||(bestRace!==null&&(!validTime(bestRace)||bestLap>bestRace)))throw new Error('Informe o piloto e complete uma volta válida.');
 const rows=readRecords(storage),existing=rows.find(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
 if(existing){const lap=Math.min(existing.bestLap,bestLap),race=bestRace===null?existing.bestRace:existing.bestRace===null?bestRace:Math.min(existing.bestRace,bestRace);if(lap===existing.bestLap&&race===existing.bestRace)return rows;existing.bestLap=lap;existing.bestRace=race;existing.date=new Date().toISOString();}
 else rows.push({circuit,name,mode,bestLap,bestRace,date:new Date().toISOString()});
 const sorted=Object.keys(CIRCUITS).flatMap(id=>['normal','immersive'].flatMap(category=>rows.filter(r=>r.circuit===id&&r.mode===category).sort((a,b)=>a.bestLap-b.bestLap).slice(0,50)));
 if(!sorted.some(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new Error('A lista guarda os 50 melhores recordes. Esse tempo ficou fora da lista.');
 try{storage.setItem(KEY,JSON.stringify(sorted));}catch{throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está disponível.');}
 return sorted;
}
// Save synchronously at each new best lap, including unfinished races.
export class AutomaticRecords {
 constructor(storage){this.storage=storage;this.name='';this.signature='';this.retryAt=0;}
 start(name){this.name=cleanName(name);this.signature='';this.retryAt=0;}
 update(mode,now=Date.now()){
  if(!this.name||!mode||mode.recordAssisted)return;
  const bestLap=mode.car.best;if(!validTime(bestLap)||mode.car.laps<1)return;
  const completed=mode.car.laps>=(mode.active?1:mode.freeTotalLaps)&&validTime(mode.finishTime);
  const bestRace=completed?mode.finishTime:null,circuit=circuitId(mode.data?.meta.id),category=mode.active?'immersive':'normal';
  const signature=JSON.stringify([this.name,circuit,category,bestLap,bestRace]);
  if(signature===this.signature||now<this.retryAt)return;
  try{saveRecord(this.storage,{name:this.name,circuit,mode:category,bestLap,bestRace});this.signature=signature;this.retryAt=0;mode.recordSaveError='';}
  catch(error){mode.recordSaveError=error.message;this.retryAt=now+5000;}
 }
}
export const RECORD_VIEW_KEY='autopobre-record-view-v1';
function recordStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function readRecordView(storage){try{const v=JSON.parse(storage?.getItem(RECORD_VIEW_KEY)||'null');return v&&typeof v.circuit==='string'&&Object.hasOwn(CIRCUITS,v.circuit)&&['normal','immersive'].includes(v.mode)&&['human','ai','all'].includes(v.source)?{circuit:v.circuit,mode:v.mode,source:v.source}:null;}catch{return null;}}
export class LapRecords {
 constructor(circuit='interlagos',storage=recordStorage()){
  this.storage=storage;const view=readRecordView(storage);this.viewSaved=!!view;
  this.circuit=circuitId(circuit);this.selectedCircuit=view?.circuit??this.circuit;this.selectedMode=view?.mode??'normal';this.selectedSource=view?.source??'all';
  this.dialog=document.createElement('dialog');this.dialog.id='lapRecords';this.dialog.setAttribute('aria-labelledby','recordsTitle');this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="recordsTitle">RECORDES DE TEMPO</h2></div><button id="recordsClose" aria-label="Fechar recordes">✕</button></div><p id="recordCandidate" hidden></p><div class="records-filters"><fieldset id="recordsCircuit"><legend>AUTÓDROMO</legend><div class="records-mode-options"><button type="button" data-records-circuit="interlagos" aria-pressed="true">Interlagos <span>4.309 m</span></button><button type="button" data-records-circuit="curvelo" aria-pressed="false">Oval de Curvelo <span>1.250 m</span></button></div></fieldset><fieldset id="recordsMode"><legend>MODALIDADE</legend><div class="records-mode-options"><button type="button" data-records-mode="normal" aria-pressed="true">Corrida normal <span>3 voltas</span></button><button type="button" data-records-mode="immersive" aria-pressed="false">Imersiva <span>1 volta</span></button></div></fieldset><fieldset id="recordsSource"><legend>QUEM PILOTOU</legend><div class="records-source-options"><button type="button" data-records-source="all" aria-pressed="true">Todos</button><button type="button" data-records-source="human" aria-pressed="false" aria-label="Pessoas" title="Pessoas">🧑</button><button type="button" data-records-source="ai" aria-pressed="false" aria-label="Inteligência artificial" title="Inteligência artificial">🤖</button></div></fieldset></div><div class="records-list"><table><thead><tr><th>POS</th><th>PILOTO</th><th>MELHOR VOLTA</th><th>MELHOR CORRIDA</th></tr></thead><tbody></tbody></table><p id="recordsEmpty">O primeiro recorde pode ser seu. Complete uma volta válida para registrar seu tempo automaticamente.</p></div><p id="recordsSourceNote" class="records-note"></p><p id="recordsMessage" role="status"></p>`;
  document.body.append(this.dialog);const $=id=>this.dialog.querySelector('#'+id);$('recordsClose').onclick=()=>this.dialog.close();
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.onclick=()=>{this.selectedSource=button.dataset.recordsSource;this.saveView();this.render();};
  for(const button of this.dialog.querySelectorAll('[data-records-circuit]'))button.onclick=()=>{this.selectedCircuit=button.dataset.recordsCircuit;this.saveView();this.render();};
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.onclick=()=>{this.selectedMode=button.dataset.recordsMode;this.saveView();this.render();};

 }
 saveView(){this.viewSaved=true;try{this.storage?.setItem(RECORD_VIEW_KEY,JSON.stringify({circuit:this.selectedCircuit,mode:this.selectedMode,source:this.selectedSource}));}catch{}}
 open(mode=null){
  const $=id=>this.dialog.querySelector('#'+id);this.candidate=mode&&!mode.recordAssisted&&validTime(mode.finishBest)&&validTime(mode.finishTime)?{circuit:circuitId(mode.data?.meta.id),mode:mode.active?'immersive':'normal',bestLap:mode.finishBest,bestRace:mode.finishTime}:null;
  if(!this.viewSaved){this.selectedCircuit=this.candidate?.circuit??this.circuit;this.selectedMode=this.candidate?.mode??this.selectedMode;}
  $('recordCandidate').hidden=!this.candidate;$('recordsMessage').textContent=mode?.recordAssisted?'O reconhecimento automático não grava recordes. Faça uma corrida pilotando o Opala.':'';
  if(this.candidate){$('recordCandidate').textContent=`Piloto: ${mode.pilotName||'—'} · ${CIRCUITS[this.candidate.circuit].name} · Volta: ${formatTime(this.candidate.bestLap)} · Corrida: ${formatTime(this.candidate.bestRace)}`;}
  if(mode?.recordSaveError)$('recordsMessage').textContent=mode.recordSaveError;

  this.saveView();this.render();this.dialog.showModal();
 }
 render(){
  const storage=this.storage;
  let rows=this.selectedSource==='ai'?[]:readRecords(storage).map(r=>({...r,source:'human'}));
  if(this.selectedSource!=='human')rows.push(...readAIRecords(storage));
  for(const button of this.dialog.querySelectorAll('[data-records-source]'))button.setAttribute('aria-pressed',String(button.dataset.recordsSource===this.selectedSource));
  this.dialog.querySelector('#recordsSourceNote').textContent=this.selectedSource==='human'?'Pessoas: recordes salvos automaticamente neste navegador.':'Pessoas: recordes deste navegador. IA: tempos do jogo, não dos pilotos reais.';
  const mode=this.selectedMode;
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.setAttribute('aria-pressed',String(button.dataset.recordsMode===mode));
  for(const button of this.dialog.querySelectorAll('[data-records-circuit]'))button.setAttribute('aria-pressed',String(button.dataset.recordsCircuit===this.selectedCircuit));
  rows=rows.filter(r=>r.mode===mode&&r.circuit===this.selectedCircuit).sort((a,b)=>a.bestLap-b.bestLap);
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  rows.forEach((row,i)=>{const tr=document.createElement('tr');tr.dataset.source=row.source;for(const value of [`${i+1}º`,row.name,formatTime(row.bestLap),formatTime(row.bestRace)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}const badge=document.createElement('span');badge.className='record-source-badge';const label=row.source==='ai'?`Inteligência artificial · carro #${row.number}`:'Pessoa';badge.title=label;badge.setAttribute('role','img');badge.setAttribute('aria-label',label);badge.textContent=row.source==='ai'?`🤖 · #${row.number}`:'🧑';tr.children[1].append(badge);body.append(tr);});this.dialog.querySelector('#recordsEmpty').hidden=rows.length>0;
 }
}
