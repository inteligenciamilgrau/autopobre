// Room server for Auto-Pobre Racing's multiplayer (teste/net-room.js, net-link.js). One Durable
// Object per room relays the room's messages over WebSockets, so the players' browsers only ever talk
// to Cloudflare: nobody sees another player's IP.
//
// What the server enforces, whatever a client sends:
// - the group key (secret CHAVE_GRUPO): without it nobody opens or enters a room;
// - the page's origin (ORIGENS): other sites cannot use it with their visitors' browsers;
// - who is who: every relayed message carries the sender's id as the server knows it (from);
// - roles: only the host sends the room's word (lobby, go, snap, pong) and it reaches the admitted
//   guests; guests' messages (hello, ready, state, ping, bye) reach the host only;
// - the doorman: a guest waits outside until the host admits it; the host can refuse or kick;
// - the line check: an echo the server answers itself, so a player's game can tell a dead connection;
// - limits: message size, messages and bytes per second per connection, players per room, failed
//   keys per room.
// A tab keeps its token (sessionStorage): back within HOST_GRACE after a reload, a host hosts again
// and a guest keeps its id and its admission; a host that does not come back hands the room to the
// guest that has been there longest.
const MAX_PEERS=19;          // 15 seats and a few watching
const MAX_BYTES=16384;       // one message
const RATE_MESSAGES=90;      // per connection, per second
const RATE_BYTES=320000;     // per connection, per second
const OVER_LIMIT_CLOSE=3;    // seconds over the limit before the connection is closed
const AUTH_WAIT=10000;       // ms to present the key
const FAILS_PER_MINUTE=20;   // wrong keys in a room before it refuses new connections for a minute
const HOST_GRACE=15000;      // ms a host that left may take to come back (env HOST_GRACE_MS in tests)
const HOST_TYPES=new Set(['lobby','go','snap','pong','admit','deny','kick','config','bye']);
const GUEST_TYPES=new Set(['hello','ready','state','ping','bye']);
const ROOM=/^[a-z0-9-]{1,24}$/,ID=/^[0-9a-f]{8}$/,TOKEN=/^[0-9a-f]{32}$/;
// Close codes the game explains to the player (net-link.js); late (no key within AUTH_WAIT: a slow
// connection, not a wrong key) it just tries again.
export const CLOSE={key:4001,full:4002,denied:4003,kicked:4004,flood:4008,busy:4009,elsewhere:4010,origin:4011,late:4012};
const hex=bytes=>[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const cleanName=value=>String(value??'').replace(/\p{C}/gu,'').replace(/\s+/g,' ').trim().slice(0,24)||'Piloto';
// Same length and every byte compared: the time taken says nothing about the key.
function sameKey(a,b){
 const x=new TextEncoder().encode(String(a??'')),y=new TextEncoder().encode(String(b??''));
 let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);
 return diff===0&&y.length>0;
}
const origins=env=>String(env.ORIGENS??'').split(',').map(s=>s.trim()).filter(Boolean);

export default {
 async fetch(request,env){
  const url=new URL(request.url),room=url.pathname.match(/^\/sala\/([^/]+)$/)?.[1];
  if(url.pathname==='/')return new Response('Auto-Pobre Racing · servidor das salas',{headers:{'content-type':'text/plain; charset=utf-8'}});
  if(!room||!ROOM.test(room))return new Response('Sala inválida',{status:404});
  if(request.headers.get('Upgrade')!=='websocket')return new Response('Esperava WebSocket',{status:426});
  if(!origins(env).includes(request.headers.get('Origin')??''))return new Response('Origem não permitida',{status:403});
  // South America: the room lives near the players.
  return env.SALAS.get(env.SALAS.idFromName(room),{locationHint:'sam'}).fetch(request);
 }
};

export class Sala {
 constructor(state,env){
  this.state=state;this.env=env;
  this.peers=new Map();        // id -> peer (authenticated connections)
  this.tokens=new Map();       // token -> {id, token, admitted, since}: who has been in this room
  this.banned=new Set();       // tokens the host kicked
  this.hostId=null;this.hostToken=null;this.hostAwayTimer=null;this.porteiro=true;
  this.fails=[];this.refuseUntil=0;this.grace=Number(env.HOST_GRACE_MS)||HOST_GRACE;this.authWait=Number(env.AUTH_WAIT_MS)||AUTH_WAIT;
 }
 async fetch(){
  const [client,socket]=Object.values(new WebSocketPair());
  socket.accept();
  const peer={socket,id:null,token:null,authed:false,window:{since:Date.now(),messages:0,bytes:0,over:0}};
  peer.authTimer=setTimeout(()=>{if(!peer.authed)this.shut(peer,CLOSE.late,'Sem chave a tempo');},this.authWait);
  socket.addEventListener('message',e=>this.message(peer,e.data));
  socket.addEventListener('close',()=>this.gone(peer));
  // An error ends the connection for good: closed here too, so the player's browser notices and
  // connects again (left open, it would wait on a line the room no longer serves).
  socket.addEventListener('error',()=>this.shut(peer,1011,'Erro na conexão'));
  return new Response(null,{status:101,webSocket:client});
 }
 // Once per connection: closing a broken socket may raise its error again.
 shut(peer,code,reason){if(peer.shut)return;peer.shut=true;try{peer.socket.close(code,reason);}catch{}this.gone(peer);}
 send(peer,m){try{peer.socket.send(JSON.stringify(m));}catch{}}
 // Messages and bytes per second per connection: over the limit a message is dropped, and a
 // connection that stays over it for OVER_LIMIT_CLOSE seconds is closed.
 allow(peer,size){
  const w=peer.window,now=Date.now();
  if(now-w.since>=1000){w.over=w.messages>RATE_MESSAGES||w.bytes>RATE_BYTES?w.over+1:0;w.since=now;w.messages=0;w.bytes=0;if(w.over>=OVER_LIMIT_CLOSE){this.shut(peer,CLOSE.flood,'Mensagens demais');return false;}}
  w.messages++;w.bytes+=size;return w.messages<=RATE_MESSAGES&&w.bytes<=RATE_BYTES;
 }
 message(peer,data){
  if(typeof data!=='string'||data.length>MAX_BYTES){this.shut(peer,CLOSE.flood,'Mensagem grande demais');return;}
  if(!this.allow(peer,data.length))return;
  let m;try{m=JSON.parse(data);}catch{return;}
  if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.t!=='string')return;
  if(!peer.authed){if(m.t==='auth')this.auth(peer,m);return;}
  // The line check (net-room.js): answered here, whatever the host is doing; no answer for a few
  // seconds tells the player's game its connection is dead before the browser notices.
  if(m.t==='eco'){this.send(peer,{t:'eco'});return;}
  const host=peer.id===this.hostId;
  if(!(host?HOST_TYPES:GUEST_TYPES).has(m.t))return;
  m.from=peer.id;
  if(host)this.fromHost(peer,m);
  else{
   const entry=this.tokens.get(peer.token);
   if(m.t==='bye'){this.shut(peer,1000,'Saiu');return;}
   // A guest outside the door is only heard by the host through its knock (again, with the name it
   // typed while waiting).
   if(entry?.admitted)this.toHost(m);
   else if(m.t==='hello'){const name=cleanName(m.name);if(name!==peer.name){peer.name=name;this.toHost({t:'knock',id:peer.id,name});}}
  }
 }
 auth(peer,m){
  const now=Date.now();
  if(now<this.refuseUntil){this.shut(peer,CLOSE.busy,'Tente de novo em um minuto');return;}
  if(!this.env.CHAVE_GRUPO||!sameKey(m.key,this.env.CHAVE_GRUPO)){
   this.fails=this.fails.filter(t=>now-t<60000);this.fails.push(now);
   if(this.fails.length>=FAILS_PER_MINUTE)this.refuseUntil=now+60000;
   this.shut(peer,CLOSE.key,'Chave errada');return;
  }
  const token=typeof m.token==='string'&&TOKEN.test(m.token)?m.token:null;
  if(token&&this.banned.has(token)){this.shut(peer,CLOSE.kicked,'Removido pelo anfitrião');return;}
  let entry=token?this.tokens.get(token):null;
  // The same tab again (a reload, or a duplicated tab): the newer connection keeps the identity.
  if(entry){const old=this.peers.get(entry.id);if(old&&old!==peer){this.peers.delete(entry.id);try{old.socket.close(CLOSE.elsewhere,'Aberta em outra aba');}catch{}}}
  if(!entry&&this.peers.size>=MAX_PEERS){this.shut(peer,CLOSE.full,'Sala cheia');return;}
  if(!entry){entry={id:this.newId(),token:hex(16),admitted:false,since:now};this.tokens.set(entry.token,entry);}
  peer.token=entry.token;peer.id=entry.id;peer.name=cleanName(m.name);peer.authed=true;clearTimeout(peer.authTimer);
  this.peers.set(peer.id,peer);
  // The first in an empty room hosts it; a host back within the grace takes it again.
  const hostBack=this.hostToken===peer.token;
  if(!this.hostId||hostBack||!this.peers.has(this.hostId)&&!this.hostAwayTimer){
   if(!hostBack&&this.hostId&&this.hostId!==peer.id)this.hostToken=null;
   this.makeHost(peer);
  }
  const role=peer.id===this.hostId?'host':'guest';
  if(role==='host')entry.admitted=true;else if(!this.porteiro)entry.admitted=true;
  this.send(peer,{t:'welcome',id:peer.id,token:peer.token,role,host:this.hostId,pending:!entry.admitted});
  if(hostBack)this.toGuests({t:'host',id:peer.id});
  if(role==='host')this.knocks();else if(!entry.admitted)this.toHost({t:'knock',id:peer.id,name:peer.name});
 }
 // Everyone still waiting at the door knocks again for a host that has just (re)taken the room.
 knocks(){for(const p of this.peers.values())if(p.id!==this.hostId&&!this.tokens.get(p.token)?.admitted)this.toHost({t:'knock',id:p.id,name:p.name});}
 newId(){let id;do id=hex(4);while([...this.tokens.values()].some(e=>e.id===id));return id;}
 makeHost(peer){
  clearTimeout(this.hostAwayTimer);this.hostAwayTimer=null;
  this.hostId=peer.id;this.hostToken=peer.token;const entry=this.tokens.get(peer.token);if(entry)entry.admitted=true;
 }
 fromHost(peer,m){
  const to=typeof m.to==='string'&&ID.test(m.to)?this.peers.get(m.to):null;
  switch(m.t){
   case 'config':this.porteiro=m.porteiro!==false;return;
   case 'admit':{if(!to)return;const e=this.tokens.get(to.token);if(e&&!e.admitted){e.admitted=true;this.send(to,{t:'admitted'});}return;}
   case 'deny':if(to&&!this.tokens.get(to.token)?.admitted)this.shut(to,CLOSE.denied,'Entrada recusada');return;
   case 'kick':if(to&&to!==peer){this.banned.add(to.token);this.shut(to,CLOSE.kicked,'Removido pelo anfitrião');}return;
   case 'pong':if(to)this.send(to,m);return;
   case 'bye':this.shut(peer,1000,'Saiu');return;
   default:this.toGuests(m);
  }
 }
 toHost(m){const host=this.peers.get(this.hostId);if(host)this.send(host,m);}
 toGuests(m){const data=JSON.stringify(m);for(const p of this.peers.values())if(p.id!==this.hostId&&this.tokens.get(p.token)?.admitted){try{p.socket.send(data);}catch{}}}
 gone(peer){
  clearTimeout(peer.authTimer);
  if(!peer.id||this.peers.get(peer.id)!==peer)return;
  this.peers.delete(peer.id);
  if(peer.id!==this.hostId){this.toHost({t:'bye',from:peer.id});return;}
  // The host left (a reload, most likely): its guests wait for it before one of them hosts.
  this.toGuests({t:'host-away'});
  clearTimeout(this.hostAwayTimer);
  this.hostAwayTimer=setTimeout(()=>{
   this.hostAwayTimer=null;if(this.peers.has(this.hostId))return;
   const next=[...this.peers.values()].sort((a,b)=>this.tokens.get(a.token).since-this.tokens.get(b.token).since)[0];
   this.hostId=null;this.hostToken=null;if(!next)return;
   this.makeHost(next);this.send(next,{t:'role',role:'host'});this.toGuests({t:'host',id:next.id});this.knocks();
  },this.grace);
 }
}
