import '../server/ssd-safety.js';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session, shell } from 'electron';
import { startAnimatorServer, type AnimatorServerHandle } from '../server/index.js';
import { installBlinkPreview, type BlinkPreviewHandle } from './blink-preview.js';

let mainWindow:BrowserWindow|null=null;
let server:AnimatorServerHandle|null=null;
let blinkHandle:BlinkPreviewHandle|null=null;
let quitting=false;

app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-sync');

const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance)app.quit();
else{
  app.on('second-instance',()=>{
    if(!mainWindow)return;
    if(mainWindow.isMinimized())mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

async function createMainWindow():Promise<void>{
  if(mainWindow)return;
  const production=app.isPackaged||process.argv.includes('--production');
  server=await startAnimatorServer({host:'127.0.0.1',port:0,production});
  const uiSession=session.fromPartition('animator-ui',{cache:false});
  const preload=fileURLToPath(new URL('./preload.js',import.meta.url));
  const window=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,show:false,autoHideMenuBar:true,backgroundColor:'#101010',webPreferences:{preload,session:uiSession,nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,backgroundThrottling:true}});
  mainWindow=window;blinkHandle=installBlinkPreview(window);
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//i.test(url))void shell.openExternal(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!server||url.startsWith(server.origin))return;event.preventDefault();if(/^https?:\/\//i.test(url))void shell.openExternal(url);});
  window.once('ready-to-show',()=>window.show());window.on('closed',()=>{if(mainWindow===window)mainWindow=null;});
  await window.loadURL(server.origin);await runDiagnosticMode(window);
}

async function runDiagnosticMode(window:BrowserWindow):Promise<void>{
  const smoke=process.argv.includes('--smoke-test'),nativeSmoke=process.argv.includes('--native-smoke-test'),googleAssets=process.argv.includes('--google-assets-test'),metrics=process.argv.includes('--metrics');
  if(!smoke&&!nativeSmoke&&!googleAssets&&!metrics)return;
  const mounted=await window.webContents.executeJavaScript("Boolean(document.querySelector('.app'))",true) as boolean;if(!mounted)throw new Error('Electron smoke test: Animator UI did not mount');
  if(smoke){
    const shellState=await window.webContents.executeJavaScript(`(()=>{const app=document.querySelector('.app'),tabs=document.querySelector('.workspaceTabs'),toggle=document.querySelector('[data-timeline-toggle]'),timeline=document.querySelector('.timeline'),stage=document.querySelector('.stage'),device=document.querySelector('[data-device]');if(!(app instanceof HTMLElement)||!(tabs instanceof HTMLElement)||!(toggle instanceof HTMLButtonElement)||!(timeline instanceof HTMLElement)||!(stage instanceof HTMLElement)||!(device instanceof HTMLElement))return{ok:false,reason:'workspace controls missing'};const initialHidden=timeline.getAttribute('aria-hidden')==='true'&&!app.classList.contains('timeline-open');const stageBefore=stage.getBoundingClientRect().height,deviceBefore=device.getBoundingClientRect().height;toggle.click();const open=app.classList.contains('timeline-open')&&timeline.getAttribute('aria-hidden')==='false'&&getComputedStyle(timeline).position==='absolute';const stageAfter=stage.getBoundingClientRect().height,deviceAfter=device.getBoundingClientRect().height;toggle.click();const closed=!app.classList.contains('timeline-open')&&timeline.getAttribute('aria-hidden')==='true';return{ok:initialHidden&&open&&closed&&Math.abs(stageBefore-stageAfter)<.01&&Math.abs(deviceBefore-deviceAfter)<.01,initialHidden,open,closed,stageBefore,stageAfter,deviceBefore,deviceAfter};})()`,true) as{ok:boolean;reason?:string;[key:string]:unknown};
    if(!shellState.ok)throw new Error(`Electron smoke test: workspace shell invariant failed ${JSON.stringify(shellState)}`);console.log('Electron smoke test: UI mounted; tabs and overlay timeline verified');
  }
  if(nativeSmoke){
    if(!server||!blinkHandle)throw new Error('Native Blink smoke test: runtime unavailable');const target=`${server.origin}/api/health`;console.log('Native Blink smoke test: opening instrumented view');await bounded('native Blink open',blinkHandle.open(target),10000);const loadedResources=await bounded('native Blink resources',blinkHandle.resources(),3000);const documentResource=loadedResources.find(resource=>resource.url===target);if(!documentResource)throw new Error(`Native Blink smoke test: Assets capture missed document ${target}`);if(!['mainFrame','document'].includes(documentResource.resourceType))throw new Error(`Native Blink smoke test: unexpected document resource type ${documentResource.resourceType}`);console.log(`Native Blink smoke test: Assets captured ${loadedResources.length} loaded resource(s)`);console.log('Native Blink smoke test: entering clean mode');const clean=await bounded('native Blink clean mode',blinkHandle.setInstrumentation(false),5000);if(clean.enabled!==false)throw new Error(`Native Blink smoke test: clean mode did not activate ${JSON.stringify(clean)}`);await new Promise(resolve=>setTimeout(resolve,250));console.log('Native Blink smoke test: restoring instrumentation');const instrumented=await bounded('native Blink instrumentation restore',blinkHandle.setInstrumentation(true),5000);if(instrumented.enabled!==true)throw new Error(`Native Blink smoke test: instrumentation did not reactivate ${JSON.stringify(instrumented)}`);console.log('Native Blink smoke test: native view, assets capture, clean reload and instrumented reload verified');await bounded('native Blink close',blinkHandle.close(),3000);
  }
  if(googleAssets){
    if(!blinkHandle)throw new Error('Google assets test: Blink runtime unavailable');const target='https://www.google.com/';
    const bridgeState=await window.webContents.executeJavaScript(`(()=>({bridge:Boolean(window.animatorDesktop?.blink),nativeOption:Boolean(document.querySelector('[data-blink-instrumentation-option]')),webOpen:Boolean(document.querySelector('[data-web-open]')),assetsRegion:Boolean(document.querySelector('[data-assets-region]'))}))()`,true) as{bridge:boolean;nativeOption:boolean;webOpen:boolean;assetsRegion:boolean};
    console.log(`Google assets bridge state: ${JSON.stringify(bridgeState)}`);if(!bridgeState.bridge)throw new Error('Google assets UI test: desktop bridge unavailable');if(!bridgeState.nativeOption)throw new Error('Google assets UI test: native web controls were not mounted');
    const bridgeRoundTrip=await window.webContents.executeJavaScript(`(async()=>{await window.animatorDesktop.blink.close();await window.animatorDesktop.blink.open(${JSON.stringify(target)});return true})()`,true) as boolean;if(!bridgeRoundTrip)throw new Error('Google assets UI test: renderer bridge round-trip failed');await new Promise(resolve=>setTimeout(resolve,1200));
    const directResources=await bounded('Google direct bridge inventory',blinkHandle.resources(),5000);console.log(`Google direct bridge inventory: ${directResources.length} ${JSON.stringify(directResources.slice(0,12).map(resource=>({type:resource.resourceType,url:resource.url})))}`);if(!directResources.some(resource=>resource.url.startsWith('https://www.google.')))throw new Error('Google assets UI test: direct renderer bridge did not navigate Google');
    await window.webContents.executeJavaScript(`window.animatorDesktop.blink.close()`,true);
    console.log(`Google assets UI test: opening ${target} through the real web dropdown`);
    const opened=await window.webContents.executeJavaScript(`(()=>{const details=document.querySelector('.webLoader'),input=document.querySelector('[data-web-url]'),button=document.querySelector('[data-web-open]');if(!(details instanceof HTMLDetailsElement)||!(input instanceof HTMLInputElement)||!(button instanceof HTMLButtonElement))return false;details.open=true;input.value=${JSON.stringify(target)};input.dispatchEvent(new Event('input',{bubbles:true}));button.click();return true;})()`,true) as boolean;if(!opened)throw new Error('Google assets UI test: web dropdown controls unavailable');
    const projectReady=await pollRenderer<boolean>(window,`(()=>{const tab=document.querySelector('.workspaceTab.active');return Boolean(tab&&/google/i.test(tab.textContent||''));})()`,15000,false);if(!projectReady)throw new Error('Google assets UI test: Google project tab did not become active');await new Promise(resolve=>setTimeout(resolve,1800));
    const assetsTab=await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('[data-left-panel-tab]')].find(node=>node.getAttribute('aria-label')==='Assets');if(!(button instanceof HTMLButtonElement))return false;button.click();return true;})()`,true) as boolean;if(!assetsTab)throw new Error('Google assets UI test: Assets rail button unavailable');
    const assetCount=await pollRenderer<number>(window,`Number(document.querySelector('[data-assets-count]')?.textContent||'0')`,10000,0,value=>value>0);const panel=await window.webContents.executeJavaScript(`(()=>({count:Number(document.querySelector('[data-assets-count]')?.textContent||'0'),status:document.querySelector('[data-assets-status]')?.textContent||'',rows:[...document.querySelectorAll('.assetCardText')].slice(0,20).map(node=>node.textContent?.trim()||''),diagnostic:document.querySelector('[data-diagnostic]')?.textContent||''}))()`,true) as{count:number;status:string;rows:string[];diagnostic:string};const resources=await bounded('Google asset inventory',blinkHandle.resources(),5000);const counts:Record<string,number>={};for(const resource of resources)counts[resource.resourceType]=(counts[resource.resourceType]??0)+1;console.log(`Google assets UI test: panel=${JSON.stringify(panel)} inventory=${resources.length} types=${JSON.stringify(counts)}`);console.log(`Google assets samples: ${JSON.stringify(resources.slice(0,25).map(resource=>({type:resource.resourceType,mime:resource.mimeType,url:resource.url})))}`);if(assetCount<=0||panel.count<=0)throw new Error(`Google assets UI test: Assets panel remained empty (${panel.count})`);if(resources.length<2)throw new Error(`Google assets UI test: expected multiple loaded assets, got ${resources.length}`);if(!resources.some(resource=>!['mainFrame','document'].includes(resource.resourceType)))throw new Error('Google assets UI test: no non-document asset references captured');await bounded('Google Blink close',blinkHandle.close(),3000);
  }
  if(metrics){await new Promise(resolve=>setTimeout(resolve,750));const processes=app.getAppMetrics().map(metric=>({pid:metric.pid,type:metric.type,name:metric.name??metric.serviceName??'',workingSetMb:roundMb(metric.memory.workingSetSize),cpuPercent:Number(metric.cpu.percentCPUUsage.toFixed(2))}));const workingSetMb=Number(processes.reduce((sum,item)=>sum+item.workingSetMb,0).toFixed(1));console.log(JSON.stringify({workingSetMb,processes},null,2));}
  await bounded('Electron shutdown',shutdown(),5000);window.destroy();app.exit(0);
}

async function pollRenderer<T>(window:BrowserWindow,expression:string,timeoutMs:number,fallback:T,accept?:(value:T)=>boolean):Promise<T>{const started=Date.now();let last=fallback;while(Date.now()-started<timeoutMs){try{last=await window.webContents.executeJavaScript(expression,true) as T;if(accept?accept(last):Boolean(last))return last;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}return last;}
function roundMb(kb:number):number{return Number((kb/1024).toFixed(1));}
async function bounded<T>(label:string,promise:Promise<T>,timeoutMs:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeoutMs}ms`)),timeoutMs);});try{return await Promise.race([promise,timeout]);}finally{if(timer)clearTimeout(timer);}}
async function shutdown():Promise<void>{if(quitting)return;quitting=true;const activeBlink=blinkHandle;blinkHandle=null;if(activeBlink)await activeBlink.cleanup().catch(()=>{});const active=server;server=null;if(active)await active.close().catch(()=>{});}
if(singleInstance){app.whenReady().then(()=>createMainWindow()).catch(error=>{console.error(error);app.exit(1);});app.on('window-all-closed',()=>app.quit());app.on('before-quit',event=>{if(quitting)return;event.preventDefault();void shutdown().finally(()=>app.quit());});}
