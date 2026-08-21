import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const remote=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><head><title>Browser fixture</title><style>html,body{margin:0;min-height:2400px}button{margin:100px;width:180px;height:70px}</style></head><body><button id="button">click me</button><script>window.clicks=0;button.addEventListener('click',()=>{window.clicks++;document.body.dataset.clicked=String(window.clicks)});</script></body></html>`);});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`,port=4194,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1365,height:900}});await page.goto(base,{waitUntil:'networkidle'});await page.locator('.app').waitFor();
    await page.locator('.webLoader>summary').click();await page.locator('[data-web-url]').fill(remoteUrl);await page.locator('[data-web-engine]').selectOption('browser');await page.locator('[data-web-open]').click();
    const surface=page.locator('[data-browser-preview]');await surface.waitFor({state:'visible'});assert.equal(await page.locator('[data-preview-frame]').count(),0,'Browser preview still rendered an iframe');
    const image=surface.locator('img');await waitUntil(async()=>Boolean(await image.getAttribute('src')),'Browser preview did not stream frames into Animator');
    const box=await surface.boundingBox();assert(box,'Browser preview surface missing');await page.mouse.click(box.x+145,box.y+135);await page.waitForTimeout(250);
    const project=await page.evaluate(()=>({diagnostic:document.querySelector('[data-diagnostic]')?.textContent||'',hasBrowser:!!document.querySelector('[data-browser-preview]')}));assert(project.hasBrowser,'Browser preview disappeared after input');
    const record=page.locator('[data-action="record"]');await record.click();await waitUntil(async()=>await record.getAttribute('data-recording-state')==='stopped','Browser preview did not confirm STOP');
    await waitUntil(async()=>await page.locator('[data-view-history-toggle]').isVisible(),'Browser history was not exposed after STOP');
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<180;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(message);}
