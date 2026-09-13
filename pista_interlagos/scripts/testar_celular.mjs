import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FamilyMessages,FAMILY_MESSAGES} from '../teste/family-phone.js';
const phone=new FamilyMessages(()=>.5),checks={};
const check=(name,value)=>{checks[name]=!!value;assert(value,name);};
phone.update(3.99);check('not_immediate',phone.count===0);
check('first_arrival',phone.update(.02)&&phone.message.text==='Buscar filha na escola');
const paused=JSON.stringify(phone.info());for(let i=0;i<300;i++)phone.update(0);check('pause_freezes_schedule',JSON.stringify(phone.info())===paused);
phone.update(17);check('message_stays_readable',phone.active);
phone.update(1.1);check('notification_returns_to_home',!phone.active);
let previous=phone.message,previousTime=phone.arrivedAt;const seen=new Set([phone.message.text]);
for(let i=0;i<28;i++){
 check('next_arrival_'+i,phone.update(phone.nextAt-phone.elapsed+.001));
 const interval=phone.arrivedAt-previousTime;
 check('spaced_no_repeat_'+i,interval>=48&&interval<=75.01&&phone.message!==previous);
 previous=phone.message;previousTime=phone.arrivedAt;seen.add(phone.message.text);
}
check('family_message_variety',seen.size===FAMILY_MESSAGES.length);
phone.reset();check('reset_starts_first_reminder_again',phone.count===0&&phone.nextAt===4&&!phone.active&&phone.message===null);
const report={passed:true,checks,messages:FAMILY_MESSAGES.length,intervalSeconds:[48,75],visibleSeconds:18};
fs.writeFileSync(new URL('../dados/validacao_celular.json',import.meta.url),JSON.stringify(report,null,2));console.log('Phone schedule passed: first reminder, timing, pause, variety, no adjacent repeats and reset.');
