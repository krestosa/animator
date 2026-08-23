import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, WebContentsView, ipcMain, session } from 'electron';
import { gateRuntimeSource } from '../server/gate-runtime.js';
import { runtimeSource } from '../server/runtime.js';
import { recordResumeRuntimeSource } from '../server/record-resume-runtime.js';
import { seekRuntimeSource } from '../server/seek-runtime.js';
import { mutationRuntimeSource } from '../server/mutation-runtime.js';
import { auxiliaryRuntimeSource } from '../server/aux-runtime.js';

type Viewport={x:number;y:number;width:number;height:number;zoomFactor:number};
type PageResource={url:string;initiatorType:string;transferSize:number;decodedBodySize:number};
const runtimeSources=[gateRuntimeSource,runtimeSource,recordResumeRuntimeSource,seekRuntimeSource,mutationRuntimeSource,auxiliaryRuntimeSource];

export function installBlinkPreview(window:BrowserWindow):()=>Promise<void>{
  let view:WebContentsView|null=null,currentUrl='';
  const validSender=(senderId:number):boolean=>senderId===window.webContents.id;

  const ensureView=async():Promise<WebContentsView>=>{
    if(view)return view;
    const preload=fileURLToPath(new URL('./target-preload.js',import.meta.url));
    const targetSession=session.fromPartition('animator-blink',{cache:false});
    const next=new WebContentsView({webPreferences:{preload,session:targetSession,nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,backgroundThrottling:false}});
    next.setBackgroundColor('#ffffff');next.setVisible(false);window.contentView.addChildView(next);view=next;
    next.webContents.setWindowOpenHandler(({url})=>{void next.webContents.loadURL(url);return{action:'deny'};});
    try{
      next.webContents.debugger.attach('1.3');
      await next.webContents.debugger.sendCommand('Page.enable');
      for(const source of runtimeSources)await next.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source});
    }catch(error){console.warn('Blink instrumentation CDP attach failed',error);}
    return next;
  };

  const open=async(url:string):Promise<void>=>{
    if(!/^https?:\/\//i.test(url))throw new Error('Blink preview only accepts http(s) URLs');
    const target=await ensureView();target.setVisible(true);window.contentView.addChildView(target);
    if(currentUrl===url)return;currentUrl=url;await target.webContents.loadURL(url);
  };
  const close=async():Promise<void>=>{currentUrl='';if(view)view.setVisible(false);};
  const resources=async():Promise<PageResource[]>=>{
    if(!view||view.webContents.isDestroyed()||!currentUrl)return[];
    return view.webContents.executeJavaScript(`(()=>{const found=new Map();const add=(raw,type='other',transfer=0,decoded=0)=>{if(!raw)return;try{const url=new URL(String(raw),document.baseURI).href;if(!/^https?:/.test(url))return;const prior=found.get(url);found.set(url,{url,initiatorType:prior?.initiatorType||type,transferSize:Math.max(prior?.transferSize||0,Number(transfer)||0),decodedBodySize:Math.max(prior?.decodedBodySize||0,Number(decoded)||0)});}catch{}};add(location.href,'document');for(const entry of performance.getEntriesByType('resource'))add(entry.name,entry.initiatorType,entry.transferSize,entry.decodedBodySize);for(const node of document.querySelectorAll('[src],[href],[poster],[data-src]'))for(const attr of ['src','href','poster','data-src'])add(node.getAttribute(attr),node.tagName.toLowerCase());for(const node of document.querySelectorAll('[srcset]'))for(const candidate of String(node.getAttribute('srcset')||'').split(','))add(candidate.trim().split(/\\s+/)[0],node.tagName.toLowerCase());return [...found.values()];})()`,true) as Promise<PageResource[]>;
  };
  const viewport=(value:Viewport):void=>{
    if(!view)return;const x=Math.max(0,Math.round(value.x)),y=Math.max(0,Math.round(value.y)),width=Math.max(1,Math.round(value.width)),height=Math.max(1,Math.round(value.height)),zoom=Number.isFinite(value.zoomFactor)?Math.max(.05,value.zoomFactor):1;
    view.setBounds({x,y,width,height});view.webContents.setZoomFactor(zoom);view.setVisible(true);window.contentView.addChildView(view);
  };
  const command=(value:unknown):void=>{if(view&&!view.webContents.isDestroyed())view.webContents.send('animator:blink:command',value);};
  const pageMessage=(event:Electron.IpcMainEvent,value:unknown):void=>{if(!view||event.sender.id!==view.webContents.id||window.isDestroyed())return;window.webContents.send('animator:blink:message',value);};

  ipcMain.handle('animator:blink:open',(event,payload:{url?:unknown})=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return open(String(payload?.url??''));});
  ipcMain.handle('animator:blink:close',event=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return close();});
  ipcMain.handle('animator:blink:resources',event=>{if(!validSender(event.sender.id))throw new Error('Invalid Blink preview sender');return resources();});
  const viewportHandler=(event:Electron.IpcMainEvent,value:Viewport)=>{if(validSender(event.sender.id))viewport(value);};
  const commandHandler=(event:Electron.IpcMainEvent,value:unknown)=>{if(validSender(event.sender.id))command(value);};
  ipcMain.on('animator:blink:viewport',viewportHandler);ipcMain.on('animator:blink:command',commandHandler);ipcMain.on('animator:blink:page-message',pageMessage);

  return async()=>{
    ipcMain.removeHandler('animator:blink:open');ipcMain.removeHandler('animator:blink:close');ipcMain.removeHandler('animator:blink:resources');ipcMain.off('animator:blink:viewport',viewportHandler);ipcMain.off('animator:blink:command',commandHandler);ipcMain.off('animator:blink:page-message',pageMessage);
    if(view){window.contentView.removeChildView(view);if(view.webContents.debugger.isAttached())view.webContents.debugger.detach();view.webContents.close();view=null;}
  };
}
