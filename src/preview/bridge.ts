import { store } from '../state/store';
import type { EditorCommand, PreviewMessage } from '../types/domain';

export const TIMELINE_STATE_EVENT='animator:timeline-state';
export const CAPTURE_REPORT_EVENT='animator:capture-report';

export function isPreviewMessage(value:unknown): value is PreviewMessage {
  return !!value && typeof value==='object' && (value as {source?:unknown}).source==='animator-preview' && typeof (value as {type?:unknown}).type==='string';
}
export function connectPreview(iframe:HTMLIFrameElement):()=>void {
  let lastPlayheadStoreSync=0;
  const handler=(event:MessageEvent<unknown>)=>{
    if(event.source!==iframe.contentWindow || !isPreviewMessage(event.data))return;
    const msg=event.data;
    if(msg.type==='ELEMENTS') store.upsertElements(msg.elements);
    else if(msg.type==='SELECT_ELEMENT'){store.upsertElements([msg.element]);store.set({selectedElementId:msg.element.id,picker:false});}
    else if(msg.type==='ANIMATION') store.addAnimation(msg.animation);
    else if(msg.type==='EVENT') store.addEvent(msg.event);
    else if(msg.type==='EVENTS') store.addEvents(msg.events);
    else if(msg.type==='TIMELINE_STATE') {
      window.dispatchEvent(new CustomEvent(TIMELINE_STATE_EVENT,{detail:msg}));
      const stamp=performance.now();
      if(!msg.playing||stamp-lastPlayheadStoreSync>=250){
        lastPlayheadStoreSync=stamp;const current=store.get().playhead;
        if(Math.abs(current-msg.time)>.25) store.set({playhead:Math.max(0,msg.time)});
      }
    }
    else if(msg.type==='CAPTURE_REPORT') window.dispatchEvent(new CustomEvent(CAPTURE_REPORT_EVENT,{detail:msg}));
    else if(msg.type==='DIAGNOSTIC') store.set({diagnostics:[...store.get().diagnostics, `${msg.level}: ${msg.message}`].slice(-100)});
  };
  window.addEventListener('message',handler); return()=>window.removeEventListener('message',handler);
}
type EditorCommandInput = EditorCommand extends infer Command ? Command extends {source:'animator-editor'} ? Omit<Command,'source'> : never : never;
const timelineCommands=new Set<string>([
  'SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL',
  'SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION',
  'APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION'
]);
export function sendCommand(iframe:HTMLIFrameElement|null, command:EditorCommandInput):void {
  const target=iframe?.contentWindow;if(!target)return;
  if(command.type==='CLEAR_OVERRIDES'||command.type==='RECALCULATE_VIEWPORT'){
    target.postMessage({source:'animator-timeline',...command},'*');
    target.postMessage({source:'animator-editor',...command},'*');
    return;
  }
  const source=timelineCommands.has(command.type)?'animator-timeline':'animator-editor';
  target.postMessage({source,...command},'*');
}
