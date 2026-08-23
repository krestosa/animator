import {store} from '../state/store';

export function mountExportActionState(root:HTMLElement):()=>void{
  let raf=0,disposed=false;
  const apply=():void=>{
    raf=0;if(disposed)return;const state=store.get(),selected=state.motionTracks.find(track=>track.id===state.selectedAnimationId)??state.motionTracks.find(track=>track.target.elementId===state.selectedElementId),disabled=!selected;
    root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button=>{button.disabled=disabled;if(disabled)button.title='Select an animation to copy generated output';else if(button.title==='Select an animation to copy generated output')button.removeAttribute('title');});
  };
  const schedule=():void=>{if(!disposed&&!raf)raf=requestAnimationFrame(apply);};
  const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});const unsubscribe=store.subscribe(schedule);schedule();
  return()=>{disposed=true;if(raf)cancelAnimationFrame(raf);observer.disconnect();unsubscribe();};
}
