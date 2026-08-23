import { contextBridge, ipcRenderer } from 'electron';

type Viewport={x:number;y:number;width:number;height:number;zoomFactor:number;clipX?:number;clipY?:number;clipWidth?:number;clipHeight?:number};
type MessageHandler=(message:unknown)=>void;
type Resource={url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number};
type ResourceHandler=(resource:Resource)=>void;
const handlers=new Set<MessageHandler>(),resourceHandlers=new Set<ResourceHandler>();
ipcRenderer.on('animator:blink:message',(_event,message)=>{for(const handler of handlers)handler(message);});
ipcRenderer.on('animator:blink:resource',(_event,resource:Resource)=>{for(const handler of resourceHandlers)handler(resource);});

contextBridge.exposeInMainWorld('animatorDesktop',{
  blink:{
    open:(url:string)=>ipcRenderer.invoke('animator:blink:open',{url}),
    close:()=>ipcRenderer.invoke('animator:blink:close'),
    setInstrumentation:(enabled:boolean)=>ipcRenderer.invoke('animator:blink:instrumentation',{enabled}),
    resources:()=>ipcRenderer.invoke('animator:blink:resources'),
    openResource:(url:string)=>ipcRenderer.invoke('animator:blink:resource-open',{url}),
    closeResource:()=>ipcRenderer.invoke('animator:blink:resource-close'),
    downloadResource:(url:string,name?:string)=>ipcRenderer.invoke('animator:blink:resource-download',{url,name}),
    onResource:(handler:ResourceHandler)=>{resourceHandlers.add(handler);},
    offResource:(handler:ResourceHandler)=>{resourceHandlers.delete(handler);},
    setViewport:(viewport:Viewport)=>ipcRenderer.send('animator:blink:viewport',viewport),
    setVisible:(visible:boolean)=>ipcRenderer.send('animator:blink:visible',visible),
    command:(command:unknown)=>ipcRenderer.send('animator:blink:command',command),
    onMessage:(handler:MessageHandler)=>{handlers.add(handler);},
    offMessage:(handler:MessageHandler)=>{handlers.delete(handler);}
  }
});
