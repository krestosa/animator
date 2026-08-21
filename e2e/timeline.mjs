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
    const recordButton=page.locator('[data-action="record"]'),recordBadge=page.locator('[data-record-state]');
    await waitUntil(async()=>/REC/.test(await recordBadge.textContent()??''),'normal motion selection stopped recording implicitly');

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
    const rail=page.locator('[data-v2-scrub-rail]').first();await rail.waitFor({state:'visible'});const railBox=await rail.boundingBox();assert(railBox&&railBox.width>160,'timeline ruler is not measurable');
    const dragScale=Number(await timeline.getAttribute('data-px-per-ms')),dragDuration=Number(await timeline.getAttribute('data-duration')),activeWidth=Math.max(60,dragScale*dragDuration),dragLocal=Math.max(20,Math.min(activeWidth*.35,activeWidth-40,railBox.width-60));
    const dragX=railBox.x+dragLocal,dragY=railBox.y+railBox.height/2;await page.mouse.move(dragX,dragY);await page.mouse.down();await page.waitForTimeout(80);
    const heldA=await timeline.evaluate(node=>({playhead:parseFloat(getComputedStyle(node).getPropertyValue('--timeline-playhead')),scrollLeft:node.scrollLeft,label:parseFloat(getComputedStyle(node).getPropertyValue('--timeline-label-width'))}));await page.waitForTimeout(320);const heldB=await timeline.evaluate(node=>({playhead:parseFloat(getComputedStyle(node).getPropertyValue('--timeline-playhead')),scrollLeft:node.scrollLeft,label:parseFloat(getComputedStyle(node).getPropertyValue('--timeline-label-width'))}));
    assert(Math.abs(heldB.playhead-heldA.playhead)<1,`held playhead drifted without mouse movement: ${heldA.playhead} -> ${heldB.playhead}`);assert(Math.abs(heldB.scrollLeft-heldA.scrollLeft)<1,`timeline scrolled while pointer was held: ${heldA.scrollLeft} -> ${heldB.scrollLeft}`);assert(Math.abs(heldB.label-heldA.label)<1,`timeline label width changed during drag: ${heldA.label} -> ${heldB.label}`);
    await page.mouse.move(dragX+30,dragY);await page.waitForTimeout(80);const moved=await timeline.evaluate(node=>parseFloat(getComputedStyle(node).getPropertyValue('--timeline-playhead')));assert(Math.abs((moved-heldB.playhead)-30)<3,`30px pointer move changed playhead by ${moved-heldB.playhead}px`);await page.mouse.up();

    const seekTo=async ms=>{const currentRail=page.locator('[data-v2-scrub-rail]').first();await currentRail.waitFor({state:'visible'});const scale=Number(await timeline.getAttribute('data-px-per-ms')),origin=Number(await timeline.getAttribute('data-origin-ms')??0),box=await currentRail.boundingBox();assert(box&&scale>0);await currentRail.click({position:{x:Math.max(.5,Math.min(box.width-.5,(ms-origin)*scale)),y:box.height/2},force:true});await page.waitForTimeout(80);};
    const visual=async()=>frame.locator('.repeat-motion').first().evaluate(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform}));
    await page.locator('[data-isolate="all"]').click();await seekTo(0);const start=await visual();await seekTo(400);const middle=await visual();await seekTo(0);const back=await visual();assert(middle.opacity>start.opacity+.1,'timeline scrub did not advance animation');assert.equal(back.transform,start.transform,'reverse scrub did not restore the initial frame');

    const stoppedClips=await page.locator('.v2Clip').count();await recordButton.click();await frame.evaluate(()=>{const target=document.querySelector('#box');if(target)target.animate([{outlineOffset:'0px'},{outlineOffset:'12px'}],{duration:80});});await page.waitForTimeout(260);assert.equal(await page.locator('.v2Clip').count(),stoppedClips,'animation was captured after recording stopped');await waitUntil(async()=>/STOPPED/.test(await recordBadge.textContent()??''),'record button did not show STOPPED');
    const resumedClips=await page.locator('.v2Clip').count();await recordButton.click();await frame.evaluate(()=>{const target=document.querySelector('#box');if(target)target.animate([{borderRadius:'0px'},{borderRadius:'17px'}],{duration:600,easing:'linear'});});await waitUntil(async()=>await page.locator('.v2Clip').count()>resumedClips,'recording resumed but immediate new motion was not captured');await waitUntil(async()=>/REC/.test(await recordBadge.textContent()??''),'record button did not show REC');await waitUntil(async()=>/Live/i.test(await page.locator('[data-preview-frame-label]').textContent()??''),'restarting record did not release timeline back to Live');

    await page.keyboard.press('Home');await page.locator('[data-preview-step="1"]').click();await waitUntil(async()=>/Frame 1/.test(await page.locator('[data-preview-frame-label]').textContent()??''),'frame stepping failed');
    await page.evaluate(()=>{window.__heartbeat=0;window.__heartbeatTimer=setInterval(()=>window.__heartbeat++,10);});await page.locator('[data-action="play"]').click();await page.waitForTimeout(300);const heartbeat=await page.evaluate(()=>window.__heartbeat);await page.locator('[data-action="pause"]').click();await page.evaluate(()=>clearInterval(window.__heartbeatTimer));assert(heartbeat>10,`playback blocked editor UI: ${heartbeat}`);

    const more=page.locator('.toolbarMore');if(await more.count())await more.evaluate(element=>{if(element instanceof HTMLDetailsElement)element.open=false;});
    const themeSelect=page.locator('[data-preview-theme]');await themeSelect.waitFor({state:'visible'});assert.equal(await themeSelect.inputValue(),'auto','preview theme did not default to Auto/site default');
    const switchTheme=async expected=>{await themeSelect.selectOption(expected);await waitUntil(async()=>await themeSelect.inputValue()===expected,`theme control did not switch to ${expected}`);await waitUntil(async()=>new URL(await frameLocator.getAttribute('src')).searchParams.get('__animator_color_scheme')===expected,`preview URL did not apply ${expected}`);await page.waitForTimeout(180);frameHandle=await frameLocator.elementHandle();frame=await frameHandle?.contentFrame();assert(frame,`preview frame missing after ${expected} theme reload`);await frame.locator('body').waitFor();};
    await switchTheme('light');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: light)').matches&&!matchMedia('(prefers-color-scheme: dark)').matches),'site JS did not detect explicit light override');assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node,'::after').content),'"light"','site CSS did not detect explicit light override');
    await switchTheme('dark');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches&&!matchMedia('(prefers-color-scheme: light)').matches),'site JS did not detect explicit dark override');assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node,'::before').content),'"dark"','site CSS did not detect explicit dark override');
    const savedOverrides=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('animator.previewColorScheme:')).map(key=>[key,localStorage.getItem(key)]));assert(savedOverrides.some(([,value])=>value==='dark'),'site-specific dark override was not persisted');

    const localSrc=await frameLocator.getAttribute('src');await page.locator('.webLoader>summary').click();await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-open]').click();
    await waitUntil(async()=>{const src=await frameLocator.getAttribute('src');return !!src&&src!==localSrc&&/^http:\/\/127\.0\.0\.1:\d+\//.test(src);},'remote page did not move to a local instrumented preview');await waitUntil(async()=>await themeSelect.inputValue()==='auto','theme override leaked from one site/project into another');frameHandle=await frameLocator.elementHandle();frame=await frameHandle?.contentFrame();assert(frame,'remote frame missing');await frame.locator('#remote-card').waitFor();assert(await frame.evaluate(()=>window.__remoteLoaded===true&&document.documentElement.dataset.remoteScript==='ok'),'remote relative JS did not load');assert.equal(await frame.locator('#remote-card').evaluate(node=>getComputedStyle(node).animationName),'remote-in','remote relative CSS did not load');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remoteFixture);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<160;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
