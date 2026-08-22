import { detectedAnimationToMotionTrack,motionTrackToDetectedAnimation,type MotionTrack } from '../core/motion';
import type { DetectedAnimation,ProjectDescriptor,RuntimeElement,StaticAnalysis,TimelineEvent } from '../types/domain';
import { emptyEditorState,mergeElements,projectContext,type EditorState } from './editor-store';
import { applyTrackSnapshot,emptyHistory,recordHistory,redoHistory,sameSnapshot,snapshotTrack,undoHistory,type HistoryEntry,type HistoryState } from './history-store';
import { emptyMotionState,ingestDetectedAnimations,legacyAnimations,replaceDetectedAnimations,updateDetectedAnimation,type MotionState } from './motion-store';
import { emptyRecordingState,replaceRecordedEvents,type RecordingQuery,type RecordingState } from './recording-store';

type CanonicalAnimatorState=EditorState&MotionState&RecordingState&HistoryState;
export type AnimatorState=CanonicalAnimatorState&{readonly animations:DetectedAnimation[];readonly events:TimelineEvent[]};

let state:CanonicalAnimatorState={...emptyEditorState(),...emptyMotionState(),...emptyRecordingState(),...emptyHistory()};
let legacyTrackRef:MotionTrack[]|undefined,legacyCache:DetectedAnimation[]=[];
let eventDatasetRef=state.recordingDataset,eventVersion=-1,eventCache:TimelineEvent[]=[];
const listeners=new Set<()=>void>();
const emit=():void=>{for(const listener of listeners)listener();};
const compatibilityView=():AnimatorState=>{
  if(legacyTrackRef!==state.motionTracks){legacyTrackRef=state.motionTracks;legacyCache=legacyAnimations(state);}
  if(eventDatasetRef!==state.recordingDataset||eventVersion!==state.recordingDataset.version){eventDatasetRef=state.recordingDataset;eventVersion=state.recordingDataset.version;eventCache=state.recordingDataset.snapshot();}
  return{...state,animations:legacyCache,events:eventCache};
};

export const store={
  get:():AnimatorState=>compatibilityView(),
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);},
  touch():void{emit();},
  set(patch:Partial<AnimatorState>):void{
    const projectChanged=Object.prototype.hasOwnProperty.call(patch,'project')&&projectContext(patch.project)!==projectContext(state.project);
    const {animations,events,...canonicalPatch}=patch;
    const motionPatch=animations!==undefined?{motionTracks:ingestDetectedAnimations(animations)}:{};
    const recordingPatch=events!==undefined?replaceRecordedEvents(state,events):{};
    state={...state,...canonicalPatch,...motionPatch,...recordingPatch,...(projectChanged?emptyHistory():{})};emit();
  },
  updateAnimation(id:string,patch:Partial<DetectedAnimation>,record=true):void{
    const currentTrack=state.motionTracks.find(track=>track.id===id);if(!currentTrack)return;
    const current=motionTrackToDetectedAnimation(currentTrack),updated={...current,...patch},updatedTrack=detectedAnimationToMotionTrack(updated),before=snapshotTrack(currentTrack),after=snapshotTrack(updatedTrack),recordEdit=record&&!sameSnapshot(before,after);
    const history=recordEdit?recordHistory(state,{id,before,after}):{history:state.history,future:state.future};
    state={...state,...history,...updateDetectedAnimation(state,id,updated)};emit();
  },
  addAnimation(animation:DetectedAnimation):void{
    const normalized=correlateSource(animation,state.analysis),animations=legacyAnimations(state),index=animations.findIndex(item=>item.id===normalized.id),shouldSelect=normalized.name==='Created animation',fallbackSelection=state.selectedAnimationId??(animations.length===0?normalized.id:undefined);
    const next=index>=0?animations.map(item=>item.id===normalized.id?mergeRuntimeReport(item,normalized,state.analysis):item):[...animations,normalized];
    state={...state,...replaceDetectedAnimations(state,next),selectedAnimationId:shouldSelect?normalized.id:fallbackSelection};emit();
  },
  addEvent(event:TimelineEvent):void{if(state.recordingDataset.append([event]))emit();},
  addEvents(events:TimelineEvent[]):void{if(state.recordingDataset.append(events))emit();},
  queryEvents(query:RecordingQuery={}):TimelineEvent[]{return state.recordingDataset.query(query);},
  recordingStats(){return state.recordingDataset.stats();},
  upsertElements(elements:RuntimeElement[]):void{state={...state,elements:mergeElements(state.elements,elements)};emit();},
  undo():void{const result=undoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'before');emit();},
  redo():void{const result=redoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'after');emit();}
};

function applyHistory(entry:HistoryEntry,history:HistoryState,direction:'before'|'after'):CanonicalAnimatorState{return{...state,...history,motionTracks:state.motionTracks.map(track=>track.id===entry.id?applyTrackSnapshot(track,entry[direction]):track)};}
function mergeRuntimeReport(existing:DetectedAnimation,incoming:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{const merged:DetectedAnimation={...existing,...incoming,startTime:existing.startTime,duration:incoming.duration??existing.duration,delay:incoming.delay??existing.delay,easing:incoming.easing??existing.easing,iterations:incoming.iterations??existing.iterations,direction:incoming.direction??existing.direction,fill:incoming.fill??existing.fill,keyframes:incoming.keyframes??existing.keyframes,source:incoming.source??existing.source,properties:incoming.properties.length?incoming.properties:existing.properties};return correlateSource(merged,analysis);}
function correlateSource(animation:DetectedAnimation,analysis:StaticAnalysis|undefined):DetectedAnimation{if(animation.source||!analysis)return animation;const match=analysis.animations.find(candidate=>{if(animation.name&&candidate.name===animation.name)return true;return candidate.type===animation.type&&candidate.properties.some(property=>animation.properties.some(runtimeProperty=>runtimeProperty.name===property.name));});if(!match?.source)return animation;return{...animation,source:match.source,confidence:animation.confidence==='runtime-observed'?'source-correlated':animation.confidence};}

export type { MotionTrack,ProjectDescriptor,StaticAnalysis };
