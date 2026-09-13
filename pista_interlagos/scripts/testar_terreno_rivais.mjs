import fs from 'node:fs';
import assert from 'node:assert/strict';
import {TestCar,GUARDRAIL_CLEARANCE,recognitionInput} from '../teste/physics.js';
import {RaceField,DRIVER_STYLES} from '../teste/race-field.js';
import {createGuardrails,createCurbs} from '../teste/track-surface.js';
const data=JSON.parse(fs.readFileSync(new URL('../dados/pista.json',import.meta.url)));
const idle={throttle:0,brake:0,left:0,right:0,reverse:0,handbrake:0};
function flat(road){const c=new TestCar(data);c.sample=()=>({i:0,u:0,s:500,d:0,z:0,width:1000,bank:0,grade:0,gx:0,gy:0,tx:1,ty:0,lx:0,ly:1,onRoad:road});c.reset();c.x=c.y=c.heading=0;c.surface=c.sample();return c;}
const road=flat(true),grass=flat(false);road.vx=grass.vx=30;
for(let i=0;i<240;i++){road.step(idle,1/120);grass.step(idle,1/120);}
assert(grass.vx<road.vx-6,'grass meaningfully slows a coasting car');
const grip=flat(false);grip.vx=12;grip.vy=6;
for(let i=0;i<90;i++)grip.step(idle,1/120);
assert(Math.abs(grip.vy)<2,'off-road tyres arrest sideways sliding');
for(let i=0;i<1200;i++)grass.step(idle,1/120);
assert(Math.hypot(grass.vx,grass.vy)<.01,'grass resistance stops without reversing or jittering');
const recover=flat(false);for(let i=0;i<600;i++)recover.step({...idle,throttle:1},1/120);
assert(recover.vx>5&&recover.vx<25,'driver can accelerate back from grass without matching asphalt pace');
let contacts=0;
for(let index=0;index<data.samples.length;index+=37)for(const side of [-1,1]){
 const c=new TestCar(data);c.reset(index);const p=c.surface,offset=side*(p.width/2+GUARDRAIL_CLEARANCE-.93-.2);
 c.x+=p.lx*offset;c.y+=p.ly*offset;c.surface=c.sample(c.x,c.y);
 c.vx=p.tx*25+p.lx*side*8;c.vy=p.ty*25+p.ly*side*8;const initial=Math.hypot(c.vx,c.vy);
 let hit=false;for(let i=0;i<15;i++){c.step(idle,1/120);if(c.wallImpactSpeed>0){hit=true;const r=c.surface;assert((c.vx*r.lx+c.vy*r.ly)*side<.1,'rail rebounds inward');assert(Math.hypot(c.vx,c.vy)<=initial+.1,'rail adds no energy');assert(c.vx*r.tx+c.vy*r.ty>17,'glancing contact retains forward motion');break;}}
 assert(hit,`continuous collision at track sample ${index}, side ${side}`);contacts++;
}
const rails=createGuardrails(data),pos=rails.rails.geometry.attributes.position;
assert.equal(rails.stats.sides,2);assert(pos.count>10000);assert([...pos.array].every(Number.isFinite));
const half=pos.count/2;
const curbs=createCurbs(data);assert.equal(curbs.children.length,2);
assert.equal(curbs.children.reduce((n,m)=>n+m.geometry.attributes.position.count,0),data.samples.length*24,'both curb edges cover every track segment');
assert(curbs.children.every(m=>[...m.geometry.attributes.position.array].every(Number.isFinite)));
for(const base of [0,half])for(let j=0;j<6;j++)for(let axis=0;axis<3;axis++)assert.equal(pos.array[(base+j)*3+axis],pos.array[(base+half-6+j)*3+axis],'guardrail closes without a finish-line gap');
// All personalities face identical corners at the same speed: commands must differ.
const signals=DRIVER_STYLES.map(()=>[]),probe=new TestCar(data);
for(let i=0;i<data.samples.length;i+=5){probe.reset(i);probe.vx=probe.surface.tx*35;probe.vy=probe.surface.ty*35;DRIVER_STYLES.forEach((style,j)=>signals[j].push(recognitionInput(probe,style).brake));}
for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)assert(signals[i].filter((v,k)=>Math.abs(v-signals[j][k])>.1).length>8,'drivers choose distinct braking strengths/locations');
const field=new RaceField(data),player=new TestCar(data),laps=Array(5).fill(null);player.x+=10000;let peak=0,maxOutside=0;
for(let frame=0;frame<180*120;frame++){field.step(player,1/120);for(const [i,r] of field.rivals.entries()){peak=Math.max(peak,Math.hypot(r.car.vx,r.car.vy)*3.6);maxOutside=Math.max(maxOutside,Math.abs(r.car.surface.d)-r.car.surface.width/2);if(laps[i]===null&&r.progress>=data.meta.reconstructed_xy_m)laps[i]=frame/120;}}
assert(laps.every(t=>t!==null&&t<159),'all drivers improve on the previous 160–162 second opening lap');assert(Math.max(...laps)-Math.min(...laps)>3,'different styles produce different lap times');assert(peak>168&&maxOutside<3,'faster rivals stay within the run-off margin');
console.log(JSON.stringify({passed:true,grassCoastingKmh:grass.vx*3.6,grassRecoveryKmh:recover.vx*3.6,railContacts:contacts,laps,peakKmh:peak,maxOutside},null,2));
