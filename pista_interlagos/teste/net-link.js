// Room messages through the room server (sala-cloudflare), for players on different machines: one
// WebSocket per window. The group key goes first; the server answers with this tab's identity and
// role, stamps every relayed message with its sender, and decides who hosts. The tab keeps the
// server's token (sessionStorage) so a reload comes back as the same player. Room (net-room.js)
// speaks the same messages over this link as over the BroadcastChannel of the same-machine test.
// The server's address is also in the page's content policy (scripts/publicacao.py ROOM_SERVER).
export const ROOM_SERVER='wss://sala.inteligenciamilgrau.com.br';
// wrangler dev on this machine (&servidor=local), for the checks.
export const LOCAL_SERVER='ws://127.0.0.1:8787';
// Why the server closed the connection (sala-cloudflare/src/index.js CLOSE): the game says so. Its
// 4012 (the key came too late: a slow connection) is not here: a line that dropped, tried again.
export const CLOSED=Object.freeze({4001:'chave',4002:'cheia',4003:'recusado',4004:'expulso',4008:'excesso',4009:'ocupada',4010:'outra-aba',4011:'origem'});
const MAX_BYTES=65536,RETRIES=[1000,2000,4000,8000,15000];
const TOKEN=/^[0-9a-f]{32}$/;
const session=()=>{try{return globalThis.sessionStorage??null;}catch{return null;}};
export class ServerLink {
 // key and name: functions, read at each connection (the key may be typed after a refusal).
 // socket: how to open the WebSocket (the Node checks add the Origin a browser sends).
 constructor({url,room,key,name,storage=session(),socket=url=>new WebSocket(url)}){
  Object.assign(this,{url,room,key,name,storage,socket});this.ws=null;this.tries=0;this.closing=false;this.onmessage=null;this.onclose=null;this.onopen=null;
 }
 get tokenKey(){return 'autopobre-sala-token-'+this.room;}
 get token(){try{const t=this.storage?.getItem(this.tokenKey);return TOKEN.test(t??'')?t:null;}catch{return null;}}
 saveToken(token){if(!TOKEN.test(token??''))return;try{this.storage?.setItem(this.tokenKey,token);}catch{}}
 open(){
  this.closing=false;clearTimeout(this.retry);
  let ws;try{ws=this.ws=this.socket(`${this.url}/sala/${encodeURIComponent(this.room)}`);}catch{this.lost();return;}
  ws.onopen=()=>{this.tries=0;ws.send(JSON.stringify({t:'auth',key:this.key()??'',token:this.token,name:this.name()??''}));this.onopen?.();};
  ws.onmessage=e=>{
   if(typeof e.data!=='string'||e.data.length>MAX_BYTES)return;
   let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m&&typeof m==='object'&&!Array.isArray(m)){if(m.t==='welcome')this.saveToken(m.token);this.onmessage?.(m);}
  };
  ws.onclose=e=>{if(this.ws!==ws)return;this.ws=null;const reason=CLOSED[e.code];if(reason||this.closing)this.onclose?.(reason??'saiu');else this.lost();};
  ws.onerror=()=>{};
 }
 // The connection dropped (network, a server restart, the day's limit): try again, soon at first,
 // then every RETRIES' last delay for as long as the page stays ('fora' once the quick tries ran out).
 lost(){
  if(this.closing)return;const delay=RETRIES[Math.min(this.tries++,RETRIES.length-1)];
  this.onclose?.(this.tries>RETRIES.length?'fora':'reconectando');clearTimeout(this.retry);this.retry=setTimeout(()=>this.open(),delay);
 }
 // The room went quiet (net-room.js): this connection may be dead though the browser has not noticed
 // (it may take it a minute). A new one takes its place at once; the old one is left open, for the
 // server to close once the new one is in (the same token: no goodbye reaches the room, so a false
 // alarm costs nothing), or to die on its own. Not while a new one is still connecting.
 reconnect(){if(this.closing||!this.ws||this.ws.readyState===0)return;this.open();}
 // For the checks (multiplayer.js dropLine): the line drops as a network drops it, no goodbye; slow:
 // the next try only after the longest wait.
 drop(slow=false){const ws=this.ws;if(!ws)return;if(slow)this.tries=RETRIES.length-1;try{ws.close(4000);}catch{}}
 send(m){if(this.ws?.readyState===1)try{this.ws.send(JSON.stringify(m));}catch{}}
 close(){this.closing=true;clearTimeout(this.retry);try{this.ws?.close(1000);}catch{}this.ws=null;}
}
