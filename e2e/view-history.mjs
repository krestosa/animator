import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port=4192,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.app').waitFor();
    await page.locator('.toolbarMore>summary').click();await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));await page.locator('[data-action="open-project"]').click();
    const iframe=page.locator('[data-preview-frame]');await iframe.waitFor({state:'attached'});await page.waitForTimeout(250);const handle=await iframe.elementHandle(),frame=await handle?.contentFrame();assert(frame,'preview frame missing');await frame.locator('body').waitFor();
    const record=page.locator('[data-action="record"]');const history=page.locator('[data-view-history-toggle]'),detach=page.locator('[data-view-history-detach]');
    assert.equal(await history.isVisible(),false,'history controls must be unavailable while REC is active');

    await frame.evaluate(()=>{window.dispatchEvent(new PointerEvent('pointermove',{clientX:140,clientY:90,bubbles:true}));scrollTo(0,520);});await page.waitForTimeout(320);const first=await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats());assert(first.samples>1,'viewport history was not captured automatically during REC');
    await frame.evaluate(()=>{window.dispatchEvent(new PointerEvent('pointermove',{clientX:310,clientY:180,bubbles:true}));scrollTo(0,1180);});await page.waitForTimeout(320);const second=await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats());const recordedViewport=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));assert(second.end>first.end,'view history time did not advance');

    await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='stopped','Record did not reach confirmed STOP state');
    await waitUntil(async()=>await history.isVisible(),'history did not become available after STOP');assert.equal(await detach.isVisible(),true,'detach did not become available after STOP');
    const stoppedStats=await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats());assert.equal(stoppedStats.recording,false,'preview runtime still considered recording active after STOP');assert.equal(stoppedStats.captureEnabled,false,'history capture continued after STOP');

    await history.click();await waitUntil(async()=>await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats().mode==='attached'),'attached history review did not enable');
    await scrub(iframe,first.end);await waitUntil(async()=>Math.abs(await frame.evaluate(()=>scrollY)-520)<90,'attached history did not restore recorded scroll position');
    const cursor=frame.locator('[data-animator-recorded-cursor]');await waitUntil(async()=>await cursor.evaluate(element=>getComputedStyle(element).display)!=='none','recorded mouse cursor is not visible');const cursorPosition=await cursor.evaluate(element=>({left:parseFloat(element.style.left),top:parseFloat(element.style.top),position:element.style.position}));assert.equal(cursorPosition.position,'fixed');assert(Math.abs(cursorPosition.left-140)<90&&Math.abs(cursorPosition.top-90)<90,'recorded cursor did not follow the recorded mouse position');

    await detach.click();await waitUntil(async()=>await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats().mode==='detached'),'detach mode did not enable');await frame.evaluate(()=>scrollTo(0,70));await page.waitForTimeout(80);await scrub(iframe,second.end);await page.waitForTimeout(120);assert(Math.abs((await frame.evaluate(()=>scrollY))-70)<40,'detached history moved real preview scroll instead of preserving freecam');
    const viewport=frame.locator('[data-animator-recorded-viewport]');await waitUntil(async()=>await viewport.evaluate(element=>getComputedStyle(element).display)!=='none','recorded viewport block is not visible');const box=await viewport.evaluate(element=>({top:parseFloat(element.style.top),width:parseFloat(element.style.width),height:parseFloat(element.style.height),shadow:getComputedStyle(element).boxShadow}));assert(Math.abs(box.top-1180)<110,'detached viewport block did not move to recorded location');assert(Math.abs(box.height-recordedViewport.height)<2,`detached viewport height ${box.height} does not match recorded ${recordedViewport.height}`);assert(Math.abs(box.width-recordedViewport.width)<2,`detached viewport width ${box.width} does not match recorded ${recordedViewport.width}`);assert(box.shadow&&box.shadow!=='none','detached view did not dim outside the recorded viewport');

    await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='recording','Record did not resume after history review');assert.equal(await history.isVisible(),false,'history remained available after REC resumed');await waitUntil(async()=>await frame.evaluate(()=>window.__ANIMATOR_VIEW_HISTORY__.stats().samples<=2),'new REC did not reset previous view history');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');}

async function scrub(iframe,time){await iframe.evaluate((element,value)=>element.contentWindow?.postMessage({source:'animator-timeline',type:'SCRUB_TIMELINE',time:value},'*'),time);}
async function waitForServer(url){for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<180;attempt++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
