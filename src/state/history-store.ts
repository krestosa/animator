import type { MotionKeyframe,MotionTiming,MotionTrack } from '../core/motion';

export type EditableSnapshot={duration:number|undefined;delay:number|undefined;easing:string|undefined;iterations:number|undefined;direction:string|undefined;fill:string|undefined;keyframes:MotionKeyframe[]};
export type HistoryEntry={id:string;before:EditableSnapshot;after:EditableSnapshot};
export type HistoryState={history:HistoryEntry[];future:HistoryEntry[]};

export const emptyHistory=():HistoryState=>({history:[],future:[]});
export const snapshotTrack=(track:MotionTrack):EditableSnapshot=>({duration:track.timing.duration,delay:track.timing.delay,easing:track.timing.easing,iterations:track.timing.iterations,direction:track.timing.direction,fill:track.timing.fill,keyframes:track.keyframes.map(frame=>({...frame,values:{...frame.values}}))});
const applyTiming=(base:MotionTiming,value:EditableSnapshot):MotionTiming=>({start:base.start,...(value.duration!==undefined?{duration:value.duration}:{}),...(value.delay!==undefined?{delay:value.delay}:{}),...(value.iterations!==undefined?{iterations:value.iterations}:{}),...(value.direction!==undefined?{direction:value.direction}:{}),...(value.easing!==undefined?{easing:value.easing}:{}),...(value.fill!==undefined?{fill:value.fill}:{})});
export const applyTrackSnapshot=(track:MotionTrack,value:EditableSnapshot):MotionTrack=>({...track,timing:applyTiming(track.timing,value),keyframes:value.keyframes.map(frame=>({...frame,values:{...frame.values}}))});
export const sameSnapshot=(a:EditableSnapshot,b:EditableSnapshot):boolean=>a.duration===b.duration&&a.delay===b.delay&&a.easing===b.easing&&a.iterations===b.iterations&&a.direction===b.direction&&a.fill===b.fill&&JSON.stringify(a.keyframes)===JSON.stringify(b.keyframes);
export const recordHistory=(state:HistoryState,entry:HistoryEntry):HistoryState=>({history:[...state.history,entry],future:[]});
export const undoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.history.at(-1);return entry?{entry,state:{history:state.history.slice(0,-1),future:[...state.future,entry]}}:{state};};
export const redoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.future.at(-1);return entry?{entry,state:{history:[...state.history,entry],future:state.future.slice(0,-1)}}:{state};};
