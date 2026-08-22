import type { MotionTrack } from '../core/motion';
import type { DetectedAnimation,ProjectDescriptor,RuntimeElement,StaticAnalysis,TimelineEvent } from '../types/domain';
import { emptyEditorState,mergeElements,projectContext,type EditorState } from './editor-store';
import { applyAnimationSnapshot,emptyHistory,recordHistory,redoHistory,sameSnapshot,snapshotAnimation,undoHistory,type HistoryEntry,type HistoryState } from './history-store';
import { emptyMotionState,replaceMotionAnimations,syncMotionTracks,updateMotionAnimation,type MotionState } from './motion-store';
import { appendRecordedEvents,emptyRecordingState,type RecordingState } from './recording-store';

export type AnimatorState=EditorState&MotionState&RecordingState&HistoryState;

let state:AnimatorState={...emptyEditorState(),...emptyMotionState(),...emptyRecordingState(),...emptyHistory()};
const listeners=new Set<()=>void>();
const emit=():void=>{for(const listener of listeners)listener();};

export const store={
  get:():AnimatorState=>state,
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);},
  touch():void{emit();},
  set(patch:Partial<AnimatorState>):void{
    const projectChanged=Object.prototype.hasOwnProperty.call(patch,'project')&&projectContext(patch.project)!==projectContext(state.project);
    const animationsChanged=Object.prototype.hasOwnProperty.call(patch,'animations');
    const animations=animationsChanged?(patch.animations??[]):state.animations;
    state={...state,...patch,...(animationsChanged?{motionTracks:syncMotionTracks(animations)}:{}),...(projectChanged?emptyHistory():{})};emit();
  },
  updateAnimation(id:string,patch:Partial<DetectedAnimation>,record=true):void{
    const current=state.animations.find(animation=>animation.id===id);if(!current)return;
    const updated={...current,...patch},before=snapshotAnimation(current),after=snapshotAnimation(updated),recordEdit=record&&!sameSnapshot(before,after);
    const history=recordEdit?recordHistory(state,{id,before,after}):{history:state.history,future:state.future};
    state={...state,...history,...updateMotionAnimation(state,id,updated)};emit();
  },
  addAnimation(animation:DetectedAnimation):void{
    const normalized=correlateSource(animation,state.analysis),index=state.animations.findIndex(item=>item.id===normalized.id),shouldSelect=normalized.name==='Created animation',fallbackSelection=state.selectedAnimationId??(state.animations.length===0?normalized.id:undefined);
    const animations=index>=0?state.animations.map(item=>item.id===normalized.id?mergeRuntimeReport(item,normalized,state.analysis):item):[...state.animations,normalized];
    state={...state,...replaceMotionAnimations(state,animations),selectedAnimationId:shouldSelect?normalized.id:fallbackSelection};emit();
  },
  addEvent(event:TimelineEvent):void{state={...state,events:appendRecordedEvents(state.events,[event])};emit();},
  addEvents(events:TimelineEvent[]):void{const next=appendRecordedEvents(state.events,events);if(next===state.events)return;state={...state,events:next};emit();},
  upsertElements(elements:RuntimeElement[]):void{state={...state,elements:mergeElements(state.elements,elements)};emit();},
  undo():void{const result=undoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'before');emit();},
  redo():void{const result=redoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'after');emit();}
};

function applyHistory(entry:HistoryEntry,history:HistoryState,direction:'before'|'after'):AnimatorState{const animations=state.animations.map(animation=>animation.id===entry.id?applyAnimationSnapshot(animation,entry[direction]):animation);return{...state,...history,...replaceMotionAnimations(state,animations)};}
function mergeRuntimeReport(existing:DetectedAnimation,incoming:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{const merged:DetectedAnimation={...existing,...incoming,startTime:existing.startTime,duration:incoming.duration??existing.duration,delay:incoming.delay??existing.delay,easing:incoming.easing??existing.easing,iterations:incoming.iterations??existing.iterations,direction:incoming.direction??existing.direction,fill:incoming.fill??existing.fill,keyframes:incoming.keyframes??existing.keyframes,source:incoming.source??existing.source,properties:incoming.properties.length?incoming.properties:existing.properties};return correlateSource(merged,analysis);}
function correlateSource(animation:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{if(animation.source||!analysis)return animation;const match=analysis.animations.find(candidate=>{if(animation.name&&candidate.name===animation.name)return true;return candidate.type===animation.type&&candidate.properties.some(property=>animation.properties.some(runtimeProperty=>runtimeProperty.name===property.name));});if(!match?.source)return animation;return{...animation,source:match.source,confidence:animation.confidence==='runtime-observed'?'source-correlated':animation.confidence};}

export type { MotionTrack,ProjectDescriptor,StaticAnalysis };
