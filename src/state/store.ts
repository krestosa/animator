import { useSyncExternalStore } from 'react';
import type { DetectedAnimation, ProjectDescriptor, RuntimeElement, StaticAnalysis, TimelineEvent } from '../types/domain';

type State = { project?:ProjectDescriptor; analysis?:StaticAnalysis; elements:RuntimeElement[]; animations:DetectedAnimation[]; events:TimelineEvent[]; selectedElementId?:string; selectedAnimationId?:string; picker:boolean; recording:boolean; playhead:number; zoom:number; diagnostics:string[]; history:Array<{id:string; duration?:number; easing?:string}>; future:Array<{id:string; duration?:number; easing?:string}>; };
let state:State = {elements:[],animations:[],events:[],picker:false,recording:true,playhead:0,zoom:1,diagnostics:[],history:[],future:[]};
const listeners = new Set<()=>void>();
const emit=()=>listeners.forEach(l=>l());
export const store = {
  get:()=>state,
  set:(patch:Partial<State>)=>{state={...state,...patch};emit();},
  updateAnimation:(id:string, patch:Partial<DetectedAnimation>, record=true)=>{const current=state.animations.find(a=>a.id===id);if(!current)return;if(record){state={...state,history:[...state.history,{id,duration:current.duration,easing:current.easing}],future:[]};}state={...state,animations:state.animations.map(a=>a.id===id?{...a,...patch}:a)};emit();},
  addAnimation:(animation:DetectedAnimation)=>{const i=state.animations.findIndex(a=>a.id===animation.id); state={...state,animations:i>=0?state.animations.map(a=>a.id===animation.id?{...a,...animation}:a):[...state.animations,animation]};emit();},
  addEvent:(event:TimelineEvent)=>{state={...state,events:[...state.events,event].slice(-1000)};emit();},
  upsertElements:(elements:RuntimeElement[])=>{const map=new Map(state.elements.map(e=>[e.id,e]));for(const e of elements)map.set(e.id,e);state={...state,elements:[...map.values()]};emit();},
  undo:()=>{const cmd=state.history.at(-1);if(!cmd)return;const current=state.animations.find(a=>a.id===cmd.id);if(!current)return;state={...state,history:state.history.slice(0,-1),future:[...state.future,{id:cmd.id,duration:current.duration,easing:current.easing}],animations:state.animations.map(a=>a.id===cmd.id?{...a,duration:cmd.duration,easing:cmd.easing}:a)};emit();},
  redo:()=>{const cmd=state.future.at(-1);if(!cmd)return;const current=state.animations.find(a=>a.id===cmd.id);if(!current)return;state={...state,future:state.future.slice(0,-1),history:[...state.history,{id:cmd.id,duration:current.duration,easing:current.easing}],animations:state.animations.map(a=>a.id===cmd.id?{...a,duration:cmd.duration,easing:cmd.easing}:a)};emit();}
};
export function useStore<T>(selector:(s:State)=>T):T { return useSyncExternalStore(cb=>{listeners.add(cb);return()=>listeners.delete(cb);},()=>selector(state)); }
