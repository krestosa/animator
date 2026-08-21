import { store } from '../state/store';

export function mountPreviewOrigin(root:HTMLElement):()=>void{
  let raf=0,currentFrame:HTMLIFrameElement|undefined;
  const apply=():void=>{
    raf=0;const project=store.get().project;const frame=root.querySelector<HTMLIFrameElement>('[data-preview-frame]');if(!project||!frame||!project.previewOrigin)return;
    const entry=project.selectedEntry.split('/').map(encodeURIComponent).join('/');
    const desired=project.previewUrl??`${project.previewOrigin.replace(/\/$/,'')}/${entry}`;
    if(frame.dataset.previewOrigin===desired)return;
    frame.dataset.previewOrigin=desired;frame.src=desired;frame.referrerPolicy='no-referrer';
    if(currentFrame!==frame){currentFrame=frame;frame.addEventListener('load',()=>store.set({diagnostics:[...store.get().diagnostics,`info: Complete preview loaded from ${project.sourceUrl??project.previewOrigin}`].slice(-100)}),{once:true});}
  };
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(apply);};
  const unsubscribe=store.subscribe(schedule);const observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});schedule();
  return()=>{unsubscribe();observer.disconnect();if(raf)cancelAnimationFrame(raf);};
}
