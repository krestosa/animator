import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port=4173,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.toolbarMore summary').click();
    await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));
    await page.locator('[data-action="open-project"]').click();
    const frameLocator=page.locator('[data-preview-frame]');await frameLocator.waitFor({state:'attached'});
    await waitUntil(async()=>/^http:\/\/127\.0\.0\.1:\d+\//.test(await frameLocator.getAttribute('src')??''),'preview was not moved to a dedicated local origin');
    const frameHandle=await frameLocator.elementHandle();const frame=await frameHandle?.contentFrame();assert(frame,'preview iframe did not load');
    await frame.locator('.repeat-motion').first().waitFor();
    assert(await frame.locator('#root-asset').evaluate(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0),'root-relative preview asset did not load');
    assert.equal(await frame.evaluate(async()=>{const response=await fetch('/__animator/clock-worker.js');return response.status;}),200,'worker-backed playback clock was not served by preview origin');
    await waitUntil(async()=>/^Ready/.test(await page.locator('[data-preview-capture-status]').textContent()??''),'startup animation capture did not complete');

    const group=page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).first();
    await group.waitFor();
    await waitUntil(async()=>/3 components/.test(await group.textContent()??''),'repeat-pop group did not expose 3 component instances');
    assert.equal(await page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).count(),1,'repeat-pop must render as one grouped timeline row');

    await group.locator('[data-v2-toggle]').click();
    await waitUntil(async()=>await page.locator('.v2InstanceRow').count()>=3,'expanded group did not render component rows');
    const firstInstance=page.locator('.v2InstanceRow').first();
    await firstInstance.locator('.v2InstanceLabel button[data-v2-instance]').click();
    await waitUntil(async()=>await firstInstance.evaluate(node=>node.classList.contains('selected')),'component instance was not individually selectable');
    await waitUntil(async()=>await page.locator('.elementList .row.selected').count()>=1,'selecting a timeline instance must select its DOM component');

    const motion=group.locator('.v2Motion');const motionBox=await motion.boundingBox();assert(motionBox,'timeline motion surface has no box');
    const pxPerMs=Number(await page.locator('[data-timeline-v2]').getAttribute('data-px-per-ms'));assert(Number.isFinite(pxPerMs)&&pxPerMs>0,'timeline scale is invalid');
    const seekOn=async(box,ms)=>{await page.mouse.click(box.x+Math.max(.5,ms*pxPerMs),box.y+box.height/2);await page.waitForTimeout(80);};
    const playhead=async()=>Number.parseInt(await page.locator('[data-playhead-label]').textContent()??'0',10);
    const frameNumber=async()=>Number((await page.locator('[data-preview-frame-label]').textContent()??'0').match(/Frame\s+(\d+)/)?.[1]??-1);
    const style=async selector=>frame.locator(selector).first().evaluate(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform}));

    await seekOn(motionBox,0);const atStart=await style('.repeat-motion');
    await seekOn(motionBox,400);const atMiddle=await style('.repeat-motion');
    await seekOn(motionBox,760);const nearEnd=await style('.repeat-motion');
    await seekOn(motionBox,0);const backAtStart=await style('.repeat-motion');
    assert(atMiddle.opacity>atStart.opacity+.15,`scrub did not advance visual opacity: ${atStart.opacity} -> ${atMiddle.opacity}`);
    assert(nearEnd.opacity>=atMiddle.opacity,`later frame regressed unexpectedly: ${atMiddle.opacity} -> ${nearEnd.opacity}`);
    assert(backAtStart.opacity<atMiddle.opacity-.15,`reverse scrub did not restore earlier visual frame: ${atMiddle.opacity} -> ${backAtStart.opacity}`);
    assert.notEqual(atStart.transform,atMiddle.transform,'transform must change between start and middle frames');

    await page.keyboard.press('Home');await waitUntil(async()=>await frameNumber()===0,'Home did not seek to frame 0');
    const frame0=await style('.repeat-motion');
    await page.locator('[data-preview-step="1"]').click();await waitUntil(async()=>await frameNumber()===1,'single-frame control did not seek to frame 1');const frame1=await style('.repeat-motion');
    await page.locator('[data-preview-step="1"]').click();await waitUntil(async()=>await frameNumber()===2,'single-frame control did not seek to frame 2');const frame2=await style('.repeat-motion');
    assert.notEqual(frame0.transform,frame2.transform,'two exact frame steps did not change the rendered animation frame');
    assert(frame1.opacity>=frame0.opacity&&frame2.opacity>=frame1.opacity,'frame stepping moved the animation backwards');
    await page.locator('[data-preview-step="-1"]').click();await waitUntil(async()=>await frameNumber()===1,'reverse frame control did not return to frame 1');const frame1Back=await style('.repeat-motion');
    assert.equal(frame1Back.transform,frame1.transform,'reverse frame stepping did not restore the exact previous frame');

    await page.keyboard.press('Home');
    const playStart=await style('.repeat-motion');
    await page.evaluate(()=>{window.__animatorHeartbeat=0;window.__animatorHeartbeatTimer=setInterval(()=>window.__animatorHeartbeat++,10);});
    await page.locator('[data-action="play"]').click();await page.waitForTimeout(350);
    const heartbeat=await page.evaluate(()=>window.__animatorHeartbeat);const playAdvanced=await style('.repeat-motion');
    await page.locator('[data-action="pause"]').click();await page.evaluate(()=>clearInterval(window.__animatorHeartbeatTimer));
    assert(heartbeat>12,`editor main thread became unresponsive during playback; heartbeat=${heartbeat}`);
    assert(playAdvanced.opacity>playStart.opacity+.08,`Play did not advance preview animation: ${playStart.opacity} -> ${playAdvanced.opacity}`);
    assert(await playhead()>100,'playhead did not advance during playback');

    await page.locator('[data-preview-live]').click();
    const htmlBefore=await frame.locator('body').evaluate(element=>({children:element.children.length,className:element.className}));
    await frame.locator('#raf').click();await page.waitForTimeout(950);
    const jsGroup=page.locator('.v2GroupRow').filter({hasText:'JS style · transform'}).first();await jsGroup.waitFor();
    const jsClip=jsGroup.locator('.v2Clip').first();const title=await jsClip.getAttribute('title')??'';const match=title.match(/·\s*(\d+)ms\s*·\s*(\d+)ms/);assert(match,'javascript motion clip did not expose timeline timing');
    const jsId=await jsClip.getAttribute('data-v2-instance');assert(jsId,'javascript motion clip did not expose its animation id');
    const jsStart=Number(match[1]),jsDuration=Number(match[2]);assert(jsDuration>500,'javascript rAF motion duration was not captured');
    const frameDebug=await frame.evaluate(id=>{const api=window.__ANIMATOR_MUTATION_REPLAY__;const track=api?.tracks?.get(id);return track?{start:track.start,last:track.last,count:track.events.length,values:[...new Set(track.events.map(event=>event.value))].slice(0,12)}:null;},jsId);
    assert(frameDebug&&frameDebug.count>5&&frameDebug.values.length>3,`javascript frame snapshots are not distinct: ${JSON.stringify(frameDebug)}`);
    const jsMotionBox=await jsGroup.locator('.v2Motion').boundingBox();assert(jsMotionBox,'javascript motion timeline row has no box');
    await seekOn(jsMotionBox,jsStart+20);const jsEarly=await style('#box');
    await seekOn(jsMotionBox,jsStart+jsDuration*.75);const jsLate=await style('#box');
    await seekOn(jsMotionBox,jsStart+20);const jsBack=await style('#box');
    assert.notEqual(jsEarly.transform,jsLate.transform,`javascript rAF motion did not advance under timeline control; captured ${JSON.stringify(frameDebug)}`);
    assert.equal(jsBack.transform,jsEarly.transform,'javascript rAF motion did not reverse to the captured frame');
    const htmlAfter=await frame.locator('body').evaluate(element=>({children:element.children.length,className:element.className}));assert.deepEqual(htmlAfter,htmlBefore,'timeline replay changed structural HTML state');
  } finally { await browser.close(); }
} finally {server.kill('SIGTERM');}

async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<120;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
