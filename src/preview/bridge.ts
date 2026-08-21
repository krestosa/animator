import { store } from '../state/store';
import type { EditorCommand, PreviewMessage } from '../types/domain';

export function isPreviewMessage(value:unknown): value is PreviewMessage {
  return !!value && typeof value==='object' && (value as {source?:unknown}).source==='animator-preview' && typeof (value as {type?:unknown}).type==='string';
}
export function connectPreview(iframe:HTMLIFrameElement):()=>void {
  const handler=(event:MessageEvent<unknown>)=>{
    if(event.source!==iframe.contentWindow || !isPreviewMessage(event.data))return;
    const msg=event.data;
    if(msg.type==='ELEMENTS') store.upsertElements(msg.elements);
    else if(msg.type==='SELECT_ELEMENT'){store.upsertElements([msg.element]);store.set({selectedElementId:msg.element.id,picker:false});}
    else if(msg.type==='ANIMATION') store.addAnimation(msg.animation);
    else if(msg.type==='EVENT') store.addEvent(msg.event);
    else if(msg.type==='TIMELINE_STATE') {
      const current=store.get().playhead;
      if(Math.abs(current-msg.time)>.25) store.set({playhead:Math.max(0,msg.time)});
    }
    else if(msg.type==='DIAGNOSTIC') store.set({diagnostics:[...store.get().diagnostics, `${msg.level}: ${msg.message}`].slice(-100)});
  };
  window.addEventListener('message',handler); return()=>window.removeEventListener('message',handler);
}
type EditorCommandInput = EditorCommand extends infer Command ? Command extends {source:'animator-editor'} ? Omit<Command,'source'> : never : never;
export function sendCommand(iframe:HTMLIFrameElement|null, command:EditorCommandInput){ iframe?.contentWindow?.postMessage({source:'animator-editor',...command},'*'); }
