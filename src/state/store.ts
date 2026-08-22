import { detectedAnimationToMotionTrack, detectedAnimationsToMotionTracks, type MotionTrack } from '../core/motion';
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
  motionTracks: MotionTrack[];
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

const MAX_EVENTS=10000;
let state:AnimatorState={project:undefined,analysis:undefined,elements:[],animations:[],motionTracks:[],events:[],selectedElementId:undefined,selectedAnimationId:undefined,picker:false,recording:true,playhead:0,zoom:1,diagnostics:[],history:[],future:[]};
const listeners=new Set<()=>void>();const emit=():void=>{for(const listener of listeners)listener();};
const snapshot=(animation:DetectedAnimation):EditableSnapshot=>({duration:animation.duration,delay:animation.delay,easing:animation.easing,iterations:animation.iterations,direction:animation.direction,fill:animation.fill,keyframes:animation.keyframes?.map(frame=>({...frame}))});
const applySnapshot=(animation:DetectedAnimation,value:EditableSnapshot):DetectedAnimation=>({...animation,duration:value.duration,delay:value.delay,easing:value.easing,iterations:value.iterations,direction:value.direction,fill:value.fill,keyframes:value.keyframes?.map(frame=>({...frame}))});
const sameSnapshot=(a:EditableSnapshot,b:EditableSnapshot):boolean=>a.duration===b.duration&&a.delay===b.delay&&a.easing===b.easing&&a.iterations===b.iterations&&a.direction===b.direction&&a.fill===b.fill&&JSON.stringify(a.keyframes)===JSON.stringify(b.keyframes);
const projectContext=(project:ProjectDescriptor|undefined):string=>project?`${project.id}:${project.selectedEntry}`:'';
const syncTracks=(animations:DetectedAnimation[]):MotionTrack[]=>detectedAnimationsToMotionTracks(animations);

export const store={
  get:():AnimatorState=>state,
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);},
  touch():void{emit();},
  set(patch:Partial<AnimatorState>):void{
    const projectChanged=Object.prototype.hasOwnProperty.call(patch,'project')&&projectContext(patch.project)!==projectContext(state.project);
    const animations=Object.prototype.hasOwnProperty.call(patch,'animations')?(patch.animations??[]):state.animations;
    state={...state,...patch,...(Object.prototype.hasOwnProperty.call(patch,'animations')?{motionTracks:syncTracks(animations)}:{}),...(projectChanged?{history:[],future:[]}:{})};emit();
  },
  updateAnimation(id:string,patch:Partial<DetectedAnimation>,record=true):void{
    const current=state.animations.find(animation=>animation.id===id);if(!current)return;
    const updated={...current,...patch},before=snapshot(current),after=snapshot(updated),editableChanged=!sameSnapshot(before,after),recordEdit=record&&editableChanged;
    const history=recordEdit?[...state.history,{id,before,after}]:state.history;
    const animations=state.animations.map(animation=>animation.id===id?updated:animation);
    state={...state,history,future:recordEdit?[]:state.future,animations,motionTracks:state.motionTracks.map(track=>track.id===id?detectedAnimationToMotionTrack(updated):track)};emit();
  },
  addAnimation(animation:DetectedAnimation):void{
    const normalized=correlateSource(animation,state.analysis);
    const index=state.animations.findIndex(item=>item.id===normalized.id);
    const shouldSelect=normalized.name==='Created animation';
    const fallbackSelection=state.selectedAnimationId??(state.animations.length===0?normalized.id:undefined);
    const animations=index>=0?state.animations.map(item=>item.id===normalized.id?mergeRuntimeReport(item,normalized,state.analysis):item):[...state.animations,normalized];
    state={...state,selectedAnimationId:shouldSelect?normalized.id:fallbackSelection,animations,motionTracks:syncTracks(animations)};emit();
  },
  addEvent(event:TimelineEvent):void{state={...state,events:[...state.events,event].slice(-MAX_EVENTS)};emit();},
  addEvents(events:TimelineEvent[]):void{if(!events.length)return;state={...state,events:[...state.events,...events].slice(-MAX_EVENTS)};emit();},
  upsertElements(elements:RuntimeElement[]):void{const map=new Map(state.elements.map(element=>[element.id,element]));for(const element of elements)map.set(element.id,element);state={...state,elements:[...map.values()]};emit();},
  undo():void{const command=state.history.at(-1);if(!command)return;const animations=state.animations.map(animation=>animation.id===command.id?applySnapshot(animation,command.before):animation);state={...state,history:state.history.slice(0,-1),future:[...state.future,command],animations,motionTracks:syncTracks(animations)};emit();},
  redo():void{const command=state.future.at(-1);if(!command)return;const animations=state.animations.map(animation=>animation.id===command.id?applySnapshot(animation,command.after):animation);state={...state,future:state.future.slice(0,-1),history:[...state.history,command],animations,motionTracks:syncTracks(animations)};emit();}
};

function mergeRuntimeReport(existing:DetectedAnimation,incoming:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{
  const merged:DetectedAnimation={
    ...existing,
    ...incoming,
    startTime:existing.startTime,
    duration:incoming.duration??existing.duration,
    delay:incoming.delay??existing.delay,
    easing:incoming.easing??existing.easing,
    iterations:incoming.iterations??existing.iterations,
    direction:incoming.direction??existing.direction,
    fill:incoming.fill??existing.fill,
    keyframes:incoming.keyframes??existing.keyframes,
    source:incoming.source??existing.source,
    properties:incoming.properties.length?incoming.properties:existing.properties
  };
  return correlateSource(merged,analysis);
}
function correlateSource(animation:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{if(animation.source||!analysis)return animation;const match=analysis.animations.find(candidate=>{if(animation.name&&candidate.name===animation.name)return true;return candidate.type===animation.type&&candidate.properties.some(property=>animation.properties.some(runtimeProperty=>runtimeProperty.name===property.name));});if(!match?.source)return animation;return{...animation,source:match.source,confidence:animation.confidence==='runtime-observed'?'source-correlated':animation.confidence};}