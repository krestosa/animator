import type { MotionFilter } from '../core/motion';

export type MotionViewState={query:string;filter:MotionFilter};
let state:MotionViewState={query:'',filter:'all'};
const listeners=new Set<()=>void>();
export const motionViewStore={
  get:():MotionViewState=>state,
  set(patch:Partial<MotionViewState>):void{const next={...state,...patch};if(next.query===state.query&&next.filter===state.filter)return;state=next;for(const listener of listeners)listener();},
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);}
};
