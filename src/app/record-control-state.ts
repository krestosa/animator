import {store} from '../state/store';

export function mountRecordControlState(root:HTMLElement):()=>void{
  let raf=0;
  const apply=():void=>{
    raf=0;
    const button=root.querySelector<HTMLButtonElement>('[data-action="record"]');
    if(button&&store.get().recording)button.disabled=false;
  };
  const sync=():void=>{
    if(!raf)raf=requestAnimationFrame(apply);
  };
  const unsubscribe=store.subscribe(sync);
  sync();
  return()=>{unsubscribe();if(raf)cancelAnimationFrame(raf);};
}
