import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const pendingPreviewUrls=new WeakMap<HTMLIFrameElement,string>();
let restoreSrcDescriptor:(()=>void)|undefined;
let nativeSetSrc:((this:HTMLIFrameElement,value:string)=>void)|undefined;

export function installPreviewNavigationGate():()=>void{
  if(restoreSrcDescriptor)return restoreSrcDescriptor;
  const descriptor=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  if(!descriptor?.get||!descriptor.set)return()=>{};
  const nativeGet=descriptor.get,nativeSet=descriptor.set;nativeSetSrc=nativeSet;
  Object.defineProperty(HTMLIFrameElement.prototype,'src',{
    configurable:descriptor.configurable===true,
    enumerable:descriptor.enumerable===true,
    get(){return nativeGet.call(this);},
    set(value:string){
      const next=String(value);
      if(this instanceof HTMLIFrameElement&&this.hasAttribute('data-preview-frame')&&!store.get().recording&&next!=='about:blank'){
        pendingPreviewUrls.set(this,next);this.dataset.recordBlocked='true';nativeSet.call(this,'about:blank');return;
      }
      pendingPreviewUrls.delete(this);this.removeAttribute('data-record-blocked');nativeSet.call(this,next);
    }
  });
  restoreSrcDescriptor=()=>{Object.defineProperty(HTMLIFrameElement.prototype,'src',descriptor);restoreSrcDescriptor=undefined;nativeSetSrc=undefined;};
  return restoreSrcDescriptor;
}

export function mountRecordGate(root:HTMLElement):()=>void{
  let lastProjectId=store.get().project?.id;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const projectPreviewUrl=():string|undefined=>{
    const project=store.get().project;if(!project)return undefined;
    if(project.previewUrl)return project.previewUrl;
    if(!project.previewOrigin)return undefined;
    const entry=project.selectedEntry.split('/').map(encodeURIComponent).join('/');
    return `${project.previewOrigin.replace(/\/$/,'')}/${entry}`;
  };
  const releasePendingPreview=():void=>{
    const preview=frame();if(!preview||!nativeSetSrc)return;
    const pending=projectPreviewUrl()??preview.dataset.previewOrigin??pendingPreviewUrls.get(preview);
    if(!pending||pending==='about:blank')return;
    pendingPreviewUrls.delete(preview);preview.removeAttribute('data-record-blocked');nativeSetSrc.call(preview,pending);
  };
  const setRecording=(enabled:boolean):void=>{
    if(store.get().recording===enabled){if(enabled)releasePendingPreview();return;}
    store.set({recording:enabled});
    const preview=frame();
    if(preview)sendCommand(preview,{type:'SET_RECORDING',enabled});
    if(enabled)releasePendingPreview();
  };
  const click=(event:MouseEvent):void=>{
    const button=(event.target as Element|null)?.closest<HTMLElement>('[data-action="record"]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();setRecording(!store.get().recording);
  };
  const changed=():void=>{
    const projectId=store.get().project?.id;
    if(projectId!==lastProjectId){lastProjectId=projectId;if(store.get().recording)queueMicrotask(releasePendingPreview);}
  };
  root.addEventListener('click',click,true);const unsubscribe=store.subscribe(changed);
  return()=>{unsubscribe();root.removeEventListener('click',click,true);};
}
