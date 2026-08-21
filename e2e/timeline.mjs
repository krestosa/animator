import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port=4173,base=`http://127.0.0.1:${port}`;
const remoteFixture=createServer((req,res)=>{
  if(req.url==='/remote'){res.writeHead(301,{location:'/remote/'});res.end();return;}
  if(req.url==='/remote/style.css'){res.writeHead(200,{'content-type':'text/css'});res.end('#remote-card{opacity:0;animation:remote-in .25s ease-out both}@keyframes remote-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}');return;}
  if(req.url==='/remote/app.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end('window.__remoteLoaded=true;document.documentElement.dataset.remoteScript="ok";');return;}
  if(req.url==='/remote/'){res.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'",'x-frame-options':'DENY'});res.end('<!doctype html><html><head><link rel="stylesheet" href="style.css"><title>Remote</title></head><body><h1 id="remote-card">Remote page</h1><script src="app.js"></script></body></html>');return;}
  res.writeHead(404);res.end('not found');
});
const remotePort=await listen(remoteFixture),remoteUrl=`http://127.0.0.1:${remotePort}/remote`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),browserErrors=[];
    page.on('pageerror',error=>browserErrors.push(`pageerror: ${error.stack??error.message}`));page.on('console',message=>{if(message.type()==='error')browserErrors.push(`console: ${message.text()}`);});
    await page.goto(base,{waitUntil:'networkidle'});
    try{await page.locator('.app').waitFor({state:'attached',timeout:5000});}catch{throw new Error(`editor did not mount; url=${page.url()} errors=${browserErrors.join(' | ')||'none'} html=${(await page.content()).slice(0,1800)}`);}
    await page.locator('.toolbarMore>summary').click();await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));await page.locator('[data-action="open-project"]').click();
    const frameLocator=page.locator('[data-preview-frame]');await frameLocator.waitFor({state:'attached'});await waitUntil(async()=>/^http:\/\/127\.0\.0\.1:\d+\//.test(await frameLocator.getAttribute('src')??''),'preview did not use dedicated origin');
    let frameHandle=await frameLocator.elementHandle(),frame=await frameHandle?.contentFrame();assert(frame,'preview iframe missing');await frame.locator('.repeat-motion').first().waitFor();
    await waitUntil(async()=>await page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).count()===1,'repeat-pop group missing');
    const group=page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).first();await waitUntil(async()=>/3 components/.test(await group.textContent()??''),'repeat-pop instances not grouped');
    await group.locator('[data-v2-toggle]').click();await waitUntil(async()=>await page.locator('.v2InstanceRow').count()>=3,'instances did not expand');
    const firstInstance=page.locator('.v2InstanceRow').first();await firstInstance.locator('.v2InstanceLabel button[data-v2-instance]').click();await waitUntil(async()=>await firstInstance.evaluate(node=>node.classList.contains('selected')),'instance selection failed');

    const labelWidth=Number.parseFloat(await page.locator('[data-timeline-v2]').evaluate(node=>getComputedStyle(node).getPropertyValue('--timeline-label-width')));assert(labelWidth>=260,`timeline label column stayed too narrow: ${labelWidth}`);
    const badOverflow=await page.locator('.v2GroupRow,.v2InstanceRow').evaluateAll(rows=>rows.some(row=>{const content=row.querySelector('.v2GroupButton,.v2InstanceLabel button[data-v2-instance]');if(!content)return false;const parts=[...content.querySelectorAll('span,small')];const overflow=parts.some(part=>part.scrollWidth>part.clientWidth+1);return overflow&&!row.querySelector('.v2DetailToggle');}));assert.equal(badOverflow,false,'timeline text overflows without an expand disclosure');
    const clippedVertical=await page.locator('.v2InstanceRow').evaluateAll(rows=>rows.some(row=>{const small=row.querySelector('small');if(!small)return false;return small.getBoundingClientRect().bottom>row.getBoundingClientRect().bottom+1;}));assert.equal(clippedVertical,false,'timeline metadata is vertically clipped');

    await page.locator('[data-focus-mode]').click();await waitUntil(async()=>await frame.locator('[data-animator-focus-overlay]').count()===1,'focus spotlight missing');assert.notEqual(await page.locator('.toolbar').evaluate(node=>getComputedStyle(node).display),'none','Focus hid editor UI');
    await page.locator('[data-magnify-mode]').click();await waitUntil(async()=>await frameLocator.getAttribute('data-camera-zoom')==='on','camera zoom did not activate');
    const camera=await frameLocator.evaluate(node=>({transform:node.style.transform,scale:Number(node.dataset.cameraScale),pointer:getComputedStyle(node).pointerEvents}));assert(camera.scale>1,`camera did not zoom in: ${JSON.stringify(camera)}`);assert(/translate3d\(.+scale\(/.test(camera.transform),'camera zoom is not a translated viewport transform');
    assert.equal(await frame.locator('[data-animator-magnify-host]').count(),0,'legacy cloned-element magnifier is still visible/active');

    const mouseButton=page.locator('[data-web-interaction]');await mouseButton.click();await waitUntil(async()=>await frameLocator.evaluate(node=>getComputedStyle(node).pointerEvents)==='none','mouse lock did not disable iframe interaction');assert(await page.locator('.stage').evaluate(node=>node.classList.contains('webMouseLocked')),'mouse lock state is not visible in editor');
    await mouseButton.click();await waitUntil(async()=>await frameLocator.evaluate(node=>getComputedStyle(node).pointerEvents)==='auto','mouse interaction did not restore');
    await page.keyboard.press('Escape');await waitUntil(async()=>await frameLocator.getAttribute('data-camera-zoom')!=='on','Escape did not reset camera zoom');

    const timeline=page.locator('[data-timeline-v2]');
    const seekTo=async ms=>{const rail=page.locator('[data-v2-scrub-rail]').first();await rail.waitFor({state:'visible'});const scale=Number(await timeline.getAttribute('data-px-per-ms')),origin=Number(await timeline.getAttribute('data-origin-ms')??0),box=await rail.boundingBox();assert(box&&scale>0);await rail.click({position:{x:Math.max(.5,Math.min(box.width-.5,(ms-origin)*scale)),y:box.height/2},force:true});await page.waitForTimeout(80);};
    const visual=async()=>frame.locator('.repeat-motion').first().evaluate(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform}));
    await page.locator('[data-isolate="all"]').click();await seekTo(0);const start=await visual();await seekTo(400);const middle=await visual();await seekTo(0);const back=await visual();assert(middle.opacity>start.opacity+.1,'timeline scrub did not advance animation');assert.equal(back.transform,start.transform,'reverse scrub did not restore the initial frame');
    await page.keyboard.press('Home');await page.locator('[data-preview-step="1"]').click();await waitUntil(async()=>/Frame 1/.test(await page.locator('[data-preview-frame-label]').textContent()??''),'frame stepping failed');
    await page.evaluate(()=>{window.__heartbeat=0;window.__heartbeatTimer=setInterval(()=>window.__heartbeat++,10);});await page.locator('[data-action="play"]').click();await page.waitForTimeout(300);const heartbeat=await page.evaluate(()=>window.__heartbeat);await page.locator('[data-action="pause"]').click();await page.evaluate(()=>clearInterval(window.__heartbeatTimer));assert(heartbeat>10,`playback blocked editor UI: ${heartbeat}`);

    const more=page.locator('.toolbarMore');if(await more.count())await more.evaluate(element=>{if(element instanceof HTMLDetailsElement)element.open=false;});const localSrc=await frameLocator.getAttribute('src');await page.locator('.webLoader>summary').click();await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-open]').click();
    await waitUntil(async()=>{const src=await frameLocator.getAttribute('src');return !!src&&src!==localSrc&&/\/remote\/$/.test(new URL(src).pathname);},'remote redirect was not preserved in iframe URL');frameHandle=await frameLocator.elementHandle();frame=await frameHandle?.contentFrame();assert(frame,'remote frame missing');await frame.locator('#remote-card').waitFor();assert(await frame.evaluate(()=>window.__remoteLoaded===true&&document.documentElement.dataset.remoteScript==='ok'),'remote relative JS did not load');assert.equal(await frame.locator('#remote-card').evaluate(node=>getComputedStyle(node).animationName),'remote-in','remote relative CSS did not load');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remoteFixture);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<160;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
