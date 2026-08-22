import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { Browser, BrowserType } from 'playwright';
import type { BrowserEngine, BrowserRuntimeStatus } from './types.js';

export const browserEngines:BrowserEngine[]=['chromium','firefox','webkit'];
export const browserLabels:Record<BrowserEngine,string>={chromium:'Chromium',firefox:'Firefox',webkit:'Safari / WebKit'};
const animatorRoot=findAnimatorRoot();
export const localBrowserDir=path.join(animatorRoot,'.animator-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH=localBrowserDir;
let playwrightPromise:Promise<typeof import('playwright')>|undefined;
let browserInstallPromise:Promise<void>|undefined;

export async function listBrowserRuntimes():Promise<BrowserRuntimeStatus[]>{const playwright=await getPlaywright();return browserEngines.map(engine=>({engine,label:browserLabels[engine],installed:isBrowserInstalled(browserType(playwright,engine))}));}
export async function installBrowserRuntimes(values:unknown):Promise<BrowserRuntimeStatus[]>{const requested=Array.isArray(values)?values.map(parseEngine):browserEngines,engines=[...new Set(requested)];await withInstallLock(engines);return listBrowserRuntimes();}
export async function ensureBrowserRuntime(engine:BrowserEngine):Promise<void>{const playwright=await getPlaywright();if(isBrowserInstalled(browserType(playwright,engine)))return;await withInstallLock([engine]);if(!isBrowserInstalled(browserType(await getPlaywright(),engine)))throw new Error(`${browserLabels[engine]} runtime was not installed in ${localBrowserDir}.`);}
export async function getPlaywright():Promise<typeof import('playwright')>{return playwrightPromise??=import('playwright');}
export function browserType(playwright:typeof import('playwright'),engine:BrowserEngine):BrowserType<Browser>{return engine==='firefox'?playwright.firefox:engine==='webkit'?playwright.webkit:playwright.chromium;}
export function parseEngine(value:unknown):BrowserEngine{return value==='firefox'?'firefox':value==='webkit'?'webkit':'chromium';}
export function parseProfile(value:unknown):'desktop'|'mobile'{return value==='mobile'?'mobile':'desktop';}
export function mobileUserAgent(engine:BrowserEngine):string{if(engine==='firefox')return'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0';if(engine==='webkit')return'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';return'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';}
export function shouldRunHeadless():boolean{return process.env.ANIMATOR_BROWSER_HEADLESS==='1'||process.env.CI==='true';}

function isBrowserInstalled(type:BrowserType<Browser>):boolean{try{return fs.existsSync(type.executablePath());}catch{return false;}}
async function withInstallLock(engines:BrowserEngine[]):Promise<void>{if(browserInstallPromise)await browserInstallPromise;const playwright=await getPlaywright(),missing=engines.filter(engine=>!isBrowserInstalled(browserType(playwright,engine)));if(!missing.length)return;browserInstallPromise=installLocalBrowsers(missing).finally(()=>{browserInstallPromise=undefined;});await browserInstallPromise;}
async function installLocalBrowsers(engines:BrowserEngine[]):Promise<void>{fs.mkdirSync(localBrowserDir,{recursive:true});const cli=path.join(animatorRoot,'node_modules','playwright','cli.js');if(!fs.existsSync(cli))throw new Error('Animator Browser requires installed npm dependencies. Run npm install in the Animator project once.');await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,[cli,'install',...engines],{cwd:animatorRoot,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:localBrowserDir},windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';const append=(chunk:Buffer|string)=>{output=(output+String(chunk)).slice(-7000);};child.stdout?.on('data',append);child.stderr?.on('data',append);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Could not install ${engines.map(engine=>browserLabels[engine]).join(', ')} in ${localBrowserDir}.${output.trim()?`\n${output.trim()}`:''}`)));});}
function findAnimatorRoot():string{let current=path.dirname(fileURLToPath(import.meta.url));for(let depth=0;depth<7;depth++){const packagePath=path.join(current,'package.json');if(fs.existsSync(packagePath)){try{const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as {name?:string};if(pkg.name==='animator')return current;}catch{}}const parent=path.dirname(current);if(parent===current)break;current=parent;}return process.cwd();}
