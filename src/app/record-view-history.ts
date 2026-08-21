import { sendCommand } from '../preview/bridge';

export function mountRecordViewHistory(root:HTMLElement):()=>void{
  const record=root.querySelector<HTMLElement>('[data-action="record"]');
  if(!record)return()=>{};

  const controls=document.createElement('span');
  controls.className='recordViewControls';
  controls.innerHTML='<button type="button" data-view-history-toggle aria-pressed="false">View history</button><button type="button" data-view-history-detach aria-pressed="false" disabled>Detach</button>';
  record.insertAdjacentElement('afterend',controls);
  const toggle=controls.querySelector<HTMLButtonElement>('[data-view-history-toggle]');
  const detach=controls.querySelector<HTMLButtonElement>('[data-view-history-detach]');
  if(!toggle||!detach){controls.remove();return()=>{};}

  let enabled=false,detached=false,currentFrame:HTMLIFrameElement|null=null;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const mode=()=>!enabled?'off':detached?'detached':'attached';
  const apply=():void=>{
    const preview=frame();
    sendCommand(preview,{type:'SET_VIEW_HISTORY_CAPTURE',enabled});
    sendCommand(preview,{type:'SET_VIEW_HISTORY_MODE',mode:mode()});
  };
  const render=():void=>{
    toggle.classList.toggle('active',enabled);toggle.setAttribute('aria-pressed',String(enabled));
    toggle.title=enabled?'Scroll and mouse history is recorded and follows the timeline':'Record scroll and mouse history with the preview timeline';
    detach.disabled=!enabled;detach.classList.toggle('active',enabled&&detached);detach.setAttribute('aria-pressed',String(enabled&&detached));
    detach.title=detached?'Freecam: the page stays where you move it while the recorded viewport is shown as a moving window':'Detach recorded viewport from page scroll for off-screen diagnostics';
  };
  const onFrameLoad=():void=>apply();
  const bindFrame=():void=>{
    const next=frame();if(next===currentFrame)return;
    currentFrame?.removeEventListener('load',onFrameLoad);currentFrame=next;
    currentFrame?.addEventListener('load',onFrameLoad);if(currentFrame)queueMicrotask(apply);
  };
  const click=(event:MouseEvent):void=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('[data-view-history-toggle],[data-view-history-detach]');if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(target.hasAttribute('data-view-history-toggle'))enabled=!enabled;
    else if(enabled)detached=!detached;
    render();apply();
  };
  const device=root.querySelector<HTMLElement>('[data-device]');
  const observer=new MutationObserver(bindFrame);if(device)observer.observe(device,{childList:true});
  root.addEventListener('click',click,true);bindFrame();render();
  return()=>{sendCommand(frame(),{type:'SET_VIEW_HISTORY_CAPTURE',enabled:false});sendCommand(frame(),{type:'SET_VIEW_HISTORY_MODE',mode:'off'});currentFrame?.removeEventListener('load',onFrameLoad);observer.disconnect();root.removeEventListener('click',click,true);controls.remove();};
}
