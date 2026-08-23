#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cacheRoot=path.join(root,'.cache');
const electronCache=path.join(cacheRoot,'electron');
const npmCache=path.join(cacheRoot,'npm');
fs.mkdirSync(electronCache,{recursive:true});
fs.mkdirSync(npmCache,{recursive:true});

const env=Object.fromEntries(Object.entries({
  ...process.env,
  ELECTRON_CACHE:electronCache,
  npm_config_cache:npmCache,
  npm_config_audit:'false',
  npm_config_fund:'false',
  npm_config_update_notifier:'false',
  PLAYWRIGHT_BROWSERS_PATH:path.join(root,'.animator-browsers')
}).filter((entry)=>typeof entry[1]==='string'));

function npmInstall(){
  if(process.platform==='win32'){
    const command=process.env.ComSpec??process.env.COMSPEC??'C:\\Windows\\System32\\cmd.exe';
    return spawn(command,['/d','/s','/c','npm install --no-audit --no-fund'],{cwd:root,env,stdio:'inherit',windowsHide:true});
  }
  const npmCli=process.env.npm_execpath;
  return npmCli
    ?spawn(process.execPath,[npmCli,'install','--no-audit','--no-fund'],{cwd:root,env,stdio:'inherit'})
    :spawn('npm',['install','--no-audit','--no-fund'],{cwd:root,env,stdio:'inherit'});
}

const code=await new Promise((resolve,reject)=>{
  const child=npmInstall();
  child.once('error',reject);
  child.once('exit',value=>resolve(value??1));
});
if(code!==0)process.exit(Number(code));

const executable=process.platform==='win32'
  ?path.join(root,'node_modules','electron','dist','electron.exe')
  :process.platform==='darwin'
    ?path.join(root,'node_modules','electron','dist','Electron.app','Contents','MacOS','Electron')
    :path.join(root,'node_modules','electron','dist','electron');
if(!fs.existsSync(executable))throw new Error(`Electron local runtime not found: ${executable}`);
console.log(`Electron local runtime: ${executable}`);
