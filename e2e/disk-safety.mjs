import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port=4191,base=`http://127.0.0.1:${port}`,root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-disk-safety-')),projectRoot=path.join(root,'project');
fs.cpSync(path.join(process.cwd(),'fixture'),projectRoot,{recursive:true});
const remote=createServer((req,res)=>{if(req.url==='/style.css'){res.writeHead(200,{'content-type':'text/css','cache-control':'no-store'});res.end('#moving{animation:move 900ms ease-in-out infinite alternate}@keyframes move{to{transform:translateX(60px)}}');return;}res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="moving">disk safety</div></body></html>');});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const projectBefore=snapshotTree(projectRoot);
  const idleIoBefore=readProcessIo(server.pid);
  const opened=await api('POST','/api/projects/open',{path:projectRoot});
  assert(opened.id,'local project did not open');
  for(let i=0;i<60;i++){
    const [health,analysis,source]=await Promise.all([
      fetch(`${base}/api/health`,{cache:'no-store'}),
      fetch(`${base}/api/projects/${opened.id}/analysis`,{cache:'no-store'}),
      fetch(`${base}/api/projects/${opened.id}/source?path=${encodeURIComponent('styles.css')}`,{cache:'no-store'})
    ]);
    assert(health.ok&&analysis.ok&&source.ok,'read-only request failed during disk safety test');
  }
  await delay(3500);
  const idleIoAfter=readProcessIo(server.pid),projectAfter=snapshotTree(projectRoot);
  assert.deepEqual(projectAfter,projectBefore,'opening, analyzing or idling rewrote the loaded project');
  assert.equal(fs.existsSync(path.join(projectRoot,'.animator')),false,'read-only use created a .animator write directory');
  const idleWriteBytes=Math.max(0,(idleIoAfter?.write_bytes??0)-(idleIoBefore?.write_bytes??0));
  if(idleIoBefore&&idleIoAfter)assert(idleWriteBytes<=262144,`server wrote ${idleWriteBytes} bytes during read-only idle use`);

  const browserOpen=await api('POST','/api/browser-sessions/open',{url:remoteUrl,engine:'chromium',profile:'desktop',width:900,height:640});
  assert(browserOpen.id,'browser capture did not open');
  await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${browserOpen.id}/state`);return state.checkpointReady===true;},'browser checkpoint never became ready',20000);
  await delay(800);
  const steadyBefore=readProcessTreeIo(server.pid);
  await delay(5000);
  const steadyAfter=readProcessTreeIo(server.pid);
  const steadyWriteBytes=Math.max(0,steadyAfter.write_bytes-steadyBefore.write_bytes);
  assert(steadyWriteBytes<=2097152,`browser recording wrote ${steadyWriteBytes} bytes in a 5s steady-state window`);
  assert.deepEqual(snapshotTree(projectRoot),projectBefore,'browser recording changed the loaded project on disk');
  await api('POST',`/api/browser-sessions/${browserOpen.id}/command`,{type:'SET_RECORDING',enabled:false});
  await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${browserOpen.id}/state`);return state.snapshotReady===true||state.snapshotStatus==='error';},'browser recording did not finalize',15000);
  await api('DELETE',`/api/browser-sessions/${browserOpen.id}`);

  const css='.disk-safe{opacity:.7}',ts='export const diskSafe=true;';
  const first=await api('POST',`/api/projects/${opened.id}/export-overrides`,{css,ts});
  assert.equal(first.changed,true,'initial explicit export did not report a write');
  const firstStats={css:statFingerprint(first.cssPath),ts:statFingerprint(first.tsPath)};
  await delay(50);
  const repeated=await api('POST',`/api/projects/${opened.id}/export-overrides`,{css,ts});
  assert.equal(repeated.changed,false,'identical explicit export was not treated as a no-op');
  assert.deepEqual(statFingerprint(first.cssPath),firstStats.css,'identical CSS export rewrote the same bytes');
  assert.deepEqual(statFingerprint(first.tsPath),firstStats.ts,'identical TypeScript export rewrote the same bytes');

  console.log(JSON.stringify({ok:true,idleWriteBytes,browserSteadyWriteBytes:steadyWriteBytes,idleWindowMs:3500,browserSteadyWindowMs:5000,projectWritesDuringReadOnly:0,redundantExportWrites:0}));
} finally {
  server.kill('SIGTERM');
  await closeServer(remote);
  fs.rmSync(root,{recursive:true,force:true});
}

function snapshotTree(dir){const out={};for(const file of walk(dir)){const relative=path.relative(dir,file).split(path.sep).join('/'),stat=fs.statSync(file),data=fs.readFileSync(file);out[relative]={size:stat.size,hash:createHash('sha256').update(data).digest('hex')};}return out;}
function walk(dir){const files=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const next=path.join(dir,entry.name);if(entry.isDirectory())files.push(...walk(next));else if(entry.isFile())files.push(next);}return files.sort();}
function statFingerprint(file){const stat=fs.statSync(file);return{size:stat.size,mtimeMs:stat.mtimeMs,hash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};}
function readProcessIo(pid){if(!pid)return null;try{const text=fs.readFileSync(`/proc/${pid}/io`,'utf8'),out={};for(const line of text.split('\n')){const match=line.match(/^(\w+):\s+(\d+)$/);if(match)out[match[1]]=Number(match[2]);}return out;}catch{return null;}}
function readProcessTreeIo(pid){const pids=[pid,...descendants(pid)],total={write_bytes:0,syscw:0};for(const current of pids){const io=readProcessIo(current);if(!io)continue;total.write_bytes+=io.write_bytes??0;total.syscw+=io.syscw??0;}return total;}
function descendants(pid,seen=new Set()){if(!pid||seen.has(pid))return[];seen.add(pid);let children=[];try{children=fs.readFileSync(`/proc/${pid}/task/${pid}/children`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number);}catch{}const out=[];for(const child of children){out.push(child,...descendants(child,seen));}return out;}
async function api(method,pathname,body){const response=await fetch(`${base}${pathname}`,{method,headers:body===undefined?undefined:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const text=await response.text();if(!response.ok)throw new Error(`${method} ${pathname}: ${response.status} ${text}`);if(!text)return{};try{return JSON.parse(text);}catch{return text;}}
async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('test server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await delay(100);}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message,timeout=10000){const started=Date.now();while(Date.now()-started<timeout){if(await check())return;await delay(100);}throw new Error(message);}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
