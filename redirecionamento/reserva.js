// When sair.js cannot load (the new address unreachable, a browser without modules), go there anyway,
// to the same page, without the saves.
setTimeout(function(){
 if(window.autopobreSaindo)return;
 location.replace('https://autopobre.com.br'+(location.pathname.replace(/^\/autopobre(?=\/|$)/,'')||'/')+location.search+location.hash);
},4000);
