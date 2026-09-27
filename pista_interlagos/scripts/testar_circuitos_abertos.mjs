// Cascavel and ECPA Piracicaba, rebuilt from open data (scripts/circuitos/): geometry,
// relief, pit lane, scenery clearances and a full AI race on each.
//   node scripts/testar_circuitos_abertos.mjs [cascavel|piracicaba]
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CIRCUITS} from '../teste/circuits.js';
import {TestCar,recognitionInput,guardrailSections} from '../teste/physics.js';
import {RaceField,pitRoute} from '../teste/race-field.js';
import {pitGeometry,locatePit,serviceSpot,garageBays} from '../teste/pit-lane.js';
import {standLayout,fitGround,sceneryBands,bandClearance} from '../teste/track-clearance.js';

const only=process.argv[2];
const report={};
for(const id of ['cascavel','piracicaba']){
 if(only&&only!==id)continue;
 const circuit=CIRCUITS[id],data=JSON.parse(readFileSync(new URL(`../dados/pista_${id}.json`,import.meta.url)));
 data.meta.id=id;data.meta.name=circuit.name;
 const a=data.samples,n=a.length,L=data.meta.reconstructed_xy_m,out={};
 // --- Closed centre line, 2 m stations, the published sense of travel.
 let length=0,turn=0;
 for(let i=0;i<n;i++){
  const p=a[i],q=a[(i+1)%n];assert(p.every(Number.isFinite),`${id}: finite samples`);
  const span=Math.hypot(q[1]-p[1],q[2]-p[2]);assert(span>1.8&&span<2.2,`${id}: station spacing ${span}`);length+=span;
  turn+=Math.atan2(p[7]*q[8]-p[8]*q[7],p[7]*q[7]+p[8]*q[8]);
  assert(Math.abs(p[7]*p[9]+p[8]*p[10])<1e-3,'left vector is normal to the tangent');
  assert(p[4]>=8.9&&p[4]<=16.2,`${id}: width ${p[4]}`);
 }
 assert(Math.abs(length-L)<1,`${id}: lap length`);
 assert(Math.abs(Math.abs(turn)-2*Math.PI)<.05,`${id}: closed loop`);
 assert.equal(Math.sign(turn),data.meta.direction==='horario'?-1:1,`${id}: sense of travel`);
 if(id==='cascavel')assert(Math.abs(data.meta.reconstructed_3d_m-3058)<.5,'Cascavel matches the published 3,058 m');
 else assert(Math.abs(L-circuit.length)<15,'ECPA shows its measured length');
 assert.equal(circuit.length,id==='cascavel'?3058:1930);
 // --- Relief: real circuits, not a flat plate; grades a car can climb.
 const grades=a.map(p=>p[6]);out.grade=[Math.min(...grades),Math.max(...grades)].map(g=>+(g*100).toFixed(1));
 assert(data.meta.elevation_range_m>10&&data.meta.elevation_range_m<60,`${id}: relief range`);
 assert(Math.max(...grades.map(Math.abs))<.15,`${id}: grade under 15%`);
 assert(Math.abs(data.meta.elevation_check.anadem_menos_copernicus_mediana_m)<1,'ANADEM and Copernicus agree along the track');
 // Terrain next to the asphalt meets the road plane (no step at the edge; between two
 // stretches of the lap that run side by side it becomes a bank).
 const car=new TestCar(data);let edgeStep=0;
 for(let i=0;i<n;i+=2){const p=a[i];car.index=i;for(const side of [-1,1]){const d=side*(p[4]/2+1),x=p[1]+p[9]*d,y=p[2]+p[10]*d,road=p[3]+p[5]*d;edgeStep=Math.max(edgeStep,Math.abs(car.terrain(x,y)-road));}}
 assert(edgeStep<.5,`${id}: terrain meets the road (max step ${edgeStep})`);out.edgeStep=+edgeStep.toFixed(3);
 // --- Pit lane: surveyed format, Box 99, AI in-lap route.
 const geo=pitGeometry(data);assert(geo,'pit geometry');
 const pc=Object.fromEntries(data.pit.columns.map((k,i)=>[k,i])),mid=data.pit.samples[Math.floor(data.pit.samples.length/2)];
 const at=locatePit(geo,mid[pc.x],mid[pc.y]);assert(at&&Math.abs(at.d)<.5,'lane centre found');
 const spot=serviceSpot(data.pit);assert(spot&&spot.d>0&&spot.d<data.pit.box99.front,'service spot on the working lane');
 const bays=garageBays(data.pit,14);assert(bays.bays>=3,'garage row');
 const route=pitRoute(data);assert(route&&route.slots.length>=5,`${id}: in-lap parking slots (${route?.slots.length})`);
 // Box 99 stands on the pit lane, clear of the track asphalt.
 const s99=car.sample(...(()=>{const p=data.pit.samples.find(r=>r[pc.s]>=data.pit.box99.s);return [p[pc.x]+p[pc.lx]*(data.pit.box99.front+8),p[pc.y]+p[pc.ly]*(data.pit.box99.front+8)];})());
 assert(Math.abs(s99.d)>s99.width/2+3,'Box 99 is off the racing surface');
 out.pit={length:Math.round(data.pit.length_m),entry:Math.round(data.pit.entry_main_s),exit:Math.round(data.pit.exit_main_s),garages:data.pit.garages,slots:route.slots.length};
 // No guardrail across the pit side while the lane runs along the track.
 const railLeft=guardrailSections(data,1);
 assert(!railLeft.some(([f,t])=>0>=f&&0<=t),'no left rail at the timing line (pit side)');
 // --- Stands and buildings keep off the roads.
 const stands=standLayout(data);assert(stands.length>=3,'grandstand blocks');
 for(const b of stands){const [x,y]=[b.x+b.rx*b.front,b.y+b.ry*b.front];car.index=car.nearest(x,y,true).i;const s=car.sample(x,y);assert(Math.abs(s.d)>s.width/2+6,'stand front clear of the asphalt');}
 const bands=sceneryBands(data),cols=Object.fromEntries(data.scenery.buildings.columns.map((k,i)=>[k,i]));
 for(const b of data.scenery.buildings.items){const c=bandClearance(bands,b[cols.x],b[cols.y]);assert(c.distance>Math.hypot(b[cols.w],b[cols.d])/2,`${id}: building ${b[cols.x]},${b[cols.y]} too close to ${c.band}`);}
 out.buildings=data.scenery.buildings.items.length;out.stands=stands.length;
 // --- Ground fitting under asphalt, kerbs, pit and stands converges.
 const fit=fitGround(data);assert(fit.stats.residual<.01,`${id}: ground fit residual ${fit.stats.residual}`);out.groundFit=fit.stats;
 // --- The recognition driver and the 14 rivals race three laps on the real geometry.
 const field=new RaceField(data,{seed:1}),parked=new TestCar(data);parked.resetGrid();field.reset(parked.surface.s,{grid:true});
 const far=data.terrain;parked.x=far.x0+5;parked.y=far.y0+5;parked.surface=parked.sample(parked.x,parked.y);
 let steps=0,offroad=0,crashes=0;
 while(field.rivals.some(r=>!r.finished)&&steps<120*600){field.step(parked,1/120,3);for(const r of field.rivals){if(!r.car.surface.onRoad)offroad++;}steps++;}
 const finished=field.rivals.filter(r=>r.finished);
 assert(finished.length>=13,`${id}: rivals finish three laps (${finished.length}/14)`);
 assert(offroad/(steps*14)<.03,`${id}: rivals stay on the asphalt (${(offroad/(steps*14)*100).toFixed(2)}% off)`);
 const best=Math.min(...field.rivals.map(r=>r.car.best??Infinity));
 out.rivals={finished:finished.length,bestLap:+best.toFixed(2),avgSpeedKmh:+(L/best*3.6).toFixed(1),offroadPct:+(offroad/(steps*14)*100).toFixed(2)};
 const solo=new TestCar(data);solo.resetGrid();solo.awaitingStart=false;let t=0,soloOff=0;const startLaps=solo.laps;
 while(solo.laps<startLaps+2&&t<120*400){solo.step(recognitionInput(solo),1/120);if(!solo.surface.onRoad)soloOff++;t++;}
 assert(solo.laps>=startLaps+2,`${id}: recognition driver laps`);out.recognition={best:+solo.best.toFixed(2),offroadPct:+(soloOff/t*100).toFixed(2)};
 report[id]=out;
}
console.log(JSON.stringify({passed:true,report},null,1));
