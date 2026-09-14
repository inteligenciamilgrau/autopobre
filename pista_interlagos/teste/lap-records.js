import {CIRCUITS,circuitId} from './circuits.js';
import {formatTime} from './race-results.js';
const KEY='autopobre-records-v1';
const validTime=t=>Number.isFinite(t)&&t>0&&t<86400;
const cleanName=name=>String(name??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,32);
export function readRecords(storage){
 try{const data=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(r=>r&&typeof r.name==='string'&&['normal','immersive'].includes(r.mode)&&cleanName(r.name)&&validTime(r.bestLap)&&validTime(r.bestRace)&&r.bestLap<=r.bestRace).slice(0,200).map(r=>({circuit:circuitId(r.circuit),name:cleanName(r.name),mode:r.mode,bestLap:r.bestLap,bestRace:r.bestRace,date:typeof r.date==='string'?r.date:''})):[];}catch{return [];}
}
export function saveRecord(storage,{name,mode,bestLap,bestRace,circuit='interlagos'}){
 if(typeof circuit!=='string'||!Object.hasOwn(CIRCUITS,circuit))throw new Error('Circuito inválido.');
 name=cleanName(name);if(!name||!['normal','immersive'].includes(mode)||!validTime(bestLap)||!validTime(bestRace)||bestLap>bestRace)throw new Error('Preencha seu nome e conclua uma corrida com volta válida.');
 const rows=readRecords(storage),existing=rows.find(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
 if(existing){existing.bestLap=Math.min(existing.bestLap,bestLap);existing.bestRace=Math.min(existing.bestRace,bestRace);existing.date=new Date().toISOString();}
 else rows.push({circuit,name,mode,bestLap,bestRace,date:new Date().toISOString()});
 const sorted=Object.keys(CIRCUITS).flatMap(id=>['normal','immersive'].flatMap(category=>rows.filter(r=>r.circuit===id&&r.mode===category).sort((a,b)=>a.bestLap-b.bestLap).slice(0,50)));
 if(!sorted.some(r=>r.circuit===circuit&&r.mode===mode&&r.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new Error('A lista guarda os 50 melhores recordes. Esse tempo ficou fora da lista.');
 try{storage.setItem(KEY,JSON.stringify(sorted));}catch{throw new Error('Não foi possível salvar neste navegador. Verifique se o armazenamento está disponível.');}
 return sorted;
}
export class LapRecords {
 constructor(circuit='interlagos'){
  this.circuit=circuitId(circuit);this.selectedMode='normal';
  this.dialog=document.createElement('dialog');this.dialog.id='lapRecords';this.dialog.setAttribute('aria-labelledby','recordsTitle');this.dialog.innerHTML=`<div class="records-head"><div><span>AUTO-POBRE RACING</span><h2 id="recordsTitle">RECORDES DE TEMPO</h2></div><button id="recordsClose" aria-label="Fechar recordes">✕</button></div><p class="records-note">Salvos neste navegador. Use seu nome para disputar o melhor tempo neste aparelho.</p><form id="recordForm" hidden><div><label for="recordName">NOME DO JOGADOR</label><input id="recordName" maxlength="32" autocomplete="nickname" required placeholder="Como você aparece no ranking?"></div><p id="recordCandidate"></p><button class="results-primary" type="submit">Gravar meu tempo</button></form><label class="records-filter">CIRCUITO <select id="recordsCircuit"><option value="interlagos">Interlagos · 4.309 m</option><option value="curvelo">Oval de Curvelo · 1.250 m</option></select></label><fieldset id="recordsMode"><legend>MODALIDADE</legend><div class="records-mode-options"><button type="button" data-records-mode="normal" aria-pressed="true">Corrida normal <span>3 voltas</span></button><button type="button" data-records-mode="immersive" aria-pressed="false">Imersiva <span>1 volta</span></button></div></fieldset><div class="records-list"><table><thead><tr><th>POS</th><th>JOGADOR</th><th>MELHOR VOLTA</th><th>MELHOR CORRIDA</th></tr></thead><tbody></tbody></table><p id="recordsEmpty">O primeiro recorde pode ser seu. Termine uma corrida e grave seu tempo.</p></div><p id="recordsMessage" role="status"></p>`;
  document.body.append(this.dialog);const $=id=>this.dialog.querySelector('#'+id);$('recordsClose').onclick=()=>this.dialog.close();$('recordsCircuit').onchange=()=>this.render();
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.onclick=()=>{this.selectedMode=button.dataset.recordsMode;this.render();};
  $('recordForm').onsubmit=e=>{e.preventDefault();if(!this.candidate)return;try{saveRecord(localStorage,{...this.candidate,name:$('recordName').value});try{localStorage.setItem('autopobre-record-name',$('recordName').value);}catch{}$('recordsMessage').textContent='Tempo gravado! Seus melhores tempos ficam guardados.';this.render();}catch(error){$('recordsMessage').textContent=error.message;}};
 }
 open(mode=null){
  const $=id=>this.dialog.querySelector('#'+id);this.candidate=mode&&!mode.recordAssisted&&validTime(mode.finishBest)&&validTime(mode.finishTime)?{circuit:circuitId(mode.data?.meta.id),mode:mode.active?'immersive':'normal',bestLap:mode.finishBest,bestRace:mode.finishTime}:null;
  $('recordsCircuit').value=this.candidate?.circuit??this.circuit;
  $('recordForm').hidden=!this.candidate;$('recordsMessage').textContent=mode?.recordAssisted?'O reconhecimento automático não grava recordes. Faça uma corrida pilotando o Opala.':'';
  if(this.candidate){this.selectedMode=this.candidate.mode;$('recordCandidate').textContent=`${CIRCUITS[this.candidate.circuit].name} · Sua volta: ${formatTime(this.candidate.bestLap)} · Corrida: ${formatTime(this.candidate.bestRace)}`;try{$('recordName').value=localStorage.getItem('autopobre-record-name')||'';}catch{}}
  this.render();this.dialog.showModal();
 }
 render(){
  let rows=[];try{rows=readRecords(localStorage);}catch{}
  const mode=this.selectedMode;
  for(const button of this.dialog.querySelectorAll('[data-records-mode]'))button.setAttribute('aria-pressed',String(button.dataset.recordsMode===mode));
  rows=rows.filter(r=>r.mode===mode&&r.circuit===this.dialog.querySelector('#recordsCircuit').value).sort((a,b)=>a.bestLap-b.bestLap);
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  rows.forEach((row,i)=>{const tr=document.createElement('tr');for(const value of [`${i+1}º`,row.name,formatTime(row.bestLap),formatTime(row.bestRace)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);});this.dialog.querySelector('#recordsEmpty').hidden=rows.length>0;
 }
}
