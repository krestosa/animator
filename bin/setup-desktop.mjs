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
  electron_config_cache:electronCache,
  npm_config_cache:npmCache,
  npm_config_audit:'false',
  npm_config_fund:'false',
  npm_config_update_notifier:'false',
  PLAYWRIGHT_BROWSERS_PATH:path.join(root,'.animator-browsers')
}).filter((entry)=>typeof entry[1]==='string'));

function run(command,args,options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env,stdio:'inherit',windowsHide:true,...options});
    child.once('error',reject);
    child.once('exit',value=>resolve(value??1));
  });
}

async function npmInstall(){
  if(process.platform==='win32'){
    const command=process.env.ComSpec??process.env.COMSPEC??'C:\\Windows\\System32\\cmd.exe';
    return run(command,['/d','/s','/c','npm install --no-audit --no-fund']);
  }
  const npmCli=process.env.npm_execpath;
  return npmCli
    ?run(process.execPath,[npmCli,'install','--no-audit','--no-fund'])
    :run('npm',['install','--no-audit','--no-fund']);
}

let code=await npmInstall();
if(code!==0)process.exit(Number(code));

const electronInstaller=path.join(root,'node_modules','electron','install.js');
if(!fs.existsSync(electronInstaller))throw new Error(`Electron installer not found: ${electronInstaller}`);
code=await run(process.execPath,[electronInstaller]);
if(code!==0)process.exit(Number(code));

const executable=process.platform==='win32'
  ?path.join(root,'node_modules','electron','dist','electron.exe')
  :process.platform==='darwin'
    ?path.join(root,'node_modules','electron','dist','Electron.app','Contents','MacOS','Electron')
    :path.join(root,'node_modules','electron','dist','electron');
if(!fs.existsSync(executable))throw new Error(`Electron local runtime not found: ${executable}`);
console.log(`Electron local runtime: ${executable}`);
