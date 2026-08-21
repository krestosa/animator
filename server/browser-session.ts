import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { gateRuntimeSource } from './gate-runtime.js';
import { recordResumeRuntimeSource } from './record-resume-runtime.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';

type BrowserEvent=Record<string,unknown>;
type BrowserSession={id:string;browser:Browser;context:BrowserContext;page:Page;events:BrowserEvent[];width:number;height:number;closed:boolean};
const sessions=new Map<string,BrowserSession>();
const timelineCommands=new Set(['SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL','SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION','APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION','SET_MAGNIFY_ANIMATION']);

export async function openBrowserSession(input:string,width=1100,height=700):Promise<{id:string;url:string;title:string}>{
  const url=parseUrl(input),id='browser-'+randomUUID();
  const executablePath=findBrowserExecutable();
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:clamp(width,320,3840),height:clamp(height,240,2160)},ignoreHTTPSErrors:true});
  const page=await context.newPage();
  const session:BrowserSession={id,browser,context,page,events:[],width:clamp(width,320,3840),height:clamp(height,240,2160),closed:false};sessions.set(id,session);
  await page.exposeBinding('__animatorEmit',(_source,payload:unknown)=>{if(payload&&typeof payload==='object')pushEvent(session,payload as BrowserEvent);});
  const forwarder=`(()=>{if(window.__ANIMATOR_BROWSER_FORWARDER__)return;window.__ANIMATOR_BROWSER_FORWARDER__=true;addEventListener('message',event=>{const value=event.data;if(event.source===window&&value&&value.source==='animator-preview'&&typeof window.__animatorEmit==='function'){try{window.__animatorEmit(value);}catch{}}});})();`;
  await page.addInitScript({content:forwarder+gateRuntimeSource+runtimeSource+recordResumeRuntimeSource+seekRuntimeSource+mutationRuntimeSource+auxiliaryRuntimeSource});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'info',message:`Browser preview: ${frame.url()}`});});
  page.on('close',()=>{session.closed=true;});
  try{await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});}catch(error){pushEvent(session,{source:'animator-preview',type:'DIAGNOSTIC',level:'warn',message:error instanceof Error?error.message:String(error)});}
  return{id,url:page.url()||url.href,title:await safeTitle(page)};
}

export function getBrowserSession(id:string):BrowserSession|undefined{return sessions.get(id);}
export async function browserFrame(id:string):Promise<Buffer>{const session=requireSession(id);return Buffer.from(await session.page.screenshot({type:'jpeg',quality:78,animations:'allow'}));}
export function drainBrowserEvents(id:string):BrowserEvent[]{const session=requireSession(id),events=session.events.splice(0,session.events.length);return events;}
export async function browserState(id:string):Promise<{url:string;title:string;width:number;height:number}>{const session=requireSession(id);return{url:session.page.url(),title:await safeTitle(session.page),width:session.width,height:session.height};}
export async function sendBrowserMessage(id:string,message:Record<string,unknown>):Promise<void>{const session=requireSession(id);await session.page.evaluate(value=>window.postMessage(value,'*'),message);}
export async function sendBrowserCommand(id:string,command:Record<string,unknown>):Promise<void>{
  const session=requireSession(id),type=String(command.type||'');
  if(type==='SET_RECORDING'&&command.enabled===true)await session.page.evaluate(value=>window.postMessage(value,'*'),{source:'animator-timeline',type:'RELEASE_TIMELINE'});
  const source=timelineCommands.has(type)?'animator-timeline':'animator-editor';
  await session.page.evaluate(value=>window.postMessage(value,'*'),{source,...command});
}
export async function browserInput(id:string,input:Record<string,unknown>):Promise<void>{
  const session=requireSession(id),page=session.page,type=String(input.type||'');
  if(type==='move'){await page.mouse.move(number(input.x),number(input.y));return;}
  if(type==='down'){await page.mouse.move(number(input.x),number(input.y));await page.mouse.down({button:mouseButton(input.button)});return;}
  if(type==='up'){await page.mouse.move(number(input.x),number(input.y));await page.mouse.up({button:mouseButton(input.button)});return;}
  if(type==='wheel'){await page.mouse.wheel(number(input.dx),number(input.dy));return;}
  if(type==='keyDown'){const key=String(input.key||'');if(key)await page.keyboard.down(key);return;}
  if(type==='keyUp'){const key=String(input.key||'');if(key)await page.keyboard.up(key);return;}
  if(type==='text'){await page.keyboard.insertText(String(input.text||''));return;}
  if(type==='resize'){const width=clamp(number(input.width),320,3840),height=clamp(number(input.height),240,2160);session.width=width;session.height=height;await page.setViewportSize({width,height});return;}
}
export async function closeBrowserSession(id:string):Promise<void>{const session=sessions.get(id);if(!session)return;sessions.delete(id);session.closed=true;try{await session.context.close();}catch{}try{await session.browser.close();}catch{}}
export async function closeAllBrowserSessions():Promise<void>{await Promise.all([...sessions.keys()].map(closeBrowserSession));}

function pushEvent(session:BrowserSession,event:BrowserEvent):void{session.events.push(event);if(session.events.length>5000)session.events.splice(0,session.events.length-5000);}
function requireSession(id:string):BrowserSession{const session=sessions.get(id);if(!session||session.closed)throw new Error('Browser preview session not found');return session;}
function parseUrl(input:string):URL{const raw=input.trim();if(!raw)throw new Error('Enter a web URL');const value=/^https?:\/\//i.test(raw)?raw:'https://'+raw,url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https URLs are supported');return url;}
function number(value:unknown):number{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,Math.round(value||min)));}
function mouseButton(value:unknown):'left'|'middle'|'right'{return value===1?'middle':value===2?'right':'left';}
async function safeTitle(page:Page):Promise<string>{try{return await page.title();}catch{return'';}}
function findBrowserExecutable():string|undefined{
  const candidates:string[]=[];
  if(process.platform==='win32'){
    const pf=process.env.PROGRAMFILES||'C:\\Program Files',pf86=process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)',local=process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local');
    candidates.push(path.join(pf,'Microsoft','Edge','Application','msedge.exe'),path.join(pf86,'Microsoft','Edge','Application','msedge.exe'),path.join(pf,'Google','Chrome','Application','chrome.exe'),path.join(pf86,'Google','Chrome','Application','chrome.exe'),path.join(local,'Google','Chrome','Application','chrome.exe'));
  }else if(process.platform==='darwin')candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  else candidates.push('/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/microsoft-edge');
  for(const candidate of candidates)if(fs.existsSync(candidate))return candidate;
  try{const managed=chromium.executablePath();if(managed&&fs.existsSync(managed))return managed;}catch{}
  return undefined;
}
