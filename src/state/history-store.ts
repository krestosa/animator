import type { DetectedAnimation } from '../types/domain';

export type EditableSnapshot = {
  duration:number|undefined;
  delay:number|undefined;
  easing:string|undefined;
  iterations:number|undefined;
  direction:string|undefined;
  fill:string|undefined;
  keyframes:Array<Record<string,string|number|null>>|undefined;
};
export type HistoryEntry={id:string;before:EditableSnapshot;after:EditableSnapshot};
export type HistoryState={history:HistoryEntry[];future:HistoryEntry[]};

export const emptyHistory=():HistoryState=>({history:[],future:[]});
export const snapshotAnimation=(animation:DetectedAnimation):EditableSnapshot=>({duration:animation.duration,delay:animation.delay,easing:animation.easing,iterations:animation.iterations,direction:animation.direction,fill:animation.fill,keyframes:animation.keyframes?.map(frame=>({...frame}))});
export const applyAnimationSnapshot=(animation:DetectedAnimation,value:EditableSnapshot):DetectedAnimation=>({...animation,duration:value.duration,delay:value.delay,easing:value.easing,iterations:value.iterations,direction:value.direction,fill:value.fill,keyframes:value.keyframes?.map(frame=>({...frame}))});
export const sameSnapshot=(a:EditableSnapshot,b:EditableSnapshot):boolean=>a.duration===b.duration&&a.delay===b.delay&&a.easing===b.easing&&a.iterations===b.iterations&&a.direction===b.direction&&a.fill===b.fill&&JSON.stringify(a.keyframes)===JSON.stringify(b.keyframes);
export const recordHistory=(state:HistoryState,entry:HistoryEntry):HistoryState=>({history:[...state.history,entry],future:[]});
export const undoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.history.at(-1);return entry?{entry,state:{history:state.history.slice(0,-1),future:[...state.future,entry]}}:{state};};
export const redoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.future.at(-1);return entry?{entry,state:{history:[...state.history,entry],future:state.future.slice(0,-1)}}:{state};};
