import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const remote=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html'});
  if(req.url==='/first'){
    res.end('<!doctype html><html><body><div id="first-checkpoint">first document</div><script>setTimeout(()=>location.href="/second",180)</script></body></html>');
    return;
  }
  if(req.url==='/second'){
    res.end('<!doctype html><html><head><style>#final{animation:pulse 700ms ease-in-out infinite alternate}@keyframes pulse{to{transform:translateX(40px)}}</style></head><body><div id="navigation-final">final checkpoint</div><div id="final">animated final</div></body></html>');
    return;
  }
  res.end(`<!doctype html><html><head><style>html,body{margin:0}#box{width:120px;height:120px;background:#fff;animation:pulse 900ms ease-in-out infinite alternate}@keyframes pulse{to{transform:translateX(70px)}}</style></head><body><div id="box"></div><canvas id="canvas" width="320" height="180"></canvas><script>const c=canvas.getContext('2d');c.fillStyle='#0af';c.fillRect(0,0,320,180);</script></body></html>`);
});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`,port=4195,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',ANIMATOR_BROWSER_HEADLESS:'1'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);
  const opened=await api('POST','/api/control/open',{url:remoteUrl,engine:'chromium',profile:'desktop'});assert(opened.project?.browserSessionId,'Control API did not create a browser project');const sessionId=opened.project.browserSessionId;
  let status=await api('GET','/api/control/status');assert.equal(status.activeSessionId,sessionId,'Opened browser session was not marked active');assert.equal(status.activeSession?.recording,true,'Opened browser session did not start in REC');
  const stopStarted=performance.now(),stopped=await api('POST','/api/control/stop',{}),stopElapsed=performance.now()-stopStarted;assert(stopElapsed<500,`STOP API blocked for ${Math.round(stopElapsed)}ms`);assert.equal(stopped.state.recording,false,'STOP API did not immediately clear recording state');
  await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${sessionId}/state`);return state.snapshotReady===true;},'Asynchronous snapshot did not finish after STOP');
  const started=await api('POST','/api/control/start',{});assert.equal(started.state.recording,true,'START API did not immediately enable recording');
  const cliStopStarted=performance.now(),cliStop=await runCli(['stop','--server',base,'--json']),cliStopElapsed=performance.now()-cliStopStarted;assert(cliStopElapsed<900,`CLI stop blocked for ${Math.round(cliStopElapsed)}ms`);const cliStopBody=JSON.parse(cliStop.stdout);assert.equal(cliStopBody.state.recording,false,'CLI stop did not stop active capture');
  await api('POST','/api/control/start',{});await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${sessionId}/state`);return state.checkpointReady===true;},'Browser checkpoint was not created while recording');
  const closed=await api('POST','/api/control/close',{});assert.equal(closed.state.recording,false,'Closing browser did not auto-stop REC');assert.equal(closed.state.closed,true,'Closing browser did not mark window closed');assert.equal(closed.state.snapshotReady,true,'Closing browser did not promote checkpoint into project snapshot');
  const finalStatus=await api('GET','/api/control/status');assert.equal(finalStatus.activeSession?.recording,false,'Control status did not preserve automatic STOP');
  const cliStatus=await runCli(['status','--server',base,'--json']);const cliStatusBody=JSON.parse(cliStatus.stdout);assert.equal(cliStatusBody.activeSessionId,sessionId,'CLI status could not see active session');

  const navigationOpen=await api('POST','/api/control/open',{url:`${remoteUrl}first`,engine:'chromium',profile:'desktop'});assert(navigationOpen.project?.browserSessionId,'Navigation regression did not create a browser session');const navigationId=navigationOpen.project.browserSessionId;
  await waitUntil(async()=>{const state=await api('GET',`/api/browser-sessions/${navigationId}/state`);try{return new URL(state.url).pathname==='/second'&&state.checkpointReady===true;}catch{return false;}},'Current-page checkpoint was not created after first → second navigation');
  const navigationState=await api('GET',`/api/browser-sessions/${navigationId}/state`);assert.equal(new URL(navigationState.url).pathname,'/second','Navigation regression never reached the second document');
  const navigationClosed=await api('POST','/api/control/close',{});assert.equal(navigationClosed.state.snapshotReady,true,'Closing after navigation did not promote the current document checkpoint');
  const snapshotResponse=await fetch(`${base}/api/browser-sessions/${navigationId}/snapshot`,{cache:'no-store'});assert.equal(snapshotResponse.ok,true,'Navigation reconstruction endpoint is unavailable');const snapshotHtml=await snapshotResponse.text();assert.match(snapshotHtml,/id="navigation-final"[^>]*>final checkpoint/,'Reconstruction did not preserve the final navigated document');assert.doesNotMatch(snapshotHtml,/id="first-checkpoint"/,'Reconstruction reused the stale first-document checkpoint');assert.match(snapshotHtml,new RegExp(`<base href="http://127\\.0\\.0\\.1:${remotePort}/second`),'Reconstruction base URL did not track the final navigation');
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function api(method,path,body){const response=await fetch(base+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const text=await response.text();let value;try{value=text?JSON.parse(text):{};}catch{value={message:text};}if(!response.ok)throw new Error(value.error??value.message??`${method} ${path} failed: ${response.status}`);return value;}
async function runCli(values){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['bin/animator.mjs',...values],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('exit',code=>code===0?resolve({stdout,stderr}):reject(new Error(`CLI failed (${code})\n${stderr}\n${stdout}`)));});}
async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<300;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`${message}\n${serverLog}`);}
