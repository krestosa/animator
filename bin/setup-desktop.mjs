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

const npmCommand=process.platform==='win32'?'npm.cmd':'npm';
const env={
  ...process.env,
  ELECTRON_CACHE:electronCache,
  npm_config_cache:npmCache,
  PLAYWRIGHT_BROWSERS_PATH:path.join(root,'.animator-browsers')
};

const code=await new Promise((resolve,reject)=>{
  const child=spawn(npmCommand,['install','--no-audit','--no-fund'],{cwd:root,env,stdio:'inherit',windowsHide:true});
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
