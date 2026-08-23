import {store} from '../state/store';

export function mountRecordControlState(root:HTMLElement):()=>void{
  const sync=():void=>{
    const button=root.querySelector<HTMLButtonElement>('[data-action="record"]');
    if(!button)return;
    const state=store.get();
    if(state.recording)button.disabled=false;
  };
  const unsubscribe=store.subscribe(sync);
  sync();
  return unsubscribe;
}
