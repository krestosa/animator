import '../server/ssd-safety.js';
import { app, BrowserWindow, session, shell } from 'electron';
import { startAnimatorServer, type AnimatorServerHandle } from '../server/index.js';

let mainWindow:BrowserWindow|null=null;
let server:AnimatorServerHandle|null=null;
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

  const window=new BrowserWindow({
    width:1440,
    height:900,
    minWidth:960,
    minHeight:640,
    show:false,
    autoHideMenuBar:true,
    backgroundColor:'#101010',
    webPreferences:{
      session:uiSession,
      nodeIntegration:false,
      contextIsolation:true,
      sandbox:true,
      spellcheck:false,
      backgroundThrottling:true
    }
  });
  mainWindow=window;

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
  const smoke=process.argv.includes('--smoke-test'),metrics=process.argv.includes('--metrics');
  if(!smoke&&!metrics)return;
  const mounted=await window.webContents.executeJavaScript("Boolean(document.querySelector('.app'))",true) as boolean;
  if(!mounted)throw new Error('Electron smoke test: Animator UI did not mount');
  if(smoke)console.log('Electron smoke test: UI mounted');
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
