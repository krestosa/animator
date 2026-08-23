import { ipcRenderer } from 'electron';

window.addEventListener('message',event=>{
  const value=event.data as {source?:unknown;type?:unknown}|undefined;
  if(!value||value.source!=='animator-preview'||typeof value.type!=='string')return;
  ipcRenderer.send('animator:blink:page-message',value);
});

ipcRenderer.on('animator:blink:command',(_event,command)=>{
  window.postMessage(command,'*');
});
