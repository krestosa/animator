import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port=4173,base=`http://127.0.0.1:${port}`;
const remoteFixture=createServer((req,res)=>{
  if(req.url==='/remote/style.css'){res.writeHead(200,{'content-type':'text/css'});res.end('#remote-card{opacity:0;animation:remote-in .42s ease-out both}@keyframes remote-in{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}');return;}
  if(req.url==='/remote/app.js'){res.writeHead(200,{'content-type':'application/javascript'});res.end('window.__remoteLoaded=true;document.documentElement.dataset.remoteScript="ok";');return;}
  if(req.url==='/remote/'||req.url==='/remote'){res.writeHead(200,{'content-type':'text/html','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'",'x-frame-options':'DENY'});res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/remote/style.css"><title>Remote fixture</title></head><body><main><h1 id="remote-card">Remote instrumented page</h1></main><script src="/remote/app.js"></script></body></html>');return;}
  res.writeHead(404);res.end('not found');
});
const remotePort=await listen(remoteFixture);const remoteUrl=`http://127.0.0.1:${remotePort}/remote/`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(base,{waitUntil:'networkidle'});
    assert.equal(await page.locator('.app').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(10, 10, 10)','editor background is not #0a0a0a');
    assert.equal(await page.locator('.toolbar').evaluate(element=>getComputedStyle(element).userSelect),'none','editor chrome still allows text selection');
    await page.locator('.toolbarMore summary').click();
    await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));
    await page.locator('[data-action="open-project"]').click();
    const frameLocator=page.locator('[data-preview-frame]');await frameLocator.waitFor({state:'attached'});
    await waitUntil(async()=>/^http:\/\/127\.0\.0\.1:\d+\//.test(await frameLocator.getAttribute('src')??''),'preview was not moved to a dedicated local origin');
    let frameHandle=await frameLocator.elementHandle();let frame=await frameHandle?.contentFrame();assert(frame,'preview iframe did not load');
    await frame.locator('.repeat-motion').first().waitFor();
    assert(await frame.locator('#root-asset').evaluate(image=>image instanceof HTMLImageElement&&image.complete&&image.naturalWidth>0),'root-relative preview asset did not load');
    assert.equal(await frame.evaluate(async()=>{const response=await fetch('/__animator/clock-worker.js');return response.status;}),200,'worker-backed playback clock was not served by preview origin');
    await waitUntil(async()=>await page.locator('[data-preview-live]').evaluate(element=>element.classList.contains('active')),'preview did not remain in Live mode after startup capture');

    const stageBox=await page.locator('.stage').boundingBox(),deviceBox=await page.locator('[data-device]').boundingBox();assert(stageBox&&deviceBox,'preview workspace has no bounds');
    assert(Math.abs(stageBox.x-deviceBox.x)<2&&Math.abs(stageBox.y-deviceBox.y)<2&&Math.abs(stageBox.width-deviceBox.width)<2&&Math.abs(stageBox.height-deviceBox.height)<2,'preview does not fill the complete center workspace');
    await waitUntil(async()=>Number(await page.locator('[data-dom-count]').textContent()??0)>5,'DOM load tree did not capture parser-built elements');
    await waitUntil(async()=>await page.locator('.v2LoadRow').count()>=2,'loading timeline rows were not rendered');
    assert(await page.locator('.domTreeRow').count()>0,'compact DOM load tree did not render visible rows');

    await page.keyboard.press('Home');
    await waitUntil(async()=>Number((await page.locator('[data-preview-frame-label]').textContent()??'').match(/Frame\s+(\d+)/)?.[1]??-1)===0,'Home did not enter frame 0 for load replay');
    assert.equal(await frame.locator('main').evaluate(element=>getComputedStyle(element).visibility),'hidden','frame 0 is not visually empty');
    await page.locator('[data-preview-live]').click();
    await waitUntil(async()=>await frame.locator('main').evaluate(element=>getComputedStyle(element).visibility)!=='hidden','Live did not restore the fully loaded DOM');

    const previewSrcBeforeRecalculate=await frameLocator.getAttribute('src');
    await frame.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await waitUntil(async()=>await frame.locator('#scroll-fade').evaluate(element=>element.classList.contains('revealed')),'scroll fixture did not enter its revealed state');
    const scrollGroup=page.locator('.v2GroupRow').filter({hasText:'scroll-fade-in'}).first();await scrollGroup.waitFor();
    await waitUntil(async()=>{const ids=await scrollGroup.locator('.v2Clip').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-v2-instance')));return ids.some(id=>!!id&&!id.startsWith('static:'));},'short viewport fade-in was not captured as a runtime animation while Live scrolling');
    await page.locator('[data-preview-recalculate]').click();
    await waitUntil(async()=>/visible|captured|Scanning|Viewport/.test(await page.locator('[data-preview-capture-status]').textContent()??''),'viewport recalculation did not publish capture stats');
    await waitUntil(async()=>!(await page.locator('[data-preview-recalculate]').isDisabled()),'viewport recalculation control stayed disabled');
    assert.equal(await frameLocator.getAttribute('src'),previewSrcBeforeRecalculate,'viewport recalculation reloaded the preview unexpectedly');

    const timeline=page.locator('[data-timeline-v2]');
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

    const zoomBefore=Number(await timeline.getAttribute('data-px-per-ms'));await page.locator('[data-timeline-zoom="in"]').click();
    await waitUntil(async()=>Number(await timeline.getAttribute('data-px-per-ms'))>zoomBefore,'timeline zoom-in control did not increase frame scale');
    await page.locator('[data-timeline-zoom="frame"]').click();
    await waitUntil(async()=>Math.abs(Number(await timeline.getAttribute('data-px-per-ms'))*(1000/60)-24)<1.5,'1f zoom did not target a readable per-frame scale');
    await page.locator('[data-timeline-zoom="fit"]').click();await page.waitForTimeout(120);
    await page.locator('[data-isolate="animation"]').click();
    await waitUntil(async()=>await page.locator('.v2GroupRow').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length)===1,'animation isolation did not hide unrelated timeline groups');
    assert.equal(await page.locator('.v2LoadRow').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length),0,'load tracks remained visible while a motion was isolated');
    await page.locator('[data-isolate="element"]').click();
    await waitUntil(async()=>await page.locator('[data-isolate="element"]').evaluate(node=>node.classList.contains('active')),'element isolation did not activate');
    assert(await page.locator('.v2GroupRow').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length)>=1,'element isolation hid the selected element motion');
    await page.locator('[data-isolate="all"]').click();
    await waitUntil(async()=>await page.locator('.v2GroupRow').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).length)>1,'All did not restore complete timeline');

    const motion=group.locator('.v2Motion');assert(await motion.boundingBox(),'timeline motion surface has no box');
    const seekOn=async(locator,ms)=>{const scale=Number(await timeline.getAttribute('data-px-per-ms'));assert(Number.isFinite(scale)&&scale>0,'timeline scale is invalid');const box=await locator.boundingBox();assert(box,'timeline motion surface has no box');const x=Math.max(.5,Math.min(box.width-.5,ms*scale));await locator.click({position:{x,y:box.height/2},force:true});await page.waitForTimeout(80);};
    const playhead=async()=>Number.parseInt(await page.locator('[data-playhead-label]').textContent()??'0',10);
    const frameNumber=async()=>Number((await page.locator('[data-preview-frame-label]').textContent()??'0').match(/Frame\s+(\d+)/)?.[1]??-1);
    const style=async selector=>frame.locator(selector).first().evaluate(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform}));

    await seekOn(motion,0);const atStart=await style('.repeat-motion');
    await seekOn(motion,400);const atMiddle=await style('.repeat-motion');
    await seekOn(motion,760);const nearEnd=await style('.repeat-motion');
    await seekOn(motion,0);const backAtStart=await style('.repeat-motion');
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
    const jsMotion=jsGroup.locator('.v2Motion');assert(await jsMotion.boundingBox(),'javascript motion timeline row has no box');
    const jsState=async()=>frame.evaluate(id=>{const track=window.__ANIMATOR_MUTATION_REPLAY__?.tracks?.get(id);if(!track)return null;return{inline:track.el.getAttribute('style'),computed:getComputedStyle(track.el).transform,mirrorTime:Number(track.mirror?.currentTime),mirrorState:track.mirror?.playState,mirrorFrames:track.mirror?.effect?.getKeyframes?.().slice(0,3),animations:track.el.getAnimations().map(animation=>({state:animation.playState,currentTime:Number(animation.currentTime),mutation:!!animation.__animatorMutationMirror,animator:!!animation.__animatorMirror}))};},jsId);
    await seekOn(jsMotion,jsStart+20);const reachedEarly=await playhead(),jsEarly=await style('#box'),jsEarlyState=await jsState();assert(Math.abs(reachedEarly-(jsStart+20))<80,`timeline missed JS early time: wanted ${jsStart+20}, got ${reachedEarly}; state=${JSON.stringify(jsEarlyState)}`);
    await seekOn(jsMotion,jsStart+jsDuration*.75);const reachedLate=await playhead(),jsLate=await style('#box'),jsLateState=await jsState();assert(Math.abs(reachedLate-(jsStart+jsDuration*.75))<80,`timeline missed JS late time: wanted ${jsStart+jsDuration*.75}, got ${reachedLate}; state=${JSON.stringify(jsLateState)}`);
    await seekOn(jsMotion,jsStart+20);const jsBack=await style('#box'),jsBackState=await jsState();
    assert.notEqual(jsEarly.transform,jsLate.transform,`javascript rAF motion did not advance; capture=${JSON.stringify(frameDebug)} early=${JSON.stringify(jsEarlyState)} late=${JSON.stringify(jsLateState)} back=${JSON.stringify(jsBackState)}`);
    assert.equal(jsBack.transform,jsEarly.transform,`javascript rAF motion did not reverse; early=${JSON.stringify(jsEarlyState)} back=${JSON.stringify(jsBackState)}`);
    const htmlAfter=await frame.locator('body').evaluate(element=>({children:element.children.length,className:element.className}));assert.deepEqual(htmlAfter,htmlBefore,'timeline replay changed structural HTML state');

    const localPreviewSrc=await frameLocator.getAttribute('src');await page.locator('.webLoader>summary').click();await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-open]').click();
    await waitUntil(async()=>{const src=await frameLocator.getAttribute('src');return !!src&&src!==localPreviewSrc&&/^http:\/\/127\.0\.0\.1:\d+\//.test(src);},'remote page was not moved behind an instrumented local proxy');
    frameHandle=await frameLocator.elementHandle();frame=await frameHandle?.contentFrame();assert(frame,'remote preview iframe did not load');
    await frame.locator('#remote-card').waitFor();
    assert(await frame.evaluate(()=>window.__remoteLoaded===true&&window.__ANIMATOR_AUX_RUNTIME__===true&&document.documentElement.dataset.remoteScript==='ok'),'remote page scripts or early Animator instrumentation did not run');
    const remoteGroup=page.locator('.v2GroupRow').filter({hasText:'remote-in'}).first();await remoteGroup.waitFor();
    await waitUntil(async()=>{const ids=await remoteGroup.locator('.v2Clip').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-v2-instance')));return ids.some(id=>!!id&&!id.startsWith('static:'));},'remote CSS animation was not captured as runtime motion');
    await waitUntil(async()=>Number(await page.locator('[data-dom-count]').textContent()??0)>0,'remote DOM construction was not captured');
  } finally { await browser.close(); }
} finally {server.kill('SIGTERM');await closeServer(remoteFixture);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<140;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
