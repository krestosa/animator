import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const remote=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body style="margin:0;background:#1737a5;color:white;font:700 42px sans-serif;display:grid;place-items:center;min-height:100vh">viewport screenshot fixture</body></html>');});
const remotePort=await listen(remote),remoteUrl=`http://127.0.0.1:${remotePort}/`,port=4197,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server-dist/server/index.js','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:'production',ANIMATOR_BROWSER_HEADLESS:'1'},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
try{
  await waitForServer(`${base}/api/health`);
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext();await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});
    const open=await fetch(`${base}/api/control/open`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:remoteUrl,engine:'chromium',profile:'desktop'})});assert.equal(open.ok,true,`Could not open browser capture: ${await open.text()}`);
    const button=page.locator('[data-viewport-screenshot]');await button.waitFor({state:'visible'});await waitUntil(async()=>!(await button.isDisabled()),'Screenshot button never became enabled');
    await button.click();
    const toast=page.locator('[data-viewport-capture-toast="success"]');await toast.waitFor({state:'visible'});assert.equal(await toast.textContent(),'Screenshot copied','Success toast copy mismatch');
    const clipboard=await page.evaluate(async()=>{const items=await navigator.clipboard.read();return items.map(item=>item.types).flat();});assert(clipboard.includes('image/png'),`Clipboard did not contain image/png: ${clipboard.join(', ')}`);
    await toast.waitFor({state:'detached',timeout:4000});
  } finally {await browser.close();}
} finally {server.kill('SIGTERM');await closeServer(remote);}

async function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('fixture server has no port'));resolve(address.port);});});}
async function closeServer(server){return new Promise(resolve=>server.close(()=>resolve()));}
async function waitForServer(url){for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`server did not start\n${serverLog}`);}
async function waitUntil(check,message){for(let i=0;i<240;i++){try{if(await check())return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`${message}\n${serverLog}`);}
