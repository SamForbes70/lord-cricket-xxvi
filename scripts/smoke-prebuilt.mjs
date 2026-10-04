import {setTimeout,clearTimeout} from 'node:timers';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
const child=spawn(process.execPath,['start.mjs'],{env:{...process.env,PORT:'4188'},stdio:['ignore','pipe','pipe']});
try {
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);
  child.stdout.once('data',()=>{clearTimeout(timer);resolve();});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});
 });
 for(const path of ['/',...(await readdir('apps/web/dist/assets')).map(n=>'/assets/'+n)]){
  const r=await globalThis.fetch('http://127.0.0.1:4188'+path);
  if(!r.ok||(await r.arrayBuffer()).byteLength===0)throw new Error(`Asset failed: ${path}`);
  if(path.endsWith('.js')&&!r.headers.get('content-type')?.includes('javascript'))throw new Error('Worker/script MIME type incorrect');
 }
 console.log('PASS: dependency-free prebuilt server serves index and all production assets with correct script MIME types.');
}finally{child.kill('SIGTERM');}
