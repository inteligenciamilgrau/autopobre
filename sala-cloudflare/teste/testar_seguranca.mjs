// Security regressions against the actual room class; sockets and time are local test fixtures.
import assert from 'node:assert/strict';
import {Sala,CLOSE} from '../src/index.js';
const KEY='fixture-only',IP='192.0.2.1';
const rooms=[];
const make=()=>{const r=new Sala({}, {CHAVE_GRUPO:KEY});rooms.push(r);return r;};
function connect(room,{ip=IP,key=KEY,token=null,name='Piloto'}={}){
 const messages=[],closed=[];
 const peer={ip,id:null,token:null,authed:false,window:{since:Date.now(),messages:0,bytes:0,over:0},socket:{send:data=>messages.push(JSON.parse(data)),close:code=>closed.push(code)}};
 room.message(peer,JSON.stringify({t:'auth',key,token,name}));
 return {peer,messages,closed};
}
const originalNow=Date.now;
try{
 // Wrong credentials throttle only their source. A known identity can still reconnect from a
 // shared IP, with both its token and the right key; the token alone is never enough.
 {
  const room=make(),host=connect(room);
  for(let i=0;i<20;i++)assert.equal(connect(room,{key:'wrong'}).closed[0],CLOSE.key);
  assert.equal(connect(room,{key:'wrong'}).closed[0],CLOSE.busy);
  assert.equal(connect(room).closed[0],CLOSE.busy,'a new identity on the offending IP waits');
  assert(connect(room,{ip:'192.0.2.2'}).peer.authed,'another IP still enters');
  assert.equal(connect(room,{token:host.peer.token,key:'wrong'}).closed[0],CLOSE.busy);
  assert(connect(room,{token:host.peer.token}).peer.authed,'valid identity reconnects even on shared IP');
  const t=originalNow();Date.now=()=>t+61000;
  assert(connect(room).peer.authed,'cooldown expires');Date.now=originalNow;
 }
 // An inactive token consumes capacity, just like a new guest. A live replacement does not.
 {
  const room=make(),host=connect(room),tokens=[];
  for(let i=0;i<24;i++){const g=connect(room);tokens.push(g.peer.token);room.gone(g.peer);}
  const guests=tokens.map(token=>connect(room,{token}));
  assert.equal(room.peers.size,19);
  assert.equal(guests.filter(g=>g.peer.authed).length,18);
  assert(guests.slice(18).every(g=>g.closed[0]===CLOSE.full));
  const replacement=connect(room,{token:host.peer.token});
  assert(replacement.peer.authed);assert.equal(room.peers.size,19);
  assert.equal(host.closed[0],CLOSE.elsewhere);
  room.message(host.peer,JSON.stringify({t:'config',porteiro:false}));
  assert.equal(room.porteiro,true,'replaced socket cannot keep acting as host');
  room.gone(replacement.peer);
  assert.equal(connect(room,{token:tokens[23]}).closed[0],CLOSE.full,'host place reserved in grace');
  const back=connect(room,{token:replacement.peer.token});
  assert(back.peer.authed);assert.equal(back.messages[0].role,'host');assert.equal(room.peers.size,19);
 }
 // History is bounded even when a key holder repeatedly comes and goes (or gets kicked).
 {
  const room=make(),host=connect(room);
  for(let i=0;i<300;i++){
   const guest=connect(room);assert(guest.peer.authed);
   room.fromHost(host.peer,{t:'kick',to:guest.peer.id});
  }
  assert.equal(room.tokens.size,256);assert(room.banned.size<=255);
  const last=[...room.banned].at(-1);
  assert.equal(connect(room,{token:last}).closed[0],CLOSE.kicked);
  const t=originalNow();Date.now=()=>t+24*60*60*1000+1;
  const fresh=connect(room,{token:last});
  assert(fresh.peer.authed);assert.equal(fresh.messages[0].pending,true,'expired identity asks admission again');
  assert.equal(room.tokens.size,2);assert.equal(room.banned.size,0);Date.now=originalNow;
 }
 // Malformed key/name objects never invoke attacker-supplied coercion or crash authentication.
 {
  const room=make();
  assert.equal(connect(room,{key:{toString:null}}).closed[0],CLOSE.key);
  const host=connect(room,{name:{toString:null}});assert.equal(host.peer.name,'Piloto');
  room.message(host.peer,JSON.stringify({t:'eco',text:'é'.repeat(9000)}));
  assert.equal(host.closed[0],CLOSE.flood,'the size limit counts UTF-8 bytes, not string characters');
 }
 // Per-source failures cannot grow an unbounded in-memory map.
 {
  const room=make();
  for(let i=0;i<1100;i++)connect(room,{ip:`fixture-${i}`,key:'wrong'});
  assert.equal(room.attempts.size,1024);
 }
 console.log('testar_seguranca: ok (IP throttling, reconnect capacity, reserved host, bounded sessions, malformed auth)');
}finally{Date.now=originalNow;for(const room of rooms)clearTimeout(room.hostAwayTimer);}
