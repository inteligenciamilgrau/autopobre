import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ImmersiveState,FANS,JOKES,strapPath} from '../teste/immersive-state.js';
const checks={},check=(name,value)=>{checks[name]=!!value;assert(value,name);};
const fresh=()=>{const s=new ImmersiveState();s.start();return s;};
const fund=s=>{for(let i=0;i<FANS.length;i++){s.talk(i);s.joke(JOKES.findIndex(j=>j.topic===FANS[i].taste));}};
const s=fresh();check('optional_off_by_default',!new ImmersiveState().active);
s.talk(0);s.joke(1);check('no_laugh_no_money',s.cash===0);s.joke(0);const cash=s.cash;s.joke(0);check('laugh_donates_once',cash>0&&s.cash===cash);
fund(s);check('crowd_can_fund_entry_and_full_tank',s.cash>=208&&s.prepare());check('fuel_and_protection_purchase',s.buy(12,true)&&s.fuel===12&&s.film);
s.starter=true;for(let i=0;i<240&&s.phase==='starting';i++)s.startEngine({throttle:s.pressure<.45?1:0},1/120);check('controlled_start_works',s.phase==='grid');
const flooded=fresh();fund(flooded);flooded.prepare();flooded.buy(4,false);for(let i=0;i<240;i++)flooded.startEngine({throttle:1},1/120);flooded.starter=true;for(let i=0;i<120&&flooded.phase==='starting';i++)flooded.startEngine({throttle:1},1/120);check('flooded_start_calls_tow',flooded.phase==='broken'&&flooded.reason.includes('afogado'));
s.startRace();s.fuel=.001;s.raceStep({speed:25,throttle:1},1);check('empty_tank_breakdown',s.phase==='broken');
const off=fresh();off.phase='race';off.fuel=8;for(let i=0;i<200;i++)off.raceStep({speed:20,throttle:1,offTrack:6},1/120);check('deep_excursion_drops_tank',off.tankDetached&&off.fuel<7.9);
const glass=fresh();glass.phase='race';glass.fuel=8;glass.hitDebris();check('glass_first_hit_cracks',glass.glass>0&&glass.phase==='race');glass.hitDebris();glass.hitDebris();check('shattered_glass_calls_tow',glass.phase==='broken');
const goodTow=fresh();goodTow.beginTow();for(let i=0;i<12000&&goodTow.phase==='tow';i++)goodTow.towStep({brake:1},1/120);check('braking_keeps_tow_strap_safe',goodTow.phase==='podium'&&goodTow.towSnags===0);
const badTow=fresh();badTow.beginTow();for(let i=0;i<3000&&badTow.phase==='tow';i++)badTow.towStep({brake:0},1/120);check('coasting_runs_over_strap',badTow.phase==='snag'&&badTow.towGap<2.2);badTow.untangle();check('snag_recoverable',badTow.phase==='tow'&&badTow.towGap===5);
for(const gap of [.5,1,2,3,4,5]){const pts=strapPath([0,.2,0],[gap,.2,0]);const len=pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-pts[i][j])),0);check('strap_fixed_length_'+gap,Math.abs(len-5)<.001);check('strap_attached_'+gap,Math.hypot(...pts[0].map((v,j)=>v-[0,.2,0][j]))<1e-8&&Math.hypot(...pts.at(-1).map((v,j)=>v-[gap,.2,0][j]))<1e-8);}
const winner=fresh();winner.phase='race';winner.finish(1);winner.leavePodium();winner.requestInspection();winner.inspectionStep(8);check('winner_still_sixth_on_podium',winner.inspected&&winner.podiumPlace===6&&winner.result.position===1&&winner.prize===600);
const angled=strapPath([10,5,30],[11.5,5.1,33.8]);const angledLength=angled.slice(1).reduce((sum,p,i)=>sum+Math.hypot(...p.map((v,j)=>v-angled[i][j])),0);
check('strap_follows_world_space_anchors',Math.hypot(...angled[0].map((v,j)=>v-[10,5,30][j]))<1e-8&&Math.hypot(...angled.at(-1).map((v,j)=>v-[11.5,5.1,33.8][j]))<1e-8&&Math.abs(angledLength-5)<.001);
const balance=winner.profile.fund;winner.podium();check('prize_not_paid_twice',winner.profile.fund===balance);
const dq=fresh();dq.phase='race';dq.finish(1);dq.leavePodium();dq.goToBox();check('box_before_judge_disqualifies_winner',dq.result.status==='Desclassificado'&&dq.prize===0&&dq.podiumPlace===6);
for(const reason of ['Motor afogado na partida','Acabou a gasolina','Para-brisa estilhaçado','Carro quebrou']){const d=fresh();d.phase='race';d.fail(reason);d.beginTow();while(d.phase==='tow')d.towStep({brake:1},.05);d.leavePodium();d.requestInspection();d.inspectionStep(8);check('dnf_sixth_'+reason,d.podiumPlace===6&&d.result.status==='Não terminou');}
winner.start();winner.phase='race';winner.finish(1);winner.leavePodium();winner.requestInspection();winner.inspectionStep(8);check('blazer_goal_can_be_completed',winner.releaseBlazer()&&winner.profile.released&&winner.profile.fund===300);check('mechanic_paid_once',!winner.releaseBlazer());
const saved=new ImmersiveState(JSON.parse(JSON.stringify(winner.profile)));check('profile_survives_reload',saved.profile.released&&saved.profile.races===2);saved.disable();check('normal_mode_isolated',!saved.active&&saved.phase==='off');
const report={passed:true,checks};fs.writeFileSync(new URL('../dados/validacao_imersivo.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
