import type { DetectedAnimation, ProjectDescriptor, RuntimeElement, StaticAnalysis, TimelineEvent } from '../types/domain';

type EditableSnapshot = {
  duration:number|undefined;
  delay:number|undefined;
  easing:string|undefined;
  iterations:number|undefined;
  direction:string|undefined;
  fill:string|undefined;
  keyframes:Array<Record<string,string|number|null>>|undefined;
};
type HistoryEntry = { id:string; before:EditableSnapshot; after:EditableSnapshot };
export type AnimatorState = {
  project: ProjectDescriptor | undefined;
  analysis: StaticAnalysis | undefined;
  elements: RuntimeElement[];
  animations: DetectedAnimation[];
  events: TimelineEvent[];
  selectedElementId: string | undefined;
  selectedAnimationId: string | undefined;
  picker: boolean;
  recording: boolean;
  playhead: number;
  zoom: number;
  diagnostics: string[];
  history: HistoryEntry[];
  future: HistoryEntry[];
};

let state:AnimatorState={project:undefined,analysis:undefined,elements:[],animations:[],events:[],selectedElementId:undefined,selectedAnimationId:undefined,picker:false,recording:true,playhead:0,zoom:1,diagnostics:[],history:[],future:[]};
const listeners=new Set<()=>void>();const emit=():void=>{for(const listener of listeners)listener();};
const snapshot=(animation:DetectedAnimation):EditableSnapshot=>({duration:animation.duration,delay:animation.delay,easing:animation.easing,iterations:animation.iterations,direction:animation.direction,fill:animation.fill,keyframes:animation.keyframes?.map(frame=>({...frame}))});
const applySnapshot=(animation:DetectedAnimation,value:EditableSnapshot):DetectedAnimation=>({...animation,duration:value.duration,delay:value.delay,easing:value.easing,iterations:value.iterations,direction:value.direction,fill:value.fill,keyframes:value.keyframes?.map(frame=>({...frame}))});

export const store={
  get:():AnimatorState=>state,
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);},
  touch():void{emit();},
  set(patch:Partial<AnimatorState>):void{state={...state,...patch};emit();},
  updateAnimation(id:string,patch:Partial<DetectedAnimation>,record=true):void{const current=state.animations.find(animation=>animation.id===id);if(!current)return;const updated={...current,...patch};const history=record?[...state.history,{id,before:snapshot(current),after:snapshot(updated)}]:state.history;state={...state,history,future:record?[]:state.future,animations:state.animations.map(animation=>animation.id===id?updated:animation)};emit();},
  addAnimation(animation:DetectedAnimation):void{
    const normalized=correlateSource(animation,state.analysis);
    const index=state.animations.findIndex(item=>item.id===normalized.id);
    const existing=index>=0?state.animations[index]:undefined;
    const shouldSelect=normalized.name==='Created animation'||(!existing&&!!state.selectedElementId&&normalized.elementId===state.selectedElementId&&normalized.startTime>0);
    state={...state,selectedAnimationId:shouldSelect?normalized.id:state.selectedAnimationId??normalized.id,animations:index>=0?state.animations.map(item=>item.id===normalized.id?correlateSource({...item,...normalized,startTime:item.startTime},state.analysis):item):[...state.animations,normalized]};emit();
  },
  addEvent(event:TimelineEvent):void{state={...state,events:[...state.events,event].slice(-1000)};emit();},
  upsertElements(elements:RuntimeElement[]):void{const map=new Map(state.elements.map(element=>[element.id,element]));for(const element of elements)map.set(element.id,element);state={...state,elements:[...map.values()]};emit();},
  undo():void{const command=state.history.at(-1);if(!command)return;state={...state,history:state.history.slice(0,-1),future:[...state.future,command],animations:state.animations.map(animation=>animation.id===command.id?applySnapshot(animation,command.before):animation)};emit();},
  redo():void{const command=state.future.at(-1);if(!command)return;state={...state,future:state.future.slice(0,-1),history:[...state.history,command],animations:state.animations.map(animation=>animation.id===command.id?applySnapshot(animation,command.after):animation)};emit();}
};

function correlateSource(animation:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{if(animation.source||!analysis)return animation;const match=analysis.animations.find(candidate=>{if(animation.name&&candidate.name===animation.name)return true;return candidate.type===animation.type&&candidate.properties.some(property=>animation.properties.some(runtimeProperty=>runtimeProperty.name===property.name));});if(!match?.source)return animation;return{...animation,source:match.source,confidence:animation.confidence==='runtime-observed'?'source-correlated':animation.confidence};}
