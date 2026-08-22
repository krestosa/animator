import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Keeps disposable browser/runtime files off persistent storage when the OS
 * exposes a real memory-backed temporary filesystem. This is deliberately
 * conservative: it never creates a RAM disk and never redirects project,
 * export, npm, or browser-runtime installation data.
 */
function writableDirectory(value:string):boolean{
  try{const stat=fs.statSync(value);if(!stat.isDirectory())return false;fs.accessSync(value,fs.constants.W_OK|fs.constants.X_OK);return true;}catch{return false;}
}

function memoryTempRoot():string|undefined{
  if(process.env.ANIMATOR_RAM_TMP&&writableDirectory(process.env.ANIMATOR_RAM_TMP))return process.env.ANIMATOR_RAM_TMP;
  if(process.platform==='linux'){
    for(const candidate of ['/dev/shm',`/run/user/${typeof process.getuid==='function'?process.getuid():''}`])if(candidate&&!candidate.endsWith('/')&&writableDirectory(candidate))return candidate;
  }
  return undefined;
}

const root=memoryTempRoot();
if(root){
  const dir=path.join(root,`animator-${process.pid}`);
  try{
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    process.env.TMPDIR=dir;
    process.env.TMP=dir;
    process.env.TEMP=dir;
    process.env.ANIMATOR_EFFECTIVE_TEMP=dir;
    const cleanup=()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}};
    process.once('exit',cleanup);
    process.once('SIGINT',()=>{cleanup();process.exit(130);});
    process.once('SIGTERM',()=>{cleanup();process.exit(143);});
  }catch{}
}

export const animatorTempDirectory=process.env.ANIMATOR_EFFECTIVE_TEMP??os.tmpdir();
