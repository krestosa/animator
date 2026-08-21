import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Browser, BrowserContext, BrowserContextOptions, BrowserType, CDPSession, Page } from 'playwright';
import { gateRuntimeSource } from './gate-runtime.js';
import { recordResumeRuntimeSource } from './record-resume-runtime.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';

export type BrowserEngine='chromium'|'firefox'|'webkit';
export type BrowserProfile='desktop'|'mobile';
export type BrowserRuntimeStatus={engine:BrowserEngine;label:string;installed:boolean};
type BrowserEvent=Record<string,unknown>;
type BrowserCommand=Record<string,unknown>;
type FrameListener=(frame:Buffer)=>void;
type BrowserSession={
  id:string;browser:Browser;context:BrowserContext;page:Page;events:BrowserEvent[];width:number;height:number;closed:boolean;headless:boolean;
  sticky:Map<string,BrowserCommand>;navigationVersion:number;engine:BrowserEngine;profile:BrowserProfile;
  frameListeners:Set<FrameListener>;latestFrame?:Buffer|undefined;screenshotPumpRunning:boolean;cdp?:CDPSession|undefined;cdpFrameHandler?:((event:{data?:string;sessionId?:number})=>void)|undefined;
};

const sessions=new Map<string,BrowserSession>();
const timelineCommands=new Set(['SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL','SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION','APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION','SET_MAGNIFY_ANIMATION']);
const stickyCommandTypes=new Set(['SET_RECORDING','SET_COLOR_SCHEME','SET_VIEW_HISTORY_CAPTURE','SET_VIEW_HISTORY_MODE','SET_REDUCED_MOTION']);
const browserEngines:BrowserEngine[]=['chromium','firefox','webkit'];
const browserLabels:Record<BrowserEngine,string>={chromium:'Chromium',firefox:'Firefox',webkit:'Safari / WebKit'};
const animatorRoot=findAnimatorRoot();
const localBrowserDir=path.join(animatorRoot,'.animator-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH=localBrowserDir;
let playwrightPromise:Promise<typeof import('playwright')>|undefined;
let browserInstallPromise:Promise<void>|undefined;

export async function listBrowserRuntimes():Promise<BrowserRuntimeStatus[]>{
  const playwright=await getPlaywright();
  return browserEngines.map(engine=>({engine,label:browserLabels[engine],installed:isBrowserInstalled(browserType(playwright,engine))}));
}

export async function installBrowserRuntimes(values:unknown):Promise<BrowserRuntimeStatus[]>{
  const requested=Array.isArray(values)?values.map(parseEngine):browserEngines;
  const engines=[...new Set(requested)];
  await withInstallLock(engines);
  return listBrowserRuntimes();
}

export async function openBrowserSession(input:string,options:{width?:number;height?:number;engine?:unknown;profile?:unknown}={}):Promise<{id:string;url:string;title:string;engine:BrowserEngine;profile:BrowserProfile;width:number;height:number;external:boolean}>{
  const url=parseUrl(input),id='browser-'+randomUUID(),engine=parseEngine(options.engine),profile=parseProfile(options.profile);
  const size=profile==='mobile'?{width:390,height:844}:{width:clamp(Number(options.width)||1100,320,3840),height:clamp(Number(options.height)||700,240,2160)};
  await ensureBrowserRuntime(engine);
  const playwright=await getPlaywright(),type=browserType(playwright,engine),executablePath=type.executablePath(),headless=shouldRunHeadless();
  const browser=await type.launch({headless,executablePath,...(engine==='chromium'?{args:['--disable-dev-shm-usage']}:{})});
  const contextOptions:BrowserContextOptions={viewport:size,ignoreHTTPSErrors:true};
  if(profile==='mobile'){
    contextOptions.deviceScaleFactor=3;contextOptions.hasTouch=true;contextOptions.userAgent=mobileUserAgent(engine);
    if(engine!=='firefox')contextOptions.isMobile=true;
  }
  const context=await browser.newContext(contextOptions),page=await context.newPage();
  const session:BrowserSession={id,browser,context,page,events:[],width:size.width,height:size.height,closed:false,headless,sticky:new Map(),navigationVersion:0,engine,profile,frameListeners:new Set(),screenshotPumpRunning:false};sessions.set(id,session);
  await page.exposeBinding('__animatorEmit',(_source,payload:unknown)=>{if(payload&&typeof payload==='object')pushEvent(session,payload as BrowserEvent);});
  const forwarder=`(()=>{if(window.__ANIMATOR_BROWSER_FORWARDER__)return;window.__ANIMATOR_BROWSER_FORWARDER__=true;const nativePost=window.postMessage.bind(window);window.postMessage=function(value,...args){if(value&&value.source==='animator-preview'&&typeof window.__animatorEmit==='function'){try{void window.__animatorEmit(value);}catch{}}return nativePost(value,...args);};})();`;
  const runtimeBundle=forwarder+gateRuntimeSource+runtimeSource+recordResumeRuntimeSource+seekRuntimeSource+mutationRuntimeSource+auxiliaryRuntimeSource;
  await page.addInitScript({content:deferRuntimeUntilDocumentRoot(runtimeBundle)});
  page.on('framenavigated',frame=>{
    if(frame!==page.mainFrame())return;
    pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'info',message:`${browserLabels[engine]} preview: ${frame.url()}`});
    const version=++session.navigationVersion;void reapplySticky(session,version);
  });
  page.on('close',()=>{session.closed=true;void stopFrameSource(session);});
  try{await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});await forceRuntimeScan(session);if(!headless)await page.bringToFront();}catch(error){pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'warn',message:error instanceof Error?error.message:String(error)});}
  return{id,url:page.url()||url.href,title:await safeTitle(page),engine,profile,width:session.width,height:session.height,external:!headless};
}

export function getBrowserSession(id:string):BrowserSession|undefined{return sessions.get(id);}
export async function browserFrame(id:string):Promise<Buffer>{const session=requireSession(id);if(session.latestFrame)return session.latestFrame;return Buffer.from(await session.page.screenshot({type:'jpeg',quality:54,animations:'allow',caret:'hide',scale:'css'}));}
export async function subscribeBrowserFrames(id:string,listener:FrameListener):Promise<()=>void>{
  const session=requireSession(id);session.frameListeners.add(listener);if(session.latestFrame)queueMicrotask(()=>{if(session.frameListeners.has(listener)&&session.latestFrame)listener(session.latestFrame);});
  await ensureFrameSource(session);
  let active=true;return()=>{if(!active)return;active=false;session.frameListeners.delete(listener);if(session.frameListeners.size===0)void stopFrameSource(session);};
}
export function drainBrowserEvents(id:string):BrowserEvent[]{const session=requireSession(id),events=session.events.splice(0,session.events.length);return events;}
export async function browserState(id:string):Promise<{url:string;title:string;width:number;height:number;engine:BrowserEngine;profile:BrowserProfile;external:boolean}>{const session=requireSession(id);return{url:session.page.url(),title:await safeTitle(session.page),width:session.width,height:session.height,engine:session.engine,profile:session.profile,external:!session.headless};}
export async function sendBrowserCommand(id:string,command:BrowserCommand):Promise<void>{const session=requireSession(id);rememberSticky(session,command);await applyBrowserCommand(session,command);}
export async function browserInput(id:string,input:Record<string,unknown>):Promise<void>{const session=requireSession(id);await applyBrowserInput(session,input);}
export async function closeBrowserSession(id:string):Promise<void>{const session=sessions.get(id);if(!session)return;sessions.delete(id);session.closed=true;await stopFrameSource(session);try{await session.context.close();}catch{}try{await session.browser.close();}catch{}}
export async function closeAllBrowserSessions():Promise<void>{await Promise.all([...sessions.keys()].map(closeBrowserSession));}

async function applyBrowserInput(session:BrowserSession,input:Record<string,unknown>):Promise<void>{
  const page=session.page,type=String(input.type||'');
  if(type==='batch'&&Array.isArray(input.events)){for(const event of input.events)if(event&&typeof event==='object')await applyBrowserInput(session,event as Record<string,unknown>);return;}
  if(type==='move'){await page.mouse.move(number(input.x),number(input.y));return;}
  if(type==='down'){await page.mouse.move(number(input.x),number(input.y));await page.mouse.down({button:mouseButton(input.button)});return;}
  if(type==='up'){await page.mouse.move(number(input.x),number(input.y));await page.mouse.up({button:mouseButton(input.button)});return;}
  if(type==='wheel'){await page.mouse.wheel(number(input.dx),number(input.dy));return;}
  if(type==='keyDown'){const key=String(input.key||'');if(key)await page.keyboard.down(key);return;}
  if(type==='keyUp'){const key=String(input.key||'');if(key)await page.keyboard.up(key);return;}
  if(type==='text'){await page.keyboard.insertText(String(input.text||''));return;}
  if(type==='resize'){
    const width=clamp(number(input.width),320,3840),height=clamp(number(input.height),240,2160);session.width=width;session.height=height;await page.setViewportSize({width,height});
  }
}

function rememberSticky(session:BrowserSession,command:BrowserCommand):void{
  const type=String(command.type||'');if(!stickyCommandTypes.has(type))return;
  const stored={...command};delete stored.requestId;delete stored.requestedAt;session.sticky.set(type,stored);
}
async function applyBrowserCommand(session:BrowserSession,command:BrowserCommand):Promise<void>{
  const type=String(command.type||''),message={...command};
  if(type==='SET_COLOR_SCHEME')await session.page.emulateMedia({colorScheme:message.mode==='dark'?'dark':message.mode==='light'?'light':null});
  if(type==='SET_RECORDING'){
    if(message.requestedAt==null)message.requestedAt=Date.now();
    if(message.enabled===true)await postToPage(session.page,{source:'animator-timeline',type:'RELEASE_TIMELINE'});
  }
  const source=timelineCommands.has(type)?'animator-timeline':'animator-editor';await postToPage(session.page,{source,...message});
  if(type==='SET_RECORDING')await confirmBrowserRecording(session,message);
}
async function confirmBrowserRecording(session:BrowserSession,message:BrowserCommand):Promise<void>{
  const enabled=message.enabled===true;
  try{await session.page.waitForFunction(expected=>{const gate=(globalThis as typeof globalThis&{__ANIMATOR_CAPTURE_GATE__?:{recording?:boolean}}).__ANIMATOR_CAPTURE_GATE__;return typeof gate?.recording==='boolean'&&gate.recording===expected;},enabled,{timeout:2000});}
  catch{throw new Error(`Browser preview did not apply recording state ${enabled?'REC':'STOP'}`);}
  if(typeof message.requestId==='string')pushEvent(session,{source:'animator-preview',type:'RECORDING_STATE',enabled,requestId:message.requestId});
}
async function reapplySticky(session:BrowserSession,version:number):Promise<void>{
  try{await session.page.waitForLoadState('domcontentloaded',{timeout:5000});}catch{}
  if(session.closed||version!==session.navigationVersion)return;
  for(const command of session.sticky.values()){try{await applyBrowserCommand(session,command);}catch{}}
  await forceRuntimeScan(session);
}
async function forceRuntimeScan(session:BrowserSession):Promise<void>{
  if(session.closed)return;
  try{await session.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await postToPage(session.page,{source:'animator-editor',type:'RECALCULATE_VIEWPORT'});}catch{}
}
async function postToPage(page:Page,message:Record<string,unknown>):Promise<void>{await page.evaluate(value=>window.postMessage(value,'*'),message);}
function pushEvent(session:BrowserSession,event:BrowserEvent):void{session.events.push(event);if(session.events.length>5000)session.events.splice(0,session.events.length-5000);}
function requireSession(id:string):BrowserSession{const session=sessions.get(id);if(!session||session.closed)throw new Error('Browser preview session not found');return session;}

async function ensureFrameSource(session:BrowserSession):Promise<void>{
  if(session.closed||session.frameListeners.size===0||session.cdp||session.screenshotPumpRunning)return;
  if(session.engine==='chromium'){
    try{
      const cdp=await session.context.newCDPSession(session.page),handler=(event:{data?:string;sessionId?:number})=>{if(event.data)publishFrame(session,Buffer.from(event.data,'base64'));if(typeof event.sessionId==='number')void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});};
      session.cdp=cdp;session.cdpFrameHandler=handler;cdp.on('Page.screencastFrame',handler);await cdp.send('Page.startScreencast',{format:'jpeg',quality:58,everyNthFrame:2,maxWidth:session.width,maxHeight:session.height});return;
    }catch{await stopFrameSource(session);}
  }
  session.screenshotPumpRunning=true;void screenshotPump(session);
}
async function screenshotPump(session:BrowserSession):Promise<void>{
  try{
    while(!session.closed&&session.frameListeners.size>0){const started=Date.now();try{publishFrame(session,Buffer.from(await session.page.screenshot({type:'jpeg',quality:52,animations:'allow',caret:'hide',scale:'css'})));}catch{}const wait=Math.max(0,60-(Date.now()-started));if(wait)await delay(wait);}
  }finally{session.screenshotPumpRunning=false;if(!session.closed&&session.frameListeners.size>0)void ensureFrameSource(session);}
}
function publishFrame(session:BrowserSession,frame:Buffer):void{session.latestFrame=frame;for(const listener of session.frameListeners){try{listener(frame);}catch{}}}
async function stopFrameSource(session:BrowserSession):Promise<void>{
  const cdp=session.cdp,handler=session.cdpFrameHandler;session.cdp=undefined;session.cdpFrameHandler=undefined;
  if(cdp){if(handler)cdp.off('Page.screencastFrame',handler);try{await cdp.send('Page.stopScreencast');}catch{}try{await cdp.detach();}catch{}}
}

async function ensureBrowserRuntime(engine:BrowserEngine):Promise<void>{
  const playwright=await getPlaywright();if(isBrowserInstalled(browserType(playwright,engine)))return;
  await withInstallLock([engine]);
  if(!isBrowserInstalled(browserType(await getPlaywright(),engine)))throw new Error(`${browserLabels[engine]} runtime was not installed in ${localBrowserDir}.`);
}
async function withInstallLock(engines:BrowserEngine[]):Promise<void>{
  if(browserInstallPromise)await browserInstallPromise;
  const playwright=await getPlaywright(),missing=engines.filter(engine=>!isBrowserInstalled(browserType(playwright,engine)));if(!missing.length)return;
  browserInstallPromise=installLocalBrowsers(missing).finally(()=>{browserInstallPromise=undefined;});await browserInstallPromise;
}
async function installLocalBrowsers(engines:BrowserEngine[]):Promise<void>{
  fs.mkdirSync(localBrowserDir,{recursive:true});const cli=path.join(animatorRoot,'node_modules','playwright','cli.js');
  if(!fs.existsSync(cli))throw new Error('Animator Browser requires installed npm dependencies. Run npm install in the Animator project once.');
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'install',...engines],{cwd:animatorRoot,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:localBrowserDir},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';const append=(chunk:Buffer|string)=>{output=(output+String(chunk)).slice(-7000);};child.stdout?.on('data',append);child.stderr?.on('data',append);
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Could not install ${engines.map(engine=>browserLabels[engine]).join(', ')} in ${localBrowserDir}.${output.trim()?`\n${output.trim()}`:''}`)));
  });
}
async function getPlaywright():Promise<typeof import('playwright')>{return playwrightPromise??=(import('playwright'));}
function browserType(playwright:typeof import('playwright'),engine:BrowserEngine):BrowserType<Browser>{return engine==='firefox'?playwright.firefox:engine==='webkit'?playwright.webkit:playwright.chromium;}
function isBrowserInstalled(type:BrowserType<Browser>):boolean{try{return fs.existsSync(type.executablePath());}catch{return false;}}
function parseEngine(value:unknown):BrowserEngine{return value==='firefox'?'firefox':value==='webkit'?'webkit':'chromium';}
function parseProfile(value:unknown):BrowserProfile{return value==='mobile'?'mobile':'desktop';}
function mobileUserAgent(engine:BrowserEngine):string{
  if(engine==='firefox')return'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0';
  if(engine==='webkit')return'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  return'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
}
function shouldRunHeadless():boolean{return process.env.ANIMATOR_BROWSER_HEADLESS==='1'||process.env.CI==='true';}
function deferRuntimeUntilDocumentRoot(source:string):string{return`(()=>{let booted=false;const boot=()=>{if(booted||!document.documentElement)return false;booted=true;${source};return true;};if(boot())return;const observer=new MutationObserver(()=>{if(boot()){observer.disconnect();}});observer.observe(document,{childList:true,subtree:true});addEventListener('DOMContentLoaded',()=>{boot();observer.disconnect();},{once:true});})();`;}
function parseUrl(input:string):URL{const raw=input.trim();if(!raw)throw new Error('Enter a web URL');const value=/^https?:\/\//i.test(raw)?raw:'https://'+raw,url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https URLs are supported');return url;}
function number(value:unknown):number{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,Math.round(value||min)));}
function mouseButton(value:unknown):'left'|'middle'|'right'{return value===1?'middle':value===2?'right':'left';}
async function safeTitle(page:Page):Promise<string>{try{return await page.title();}catch{return'';}}
function delay(ms:number):Promise<void>{return new Promise(resolve=>setTimeout(resolve,ms));}
function findAnimatorRoot():string{
  let current=path.dirname(fileURLToPath(import.meta.url));
  for(let depth=0;depth<6;depth++){const packagePath=path.join(current,'package.json');if(fs.existsSync(packagePath)){try{const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as {name?:string};if(pkg.name==='animator')return current;}catch{}}const parent=path.dirname(current);if(parent===current)break;current=parent;}
  return process.cwd();
}