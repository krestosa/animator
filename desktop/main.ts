import '../server/ssd-safety.js';
import { app, BrowserWindow, shell } from 'electron';
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

  const window=new BrowserWindow({
    width:1440,
    height:900,
    minWidth:960,
    minHeight:640,
    show:false,
    autoHideMenuBar:true,
    backgroundColor:'#101010',
    webPreferences:{
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
}

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
