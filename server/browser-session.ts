import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { Browser, BrowserContext, BrowserContextOptions, BrowserType, Page } from 'playwright';
import { gateRuntimeSource } from './gate-runtime.js';
import { recordResumeRuntimeSource } from './record-resume-runtime.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';
import { browserSnapshotRuntimeSource } from './browser-snapshot-runtime.js';

export type BrowserEngine='chromium'|'firefox'|'webkit';
export type BrowserProfile='desktop'|'mobile';
export type BrowserRuntimeStatus={engine:BrowserEngine;label:string;installed:boolean};
type BrowserEvent=Record<string,unknown>;
type BrowserCommand=Record<string,unknown>;
type BrowserSession={id:string;browser:Browser;context:BrowserContext;page:Page;events:BrowserEvent[];width:number;height:number;closed:boolean;headless:boolean;snapshotHtml?:string;sticky:Map<string,BrowserCommand>;navigationVersion:number;engine:BrowserEngine;profile:BrowserProfile};
type SnapshotAnimation={id:string;elementId:string;startTime:number;duration:number;delay:number;iterations:number|string;direction:string;easing:string;fill:string;keyframes:Array<Record<string,unknown>>;currentTime:number|null;playbackRate:number};
type SnapshotVisual={id:string;tag:string;width:number;height:number;dataUrl?:string};
type SnapshotPayload={html:string;url:string;scrollX:number;scrollY:number;history:unknown[];animations:SnapshotAnimation[];visuals:SnapshotVisual[]};

const sessions=new Map<string,BrowserSession>();
const timelineCommands=new Set(['SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL','SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION','APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION','SET_MAGNIFY_ANIMATION']);
const stickyCommandTypes=new Set(['SET_RECORDING','SET_COLOR_SCHEME','SET_VIEW_HISTORY_CAPTURE','SET_VIEW_HISTORY_MODE','SET_REDUCED_MOTION']);
const browserEngines:BrowserEngine[]=['chromium','firefox','webkit'];
const browserLabels:Record<BrowserEngine,string>={chromium:'Chromium',firefox:'Firefox',webkit:'Safari / WebKit'};
const animatorRoot=findAnimatorRoot(),localBrowserDir=path.join(animatorRoot,'.animator-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH=localBrowserDir;
let playwrightPromise:Promise<typeof import('playwright')>|undefined,browserInstallPromise:Promise<void>|undefined;

export async function listBrowserRuntimes():Promise<BrowserRuntimeStatus[]>{const playwright=await getPlaywright();return browserEngines.map(engine=>({engine,label:browserLabels[engine],installed:isBrowserInstalled(browserType(playwright,engine))}));}
export async function installBrowserRuntimes(values:unknown):Promise<BrowserRuntimeStatus[]>{const requested=Array.isArray(values)?values.map(parseEngine):browserEngines,engines=[...new Set(requested)];await withInstallLock(engines);return listBrowserRuntimes();}
export async function openBrowserSession(input:string,options:{width?:number;height?:number;engine?:unknown;profile?:unknown}={}):Promise<{id:string;url:string;title:string;engine:BrowserEngine;profile:BrowserProfile;width:number;height:number;external:boolean}>{
  const url=parseUrl(input),id='browser-'+randomUUID(),engine=parseEngine(options.engine),profile=parseProfile(options.profile),size=profile==='mobile'?{width:390,height:844}:{width:clamp(Number(options.width)||1100,320,3840),height:clamp(Number(options.height)||700,240,2160)};
  await ensureBrowserRuntime(engine);const playwright=await getPlaywright(),type=browserType(playwright,engine),headless=shouldRunHeadless();
  const browser=await type.launch({headless,executablePath:type.executablePath(),...(engine==='chromium'?{args:['--disable-dev-shm-usage']}:{})}),contextOptions:BrowserContextOptions={viewport:size,ignoreHTTPSErrors:true};
  if(profile==='mobile'){contextOptions.deviceScaleFactor=3;contextOptions.hasTouch=true;contextOptions.userAgent=mobileUserAgent(engine);if(engine!=='firefox')contextOptions.isMobile=true;}
  const context=await browser.newContext(contextOptions),page=await context.newPage(),session:BrowserSession={id,browser,context,page,events:[],width:size.width,height:size.height,closed:false,headless,sticky:new Map(),navigationVersion:0,engine,profile};sessions.set(id,session);
  await page.exposeBinding('__animatorEmit',(_source,payload:unknown)=>{if(payload&&typeof payload==='object')pushEvent(session,payload as BrowserEvent);});
  const forwarder=`(()=>{if(window.__ANIMATOR_BROWSER_FORWARDER__)return;window.__ANIMATOR_BROWSER_FORWARDER__=true;const nativePost=window.postMessage.bind(window);window.postMessage=function(value,...args){if(value&&value.source==='animator-preview'&&typeof window.__animatorEmit==='function'){try{void window.__animatorEmit(value);}catch{}}return nativePost(value,...args);};})();`,runtimeBundle=forwarder+gateRuntimeSource+runtimeSource+recordResumeRuntimeSource+seekRuntimeSource+mutationRuntimeSource+auxiliaryRuntimeSource;
  await page.addInitScript({content:deferRuntimeUntilDocumentRoot(runtimeBundle)});
  page.on('framenavigated',frame=>{if(frame!==page.mainFrame())return;session.snapshotHtml=undefined;pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'info',message:`${browserLabels[engine]} preview: ${frame.url()}`});const version=++session.navigationVersion;void reapplySticky(session,version);});
  page.on('close',()=>{session.closed=true;});
  try{await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});await forceRuntimeScan(session);if(!headless)await page.bringToFront();}catch(error){pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'warn',message:error instanceof Error?error.message:String(error)});}
  return{id,url:page.url()||url.href,title:await safeTitle(page),engine,profile,width:size.width,height:size.height,external:!headless};
}

export function getBrowserSession(id:string):BrowserSession|undefined{return sessions.get(id);}
export function browserSnapshot(id:string):string{const session=requireSession(id);if(!session.snapshotHtml)throw new Error('Browser capture snapshot is not ready');return session.snapshotHtml;}
export function drainBrowserEvents(id:string):BrowserEvent[]{const session=requireSession(id),events=session.events.splice(0,session.events.length);return events;}
export async function browserState(id:string):Promise<{url:string;title:string;width:number;height:number;engine:BrowserEngine;profile:BrowserProfile;external:boolean;snapshotReady:boolean}>{const session=requireSession(id);return{url:session.page.url(),title:await safeTitle(session.page),width:session.width,height:session.height,engine:session.engine,profile:session.profile,external:!session.headless,snapshotReady:!!session.snapshotHtml};}
export async function sendBrowserCommand(id:string,command:BrowserCommand):Promise<void>{const session=requireSession(id);rememberSticky(session,command);await applyBrowserCommand(session,command);}
export async function closeBrowserSession(id:string):Promise<void>{const session=sessions.get(id);if(!session)return;sessions.delete(id);session.closed=true;try{await session.context.close();}catch{}try{await session.browser.close();}catch{}}
export async function closeAllBrowserSessions():Promise<void>{await Promise.all([...sessions.keys()].map(closeBrowserSession));}

function rememberSticky(session:BrowserSession,command:BrowserCommand):void{const type=String(command.type||'');if(!stickyCommandTypes.has(type))return;const stored={...command};delete stored.requestId;delete stored.requestedAt;session.sticky.set(type,stored);}
async function applyBrowserCommand(session:BrowserSession,command:BrowserCommand):Promise<void>{
  const type=String(command.type||''),message={...command};if(type==='SET_COLOR_SCHEME')await session.page.emulateMedia({colorScheme:message.mode==='dark'?'dark':message.mode==='light'?'light':null});
  if(type==='SET_RECORDING'){if(message.requestedAt==null)message.requestedAt=Date.now();if(message.enabled===true){session.snapshotHtml=undefined;await postToPage(session.page,{source:'animator-timeline',type:'RELEASE_TIMELINE'});}}
  const source=timelineCommands.has(type)?'animator-timeline':'animator-editor';await postToPage(session.page,{source,...message});if(type==='SET_RECORDING')await confirmBrowserRecording(session,message);
}
async function confirmBrowserRecording(session:BrowserSession,message:BrowserCommand):Promise<void>{
  const enabled=message.enabled===true;try{await session.page.waitForFunction(expected=>{const gate=(globalThis as typeof globalThis&{__ANIMATOR_CAPTURE_GATE__?:{recording?:boolean}}).__ANIMATOR_CAPTURE_GATE__;return typeof gate?.recording==='boolean'&&gate.recording===expected;},enabled,{timeout:2000});}catch{throw new Error(`Browser preview did not apply recording state ${enabled?'REC':'STOP'}`);}
  if(!enabled)await captureBrowserSnapshot(session);if(typeof message.requestId==='string')pushEvent(session,{source:'animator-preview',type:'RECORDING_STATE',enabled,requestId:message.requestId});
}
async function captureBrowserSnapshot(session:BrowserSession):Promise<void>{
  const visualToken='visual-'+randomUUID().replace(/-/g,''),payload=await session.page.evaluate((token):SnapshotPayload=>{
    const host=globalThis as typeof globalThis&{__ANIMATOR_ELEMENT_ID__?:(element:Element)=>string;__ANIMATOR_VIEW_HISTORY__?:{snapshot?:()=>unknown[]}},idFor=host.__ANIMATOR_ELEMENT_ID__,marked:Array<{element:Element;previous:string|null}>=[],all=[document.documentElement,...document.documentElement.querySelectorAll('*')];
    for(const element of all){if(element.hasAttribute('data-animator-internal'))continue;const id=typeof idFor==='function'?idFor(element):element.id?`dom-${element.id}`:'';if(!id)continue;marked.push({element,previous:element.getAttribute('data-animator-capture-id')});element.setAttribute('data-animator-capture-id',id);}
    const visuals:Array<{id:string;tag:string;width:number;height:number}>=[];let visualIndex=0;
    for(const element of document.querySelectorAll('canvas,video,iframe,object,embed')){if(element.hasAttribute('data-animator-internal'))continue;const rect=element.getBoundingClientRect();if(rect.width<1||rect.height<1)continue;const id=`${token}-${++visualIndex}`;element.setAttribute('data-animator-visual-id',id);visuals.push({id,tag:element.tagName.toLowerCase(),width:rect.width,height:rect.height});if(visuals.length>=64)break;}
    const animations:SnapshotAnimation[]=[];
    for(const animation of document.getAnimations?.()??[]){
      const effect=animation.effect;if(!(effect instanceof KeyframeEffect))continue;const target=effect.target;if(!(target instanceof Element)||target.hasAttribute('data-animator-internal'))continue;const elementId=typeof idFor==='function'?idFor(target):target.getAttribute('data-animator-capture-id')||'';if(!elementId)continue;
      let timing={} as ComputedEffectTiming,rawFrames:ComputedKeyframe[]=[];try{timing=effect.getComputedTiming();rawFrames=effect.getKeyframes();}catch{}
      const keyframes=rawFrames.map(frame=>{const out:Record<string,unknown>={};for(const [key,value] of Object.entries(frame))if(value!==undefined)out[key]=value===null||typeof value==='number'||typeof value==='string'?value:String(value);return out;}),object=animation as Animation&{__animatorId?:string;__animatorBrowserStartTime?:number},current=Number(animation.currentTime),rate=Math.abs(Number(animation.playbackRate))||1,id=object.__animatorId||`anim-snapshot-${animations.length+1}`,knownStart=Number(object.__animatorBrowserStartTime),iterations=Number(timing.iterations);
      animations.push({id,elementId,startTime:Number.isFinite(knownStart)?knownStart:Math.max(0,performance.now()-(Number.isFinite(current)?Math.max(0,current)/rate:0)),duration:Number(timing.duration)||0,delay:Number(timing.delay)||0,iterations:Number.isFinite(iterations)?iterations:'Infinity',direction:String(timing.direction||'normal'),easing:String(timing.easing||'linear'),fill:String(timing.fill||'both'),keyframes,currentTime:Number.isFinite(current)?current:null,playbackRate:Number(animation.playbackRate)||1});
    }
    const clone=document.documentElement.cloneNode(true) as HTMLElement;for(const item of marked){if(item.previous==null)item.element.removeAttribute('data-animator-capture-id');else item.element.setAttribute('data-animator-capture-id',item.previous);}
    clone.querySelectorAll('script,[data-animator-internal],[data-animator-picker-outline],[data-animator-recorded-viewport],[data-animator-recorded-cursor]').forEach(node=>node.remove());clone.querySelectorAll('meta[http-equiv]').forEach(node=>{if((node.getAttribute('http-equiv')||'').toLowerCase()==='content-security-policy')node.remove();});clone.querySelectorAll('base').forEach(node=>node.remove());
    return{html:'<!doctype html>'+clone.outerHTML,url:location.href,scrollX,scrollY,history:host.__ANIMATOR_VIEW_HISTORY__?.snapshot?.()??[],animations,visuals};
  },visualToken);
  const capturedVisuals:SnapshotVisual[]=[];
  try{
    for(const visual of payload.visuals){
      try{const locator=session.page.locator(`[data-animator-visual-id="${visual.id}"]`).first(),box=await locator.boundingBox();if(!box||box.width<1||box.height<1)continue;const buffer=await locator.screenshot({type:'png',animations:'allow',caret:'hide',scale:'css',timeout:4000});capturedVisuals.push({...visual,dataUrl:'data:image/png;base64,'+buffer.toString('base64')});}catch{}
    }
  }finally{
    try{await session.page.evaluate(ids=>{for(const id of ids)document.querySelector(`[data-animator-visual-id="${id}"]`)?.removeAttribute('data-animator-visual-id');},payload.visuals.map(visual=>visual.id));await session.page.evaluate(({x,y})=>scrollTo(x,y),{x:payload.scrollX,y:payload.scrollY});}catch{}
  }
  const base=`<base href="${escapeHtml(payload.url)}">`,freeze='<style data-animator-snapshot-freeze>*,*::before,*::after{animation:none!important;transition:none!important}</style>',seed=`<script>window.__ANIMATOR_VIEW_HISTORY_SEED__=${safeJson(payload.history)};window.__ANIMATOR_SNAPSHOT_STATE__=${safeJson({scrollX:payload.scrollX,scrollY:payload.scrollY})};window.__ANIMATOR_SNAPSHOT_ANIMATIONS__=${safeJson(payload.animations)};window.__ANIMATOR_SNAPSHOT_VISUALS__=${safeJson(capturedVisuals)};</script>`,runtimes=inlineScript(browserSnapshotRuntimeSource)+inlineScript(recordResumeRuntimeSource)+inlineScript(seekRuntimeSource);
  let html=payload.html.replace(/<head([^>]*)>/i,match=>match+base+freeze);if(!/<head[\s>]/i.test(html))html=html.replace(/<html([^>]*)>/i,match=>match+'<head>'+base+freeze+'</head>');html=/<\/body>/i.test(html)?html.replace(/<\/body>/i,seed+runtimes+'</body>'):html.replace(/<\/html>/i,seed+runtimes+'</html>');session.snapshotHtml=html;
}
async function reapplySticky(session:BrowserSession,version:number):Promise<void>{try{await session.page.waitForLoadState('domcontentloaded',{timeout:5000});}catch{}if(session.closed||version!==session.navigationVersion)return;for(const command of session.sticky.values()){try{await applyBrowserCommand(session,command);}catch{}}await forceRuntimeScan(session);}
async function forceRuntimeScan(session:BrowserSession):Promise<void>{if(session.closed)return;try{await session.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await postToPage(session.page,{source:'animator-editor',type:'RECALCULATE_VIEWPORT'});}catch{}}
async function postToPage(page:Page,message:Record<string,unknown>):Promise<void>{await page.evaluate(value=>window.postMessage(value,'*'),message);}
function pushEvent(session:BrowserSession,event:BrowserEvent):void{session.events.push(event);if(session.events.length>5000)session.events.splice(0,session.events.length-5000);}
function requireSession(id:string):BrowserSession{const session=sessions.get(id);if(!session||session.closed)throw new Error('Browser preview session not found');return session;}

async function ensureBrowserRuntime(engine:BrowserEngine):Promise<void>{const playwright=await getPlaywright();if(isBrowserInstalled(browserType(playwright,engine)))return;await withInstallLock([engine]);if(!isBrowserInstalled(browserType(await getPlaywright(),engine)))throw new Error(`${browserLabels[engine]} runtime was not installed in ${localBrowserDir}.`);}
async function withInstallLock(engines:BrowserEngine[]):Promise<void>{if(browserInstallPromise)await browserInstallPromise;const playwright=await getPlaywright(),missing=engines.filter(engine=>!isBrowserInstalled(browserType(playwright,engine)));if(!missing.length)return;browserInstallPromise=installLocalBrowsers(missing).finally(()=>{browserInstallPromise=undefined;});await browserInstallPromise;}
async function installLocalBrowsers(engines:BrowserEngine[]):Promise<void>{fs.mkdirSync(localBrowserDir,{recursive:true});const cli=path.join(animatorRoot,'node_modules','playwright','cli.js');if(!fs.existsSync(cli))throw new Error('Animator Browser requires installed npm dependencies. Run npm install in the Animator project once.');await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,[cli,'install',...engines],{cwd:animatorRoot,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:localBrowserDir},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';const append=(chunk:Buffer|string)=>{output=(output+String(chunk)).slice(-7000);};child.stdout?.on('data',append);child.stderr?.on('data',append);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Could not install ${engines.map(engine=>browserLabels[engine]).join(', ')} in ${localBrowserDir}.${output.trim()?`\n${output.trim()}`:''}`)));});}
async function getPlaywright():Promise<typeof import('playwright')>{return playwrightPromise??=import('playwright');}
function browserType(playwright:typeof import('playwright'),engine:BrowserEngine):BrowserType<Browser>{return engine==='firefox'?playwright.firefox:engine==='webkit'?playwright.webkit:playwright.chromium;}
function isBrowserInstalled(type:BrowserType<Browser>):boolean{try{return fs.existsSync(type.executablePath());}catch{return false;}}
function parseEngine(value:unknown):BrowserEngine{return value==='firefox'?'firefox':value==='webkit'?'webkit':'chromium';}
function parseProfile(value:unknown):BrowserProfile{return value==='mobile'?'mobile':'desktop';}
function mobileUserAgent(engine:BrowserEngine):string{if(engine==='firefox')return'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0';if(engine==='webkit')return'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';return'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';}
function shouldRunHeadless():boolean{return process.env.ANIMATOR_BROWSER_HEADLESS==='1'||process.env.CI==='true';}
function deferRuntimeUntilDocumentRoot(source:string):string{return`(()=>{let booted=false;const boot=()=>{if(booted||!document.documentElement)return false;booted=true;${source};return true;};if(boot())return;const observer=new MutationObserver(()=>{if(boot()){observer.disconnect();}});observer.observe(document,{childList:true,subtree:true});addEventListener('DOMContentLoaded',()=>{boot();observer.disconnect();},{once:true});})();`;}
function parseUrl(input:string):URL{const raw=input.trim();if(!raw)throw new Error('Enter a web URL');const value=/^https?:\/\//i.test(raw)?raw:'https://'+raw,url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https URLs are supported');return url;}
function safeJson(value:unknown):string{return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
function inlineScript(source:string):string{return`<script>${source.replace(/<\/script/gi,'<\\/script')}</script>`;}
function escapeHtml(value:string):string{return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,Math.round(value||min)));}
async function safeTitle(page:Page):Promise<string>{try{return await page.title();}catch{return'';}}
function findAnimatorRoot():string{let current=path.dirname(fileURLToPath(import.meta.url));for(let depth=0;depth<6;depth++){const packagePath=path.join(current,'package.json');if(fs.existsSync(packagePath)){try{const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as {name?:string};if(pkg.name==='animator')return current;}catch{}}const parent=path.dirname(current);if(parent===current)break;current=parent;}return process.cwd();}
