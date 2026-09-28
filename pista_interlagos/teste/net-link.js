// Room messages through the room server (sala-cloudflare), for players on different machines: one
// WebSocket per window. The group key goes first; the server answers with this tab's identity and
// role, stamps every relayed message with its sender, and decides who hosts. The tab keeps the
// server's token (sessionStorage) so a reload comes back as the same player. Room (net-room.js)
// speaks the same messages over this link as over the BroadcastChannel of the same-machine test.
// The server's address is also in the page's content policy (scripts/publicacao.py ROOM_SERVER).
export const ROOM_SERVER='wss://sala.inteligenciamilgrau.com.br';
// wrangler dev on this machine (&servidor=local), for the checks.
export const LOCAL_SERVER='ws://127.0.0.1:8787';
// Why the server closed the connection (sala-cloudflare/src/index.js CLOSE): the game says so.
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
 // The connection dropped (network, a server restart, the day's limit): try again a few times.
 lost(){
  if(this.closing)return;const delay=RETRIES[this.tries++];
  if(delay===undefined){this.onclose?.('fora');return;}
  this.onclose?.('reconectando');this.retry=setTimeout(()=>this.open(),delay);
 }
 send(m){if(this.ws?.readyState===1)try{this.ws.send(JSON.stringify(m));}catch{}}
 close(){this.closing=true;clearTimeout(this.retry);try{this.ws?.close(1000);}catch{}this.ws=null;}
}
