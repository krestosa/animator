import { contextBridge, ipcRenderer } from 'electron';

type Viewport={x:number;y:number;width:number;height:number;zoomFactor:number};
type MessageHandler=(message:unknown)=>void;
const handlers=new Set<MessageHandler>();
ipcRenderer.on('animator:blink:message',(_event,message)=>{for(const handler of handlers)handler(message);});

contextBridge.exposeInMainWorld('animatorDesktop',{
  blink:{
    open:(url:string)=>ipcRenderer.invoke('animator:blink:open',{url}),
    close:()=>ipcRenderer.invoke('animator:blink:close'),
    setViewport:(viewport:Viewport)=>ipcRenderer.send('animator:blink:viewport',viewport),
    command:(command:unknown)=>ipcRenderer.send('animator:blink:command',command),
    onMessage:(handler:MessageHandler)=>{handlers.add(handler);},
    offMessage:(handler:MessageHandler)=>{handlers.delete(handler);}
  }
});
