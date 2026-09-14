import {CIRCUITS,circuitId} from './circuits.js';
import {PLAYER_ENTRY} from './race-roster.js';
export const formatTime=value=>Number.isFinite(value)&&value>0?`${String(Math.floor(value/60)).padStart(2,'0')}:${(value%60).toFixed(3).padStart(6,'0')}`:'—';
export function resultRows(mode){
 const rows=(mode.freeOrder??[]).map(entry=>({...entry}));
 rows.splice(Math.max(0,(mode.finishPosition??mode.freePosition)-1),0,{...PLAYER_ENTRY,name:mode.pilotName||PLAYER_ENTRY.name,bestLap:mode.finishBest,totalTime:mode.finishTime,finished:true,player:true});
 return rows.map((row,index)=>({...row,position:index+1}));
}
export class RaceResults {
 constructor({onRestart,onSettings,onRecords,onMainMenu}){
  this.root=document.createElement('section');this.root.id='raceResults';this.root.hidden=true;this.root.setAttribute('aria-label','Resultado Auto-Pobre Racing');
  this.root.innerHTML=`<div class="results-sheet"><div class="results-top"><div><span class="results-kicker">AUTO-POBRE RACING</span><h1>RESULTADO DA CORRIDA</h1><p class="results-circuit"><b id="resultsCircuit">INTERLAGOS</b> <span id="resultsMode"></span></p></div><img src="./assets/abertura/logo_auto_pobre_racing.png" alt="Auto-Pobre Racing" width="1774" height="887"></div><div class="results-summary"><strong id="resultsPlace"></strong><span id="resultsTime"></span><span id="resultsFastest"></span></div><div class="results-scroll"><table class="results-table"><thead><tr><th scope="col">POS</th><th scope="col">Nº</th><th scope="col">PILOTO / DUPLA</th><th scope="col">MELHOR VOLTA</th><th scope="col">TEMPO TOTAL</th></tr></thead><tbody></tbody></table></div><p class="results-footnote">Tempos registrados na sua bandeirada. — indica que ainda não houve volta válida; “na pista” indica quem ainda não terminou.</p><div class="results-actions"><button id="resultsContinue" class="results-primary">Correr novamente →</button><button id="resultsRecords">Recordes de tempo</button><button id="resultsSettings">Configurações</button></div><div id="resultsRecordsPanel" hidden></div></div>`;
  const mainMenu=document.createElement('button');mainMenu.id='resultsMainMenu';mainMenu.textContent='Voltar ao menu principal';mainMenu.onclick=onMainMenu;this.root.querySelector('.results-actions').insertBefore(mainMenu,this.root.querySelector('#resultsRecords'));
  document.body.append(this.root);this.root.querySelector('#resultsContinue').onclick=()=>{if(this.mode.active){this.dismissed=true;this.root.hidden=true;}else onRestart();};this.root.querySelector('#resultsSettings').onclick=onSettings;this.root.querySelector('#resultsRecords').onclick=()=>onRecords(this.mode);
 }
 update(mode,paused,settingsOpen){
  this.mode=mode;
  if(this.snapshot!==mode.freeOrder){this.snapshot=mode.freeOrder;this.dismissed=false;this.rendered=false;}
  const ready=mode.active?mode.state.phase==='podium':mode.freeResultReady&&paused;
  this.root.hidden=!(ready&&this.snapshot&&!this.dismissed&&!settingsOpen);
  if(!this.root.hidden&&!this.rendered){this.render(mode);this.rendered=true;}
 }
 render(mode){
  const rows=resultRows(mode),best=rows.filter(r=>Number.isFinite(r.bestLap)&&r.bestLap>0).sort((a,b)=>a.bestLap-b.bestLap)[0];this.rows=rows;
  const $=id=>this.root.querySelector('#'+id);
  $('resultsCircuit').textContent=CIRCUITS[circuitId(mode.data?.meta.id)].name.toUpperCase();
  $('resultsMode').textContent=`/ ${mode.active?'IMERSIVA · 1 VOLTA':'CORRIDA · 3 VOLTAS'}`;
  $('resultsPlace').textContent=`VOCÊ CHEGOU EM ${mode.finishPosition}º / ${rows.length}`;
  $('resultsTime').textContent=`TOTAL ${formatTime(mode.finishTime)}`;
  $('resultsFastest').textContent=best?`VOLTA MAIS RÁPIDA · #${best.number} · ${formatTime(best.bestLap)}`:'VOLTA MAIS RÁPIDA · —';
  $('resultsContinue').textContent=mode.active?'Continuar para o pódio →':'Correr novamente →';
  const body=this.root.querySelector('tbody');body.replaceChildren();
  for(const row of rows){const tr=document.createElement('tr');if(row.player)tr.classList.add('results-player');
   const values=[`${row.position}º`,row.number,row.name+(row.player?' · VOCÊ':''),formatTime(row.bestLap),row.finished?formatTime(row.totalTime):'NA PISTA'];
   values.forEach((value,i)=>{const cell=document.createElement(i===2?'th':'td');if(i===2)cell.scope='row';cell.textContent=value;if(i===3&&best&&row.number===best.number)cell.className='results-best';tr.append(cell);});body.append(tr);
  }
 }
}
