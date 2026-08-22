import type {MotionTrack} from '../core/motion';
import type {ProjectDescriptor,RuntimeElement,StaticAnalysis,TimelineEvent} from '../types/domain';
import {emptyEditorState,mergeElements,projectContext,type EditorState} from './editor-store';
import {applyMotionCommand,commandForTrackChange,emptyHistory,recordHistory,redoHistory,undoHistory,type HistoryEntry,type HistoryState} from './history-store';
import {emptyMotionState,patchMotionTrack,updateMotionTrack,type MotionState,type MotionTrackPatch} from './motion-store';
import {emptyRecordingState,replaceRecordedEvents,type RecordingQuery,type RecordingState} from './recording-store';

type CanonicalAnimatorState=EditorState&MotionState&RecordingState&HistoryState;
export type AnimatorState=CanonicalAnimatorState&{readonly events:TimelineEvent[]};
type StorePatch=Partial<AnimatorState>;

let state:CanonicalAnimatorState={...emptyEditorState(),...emptyMotionState(),...emptyRecordingState(),...emptyHistory()};
let eventDatasetRef=state.recordingDataset,eventVersion=-1,eventCache:TimelineEvent[]=[];
const listeners=new Set<()=>void>();
const emit=():void=>{for(const listener of listeners)listener();};
const stateView=():AnimatorState=>{
  if(eventDatasetRef!==state.recordingDataset||eventVersion!==state.recordingDataset.version){eventDatasetRef=state.recordingDataset;eventVersion=state.recordingDataset.version;eventCache=state.recordingDataset.snapshot();}
  return{...state,events:eventCache};
};

export const store={
  get:():AnimatorState=>stateView(),
  subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>listeners.delete(listener);},
  touch():void{emit();},
  set(patch:StorePatch):void{
    const projectChanged=Object.prototype.hasOwnProperty.call(patch,'project')&&projectContext(patch.project)!==projectContext(state.project);
    const {events,...canonicalPatch}=patch;
    const recordingPatch=events!==undefined?replaceRecordedEvents(state,events):{};
    state={...state,...canonicalPatch,...recordingPatch,...(projectChanged?emptyHistory():{})};emit();
  },
  getMotionTrack(id:string|undefined):MotionTrack|undefined{return id?state.motionTracks.find(track=>track.id===id):undefined;},
  updateMotionTrack(id:string,patch:MotionTrackPatch,record=true):void{
    const current=state.motionTracks.find(track=>track.id===id);if(!current)return;
    const updated=patchMotionTrack(current,patch),command=record?commandForTrackChange(current,updated):undefined,history=command?recordHistory(state,command):{history:state.history,future:state.future};
    state={...state,...history,...updateMotionTrack(state,id,updated)};emit();
  },
  addMotionTrack(track:MotionTrack):void{ingestMotionTrack(track);},
  addEvent(event:TimelineEvent):void{if(state.recordingDataset.append([event]))emit();},
  addEvents(events:TimelineEvent[]):void{if(state.recordingDataset.append(events))emit();},
  queryEvents(query:RecordingQuery={}):TimelineEvent[]{return state.recordingDataset.query(query);},
  recordingStats(){return state.recordingDataset.stats();},
  upsertElements(elements:RuntimeElement[]):void{state={...state,elements:mergeElements(state.elements,elements)};emit();},
  undo():void{const result=undoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'reverse');emit();},
  redo():void{const result=redoHistory(state);if(!result.entry)return;state=applyHistory(result.entry,result.state,'forward');emit();}
};

function ingestMotionTrack(track:MotionTrack):void{
  const normalized=correlateMotionSource(track,state.analysis),index=state.motionTracks.findIndex(item=>item.id===normalized.id),shouldSelect=normalized.name==='Created animation',fallbackSelection=state.selectedAnimationId??(state.motionTracks.length===0?normalized.id:undefined);
  const next=index>=0?state.motionTracks.map(item=>item.id===normalized.id?mergeMotionTrack(item,normalized,state.analysis):item):[...state.motionTracks,normalized];
  state={...state,motionTracks:next,selectedAnimationId:shouldSelect?normalized.id:fallbackSelection};emit();
}
function applyHistory(entry:HistoryEntry,history:HistoryState,direction:'forward'|'reverse'):CanonicalAnimatorState{return{...state,...history,motionTracks:state.motionTracks.map(track=>track.id===entry.trackId?applyMotionCommand(track,entry,direction):track)};}
function mergeMotionTrack(existing:MotionTrack,incoming:MotionTrack,analysis:StaticAnalysis|undefined):MotionTrack{
  const correlated=correlateMotionSource(incoming,analysis),reference=correlated.source.reference??existing.source.reference;
  return{...existing,...correlated,target:{...existing.target,...correlated.target},timing:{...existing.timing,...correlated.timing,start:existing.timing.start},properties:correlated.properties.length?correlated.properties:existing.properties,keyframes:correlated.keyframes.length?correlated.keyframes:existing.keyframes,source:{...existing.source,...correlated.source,...(reference?{reference}:{})}};
}
function correlateMotionSource(track:MotionTrack,analysis:StaticAnalysis|undefined):MotionTrack{
  if(track.source.reference||!analysis)return track;const match=analysis.motionTracks.find(candidate=>{if(track.name&&candidate.name===track.name)return true;return candidate.source.kind===track.source.kind&&candidate.properties.some(property=>track.properties.some(runtimeProperty=>runtimeProperty.name===property.name));});if(!match?.source.reference)return track;
  return{...track,target:{...track.target,...(match.target.selector?{selector:match.target.selector}:{})},source:{...track.source,reference:match.source.reference,confidence:track.source.confidence==='runtime-observed'?'source-correlated':track.source.confidence}};
}

export type{MotionTrack,MotionTrackPatch,ProjectDescriptor,StaticAnalysis};
