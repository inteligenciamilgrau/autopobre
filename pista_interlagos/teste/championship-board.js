import {CIRCUITS} from './circuits.js';
import {CHAMPIONSHIP_ROUNDS,CHAMPIONSHIP_POINTS,pointsText} from './championship.js';

// The championship on screen: the panel of the track screen (calendar, status, top five)
// and the full standings dialog, opened from there and from the result sheet.
const SHORT={interlagos:'INT',cascavel:'CAS',piracicaba:'PIR',chapeco:'CHA',curvelo:'CUR'};
const el=(tag,props={},...children)=>{const node=document.createElement(tag);Object.assign(node,props);node.append(...children);return node;};
const ordinal=n=>`${n}º`;
const MODE_NAME={corrida:'MODO CORRIDA',historia:'MODO HISTÓRIA'};
// A round's place: retirements and disqualifications score nothing.
const placeText=r=>r.dsq?'DSQ':r.dnf?'AB':ordinal(r.position);

export function renderChampionshipPanel(root,championship){
 const $=id=>root.querySelector('#'+id),state=championship.state,round=championship.round;
 const calendar=$('championshipCalendar');calendar.replaceChildren();
 const standings=championship.standings(),player=standings.find(d=>d.player);
 championship.rounds.forEach((id,k)=>{
  const done=state?.results[k],mine=done?.rows.find(r=>r.player),current=championship.active&&k===round;
  const item=el('li',{className:done?'done':current?'next':''},el('b',{textContent:`${k+1}`}),el('span',{textContent:CIRCUITS[id].name}),el('em',{textContent:mine?`${placeText(mine)} · +${mine.points}`:current?'próxima':'—'}));
  calendar.append(item);
 });
 $('championshipKicker').textContent=`CAMPEONATO · ${MODE_NAME[championship.mode]??MODE_NAME.corrida}`;
 const status=$('championshipStatus'),start=$('championshipStart'),reset=$('championshipReset'),table=$('championshipTableButton'),mini=$('championshipMini');
 mini.replaceChildren();
 if(!state){
  status.textContent=`${CHAMPIONSHIP_ROUNDS.length} etapas, uma corrida em cada pista. Pontos para os 15: ${CHAMPIONSHIP_POINTS.slice(0,3).join(', ')}… até 1.`;
  start.textContent='Começar campeonato →';
 }else{
  status.textContent=championship.finished
   ?`Campeonato encerrado. Campeão: #${standings[0].number} ${standings[0].shortName}. Você terminou em ${ordinal(player.position)} com ${pointsText(player.points)}.`
   :round===0?`Etapa 1 de ${championship.total}: ${CIRCUITS[championship.nextCircuit].name}, ${state.laps} volta${state.laps>1?'s':''}.`
   :`Você é ${ordinal(player.position)} com ${pointsText(player.points)}. Próxima: etapa ${round+1}, ${CIRCUITS[championship.nextCircuit].name}.`;
  start.textContent=championship.finished?'Novo campeonato →':round===0?'Largar na etapa 1 →':`Correr a etapa ${round+1} →`;
  if(round>0)for(const d of standings.slice(0,5).concat(player.position>5?[player]:[]))
   mini.append(el('li',{className:d.player?'player':''},el('b',{textContent:ordinal(d.position)}),el('span',{textContent:`#${d.number} ${d.shortName}`}),el('em',{textContent:`${d.points}`})));
 }
 mini.hidden=!mini.children.length;
 reset.hidden=!championship.active||round===0;table.hidden=!state||round===0;
}

export class ChampionshipDialog {
 constructor(){
  this.dialog=el('dialog',{id:'championshipDialog'});this.dialog.setAttribute('aria-labelledby','championshipDialogTitle');
  this.dialog.innerHTML=`<div class="champ-head"><div><span id="championshipDialogMode">CAMPEONATO OLD STOCK · AUTO-POBRE RACING</span><h2 id="championshipDialogTitle">CLASSIFICAÇÃO GERAL</h2></div><button id="championshipClose" type="button" aria-label="Fechar classificação">✕</button></div><p id="championshipBanner"></p><div class="champ-scroll"><table><thead></thead><tbody></tbody></table></div><p class="champ-note">Pontos por posição de chegada: ${CHAMPIONSHIP_POINTS.map((p,i)=>`${i+1}º ${p}`).join(' · ')}. AB abandono e DSQ desclassificado: 0. Empate: vitórias, pódios e melhor chegada.</p>`;
  document.body.append(this.dialog);
  this.dialog.querySelector('#championshipClose').onclick=()=>this.dialog.close();
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.dialog.close();});
 }
 open(championship){
  const standings=championship.standings(),state=championship.state,$=id=>this.dialog.querySelector('#'+id);
  const player=standings.find(d=>d.player);
  $('championshipDialogMode').textContent=`CAMPEONATO OLD STOCK · ${MODE_NAME[championship.mode]??MODE_NAME.corrida}`;
  $('championshipBanner').textContent=championship.finished
   ?(player.position===1?`CAMPEÃO! ${player.shortName} e o Opala ${player.number} levam o título com ${pointsText(player.points)}.`:`Campeão: #${standings[0].number} ${standings[0].name} (${standings[0].points} pts). Você fechou em ${ordinal(player.position)}.`)
   :`Depois de ${championship.round} de ${championship.total} etapas · próxima: ${CIRCUITS[championship.nextCircuit]?.name??'—'}`;
  $('championshipBanner').classList.toggle('champion',championship.finished&&player.position===1);
  const head=this.dialog.querySelector('thead');head.replaceChildren(el('tr',{},el('th',{textContent:'POS'}),el('th',{textContent:'Nº'}),el('th',{textContent:'PILOTO / DUPLA'}),
   ...championship.rounds.map((id,k)=>{const th=el('th',{textContent:SHORT[id],title:CIRCUITS[id].name});if(k>=championship.round)th.className='pending';return th;}),el('th',{textContent:'VIT'}),el('th',{textContent:'PTS'})));
  const body=this.dialog.querySelector('tbody');body.replaceChildren();
  for(const d of standings){
   const row=el('tr',{className:d.player?'player':''},el('td',{textContent:ordinal(d.position)}),el('td',{textContent:d.number}),el('th',{scope:'row',textContent:d.player?`${state?.pilot||d.shortName} · VOCÊ`:d.name}),
    ...championship.rounds.map((id,k)=>{const r=d.rounds[k];return el('td',{textContent:r?placeText(r):'·',title:r?`${CIRCUITS[id].name}: ${r.dsq?'desclassificado':r.dnf?'abandono':r.position+'º'}, ${r.points} pts`:CIRCUITS[id].name});}),
    el('td',{textContent:String(d.wins)}),el('td',{className:'points',textContent:String(d.points)}));
   body.append(row);
  }
  if(!this.dialog.open)this.dialog.showModal();
 }
 close(){this.dialog.close();}
}
