import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const remote=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><head><style>html,body{margin:0;min-height:100vh;background:#f5f5f5;color:#111}@media (prefers-color-scheme:dark){html,body{background:#101820;color:#fff}}</style></head><body><div style="padding:160px;font:700 42px sans-serif">viewport screenshot fixture</div></body></html>');});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`,port=4197,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',ANIMATOR_BROWSER_HEADLESS:'1'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({colorScheme:'dark'});await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});
    const open=await fetch(`${base}/api/control/open`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:remoteUrl,engine:'chromium',profile:'desktop'})});assert.equal(open.ok,true,`Could not open browser capture: ${await open.text()}`);
    const surface=page.locator('[data-browser-preview]');await surface.waitFor({state:'visible'});await waitUntil(async()=>await surface.getAttribute('data-browser-reconstruction-ready')==='true','Browser reconstruction never became ready');
    const stop=await fetch(`${base}/api/control/stop`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(stop.ok,true,`Could not stop browser capture: ${await stop.text()}`);
    const snapshot=page.locator('[data-browser-snapshot-frame]');await snapshot.waitFor({state:'attached'});const handle=await snapshot.elementHandle(),frame=await handle?.contentFrame();assert(frame,'Reconstructed frame missing');await frame.locator('body').waitFor();
    await installMarker(frame,'#ff00aa');
    const rendered=await frame.evaluate(()=>({dark:getComputedStyle(document.body).backgroundColor,marker:getComputedStyle(document.querySelector('#exact-frame-marker')).backgroundColor}));assert.equal(rendered.dark,'rgb(16, 24, 32)','Auto theme in visible viewport was not dark');assert.equal(rendered.marker,'rgb(255, 0, 170)','Visible frame marker was not applied');

    const button=page.locator('[data-viewport-screenshot]');await waitUntil(async()=>!(await button.isDisabled()),'Screenshot button never became enabled');await button.click();
    await assertSuccessToast(page);
    let clipboard=await readClipboardPixels(page);assertExactViewport(clipboard,{marker:'magenta'});
    await page.locator('[data-viewport-capture-toast="success"]').waitFor({state:'detached',timeout:4000});

    const loader=page.locator('.webLoader');await loader.locator('summary').click();await loader.locator('[data-web-url]').fill(remoteUrl);await loader.locator('[data-web-engine]').selectOption('proxy');await loader.locator('[data-web-open]').click();
    const proxyFrameElement=page.locator('[data-preview-frame]');await proxyFrameElement.waitFor({state:'attached'});const proxyHandle=await proxyFrameElement.elementHandle(),proxyFrame=await proxyHandle?.contentFrame();assert(proxyFrame,'Proxy frame missing');await proxyFrame.locator('body').waitFor();
    await installMarker(proxyFrame,'#00e5ff');
    const proxyRendered=await proxyFrame.evaluate(()=>({dark:getComputedStyle(document.body).backgroundColor,marker:getComputedStyle(document.querySelector('#exact-frame-marker')).backgroundColor}));assert.equal(proxyRendered.dark,'rgb(16, 24, 32)','Proxy Auto theme in visible viewport was not dark');assert.equal(proxyRendered.marker,'rgb(0, 229, 255)','Proxy visible-frame marker was not applied');
    await waitUntil(async()=>!(await button.isDisabled()),'Screenshot button never became enabled for Proxy');await button.click();await assertSuccessToast(page);clipboard=await readClipboardPixels(page);assertExactViewport(clipboard,{marker:'cyan'});
    await page.locator('[data-viewport-capture-toast="success"]').waitFor({state:'detached',timeout:4000});
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function installMarker(frame,color){await frame.evaluate(value=>{document.querySelector('#exact-frame-marker')?.remove();const marker=document.createElement('div');marker.id='exact-frame-marker';Object.assign(marker.style,{position:'fixed',left:'20px',top:'20px',width:'90px',height:'90px',background:value,zIndex:'2147483646'});document.body.append(marker);},color);}
async function assertSuccessToast(page){const toast=page.locator('[data-viewport-capture-toast="success"]');await toast.waitFor({state:'visible',timeout:15000});assert.equal(await toast.textContent(),'Screenshot copied','Success toast copy mismatch');}
async function readClipboardPixels(page){return page.evaluate(async()=>{const items=await navigator.clipboard.read(),blob=await items[0].getType('image/png'),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const marker=Array.from(context.getImageData(30,30,1,1).data),background=Array.from(context.getImageData(Math.min(500,bitmap.width-1),Math.min(500,bitmap.height-1),1,1).data);return{types:items.flatMap(item=>item.types),width:bitmap.width,height:bitmap.height,marker,background};});}
function assertExactViewport(clipboard,{marker}){assert(clipboard.types.includes('image/png'),`Clipboard did not contain image/png: ${clipboard.types.join(', ')}`);assert.equal(clipboard.width,1100,'Screenshot width did not match visible viewport');assert.equal(clipboard.height,700,'Screenshot height did not match visible viewport');if(marker==='magenta')assert(clipboard.marker[0]>240&&clipboard.marker[1]<20&&clipboard.marker[2]>150,`Screenshot did not contain current-frame marker: ${clipboard.marker.join(',')}`);else assert(clipboard.marker[0]<20&&clipboard.marker[1]>210&&clipboard.marker[2]>235,`Proxy screenshot did not contain current-frame marker: ${clipboard.marker.join(',')}`);assert(clipboard.background[0]<40&&clipboard.background[1]<50&&clipboard.background[2]<60,`Screenshot lost Auto dark theme: ${clipboard.background.join(',')}`);}
async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<240;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`${message}\n${serverLog}`);}
