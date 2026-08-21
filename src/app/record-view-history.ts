import { RECORDING_STATE_EVENT, sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import type { PreviewMessage } from '../types/domain';

export function mountRecordViewHistory(root:HTMLElement):()=>void{
  const record=root.querySelector<HTMLElement>('[data-action="record"]');
  if(!record)return()=>{};

  const controls=document.createElement('span');
  controls.className='recordViewControls';
  controls.innerHTML='<button type="button" data-view-history-toggle aria-pressed="false" hidden>View history</button><button type="button" data-view-history-detach aria-pressed="false" hidden disabled>Detach</button>';
  record.insertAdjacentElement('afterend',controls);
  const toggle=controls.querySelector<HTMLButtonElement>('[data-view-history-toggle]');
  const detach=controls.querySelector<HTMLButtonElement>('[data-view-history-detach]');
  if(!toggle||!detach){controls.remove();return()=>{};}

  let review=false,detached=false,lastRecording=store.get().recording,lastProjectId=store.get().project?.id,lastFrame:HTMLIFrameElement|null=null,confirmedRecording=true,recordingCycleStarted=!!store.get().project&&store.get().recording,completedRecording=false;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const currentMode=()=>!review?'off':detached?'detached':'attached';
  const sendState=(reset=false):void=>{
    const recording=store.get().recording;
    sendCommand(frame(),{type:'SET_VIEW_HISTORY_CAPTURE',enabled:recording,reset});
    sendCommand(frame(),{type:'SET_VIEW_HISTORY_MODE',mode:recording?'off':currentMode()});
  };
  const render=():void=>{
    const recording=store.get().recording,available=!recording&&!confirmedRecording&&completedRecording;
    toggle.hidden=!available;detach.hidden=!available;
    toggle.classList.toggle('active',review);toggle.setAttribute('aria-pressed',String(review));
    detach.disabled=!review;detach.classList.toggle('active',review&&detached);detach.setAttribute('aria-pressed',String(review&&detached));
    toggle.title=review?'Disable recorded view playback':'Review scroll and pointer history from the completed recording';
    detach.title=detached?'Free camera enabled':'Keep the page free while showing the recorded viewport';
  };
  const onFrameLoad=():void=>sendState(lastRecording);
  const bindFrame=():void=>{
    const next=frame();if(next===lastFrame)return;
    lastFrame?.removeEventListener('load',onFrameLoad);lastFrame=next;lastFrame?.addEventListener('load',onFrameLoad);
    if(lastFrame)queueMicrotask(()=>sendState(lastRecording));
  };
  const sync=():void=>{
    const state=store.get(),recording=state.recording,projectId=state.project?.id;bindFrame();
    if(projectId!==lastProjectId){lastProjectId=projectId;review=false;detached=false;lastRecording=recording;confirmedRecording=true;recordingCycleStarted=!!projectId&&recording;completedRecording=false;sendState(true);render();return;}
    if(recording!==lastRecording){lastRecording=recording;review=false;detached=false;if(recording){confirmedRecording=true;recordingCycleStarted=!!projectId;completedRecording=false;}sendState(recording);}
    render();
  };
  const onRecordingState=(event:Event):void=>{const detail=(event as CustomEvent<Extract<PreviewMessage,{type:'RECORDING_STATE'}>>).detail;if(!detail)return;confirmedRecording=detail.enabled;if(detail.enabled){recordingCycleStarted=!!store.get().project;completedRecording=false;review=false;detached=false;}else if(recordingCycleStarted){completedRecording=true;}render();};
  const click=(event:MouseEvent):void=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('[data-view-history-toggle],[data-view-history-detach]');
    if(!target||store.get().recording||confirmedRecording||!completedRecording)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(target.hasAttribute('data-view-history-toggle')){review=!review;if(!review)detached=false;}
    else if(review)detached=!detached;
    render();sendState(false);
  };
  const device=root.querySelector<HTMLElement>('[data-device]');const observer=new MutationObserver(bindFrame);if(device)observer.observe(device,{childList:true});
  const unsubscribe=store.subscribe(sync);root.addEventListener('click',click,true);window.addEventListener(RECORDING_STATE_EVENT,onRecordingState);bindFrame();sendState(true);render();
  return()=>{unsubscribe();sendCommand(frame(),{type:'SET_VIEW_HISTORY_CAPTURE',enabled:false});sendCommand(frame(),{type:'SET_VIEW_HISTORY_MODE',mode:'off'});lastFrame?.removeEventListener('load',onFrameLoad);observer.disconnect();root.removeEventListener('click',click,true);window.removeEventListener(RECORDING_STATE_EVENT,onRecordingState);controls.remove();};
}
