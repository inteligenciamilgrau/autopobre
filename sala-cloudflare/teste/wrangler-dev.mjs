// wrangler dev for the checks: the room server on this machine, with the key and the origins of
// .dev.vars. Returns stop(); the process tree is killed on exit too.
import {spawn,execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE=fileURLToPath(new URL('..',import.meta.url));
export async function startWrangler({port,vars={}}){
 const args=[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),'dev','--ip','127.0.0.1','--port',String(port),'--show-interactive-dev-session=false'];
 for(const [k,v] of Object.entries(vars))args.push('--var',`${k}:${v}`);
 const dev=spawn(process.execPath,args,{cwd:HERE,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 let log='';dev.stdout.on('data',d=>log+=d);dev.stderr.on('data',d=>log+=d);
 const stop=()=>{try{process.platform==='win32'?execSync(`taskkill /pid ${dev.pid} /T /F`,{stdio:'ignore'}):dev.kill();}catch{}};
 process.on('exit',stop);
 const end=Date.now()+90000;
 while(!/Ready on/.test(log)){if(Date.now()>end||dev.exitCode!==null){stop();throw new Error('wrangler dev did not start: '+log);}await new Promise(r=>setTimeout(r,200));}
 return stop;
}
