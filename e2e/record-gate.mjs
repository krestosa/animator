import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const appPort=4191,appBase=`http://127.0.0.1:${appPort}`;
let documentHits=0,probeHits=0,slowHits=0,slowClosed=0;
const remote=createServer((req,res)=>{
  if(req.url==='/'){documentHits++;res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><style>html,body{margin:0;width:2600px;min-height:3200px}#marker{position:absolute;left:1800px;top:2400px;width:200px;height:120px;background:#468}</style></head><body><div id="marker"></div><script>window.__wheel=0;window.__scroll=0;window.__pointer=0;addEventListener('wheel',()=>window.__wheel++);addEventListener('scroll',()=>window.__scroll++);addEventListener('pointerdown',()=>window.__pointer++);addEventListener('pointermove',()=>window.__pointer++);</script></body></html>`);return;}
  if(req.url==='/probe'){probeHits++;res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;}
  if(req.url==='/slow'){slowHits++;req.on('close',()=>slowClosed++);res.writeHead(200,{'content-type':'text/plain'});setTimeout(()=>{if(!res.writableEnded)res.end('late');},5000);return;}
  res.writeHead(404);res.end('not found');
});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(appPort),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${appBase}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1360,height:900}});await page.goto(appBase,{waitUntil:'networkidle'});await page.locator('.app').waitFor();
    const record=page.locator('[data-action="record"]');await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='stopped','Record did not stop without a project');
    await page.locator('.webLoader>summary').click();await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-open]').click();
    const iframe=page.locator('[data-preview-frame]');await iframe.waitFor({state:'attached'});await page.waitForTimeout(350);assert.equal(documentHits,0,'remote document loaded while Record was STOPPED');assert.equal(await iframe.getAttribute('src'),'about:blank','preview was not held at about:blank while stopped');

    await record.click();await waitUntil(async()=>documentHits>0,'remote document did not load immediately after REC');await waitUntil(async()=>await record.getAttribute('data-recording-state')==='recording','Record did not enter recording state');let handle=await iframe.elementHandle(),frame=await handle?.contentFrame();assert(frame,'preview frame missing after REC');await frame.locator('#marker').waitFor();

    await frame.evaluate(()=>{window.__slowState='pending';fetch('/slow').then(()=>window.__slowState='resolved').catch(error=>window.__slowState=error?.name||'rejected');});await waitUntil(()=>slowHits===1,'slow request never started');
    await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='stopped','STOP did not apply immediately');await waitUntil(async()=>await frame.evaluate(()=>window.__slowState!=='pending'),'in-flight fetch was not aborted');assert.equal(await frame.evaluate(()=>window.__slowState),'AbortError','in-flight fetch did not reject with AbortError');
    await frame.evaluate(()=>{window.__blockedState='pending';fetch('/probe').then(()=>window.__blockedState='resolved').catch(error=>window.__blockedState=error?.name||'rejected');});await waitUntil(async()=>await frame.evaluate(()=>window.__blockedState!=='pending'),'fetch started in STOP did not settle');assert.equal(await frame.evaluate(()=>window.__blockedState),'AbortError','new fetch was not blocked in STOP');assert.equal(probeHits,0,'blocked fetch reached the remote server');

    await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='recording','REC did not resume');await frame.evaluate(()=>{window.__resumeState='pending';fetch('/probe').then(()=>window.__resumeState='resolved').catch(error=>window.__resumeState=error?.name||'rejected');});await waitUntil(async()=>await frame.evaluate(()=>window.__resumeState==='resolved'),'fetch did not resume after REC');assert.equal(probeHits,1,'resumed fetch did not reach server exactly once');

    const mouseToggle=page.locator('[data-web-interaction]');await mouseToggle.click();await waitUntil(async()=>await iframe.evaluate(node=>getComputedStyle(node).pointerEvents)==='none','mouse lock did not make iframe passive');
    const stage=page.locator('.stage'),box=await stage.boundingBox();assert(box,'stage missing');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,480);await waitUntil(async()=>await frame.evaluate(()=>scrollY>0),'passive vertical pan did not move viewport');await page.mouse.wheel(420,0);await waitUntil(async()=>await frame.evaluate(()=>scrollX>0),'passive horizontal pan did not move viewport');
    const beforeDrag=await frame.evaluate(()=>({x:scrollX,y:scrollY}));const cx=box.x+box.width/2,cy=box.y+box.height/2;await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-130,cy-150,{steps:5});await page.mouse.up();await waitUntil(async()=>await frame.evaluate(({x,y})=>scrollX>x+70&&scrollY>y+90,beforeDrag),'passive click-drag did not pan viewport');
    const pageInput=await frame.evaluate(()=>({wheel:window.__wheel,scroll:window.__scroll,pointer:window.__pointer,x:scrollX,y:scrollY}));assert.equal(pageInput.wheel,0,'locked preview delivered wheel to the web');assert.equal(pageInput.scroll,0,'locked preview delivered scroll events to the web');assert.equal(pageInput.pointer,0,'locked preview delivered pointer drag to the web');assert(pageInput.x>beforeDrag.x&&pageInput.y>beforeDrag.y,'locked preview drag did not pan both axes');
    await mouseToggle.click();await waitUntil(async()=>await iframe.evaluate(node=>getComputedStyle(node).pointerEvents)==='auto','mouse interaction did not restore');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<100;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await delay(80);}throw new Error(`app server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<160;i++){if(await check())return;await delay(50);}throw new Error(message);}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
