import { RECORDING_STATE_EVENT, sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import type { PreviewMessage } from '../types/domain';

const pendingPreviewUrls=new WeakMap<HTMLIFrameElement,string>();
const armedPreviewFrames=new WeakSet<HTMLIFrameElement>();
let restoreSrcDescriptor:(()=>void)|undefined;
let nativeSetSrc:((this:HTMLIFrameElement,value:string)=>void)|undefined;

export function installPreviewNavigationGate():()=>void{
  if(restoreSrcDescriptor)return restoreSrcDescriptor;
  const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');if(!descriptor?.get||!descriptor.set)return()=>{};
  const nativeGet=descriptor.get,nativeSet=descriptor.set;nativeSetSrc=nativeSet;
  Object.defineProperty(HTMLIFrameElement.prototype,'src',{configurable:descriptor.configurable===true,enumerable:descriptor.enumerable===true,get(){return nativeGet.call(this);},set(value:string){const next=String(value);if(this instanceof HTMLIFrameElement&&this.hasAttribute('data-preview-frame')&&armedPreviewFrames.has(this)&&!store.get().recording&&next!=='about:blank'){pendingPreviewUrls.set(this,next);this.dataset.recordBlocked='true';nativeSet.call(this,'about:blank');return;}pendingPreviewUrls.delete(this);this.removeAttribute('data-record-blocked');nativeSet.call(this,next);}});
  restoreSrcDescriptor=()=>{Object.defineProperty(HTMLIFrameElement.prototype,'src',descriptor);restoreSrcDescriptor=undefined;nativeSetSrc=undefined;};return restoreSrcDescriptor;
}

export function mountRecordGate(root:HTMLElement):()=>void{
  let lastProjectId=store.get().project?.id,currentFrame:HTMLIFrameElement|null=null,pendingId='',desired=store.get().recording,retryTimer=0,retries=0;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const projectPreviewUrl=():string|undefined=>{const project=store.get().project;if(!project||project.browserSessionId)return undefined;if(project.previewUrl)return project.previewUrl;if(!project.previewOrigin)return undefined;const entry=project.selectedEntry.split('/').map(encodeURIComponent).join('/');return `${project.previewOrigin.replace(/\/$/,'')}/${entry}`;};
  const releasePendingPreview=():void=>{const preview=frame();if(!preview||!nativeSetSrc)return;const explicitPending=pendingPreviewUrls.get(preview),blocked=preview.dataset.recordBlocked==='true'||preview.getAttribute('src')==='about:blank';if(!blocked&&!explicitPending)return;const pending=projectPreviewUrl()??preview.dataset.previewOrigin??explicitPending;if(!pending||pending==='about:blank')return;pendingPreviewUrls.delete(preview);preview.removeAttribute('data-record-blocked');nativeSetSrc.call(preview,pending);};
  const stopRetry=():void=>{if(retryTimer)clearTimeout(retryTimer);retryTimer=0;retries=0;};
  const transmit=():void=>{if(!pendingId)return;sendCommand(frame(),{type:'SET_RECORDING',enabled:desired,requestId:pendingId});if(retryTimer)clearTimeout(retryTimer);if(retries++<50)retryTimer=window.setTimeout(transmit,120);else{retryTimer=0;store.set({diagnostics:[...store.get().diagnostics,'warn: Preview did not confirm the requested Record state'].slice(-100)});}};
  const requestState=(enabled:boolean):void=>{stopRetry();desired=enabled;pendingId=`rec-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;if(store.get().recording!==enabled)store.set({recording:enabled});if(enabled)queueMicrotask(releasePendingPreview);transmit();};
  const applyExternal=(detail:Extract<PreviewMessage,{type:'RECORDING_STATE'}>):void=>{pendingId='';stopRetry();desired=detail.enabled;if(store.get().recording!==detail.enabled)store.set({recording:detail.enabled});if(detail.enabled)queueMicrotask(releasePendingPreview);};
  const onAck=(event:Event):void=>{
    const detail=(event as CustomEvent<Extract<PreviewMessage,{type:'RECORDING_STATE'}>>).detail;if(!detail)return;const external=!!detail.reason&&detail.reason!=='command';
    if(external){applyExternal(detail);return;}
    if(!pendingId)return;
    if(detail.requestId&&detail.requestId!==pendingId)return;
    if(detail.enabled!==desired){transmit();return;}pendingId='';stopRetry();if(store.get().recording!==detail.enabled)store.set({recording:detail.enabled});if(detail.enabled)releasePendingPreview();
  };
  const onFrameLoad=():void=>{const preview=frame();if(!preview)return;const src=preview.getAttribute('src')??'';if(src&&src!=='about:blank')armedPreviewFrames.add(preview);const blocked=preview.dataset.recordBlocked==='true'||src==='about:blank';if(blocked&&!store.get().recording)return;if(pendingId)transmit();else if(store.get().project&&!store.get().project?.browserSessionId)requestState(store.get().recording);};
  const bindFrame=():void=>{const next=frame();if(next===currentFrame)return;currentFrame?.removeEventListener('load',onFrameLoad);currentFrame=next;currentFrame?.addEventListener('load',onFrameLoad);};
  const click=(event:MouseEvent):void=>{const button=(event.target as Element|null)?.closest<HTMLElement>('[data-action="record"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const project=store.get().project;if(!project){store.set({recording:!store.get().recording});desired=store.get().recording;return;}requestState(!store.get().recording);};
  const changed=():void=>{bindFrame();const projectId=store.get().project?.id;if(projectId===lastProjectId)return;lastProjectId=projectId;desired=store.get().recording;if(desired)queueMicrotask(releasePendingPreview);if(projectId&&store.get().project?.browserSessionId)requestState(desired);};
  const observer=new MutationObserver(bindFrame);const device=root.querySelector<HTMLElement>('[data-device]');if(device)observer.observe(device,{childList:true});
  root.addEventListener('click',click,true);window.addEventListener(RECORDING_STATE_EVENT,onAck);const unsubscribe=store.subscribe(changed);bindFrame();
  return()=>{stopRetry();unsubscribe();observer.disconnect();currentFrame?.removeEventListener('load',onFrameLoad);root.removeEventListener('click',click,true);window.removeEventListener(RECORDING_STATE_EVENT,onAck);};
}
