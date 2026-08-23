import { fileURLToPath } from 'node:url';
import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron';
import { gateRuntimeSource } from '../server/gate-runtime.js';
import { runtimeSource } from '../server/runtime.js';
import { recordResumeRuntimeSource } from '../server/record-resume-runtime.js';
import { seekRuntimeSource } from '../server/seek-runtime.js';
import { mutationRuntimeSource } from '../server/mutation-runtime.js';
import { auxiliaryRuntimeSource } from '../server/aux-runtime.js';

type Viewport={x:number;y:number;width:number;height:number;zoomFactor:number};
type PageResource={url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number};
export interface BlinkPreviewHandle{
  open:(url:string)=>Promise<void>;
  close:()=>Promise<void>;
  setInstrumentation:(enabled:boolean)=>Promise<{enabled:boolean}>;
  resources:()=>Promise<PageResource[]>;
  cleanup:()=>Promise<void>;
}
const runtimeSources=[gateRuntimeSource,runtimeSource,recordResumeRuntimeSource,seekRuntimeSource,mutationRuntimeSource,auxiliaryRuntimeSource];

export function installBlinkPreview(window:BrowserWindow):BlinkPreviewHandle{
  let view:WebContentsView|null=null,parkedInstrumented:WebContentsView|null=null,currentUrl='',instrumentationEnabled=true,lastViewport:Viewport|undefined;
  const validSender=(senderId:number):boolean=>senderId===window.webContents.id;
  const targetSession=session.fromPartition('animator-blink',{cache:false});
  const networkResources=new Map<string,PageResource>();
  const networkFilter={urls:['<all_urls>']};

  const captureResource=(details:{url:string;resourceType?:string;method?:string;timestamp?:number;responseHeaders?:Record<string,string[]>;statusCode?:number;fromCache?:boolean}):void=>{
    const url=String(details.url||'');if(!url)return;
    const prior=networkResources.get(url),resourceType=String(details.resourceType||prior?.resourceType||'other'),headers=details.responseHeaders;
    const contentLength=headerNumber(headers,'content-length'),mimeType=headerValue(headers,'content-type').split(';')[0]?.trim()||prior?.mimeType||'';
    networkResources.set(url,{
      url,
      initiatorType:resourceType,
      resourceType,
      transferSize:Math.max(prior?.transferSize??0,contentLength),
      decodedBodySize:Math.max(prior?.decodedBodySize??0,contentLength),
      mimeType,
      statusCode:Number(details.statusCode??prior?.statusCode??0)||0,
      method:String(details.method||prior?.method||'GET'),
      fromCache:Boolean(details.fromCache??prior?.fromCache??false),
      timestamp:Number(details.timestamp??prior?.timestamp??Date.now())
    });
  };
  targetSession.webRequest.onSendHeaders(networkFilter,details=>captureResource(details));
  targetSession.webRequest.onResponseStarted(networkFilter,details=>captureResource(details));
  targetSession.webRequest.onCompleted(networkFilter,details=>captureResource(details));

  const detachTarget=(target:WebContentsView):void=>{
    try{window.contentView.removeChildView(target);}catch{}
    try{if(target.webContents.debugger.isAttached())target.webContents.debugger.detach();}catch{}
  };
  const destroyTarget=async(target:WebContentsView|null):Promise<void>=>{
    if(!target)return;detachTarget(target);
    const contents=target.webContents;if(contents.isDestroyed())return;
    await new Promise<void>(resolve=>{
      let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};
      const timer=setTimeout(finish,500);
      contents.once('destroyed',finish);
      contents.close();
    });
  };
  const disposeViews=async():Promise<void>=>{
    const active=view,parked=parkedInstrumented;view=null;parkedInstrumented=null;
    await destroyTarget(active);if(parked&&parked!==active)await destroyTarget(parked);
  };
  const setGeometry=(target:WebContentsView,value:Viewport):void=>{
    const x=Math.max(0,Math.round(value.x)),y=Math.max(0,Math.round(value.y)),width=Math.max(1,Math.round(value.width)),height=Math.max(1,Math.round(value.height)),zoom=Number.isFinite(value.zoomFactor)?Math.max(.05,value.zoomFactor):1;
    target.setBounds({x,y,width,height});target.webContents.setZoomFactor(zoom);
  };
  const showTarget=(target:WebContentsView):void=>{if(lastViewport)setGeometry(target,lastViewport);target.setVisible(true);window.contentView.addChildView(target);};
  const cdp=async(target:WebContentsView,method:string,params?:Record<string,unknown>):Promise<void>=>{
    await bounded(`CDP ${method}`,target.webContents.debugger.sendCommand(method,params),5000);
  };
  const createView=async(instrumented:boolean):Promise<WebContentsView>=>{
    const preload=fileURLToPath(new URL('./target-preload.js',import.meta.url));
    const next=new WebContentsView({webPreferences:{...(instrumented?{preload}:{}),session:targetSession,nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,backgroundThrottling:false}});
    next.setBackgroundColor('#ffffff');next.setVisible(false);window.contentView.addChildView(next);
    next.webContents.setWindowOpenHandler(({url})=>{startReload(next,url);return{action:'deny'};});
    next.webContents.on('did-navigate',(_event,url)=>{if(/^https?:\/\//i.test(url))currentUrl=url;});
    if(lastViewport)setGeometry(next,lastViewport);
    if(instrumented){
      try{
        await bounded('Blink instrumentation target init',next.webContents.loadURL('about:blank'),5000);
        next.webContents.debugger.attach('1.3');
        await cdp(next,'Page.enable');
        for(const source of runtimeSources)await cdp(next,'Page.addScriptToEvaluateOnNewDocument',{source});
      }catch(error){
        console.warn('Blink instrumentation CDP attach failed',error);
        await destroyTarget(next);
        throw error;
      }
    }
    return next;
  };
  const ensureView=async():Promise<WebContentsView>=>{
    if(view)return view;
    view=await createView(instrumentationEnabled);return view;
  };
  const startReload=(target:WebContentsView,url:string):void=>{
    if(!url||target.webContents.isDestroyed())return;
    void target.webContents.loadURL(url).catch(error=>{
      if(!target.webContents.isDestroyed())console.warn('Blink reload failed',error);
    });
  };

  const open=async(url:string):Promise<void>=>{
    if(!/^https?:\/\//i.test(url))throw new Error('Blink preview only accepts http(s) URLs');
    const target=await ensureView();showTarget(target);
    if(currentUrl===url)return;
    networkResources.clear();currentUrl=url;await target.webContents.loadURL(url);
  };
  const close=async():Promise<void>=>{currentUrl='';networkResources.clear();if(view)view.setVisible(false);};
  const setInstrumentation=async(enabled:boolean):Promise<{enabled:boolean}>=>{
    const nextEnabled=Boolean(enabled);
    if(nextEnabled===instrumentationEnabled)return{enabled:instrumentationEnabled};
    const liveUrl=view&&!view.webContents.isDestroyed()?view.webContents.getURL():'';
    const url=/^https?:\/\//i.test(liveUrl)?liveUrl:currentUrl;currentUrl=url;

    if(!nextEnabled){
      const instrumented=view;
      try{
        const clean=await createView(false);
        if(instrumented){instrumented.setVisible(false);parkedInstrumented=instrumented;instrumented.webContents.stop();startReload(instrumented,'about:blank');}
        view=clean;instrumentationEnabled=false;showTarget(clean);startReload(clean,url);
        return{enabled:false};
      }catch(error){if(instrumented)showTarget(instrumented);throw error;}
    }

    const clean=view,prepared=parkedInstrumented;parkedInstrumented=null;
    if(clean)clean.setVisible(false);
    let instrumented=prepared;
    try{
      if(!instrumented||instrumented.webContents.isDestroyed())instrumented=await createView(true);
      view=instrumented;instrumentationEnabled=true;showTarget(instrumented);startReload(instrumented,url);
      if(clean&&clean!==instrumented)await destroyTarget(clean);
      return{enabled:true};
    }catch(error){
      if(clean&&!clean.webContents.isDestroyed()){view=clean;instrumentationEnabled=false;showTarget(clean);}
      if(instrumented&&instrumented!==prepared)await destroyTarget(instrumented);
      parkedInstrumented=prepared&&!prepared.webContents.isDestroyed()?prepared:null;
      throw error;
    }
  };
  const resources=async():Promise<PageResource[]>=>[...networkResources.values()].sort((a,b)=>a.timestamp-b.timestamp||a.url.localeCompare(b.url));
  const viewport=(value:Viewport):void=>{lastViewport=value;if(view){setGeometry(view,value);view.setVisible(true);window.contentView.addChildView(view);}};
  const command=(value:unknown):void=>{if(instrumentationEnabled&&view&&!view.webContents.isDestroyed())view.webContents.send('animator:blink:command',value);};
  const pageMessage=(event:Electron.IpcMainEvent,value:unknown):void=>{if(!instrumentationEnabled||!view||event.sender.id!==view.webContents.id||window.isDestroyed())return;window.webContents.send('animator:blink:message',value);};

  ipcMain.handle('animator:blink:open',(event,payload:{url?:unknown})=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return open(String(payload?.url??''));});
  ipcMain.handle('animator:blink:close',event=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return close();});
  ipcMain.handle('animator:blink:instrumentation',(event,payload:{enabled?:unknown})=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return setInstrumentation(Boolean(payload?.enabled));});
  ipcMain.handle('animator:blink:resources',event=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return resources();});
  const viewportHandler=(event:Electron.IpcMainEvent,value:Viewport)=>{if(validSender(event.sender.id))viewport(value);};
  const commandHandler=(event:Electron.IpcMainEvent,value:unknown)=>{if(validSender(event.sender.id))command(value);};
  ipcMain.on('animator:blink:viewport',viewportHandler);ipcMain.on('animator:blink:command',commandHandler);ipcMain.on('animator:blink:page-message',pageMessage);

  const cleanup=async():Promise<void>=>{
    ipcMain.removeHandler('animator:blink:open');ipcMain.removeHandler('animator:blink:close');ipcMain.removeHandler('animator:blink:instrumentation');ipcMain.removeHandler('animator:blink:resources');ipcMain.off('animator:blink:viewport',viewportHandler);ipcMain.off('animator:blink:command',commandHandler);ipcMain.off('animator:blink:page-message',pageMessage);
    targetSession.webRequest.onSendHeaders(null);targetSession.webRequest.onResponseStarted(null);targetSession.webRequest.onCompleted(null);
    networkResources.clear();await disposeViews();
  };
  return{open,close,setInstrumentation,resources,cleanup};
}

function headerValue(headers:Record<string,string[]>|undefined,name:string):string{
  if(!headers)return'';const key=Object.keys(headers).find(value=>value.toLowerCase()===name);return key?String(headers[key]?.[0]??''):'';
}
function headerNumber(headers:Record<string,string[]>|undefined,name:string):number{const value=Number(headerValue(headers,name));return Number.isFinite(value)&&value>0?value:0;}
async function bounded<T>(label:string,promise:Promise<T>,timeoutMs:number):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeoutMs}ms`)),timeoutMs);});
  try{return await Promise.race([promise,timeout]);}finally{if(timer)clearTimeout(timer);}
}
