import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const port=4174,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);

try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.app').waitFor();
    const frameLocator=page.locator('[data-preview-frame]'),theme=page.locator('[data-preview-theme]');
    const refreshFrame=async()=>{const handle=await frameLocator.elementHandle(),frame=await handle?.contentFrame();assert(frame,'preview iframe missing');await frame.locator('html').waitFor();return frame;};
    const selectTheme=async mode=>{await theme.selectOption(mode);await waitUntil(async()=>await theme.inputValue()===mode,`theme selector did not become ${mode}`);await page.waitForTimeout(260);return refreshFrame();};
    const openRemote=async url=>{const details=page.locator('.webLoader');await details.evaluate(element=>{if(element instanceof HTMLDetailsElement)element.open=true;});await page.locator('[data-web-url]').fill(url);await page.locator('[data-web-open]').click();await waitUntil(async()=>await theme.inputValue()==='auto','new parent site did not reset theme to Auto');await frameLocator.waitFor({state:'attached'});await page.waitForTimeout(350);return refreshFrame();};

    await page.locator('.toolbarMore>summary').click();await page.locator('[data-path-input]').fill(path.join(process.cwd(),'fixture'));await page.locator('[data-action="open-project"]').click();await frameLocator.waitFor({state:'attached'});let frame=await refreshFrame();
    assert.equal(await theme.inputValue(),'auto','local fixture did not start in Auto');
    await waitUntil(async()=>await frame.evaluate(()=>document.documentElement.getAttribute('data-fixture-theme-resolved'))==='dark','storage-driven fixture did not expose its own dark default');
    frame=await selectTheme('light');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-fixture-theme')),'light','Light override did not replace storage-driven theme');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-fixture-theme-resolved')),'light','Light override did not resolve storage-driven theme to light');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: light)').matches&&!matchMedia('(prefers-color-scheme: dark)').matches),'Light override did not change matchMedia');assert.equal(await frame.evaluate(()=>localStorage.getItem('fixtureTheme:v1')),'light','site-facing storage did not expose Light override');
    frame=await selectTheme('dark');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-fixture-theme-resolved')),'dark','Dark override did not resolve storage-driven theme to dark');
    frame=await selectTheme('auto');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-fixture-theme-resolved')),'dark','Auto did not restore the site-owned underlying theme');assert.equal(await frame.evaluate(()=>localStorage.getItem('fixtureTheme:v1')),'dark','override mutated the site real storage');

    frame=await openRemote('https://krestosa.github.io/carta-sc/');await frame.locator('body').waitFor({timeout:20000});
    assert.equal(await theme.inputValue(),'auto','carta-sc did not start in Auto');
    frame=await selectTheme('light');await waitUntil(async()=>await frame.evaluate(()=>document.documentElement.getAttribute('data-sc-theme-resolved'))==='light','carta-sc ignored Light override');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-sc-theme')),'light','carta-sc theme mode was not overridden to light');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: light)').matches),'carta-sc matchMedia is not light');
    frame=await selectTheme('dark');await waitUntil(async()=>await frame.evaluate(()=>document.documentElement.getAttribute('data-sc-theme-resolved'))==='dark','carta-sc ignored Dark override');assert.equal(await frame.evaluate(()=>document.documentElement.getAttribute('data-sc-theme')),'dark','carta-sc theme mode was not overridden to dark');
    frame=await selectTheme('auto');assert.equal(await frame.evaluate(()=>window.__ANIMATOR_PREVIEW_COLOR_SCHEME_OVERRIDE__),undefined,'Auto still injected a forced theme into carta-sc');

    frame=await openRemote('https://www.google.com/');await frame.locator('body').waitFor({timeout:20000});
    frame=await selectTheme('light');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: light)').matches&&!matchMedia('(prefers-color-scheme: dark)').matches),'Google preview did not receive Light environment override');assert(/light/i.test(await frame.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)),'Google preview color-scheme environment is not light');
    frame=await selectTheme('dark');assert(await frame.evaluate(()=>matchMedia('(prefers-color-scheme: dark)').matches&&!matchMedia('(prefers-color-scheme: light)').matches),'Google preview did not receive Dark environment override');assert(/dark/i.test(await frame.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)),'Google preview color-scheme environment is not dark');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');}

async function waitForServer(url){for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let attempt=0;attempt<240;attempt++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
