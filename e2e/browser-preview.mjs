import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const remote=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><title>Browser fixture</title><style>html,body{margin:0;min-height:2400px}button{margin:100px;width:180px;height:70px;animation:fixture-pulse 800ms ease-in-out infinite alternate;transition:opacity 180ms ease,transform 220ms ease}@keyframes fixture-pulse{from{transform:translateY(0)}to{transform:translateY(14px)}}button.clicked{opacity:.45;transform:scale(.94)}</style></head><body><button id="button">click me</button><script>window.clicks=0;button.addEventListener('click',()=>{window.clicks++;button.classList.toggle('clicked');document.body.dataset.clicked=String(window.clicks)});button.animate([{filter:'brightness(1)'},{filter:'brightness(1.18)'}],{duration:1100,iterations:Infinity,direction:'alternate'});</script></body></html>`);});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`,port=4194,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.app').waitFor();
    await page.evaluate(()=>{window.__animatorFrameInsertions=0;const device=document.querySelector('[data-device]');if(!device)return;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node instanceof HTMLIFrameElement&&node.matches('[data-preview-frame]'))window.__animatorFrameInsertions++;else if(node instanceof Element)window.__animatorFrameInsertions+=node.querySelectorAll('iframe[data-preview-frame]').length;}}).observe(device,{childList:true,subtree:true});});
    const engineControl=page.locator('select[data-browser-engine]'),profileControl=page.locator('select[data-browser-profile]');
    const options=await engineControl.locator('option').allTextContents();assert.deepEqual(options,['Chromium','Firefox','Safari / WebKit'],'Browser engine selector is incomplete');
    const combinations=[
      ['chromium','mobile'],['firefox','desktop'],['firefox','mobile'],['webkit','desktop'],['webkit','mobile'],['chromium','desktop']
    ];
    for(const [engine,profile] of combinations){
      const loader=page.locator('.webLoader');if(!(await loader.getAttribute('open')))await page.locator('.webLoader>summary').click();
      await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-engine]').selectOption('browser');await engineControl.selectOption(engine);await profileControl.selectOption(profile);await page.locator('[data-web-open]').click();
      const surface=page.locator('[data-browser-preview]');await surface.waitFor({state:'visible'});assert.equal(await page.locator('[data-preview-frame]').count(),0,`${engine}/${profile} rendered an iframe`);assert.equal(await page.evaluate(()=>window.__animatorFrameInsertions),0,`${engine}/${profile} inserted an ephemeral iframe`);
      await waitUntil(async()=>await surface.getAttribute('data-browser-engine-active')===engine&&await surface.getAttribute('data-browser-profile-active')===profile,`${engine}/${profile} state metadata was not applied`);
      const expected=profile==='mobile'?['390','844']:['1100','700'];assert.equal(await surface.getAttribute('data-browser-width'),expected[0],`${engine}/${profile} width mismatch`);assert.equal(await surface.getAttribute('data-browser-height'),expected[1],`${engine}/${profile} height mismatch`);
      const geometry=await surface.boundingBox();assert(geometry,`${engine}/${profile} surface geometry missing`);const expectedRatio=Number(expected[0])/Number(expected[1]),actualRatio=geometry.width/geometry.height;assert(Math.abs(actualRatio-expectedRatio)<0.03,`${engine}/${profile} preview aspect ratio was distorted: ${actualRatio} vs ${expectedRatio}`);
      await waitUntil(async()=>await surface.locator('img').evaluate(image=>image.naturalWidth>0&&image.naturalHeight>0),`${engine}/${profile} did not receive streamed frames`);
      await waitUntil(async()=>await surface.getAttribute('data-browser-runtime')==='true',`${engine}/${profile} instrumentation runtime did not bootstrap`);
      await waitUntil(async()=>await page.locator('[data-motion-region] .motionRow').count()>0,`${engine}/${profile} did not detect animations`);
      await waitUntil(async()=>await page.locator('[data-timeline-v2] .v2Clip').count()>0,`${engine}/${profile} did not build timeline clips`);
    }
    const surface=page.locator('[data-browser-preview]'),box=await surface.boundingBox();assert(box,'Browser preview surface missing');await page.mouse.click(box.x+145,box.y+135);await page.waitForTimeout(250);
    const project=await page.evaluate(()=>({diagnostic:document.querySelector('[data-diagnostic]')?.textContent||'',hasBrowser:!!document.querySelector('[data-browser-preview]')}));assert(project.hasBrowser,'Browser preview disappeared after input');
    const record=page.locator('[data-action="record"]');await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='stopped','Browser preview did not confirm STOP');
    await waitUntil(async()=>await page.locator('[data-view-history-toggle]').isVisible(),'Browser history was not exposed after STOP');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<240;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
