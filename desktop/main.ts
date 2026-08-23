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

  const window=new BrowserWindow({
    width:1440,
    height:900,
    minWidth:960,
    minHeight:640,
    show:false,
    autoHideMenuBar:true,
    backgroundColor:'#101010',
    webPreferences:{
      preload,
      session:uiSession,
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      spellcheck:false,
      backgroundThrottling:true
    }
  });
  mainWindow=window;
  blinkHandle=installBlinkPreview(window);

  window.webContents.setWindowOpenHandler(({url})=>{
    if(/^https?:\/\//i.test(url))void shell.openExternal(url);
    return{action:'deny'};
  });
  window.webContents.on('will-navigate',(event,url)=>{
    if(!server||url.startsWith(server.origin))return;
    event.preventDefault();
    if(/^https?:\/\//i.test(url))void shell.openExternal(url);
  });
  window.once('ready-to-show',()=>window.show());
  window.on('closed',()=>{if(mainWindow===window)mainWindow=null;});
  await window.loadURL(server.origin);
  await runDiagnosticMode(window);
}

async function runDiagnosticMode(window:BrowserWindow):Promise<void>{
  const smoke=process.argv.includes('--smoke-test'),nativeSmoke=process.argv.includes('--native-smoke-test'),metrics=process.argv.includes('--metrics');
  if(!smoke&&!nativeSmoke&&!metrics)return;
  const mounted=await window.webContents.executeJavaScript("Boolean(document.querySelector('.app'))",true) as boolean;
  if(!mounted)throw new Error('Electron smoke test: Animator UI did not mount');
  if(smoke){
    const shellState=await window.webContents.executeJavaScript(`(()=>{
      const app=document.querySelector('.app'),tabs=document.querySelector('.workspaceTabs'),toggle=document.querySelector('[data-timeline-toggle]'),timeline=document.querySelector('.timeline'),stage=document.querySelector('.stage'),device=document.querySelector('[data-device]');
      if(!(app instanceof HTMLElement)||!(tabs instanceof HTMLElement)||!(toggle instanceof HTMLButtonElement)||!(timeline instanceof HTMLElement)||!(stage instanceof HTMLElement)||!(device instanceof HTMLElement))return{ok:false,reason:'workspace controls missing'};
      const initialHidden=timeline.getAttribute('aria-hidden')==='true'&&!app.classList.contains('timeline-open');
      const stageBefore=stage.getBoundingClientRect().height,deviceBefore=device.getBoundingClientRect().height;
      toggle.click();
      const open=app.classList.contains('timeline-open')&&timeline.getAttribute('aria-hidden')==='false'&&getComputedStyle(timeline).position==='absolute';
      const stageAfter=stage.getBoundingClientRect().height,deviceAfter=device.getBoundingClientRect().height;
      toggle.click();
      const closed=!app.classList.contains('timeline-open')&&timeline.getAttribute('aria-hidden')==='true';
      return{ok:initialHidden&&open&&closed&&Math.abs(stageBefore-stageAfter)<.01&&Math.abs(deviceBefore-deviceAfter)<.01,initialHidden,open,closed,stageBefore,stageAfter,deviceBefore,deviceAfter};
    })()`,true) as{ok:boolean;reason?:string;[key:string]:unknown};
    if(!shellState.ok)throw new Error(`Electron smoke test: workspace shell invariant failed ${JSON.stringify(shellState)}`);
    console.log('Electron smoke test: UI mounted; tabs and overlay timeline verified');
  }
  if(nativeSmoke){
    if(!server||!blinkHandle)throw new Error('Native Blink smoke test: runtime unavailable');
    const target=`${server.origin}/api/health`;
    await blinkHandle.open(target);
    const clean=await blinkHandle.setInstrumentation(false);
    if(clean.enabled!==false)throw new Error(`Native Blink smoke test: clean mode did not activate ${JSON.stringify(clean)}`);
    const instrumented=await blinkHandle.setInstrumentation(true);
    if(instrumented.enabled!==true)throw new Error(`Native Blink smoke test: instrumentation did not reactivate ${JSON.stringify(instrumented)}`);
    console.log('Native Blink smoke test: native view, clean reload and instrumented reload verified');
    await blinkHandle.close();
  }
  if(metrics){
    await new Promise(resolve=>setTimeout(resolve,750));
    const processes=app.getAppMetrics().map(metric=>({pid:metric.pid,type:metric.type,name:metric.name??metric.serviceName??'',workingSetMb:roundMb(metric.memory.workingSetSize),cpuPercent:Number(metric.cpu.percentCPUUsage.toFixed(2))}));
    const workingSetMb=Number(processes.reduce((sum,item)=>sum+item.workingSetMb,0).toFixed(1));
    console.log(JSON.stringify({workingSetMb,processes},null,2));
  }
  await shutdown();
  window.destroy();
  app.exit(0);
}

function roundMb(kb:number):number{return Number((kb/1024).toFixed(1));}

async function shutdown():Promise<void>{
  if(quitting)return;
  quitting=true;
  const activeBlink=blinkHandle;blinkHandle=null;
  if(activeBlink)await activeBlink.cleanup().catch(()=>{});
  const active=server;
  server=null;
  if(active)await active.close().catch(()=>{});
}

if(singleInstance){
  app.whenReady().then(()=>createMainWindow()).catch(error=>{
    console.error(error);
    app.exit(1);
  });

  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{
    if(quitting)return;
    event.preventDefault();
    void shutdown().finally(()=>app.quit());
  });
}
