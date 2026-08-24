import { store } from '../state/store';
import type { EditorCommand, PreviewMessage } from '../types/domain';

export const TIMELINE_STATE_EVENT='animator:timeline-state';
export const CAPTURE_REPORT_EVENT='animator:capture-report';
export const RECORDING_STATE_EVENT='animator:recording-state';

export function isPreviewMessage(value:unknown): value is PreviewMessage {
  return !!value && typeof value==='object' && (value as {source?:unknown}).source==='animator-preview' && typeof (value as {type?:unknown}).type==='string';
}
export function connectPreview(iframe:HTMLIFrameElement|null):()=>void {
  let lastPlayheadStoreSync=0,disposed=false,pollTimer=0;
  const handle=(msg:PreviewMessage):void=>{
    if(msg.type==='ELEMENTS') store.upsertElements(msg.elements);
    else if(msg.type==='SELECT_ELEMENT'){store.upsertElements([msg.element]);store.set({selectedElementId:msg.element.id,picker:false});}
    else if(msg.type==='MOTION_TRACK'){if(store.get().recording||msg.track.name==='Created animation')store.addMotionTrack(msg.track);}
    else if(msg.type==='EVENT'){if(store.get().recording)store.addEvent(msg.event);}
    else if(msg.type==='EVENTS'){if(store.get().recording)store.addEvents(msg.events);}
    else if(msg.type==='TIMELINE_STATE'){
      window.dispatchEvent(new CustomEvent(TIMELINE_STATE_EVENT,{detail:msg}));
      if(!store.get().recording)sendCommand(iframe,{type:'APPLY_VIEW_HISTORY_TIME',time:msg.time,controlled:msg.controlled});
      const stamp=performance.now();if(!msg.playing||stamp-lastPlayheadStoreSync>=250){lastPlayheadStoreSync=stamp;const current=store.get().playhead;if(Math.abs(current-msg.time)>.25)store.set({playhead:Math.max(0,msg.time)});}
    }
    else if(msg.type==='RECORDING_STATE')window.dispatchEvent(new CustomEvent(RECORDING_STATE_EVENT,{detail:msg}));
    else if(msg.type==='CAPTURE_REPORT')window.dispatchEvent(new CustomEvent(CAPTURE_REPORT_EVENT,{detail:msg}));
    else if(msg.type==='DIAGNOSTIC')store.set({diagnostics:[...store.get().diagnostics,`${msg.level}: ${msg.message}`].slice(-100)});
  };
  const browserSessionId=store.get().project?.browserSessionId;
  if(browserSessionId){
    const controller=new AbortController();
    const ownsSession=():boolean=>!disposed&&store.get().project?.browserSessionId===browserSessionId;
    const snapshotHandler=(event:MessageEvent<unknown>):void=>{const frame=document.querySelector<HTMLIFrameElement>('[data-browser-snapshot-frame]');if(event.source!==frame?.contentWindow||!isPreviewMessage(event.data))return;handle(event.data);};
    window.addEventListener('message',snapshotHandler);
    const poll=async():Promise<void>=>{
      if(!ownsSession())return;
      let delay=store.get().recording?120:450;
      try{
        const response=await fetch(`/api/browser-sessions/${encodeURIComponent(browserSessionId)}/events`,{cache:'no-store',signal:controller.signal});
        if(!response.ok||!ownsSession())return;
        const values=await response.json() as unknown[];
        if(!ownsSession())return;
        if(values.length)delay=55;
        for(const value of values){if(!ownsSession())break;if(isPreviewMessage(value))handle(value);}
      }catch{}finally{if(ownsSession())pollTimer=window.setTimeout(()=>void poll(),delay);}
    };
    void poll();return()=>{disposed=true;controller.abort();if(pollTimer)clearTimeout(pollTimer);window.removeEventListener('message',snapshotHandler);};
  }
  const native=window.animatorDesktop?.blink;
  if(native){const nativeHandler=(value:unknown)=>{if(!disposed&&isPreviewMessage(value))handle(value);};native.onMessage(nativeHandler);return()=>{disposed=true;native.offMessage(nativeHandler);};}
  if(!iframe)return()=>{disposed=true;};
  const handler=(event:MessageEvent<unknown>)=>{if(event.source!==iframe.contentWindow||!isPreviewMessage(event.data))return;handle(event.data);};
  window.addEventListener('message',handler);return()=>{disposed=true;window.removeEventListener('message',handler);};
}
type EditorCommandInput=EditorCommand extends infer Command?Command extends{source:'animator-editor'}?Omit<Command,'source'>:never:never;
const timelineCommands=new Set<string>(['SET_ANIMATION_TIME','SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','RELEASE_TIMELINE','SET_LOOP_ALL','SET_ALL_PLAYBACK_RATE','SET_PLAYBACK_RATE','PLAY_ANIMATION','PAUSE_ANIMATION','RESTART_ANIMATION','APPLY_OVERRIDE','HIGHLIGHT_ANIMATION','SET_SOLO_ANIMATION','CLEAR_SOLO_ANIMATION','SET_FOCUS_ANIMATION','SET_MAGNIFY_ANIMATION']);
const stickyBrowserCommands=new Set<string>(['SET_COLOR_SCHEME','SET_REDUCED_MOTION']);
export function sendCommand(iframe:HTMLIFrameElement|null,command:EditorCommandInput):void{
  const browserSessionId=store.get().project?.browserSessionId,replayFrame=document.querySelector<HTMLIFrameElement>('[data-browser-snapshot-frame]');
  if(browserSessionId&&!store.get().recording&&command.type!=='SET_RECORDING'&&replayFrame?.contentWindow){
    postFrameCommand(replayFrame,command);if(stickyBrowserCommands.has(command.type))void postBrowserCommand(browserSessionId,command);return;
  }
  if(browserSessionId){
    const requestedSessionId=browserSessionId;
    void postBrowserCommand(requestedSessionId,command).then(response=>{
      if(store.get().project?.browserSessionId!==requestedSessionId||!response.ok||command.type!=='SET_RECORDING')return;
      const detail:Extract<PreviewMessage,{type:'RECORDING_STATE'}>={source:'animator-preview',type:'RECORDING_STATE',enabled:command.enabled,requestId:command.requestId};
      window.dispatchEvent(new CustomEvent(RECORDING_STATE_EVENT,{detail}));
    }).catch(()=>{});return;
  }
  const native=window.animatorDesktop?.blink;if(native){postNativeCommand(native,command);return;}
  if(iframe)postFrameCommand(iframe,command);
}
function postBrowserCommand(sessionId:string,command:EditorCommandInput):Promise<Response>{return fetch(`/api/browser-sessions/${encodeURIComponent(sessionId)}/command`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});}
function postNativeCommand(native:NonNullable<Window['animatorDesktop']>['blink'],command:EditorCommandInput):void{
  if(command.type==='SET_RECORDING'){const requestedAt=Date.now();if(command.enabled)native.command({source:'animator-timeline',type:'RELEASE_TIMELINE'});native.command({source:'animator-editor',...command,requestedAt});return;}
  if(command.type==='CLEAR_OVERRIDES'||command.type==='RECALCULATE_VIEWPORT'){native.command({source:'animator-timeline',...command});native.command({source:'animator-editor',...command});return;}
  native.command({source:timelineCommands.has(command.type)?'animator-timeline':'animator-editor',...command});
}
function postFrameCommand(iframe:HTMLIFrameElement,command:EditorCommandInput):void{
  const target=iframe.contentWindow;if(!target)return;
  if(command.type==='SET_RECORDING'){const requestedAt=Date.now();if(command.enabled)target.postMessage({source:'animator-timeline',type:'RELEASE_TIMELINE'},'*');target.postMessage({source:'animator-editor',...command,requestedAt},'*');return;}
  if(command.type==='CLEAR_OVERRIDES'||command.type==='RECALCULATE_VIEWPORT'){target.postMessage({source:'animator-timeline',...command},'*');target.postMessage({source:'animator-editor',...command},'*');return;}
  const source=timelineCommands.has(command.type)?'animator-timeline':'animator-editor';target.postMessage({source,...command},'*');
}
