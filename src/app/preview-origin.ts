import { store } from '../state/store';

export function mountPreviewOrigin(root:HTMLElement):()=>void{
  let raf=0,currentFrame:HTMLIFrameElement|undefined,currentLoad:(()=>void)|undefined,disposed=false;
  const unbindLoad=():void=>{if(currentFrame&&currentLoad)currentFrame.removeEventListener('load',currentLoad);currentLoad=undefined;};
  const bindLoad=(frame:HTMLIFrameElement,projectId:string,source:string):void=>{if(currentFrame!==frame)unbindLoad();currentFrame=frame;unbindLoad();currentLoad=()=>{currentLoad=undefined;if(disposed||store.get().project?.id!==projectId)return;store.set({diagnostics:[...store.get().diagnostics,`info: Complete preview loaded from ${source}`].slice(-100)});};frame.addEventListener('load',currentLoad,{once:true});};
  const apply=():void=>{
    raf=0;if(disposed)return;const project=store.get().project;const frame=root.querySelector<HTMLIFrameElement>('[data-preview-frame]');if(!project||!frame||!project.previewOrigin)return;
    const entry=project.selectedEntry.split('/').map(encodeURIComponent).join('/');
    const raw=project.previewUrl??`${project.previewOrigin.replace(/\/$/,'')}/${entry}`;
    const url=new URL(raw,location.href);url.searchParams.delete('__animator_color_scheme');url.searchParams.set('__animator_color_scheme_reset','1');
    const desired=url.toString();
    if(frame.dataset.previewOrigin===desired)return;
    frame.dataset.previewOrigin=desired;frame.referrerPolicy='no-referrer';bindLoad(frame,project.id,project.sourceUrl??project.previewOrigin);frame.src=desired;
  };
  const schedule=():void=>{if(!disposed&&!raf)raf=requestAnimationFrame(apply);};
  const unsubscribe=store.subscribe(schedule);const observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();
  return()=>{disposed=true;unsubscribe();observer.disconnect();unbindLoad();if(raf)cancelAnimationFrame(raf);};
}
