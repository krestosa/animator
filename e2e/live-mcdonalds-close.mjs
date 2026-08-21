import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port=4196,base=`http://127.0.0.1:${port}`,target='https://www.mcdonalds.com.ar';
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',ANIMATOR_BROWSER_HEADLESS:'1'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);
  const opened=await api('POST','/api/control/open',{url:target,engine:'chromium',profile:'desktop'});assert(opened.project?.browserSessionId,'McDonalds smoke did not create a browser session');const id=opened.project.browserSessionId;
  await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${id}/state`);return state.checkpointReady===true;},'McDonalds browser session never produced an emergency checkpoint',40000);
  const before=await api('GET',`/api/browser-sessions/${id}/state`);assert.equal(before.recording,true,'McDonalds session stopped before browser close');assert.match(before.url,/mcdonalds\.com\.ar/i,'McDonalds navigation did not reach the requested origin');
  const closed=await api('POST','/api/control/close',{});assert.equal(closed.state.recording,false,'Browser close did not stop McDonalds REC');assert.equal(closed.state.closed,true,'Browser close did not mark McDonalds window closed');assert.equal(closed.state.snapshotReady,true,'Browser close did not promote the McDonalds checkpoint into a snapshot');
  const snapshotResponse=await fetch(`${base}/api/browser-sessions/${id}/snapshot`,{cache:'no-store'});assert.equal(snapshotResponse.ok,true,'McDonalds reconstructed snapshot endpoint is unavailable');const html=await snapshotResponse.text();assert(html.length>500,'McDonalds reconstructed snapshot is unexpectedly empty');assert.match(html,/__ANIMATOR_BROWSER_SNAPSHOT_RUNTIME__|ANIMATOR_SNAPSHOT_STATE/i,'McDonalds reconstructed document does not contain Animator reconstruction runtime');assert.match(html,/mcdonalds\.com\.ar/i,'McDonalds reconstructed document lost its source origin');
  console.log(JSON.stringify({ok:true,url:before.url,checkpointReady:before.checkpointReady,snapshotBytes:html.length,status:closed.state.snapshotStatus}));
} finally {server.kill('SIGTERM');}

async function api(method,path,body){const response=await fetch(base+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const text=await response.text();let value;try{value=text?JSON.parse(text):{};}catch{value={message:text};}if(!response.ok)throw new Error(value.error??value.message??`${method} ${path} failed: ${response.status}`);return value;}
async function waitForServer(url){for(let i=0;i<160;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message,timeout=20000){const started=Date.now();while(Date.now()-started<timeout){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`${message}\n${serverLog}`);}
