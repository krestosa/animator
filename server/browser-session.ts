import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import { gateRuntimeSource } from './gate-runtime.js';
import { recordResumeRuntimeSource } from './record-resume-runtime.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';
import { emergencyCheckpointRuntimeSource } from './emergency-checkpoint-runtime.js';
import { launchBrowser, closeBrowserResources } from './browser/browser-manager.js';
import { browserLabels, installBrowserRuntimes, listBrowserRuntimes, parseEngine, parseProfile } from './browser/runtime-manager.js';
import { sessionRegistry } from './browser/session-registry.js';
import { clearCheckpoint, markStoppedImmediately, scheduleCheckpoint, setBrowserRecording, type RecordingHooks } from './browser/recording-controller.js';
import { clearEmergencyCheckpoint, hasValidEmergencyCheckpoint, promoteEmergencyCheckpoint, rememberEmergencyCheckpoint } from './browser/snapshot-service.js';
import type { BrowserCommand, BrowserEngine, BrowserEvent, BrowserProfile, BrowserResource, BrowserRuntimeStatus, BrowserSession, BrowserSessionState, BrowserSnapshotStatus } from './browser/types.js';

export type { BrowserEngine, BrowserProfile, BrowserResource, BrowserRuntimeStatus, BrowserSessionState, BrowserSnapshotStatus } from './browser/types.js';
export { installBrowserRuntimes, listBrowserRuntimes } from './browser/runtime-manager.js';

const timelineCommands=new Set(['SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL','SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION','APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION','SET_MAGNIFY_ANIMATION']);
const stickyCommandTypes=new Set(['SET_RECORDING','SET_COLOR_SCHEME','SET_VIEW_HISTORY_CAPTURE','SET_VIEW_HISTORY_MODE','SET_REDUCED_MOTION']);

const recordingHooks:RecordingHooks={
  postToPage:async(session,message)=>postToPage(session.page,message),
  pushEvent,
  pushDiagnostic,
  requestEmergencyCheckpoint
};

export async function openBrowserSession(input:string,options:{width?:number;height?:number;engine?:unknown;profile?:unknown}={}):Promise<{id:string;url:string;title:string;engine:BrowserEngine;profile:BrowserProfile;width:number;height:number;external:boolean}>{
  const url=parseUrl(input),id='browser-'+randomUUID(),engine=parseEngine(options.engine),profile=parseProfile(options.profile),opened=await launchBrowser(engine,profile,options.width,options.height);
  const {browser,context,page,headless,width,height}=opened;
  const session:BrowserSession={id,browser,context,page,events:[],resources:new Map(),width,height,destroyed:false,browserClosed:false,headless,recording:true,snapshotStatus:'idle',snapshotVersion:0,snapshotGeneration:0,checkpointBusy:false,sticky:new Map(),navigationVersion:0,engine,profile,url:url.href,title:''};
  sessionRegistry.add(session);
  page.on('request',request=>{
    if(session.destroyed)return;
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame())session.resources.clear();
    rememberBrowserResource(session,{url:request.url(),resourceType:request.resourceType(),method:request.method()});
  });
  page.on('response',response=>{
    if(session.destroyed)return;
    const request=response.request(),headers=response.headers(),contentLength=parseContentLength(headers['content-length']),mimeType=String(headers['content-type']??'').split(';')[0]?.trim()??'';
    rememberBrowserResource(session,{url:response.url(),resourceType:request.resourceType(),method:request.method(),statusCode:response.status(),transferSize:contentLength,decodedBodySize:contentLength,mimeType});
  });
  page.on('websocket',socket=>{if(!session.destroyed)rememberBrowserResource(session,{url:socket.url(),resourceType:'webSocket',method:'GET'});});
  await page.exposeBinding('__animatorEmit',(source,payload:unknown)=>{if(payload&&typeof payload==='object'){const message=payload as BrowserEvent;if(message.type==='BROWSER_CHECKPOINT'){if(source.frame===page.mainFrame())rememberEmergencyCheckpoint(session,message);return;}pushEvent(session,message);}});
  const forwarder=`(()=>{if(window.__ANIMATOR_BROWSER_FORWARDER__)return;window.__ANIMATOR_BROWSER_FORWARDER__=true;const nativePost=window.postMessage.bind(window);window.postMessage=function(value,...args){if(value&&value.source==='animator-preview'&&typeof window.__animatorEmit==='function'){try{void window.__animatorEmit(value);}catch{}}return nativePost(value,...args);};})();`;
  const runtimeBundle=forwarder+gateRuntimeSource+runtimeSource+recordResumeRuntimeSource+seekRuntimeSource+mutationRuntimeSource+auxiliaryRuntimeSource+emergencyCheckpointRuntimeSource;
  await page.addInitScript({content:deferRuntimeUntilDocumentRoot(runtimeBundle)});
  page.on('framenavigated',frame=>{if(frame!==page.mainFrame()||session.destroyed)return;session.url=frame.url()||session.url;session.snapshotHtml=undefined;clearEmergencyCheckpoint(session.id);session.snapshotStatus='idle';session.snapshotError=undefined;session.snapshotGeneration++;scheduleCheckpoint(session,recordingHooks,700);pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'info',message:`${browserLabels[engine]} preview: ${session.url}`});const version=++session.navigationVersion;void reapplySticky(session,version);void refreshSessionTitle(session);});
  page.on('close',()=>handleBrowserClosed(session,'browser-closed'));
  browser.on('disconnected',()=>handleBrowserClosed(session,'browser-disconnected'));
  try{await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});session.url=page.url()||url.href;session.title=await safeTitle(page);await forceRuntimeScan(session);await requestEmergencyCheckpoint(session);if(!headless)await page.bringToFront();scheduleCheckpoint(session,recordingHooks,350);}catch(error){pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'warn',message:errorMessage(error));scheduleCheckpoint(session,recordingHooks,350);}
  return{id,url:session.url,title:session.title,engine,profile,width,height,external:!headless};
}

export function getBrowserSession(id:string):BrowserSession|undefined{return sessionRegistry.get(id);}
export function browserSnapshot(id:string):string{const session=sessionRegistry.require(id);if(!session.snapshotHtml)throw new Error('Browser capture snapshot is not ready');return session.snapshotHtml;}
export function drainBrowserEvents(id:string):BrowserEvent[]{const session=sessionRegistry.require(id),events=session.events.splice(0,session.events.length);return events;}
export function listBrowserResources(id:string):BrowserResource[]{return[...sessionRegistry.require(id).resources.values()].sort((a,b)=>a.timestamp-b.timestamp||a.url.localeCompare(b.url));}
export function listBrowserSessionStates():BrowserSessionState[]{return sessionRegistry.values().filter(session=>!session.destroyed).map(stateOf);}
export async function browserState(id:string):Promise<BrowserSessionState>{return stateOf(sessionRegistry.require(id));}
export async function sendBrowserCommand(id:string,command:BrowserCommand):Promise<void>{const session=sessionRegistry.require(id);rememberSticky(session,command);await applyBrowserCommand(session,command);}
export async function hardStopBrowserSession(id:string,reason='control-hard-stop'):Promise<void>{const session=sessionRegistry.require(id);markStoppedImmediately(session,reason,recordingHooks);session.snapshotGeneration++;clearCheckpoint(session);if(!session.snapshotHtml)promoteEmergencyCheckpoint(session);if(session.snapshotHtml){session.snapshotStatus:'ready';session.snapshotError=undefined;}else{session.snapshotStatus='error';session.snapshotError='Hard stop used before a browser checkpoint was available';}void closeBrowserWindow(id,reason);}
export async function closeBrowserWindow(id:string,reason='browser-close-command'):Promise<void>{const session=sessionRegistry.require(id);if(session.browserClosed)return;if(session.recording)markStoppedImmediately(session,reason,recordingHooks);session.browserClosed=true;session.snapshotGeneration++;clearCheckpoint(session);if(!session.snapshotHtml)promoteEmergencyCheckpoint(session);if(session.snapshotHtml){session.snapshotStatus='ready';session.snapshotError=undefined;}else if(session.snapshotStatus!=='ready'){session.snapshotStatus='error';session.snapshotError='Browser closed before a capture checkpoint was available';}await closeBrowserResources(session.browser,session.context);}
export async function closeBrowserSession(id:string):Promise<void>{const session=sessionRegistry.remove(id);if(!session)return;clearEmergencyCheckpoint(id);session.destroyed=true;session.browserClosed=true;session.snapshotGeneration++;clearCheckpoint(session);await closeBrowserResources(session.browser,session.context);}
export async function closeAllBrowserSessions():Promise<void>{await Promise.all(sessionRegistry.ids().map(closeBrowserSession));}

function stateOf(session:BrowserSession):BrowserSessionState{return{id:session.id,url:session.url,title:session.title,width:session.width,height:session.height,engine:session.engine,profile:session.profile,external:!session.headless,recording:session.recording,closed:session.browserClosed,snapshotReady:!session.recording&&session.snapshotStatus==='ready'&&!!session.snapshotHtml,snapshotStatus:session.snapshotStatus,snapshotVersion:session.snapshotVersion,checkpointReady:!!session.snapshotHtml||hasValidEmergencyCheckpoint(session),...(session.snapshotError?{snapshotError:session.snapshotError}:{})};}
function rememberSticky(session:BrowserSession,command:BrowserCommand):void{const type=String(command.type||'');if(!stickyCommandTypes.has(type))return;const stored={...command};delete stored.requestId;delete stored.requestedAt;session.sticky.set(type,stored);}
function rememberBrowserResource(session:BrowserSession,input:{url:string;resourceType:string;method:string;transferSize?:number;decodedBodySize?:number;mimeType?:string;statusCode?:number;fromCache?:boolean}):void{
  const url=String(input.url||'');if(!url)return;const prior=session.resources.get(url),resourceType=String(input.resourceType||prior?.resourceType||'other');
  session.resources.set(url,{url,initiatorType:resourceType,resourceType,transferSize:Math.max(prior?.transferSize??0,input.transferSize??0),decodedBodySize:Math.max(prior?.decodedBodySize??0,input.decodedBodySize??0),mimeType:String(input.mimeType??prior?.mimeType??''),statusCode:Number(input.statusCode??prior?.statusCode??0)||0,method:String(input.method||prior?.method||'GET'),fromCache:Boolean(input.fromCache??prior?.fromCache??false),timestamp:prior?.timestamp??Date.now()});
}
function parseContentLength(value:string|undefined):number{const size=Number(value);return Number.isFinite(size)&&size>0?size:0;}
async function applyBrowserCommand(session:BrowserSession,command:BrowserCommand):Promise<void>{const type=String(command.type||''),message={...command};if(type==='SET_RECORDING'){setBrowserRecording(session,message,recordingHooks);return;}if(session.browserClosed)throw new Error('Browser window is closed');if(type==='SET_COLOR_SCHEME')await session.page.emulateMedia({colorScheme:message.mode==='dark'?'dark':message.mode==='light'?'light':null});const source=timelineCommands.has(type)?'animator-timeline':'animator-editor';await postToPage(session.page,{source,...message});}
function handleBrowserClosed(session:BrowserSession,reason:string):void{if(session.destroyed||session.browserClosed)return;session.browserClosed=true;session.snapshotGeneration++;clearCheckpoint(session);if(session.recording)markStoppedImmediately(session,reason,recordingHooks);if(!session.snapshotHtml)promoteEmergencyCheckpoint(session);if(session.snapshotHtml){session.snapshotStatus='ready';session.snapshotError=undefined;}else if(session.snapshotStatus!=='ready'){session.snapshotStatus='error';session.snapshotError='Browser closed before a current-page capture checkpoint was available';}pushDiagnostic(session,'info','Browser window closed; recording finalized automatically');}
async function reapplySticky(session:BrowserSession,version:number):Promise<void>{try{await session.page.waitForLoadState('domcontentloaded',{timeout:5000});}catch{}if(session.destroyed||session.browserClosed||version!==session.navigationVersion)return;for(const command of session.sticky.values()){if(String(command.type||'')==='SET_RECORDING')continue;try{await applyBrowserCommand(session,command);}catch{}}await forceRuntimeScan(session);await requestEmergencyCheckpoint(session);if(session.recording)void postToPage(session.page,{source:'animator-editor',type:'SET_RECORDING',enabled:true,requestedAt:Date.now()});}
async function requestEmergencyCheckpoint(session:BrowserSession):Promise<void>{if(session.destroyed||session.browserClosed||!session.recording)return;try{await postToPage(session.page,{source:'animator-editor',type:'CAPTURE_BROWSER_CHECKPOINT'});}catch{}}
async function forceRuntimeScan(session:BrowserSession):Promise<void>{if(session.destroyed||session.browserClosed)return;try{await session.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await postToPage(session.page,{source:'animator-editor',type:'RECALCULATE_VIEWPORT'});}catch{}}
async function postToPage(page:Page,message:Record<string,unknown>):Promise<void>{await page.evaluate(value=>window.postMessage(value,'*'),message);}
function pushEvent(session:BrowserSession,event:BrowserEvent):void{session.events.push(event);if(session.events.length>5000)session.events.splice(0,session.events.length-5000);}
function pushDiagnostic(session:BrowserSession,level:'info'|'warn'|'error',message:string):void{pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level,message});}
async function refreshSessionTitle(session:BrowserSession):Promise<void>{if(session.browserClosed||session.destroyed)return;try{session.url=session.page.url()||session.url;session.title=await safeTitle(session.page);}catch{}}
function deferRuntimeUntilDocumentRoot(source:string):string{return`(()=>{let booted=false;const boot=()=>{if(booted||!document.documentElement)return false;booted=true;${source};return true;};if(boot())return;const observer=new MutationObserver(()=>{if(boot()){observer.disconnect();}});observer.observe(document,{childList:true,subtree:true});addEventListener('DOMContentLoaded',()=>{boot();observer.disconnect();},{once:true});})();`;}
function parseUrl(input:string):URL{const raw=input.trim();if(!raw)throw new Error('Enter a web URL');const value=/^https?:\/\//i.test(raw)?raw:'https://'+raw,url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https URLs are supported');return url;}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:String(error);}
async function safeTitle(page:Page):Promise<string>{try{return await page.title();}catch{return'';}}
