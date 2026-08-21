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
    await page.locator('[data-preview-frame]').waitFor({state:'attached'});
    const frame=page.frames().find(candidate=>candidate.url().includes('/preview/'));
    assert(frame,'preview iframe did not load');
    await frame.locator('.repeat-motion').first().waitFor();

    const group=page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).first();
    await group.waitFor();
    await waitUntil(async()=>/3 components/.test(await group.textContent()??''),'repeat-pop group did not expose 3 component instances');
    assert.equal(await page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).count(),1,'repeat-pop must render as one grouped timeline row');

    await group.locator('[data-v2-toggle]').click();
    await waitUntil(async()=>await page.locator('.v2InstanceRow').count()>=3,'expanded group did not render component rows');
    const firstInstance=page.locator('.v2InstanceRow').first();
    await firstInstance.locator('[data-v2-instance]').click();
    assert(await firstInstance.evaluate(node=>node.classList.contains('selected')),'component instance was not individually selectable');
    assert((await page.locator('.elementList .row.selected').count())>=1,'selecting a timeline instance must select its DOM component');

    const motion=group.locator('.v2Motion');
    const motionBox=await motion.boundingBox();
    assert(motionBox,'timeline motion surface has no box');
    const pxPerMs=Number(await page.locator('[data-timeline-v2]').getAttribute('data-px-per-ms'));
    assert(Number.isFinite(pxPerMs)&&pxPerMs>0,'timeline scale is invalid');
    const seek=async ms=>{await page.mouse.click(motionBox.x+Math.max(.5,ms*pxPerMs),motionBox.y+motionBox.height/2);await page.waitForTimeout(80);};
    const style=async()=>frame.locator('.repeat-motion').first().evaluate(element=>({opacity:Number(getComputedStyle(element).opacity),transform:getComputedStyle(element).transform}));

    await seek(0);const atStart=await style();
    await seek(400);const atMiddle=await style();
    await seek(760);const nearEnd=await style();
    await seek(0);const backAtStart=await style();
    assert(atMiddle.opacity>atStart.opacity+.15,`scrub did not advance visual opacity: ${atStart.opacity} -> ${atMiddle.opacity}`);
    assert(nearEnd.opacity>=atMiddle.opacity,`later frame regressed unexpectedly: ${atMiddle.opacity} -> ${nearEnd.opacity}`);
    assert(backAtStart.opacity<atMiddle.opacity-.15,`reverse scrub did not restore earlier visual frame: ${atMiddle.opacity} -> ${backAtStart.opacity}`);
    assert.notEqual(atStart.transform,atMiddle.transform,'transform must change between start and middle frames');

    await seek(0);
    const playStart=await style();
    await page.locator('[data-action="play"]').click();
    await page.waitForTimeout(280);
    const playAdvanced=await style();
    await page.locator('[data-action="pause"]').click();
    assert(playAdvanced.opacity>playStart.opacity+.08,`Play did not advance preview animation: ${playStart.opacity} -> ${playAdvanced.opacity}`);
    const playheadText=await page.locator('[data-playhead-label]').textContent();
    assert(Number.parseInt(playheadText??'0',10)>100,`playhead did not advance during playback: ${playheadText}`);
  } finally { await browser.close(); }
} finally {
  server.kill('SIGTERM');
}

async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<80;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
