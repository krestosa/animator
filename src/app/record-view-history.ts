import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

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

  let review=false,detached=false,lastRecording=store.get().recording,lastProjectId=store.get().project?.id,lastFrame:HTMLIFrameElement|null=null;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const currentMode=()=>!review?'off':detached?'detached':'attached';
  const sendState=(reset=false):void=>{
    const recording=store.get().recording;
    sendCommand(frame(),{type:'SET_VIEW_HISTORY_CAPTURE',enabled:recording,reset});
    sendCommand(frame(),{type:'SET_VIEW_HISTORY_MODE',mode:recording?'off':currentMode()});
  };
  const render=():void=>{
    const recording=store.get().recording;
    toggle.hidden=recording;detach.hidden=recording;
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
    if(projectId!==lastProjectId){lastProjectId=projectId;review=false;detached=false;lastRecording=recording;sendState(true);render();return;}
    if(recording!==lastRecording){lastRecording=recording;review=false;detached=false;sendState(recording);}
    render();
  };
  const click=(event:MouseEvent):void=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('[data-view-history-toggle],[data-view-history-detach]');
    if(!target||store.get().recording)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(target.hasAttribute('data-view-history-toggle')){review=!review;if(!review)detached=false;}
    else if(review)detached=!detached;
    render();sendState(false);
  };
  const device=root.querySelector<HTMLElement>('[data-device]');const observer=new MutationObserver(bindFrame);if(device)observer.observe(device,{childList:true});
  const unsubscribe=store.subscribe(sync);root.addEventListener('click',click,true);bindFrame();sendState(true);render();
  return()=>{unsubscribe();sendCommand(frame(),{type:'SET_VIEW_HISTORY_CAPTURE',enabled:false});sendCommand(frame(),{type:'SET_VIEW_HISTORY_MODE',mode:'off'});lastFrame?.removeEventListener('load',onFrameLoad);observer.disconnect();root.removeEventListener('click',click,true);controls.remove();};
}
