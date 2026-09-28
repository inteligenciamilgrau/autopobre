// The room server (src/index.js) in Cloudflare's local runtime (wrangler dev, as in development):
// the group key, the origin, who is who, the roles, the doorman, the limits, a host's reload and
// its handover. Run: npm test (from sala-cloudflare). The key and the allowed origins come from
// .dev.vars (CHAVE_GRUPO=chave-de-teste-local, ORIGENS with http://teste.local).
import assert from 'node:assert/strict';
import http from 'node:http';
import {startWrangler} from './wrangler-dev.mjs';
const PORT=8797,KEY='chave-de-teste-local',ORIGIN='http://teste.local',GRACE=600;
const wait=(ms=40)=>new Promise(r=>setTimeout(r,ms));
const stop=await startWrangler({port:PORT,vars:{HOST_GRACE_MS:GRACE}});
let rooms=0;const fresh=()=>'sala-'+(++rooms)+'-'+Math.random().toString(36).slice(2,6);
// The HTTP status of a WebSocket request that is turned away before the upgrade.
const refused=(path,origin)=>new Promise(done=>{const req=http.request({host:'127.0.0.1',port:PORT,path,headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==',...(origin?{Origin:origin}:{})}});
 req.on('response',res=>{res.resume();done(res.statusCode);});req.on('upgrade',(res,socket)=>{socket.destroy();done(101);});req.on('error',()=>done(0));req.end();});
// A client: its messages, its close, and helpers to wait for them.
async function open(room,{origin=ORIGIN,key=KEY,token=null,name='Piloto',auth=true}={}){
 const ws=new WebSocket(`ws://127.0.0.1:${PORT}/sala/${room}`,{headers:{Origin:origin}}),c={ws,got:[],closed:null};
 ws.onmessage=e=>c.got.push(JSON.parse(e.data));ws.onclose=e=>{c.closed={code:e.code,reason:e.reason};};ws.onerror=()=>{};
 await new Promise(r=>{ws.onopen=r;const t=setInterval(()=>{if(c.closed){clearInterval(t);r();}},20);});
 c.send=m=>{try{ws.send(typeof m==='string'?m:JSON.stringify(m));}catch{}};
 c.of=t=>c.got.filter(m=>m.t===t);
 c.until=async(check,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=check();if(v)return v;await wait(10);}throw new Error('timeout: '+check);};
 if(auth&&!c.closed){c.send({t:'auth',key,token,name});await c.until(()=>c.of('welcome')[0]||c.closed);c.me=c.of('welcome')[0];}
 return c;
}
const report={};

// The door itself: the page's origin, the room's name, the key.
{
 assert.equal(await refused('/sala/abc','https://outro-site.com'),403,'another site cannot open a room');
 assert.equal(await refused('/sala/abc',null),403,'nor a page that says nothing');
 assert.equal(await refused('/sala/Nome%20Ruim',ORIGIN),404);
 assert.equal(await refused('/sala/abc',ORIGIN),101,'the game page gets in');
 const wrong=await open(fresh(),{key:'errada'});assert.equal(wrong.closed?.code,4001,'a wrong key is shut out');
 const none=await open(fresh(),{key:''});assert.equal(none.closed?.code,4001);
}

// Roles, the doorman, and who is who.
{
 const room=fresh(),host=await open(room,{name:'Ana'});
 assert.equal(host.me.role,'host');assert.match(host.me.id,/^[0-9a-f]{8}$/);assert.match(host.me.token,/^[0-9a-f]{32}$/);
 const bia=await open(room,{name:'Bia‮​'});
 assert.equal(bia.me.role,'guest');assert.equal(bia.me.pending,true,'a guest waits at the door');assert.equal(bia.me.host,host.me.id);
 const knock=await host.until(()=>host.of('knock')[0]);assert.equal(knock.id,bia.me.id);assert.equal(knock.name,'Bia','names are cleaned on the server too');
 // Outside the door nothing gets through, either way; a new name only knocks again, cleaned.
 bia.send({t:'hello',name:'Bia Souza​',want:null});host.send({t:'lobby',name:'Ana',age:1,players:[],race:null});
 await host.until(()=>host.of('knock').some(k=>k.id===bia.me.id&&k.name==='Bia Souza'));
 assert.equal(host.of('hello').length,0);assert.equal(bia.of('lobby').length,0);
 host.send({t:'admit',to:bia.me.id});await bia.until(()=>bia.of('admitted')[0]);
 // Whatever a guest claims to be, the host hears the id the server gave it.
 bia.send({t:'hello',name:'Bia',want:'64',from:host.me.id});const hello=await host.until(()=>host.of('hello')[0]);assert.equal(hello.from,bia.me.id,'from is the server\'s word');
 // Guests cannot speak for the host, and do not hear each other.
 host.send({t:'config',porteiro:false});await wait(40);
 const caio=await open(room,{name:'Caio'});assert.equal(caio.me.pending,false,'without the doorman a guest comes straight in');
 bia.send({t:'lobby',name:'x',age:1,players:[],race:null});bia.send({t:'go',race:'00000000',seats:[]});bia.send({t:'snap',race:'00000000',seq:1,cars:[]});bia.send({t:'state',race:'00000000',seq:1,lat:0,car:[]});
 await wait(100);assert.equal(caio.of('lobby').length+caio.of('go').length+caio.of('snap').length+caio.of('state').length,0,'a guest reaches no other guest');
 assert.equal(host.of('lobby').length,0,'host-only messages from a guest are dropped');assert.equal(host.of('state').length,1,'its own kind reaches the host');
 // The host's word reaches every guest; a pong only the one it answers.
 host.send({t:'lobby',name:'Ana',age:1,players:[],race:null});host.send({t:'pong',to:caio.me.id,n:3});
 await bia.until(()=>bia.of('lobby')[0]);await caio.until(()=>caio.of('pong')[0]);await wait(40);assert.equal(bia.of('pong').length,0);
 // Refused at the door, and kicked (the kicked tab cannot come back).
 host.send({t:'config',porteiro:true});await wait(30);
 const dora=await open(room,{name:'Dora'});await host.until(()=>host.of('knock').some(k=>k.id===dora.me.id));
 host.send({t:'deny',to:dora.me.id});await dora.until(()=>dora.closed);assert.equal(dora.closed.code,4003);
 host.send({t:'kick',to:caio.me.id});await caio.until(()=>caio.closed);assert.equal(caio.closed.code,4004);
 const back=await open(room,{token:caio.me.token,name:'Caio'});assert.equal(back.closed?.code,4004,'a kicked tab stays out');
 await host.until(()=>host.of('bye').some(m=>m.from===caio.me.id));
 report.roles='ok';
 // A message too big closes the connection; a flood is cut at 90 a second.
 const big=await open(room,{name:'Big'});host.send({t:'admit',to:big.me.id});await big.until(()=>big.of('admitted')[0]);
 big.send({t:'state',x:'y'.repeat(20000)});await big.until(()=>big.closed);assert.equal(big.closed.code,4008);
 const before=host.of('ping').length;for(let i=0;i<300;i++)bia.send({t:'ping',n:i});await wait(300);
 const through=host.of('ping').length-before;assert(through>0&&through<=90,`flood cut: ${through}`);report.flood=through;
 for(const c of [host,bia])c.ws.close();
}

// F5 on the host: its tab's token takes the room back within the grace; the guests hear it went and
// came back. A duplicated tab (same token) takes the identity over from the old one.
{
 const room=fresh(),host=await open(room,{name:'Ana'});host.send({t:'config',porteiro:false});await wait(30);
 const bia=await open(room,{name:'Bia'});
 host.ws.close();await bia.until(()=>bia.of('host-away')[0]);
 const again=await open(room,{token:host.me.token,name:'Ana'});
 assert.equal(again.me.role,'host');assert.equal(again.me.id,host.me.id,'same identity after the reload');
 await bia.until(()=>bia.of('host').some(m=>m.id===host.me.id));
 const twin=await open(room,{token:again.me.token,name:'Ana'});assert.equal(twin.me.id,host.me.id);assert.equal(twin.me.role,'host');
 await again.until(()=>again.closed);assert.equal(again.closed.code,4010,'the older tab is told the room opened elsewhere');
 // The host goes for good: after the grace the guest that came first hosts, the others follow it.
 const caio=await open(room,{name:'Caio'});await wait(30);
 twin.ws.close();await bia.until(()=>bia.of('host-away').length>=2);
 await bia.until(()=>bia.of('role')[0],GRACE+2000);assert.equal(bia.of('role')[0].role,'host','the longest-standing guest hosts');
 await caio.until(()=>caio.of('host').some(m=>m.id===bia.me.id));
 for(const c of [bia,caio])c.ws.close();
 report.reload='ok';
}

// A full room, and a room that saw too many wrong keys.
{
 const room=fresh(),host=await open(room);host.send({t:'config',porteiro:false});await wait(30);
 const others=[];for(let i=0;i<18;i++)others.push(await open(room,{name:'P'+i}));
 assert(others.every(o=>o.me?.role==='guest'));
 const late=await open(room);assert.equal(late.closed?.code,4002,'19 in the room: the 20th is turned away');
 for(const c of [host,...others])c.ws.close();
 const locked=fresh();for(let i=0;i<20;i++)await open(locked,{key:'errada'});
 const right=await open(locked);assert.equal(right.closed?.code,4009,'after 20 wrong keys the room waits a minute');
 report.limits='ok';
}
stop();
console.log(JSON.stringify(report));
console.log('testar_sala: ok');
