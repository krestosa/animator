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
    await page.locator('.app').waitFor({state:'attached'});
    await page.locator('.toolbarMore>summary').click();
    await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));
    await page.locator('[data-action="open-project"]').click();
    const frameLocator=page.locator('[data-preview-frame]');await frameLocator.waitFor({state:'attached'});
    const frame=await (await frameLocator.elementHandle())?.contentFrame();assert(frame,'preview iframe missing');
    await frame.locator('.repeat-motion').first().waitFor();
    const group=page.locator('.v2GroupRow').filter({hasText:'repeat-pop'}).first();
    await waitUntil(async()=>await group.count()===1,'repeat-pop group missing');
    await group.locator('[data-v2-toggle]').click();
    await waitUntil(async()=>await page.locator('.v2InstanceRow').count()>=3,'repeat-pop instances did not expand');
    const firstInstance=page.locator('.v2InstanceRow').first();
    await firstInstance.locator('.v2InstanceLabel button[data-v2-instance]').click();
    await waitUntil(async()=>await firstInstance.evaluate(node=>node.classList.contains('selected')),'instance selection failed');
    await group.locator('[data-v2-toggle]').click();
    await waitUntil(async()=>await page.locator('.v2InstanceRow').count()===0,'repeat-pop group did not collapse');

    await page.locator('[data-isolate="animation"]').click();
    await waitUntil(async()=>await group.isVisible(),'Motion isolation hid the selected collapsed group');
    assert((await page.locator('.v2GroupRow:not([hidden])').count())>=1,'Motion isolation hid every group row');

    await page.locator('[data-isolate="element"]').click();
    await waitUntil(async()=>await group.isVisible(),'Element isolation hid the selected collapsed group');
    assert((await page.locator('.v2GroupRow:not([hidden])').count())>=1,'Element isolation hid every group row');

    await page.locator('[data-isolate="all"]').click();
    await waitUntil(async()=>await page.locator('.v2GroupRow:not([hidden])').count()>=1,'All isolation did not restore groups');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');}

async function waitForServer(url){for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<160;attempt++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
