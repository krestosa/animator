import { detectedAnimationsToMotionTracks,type MotionKeyframe,type MotionTrack } from '../core/motion';
import type { DetectedAnimation } from '../types/domain';

export type MotionState={motionTracks:MotionTrack[];selectedAnimationId:string|undefined};
export type MotionTrackPatch={timing?:Partial<MotionTrack['timing']>;keyframes?:MotionKeyframe[];properties?:MotionTrack['properties'];name?:string;runtimeState?:MotionTrack['runtimeState'];trigger?:MotionTrack['trigger'];metadata?:Record<string,unknown>};
export const emptyMotionState=():MotionState=>({motionTracks:[],selectedAnimationId:undefined});
export const ingestDetectedAnimations=(animations:DetectedAnimation[]):MotionTrack[]=>detectedAnimationsToMotionTracks(animations);
export const replaceMotionTracks=(state:MotionState,motionTracks:MotionTrack[]):MotionState=>({motionTracks,selectedAnimationId:state.selectedAnimationId});
export const patchMotionTrack=(track:MotionTrack,patch:MotionTrackPatch):MotionTrack=>({...track,...(patch.name!==undefined?{name:patch.name}:{}),...(patch.runtimeState!==undefined?{runtimeState:patch.runtimeState}:{}),...(patch.trigger!==undefined?{trigger:patch.trigger}:{}),...(patch.metadata!==undefined?{metadata:patch.metadata}:{}),timing:patch.timing?{...track.timing,...patch.timing}:track.timing,keyframes:patch.keyframes??track.keyframes,properties:patch.properties??track.properties});
export const updateMotionTrack=(state:MotionState,id:string,track:MotionTrack):MotionState=>({motionTracks:state.motionTracks.map(item=>item.id===id?track:item),selectedAnimationId:state.selectedAnimationId});
export const patchMotionTrackState=(state:MotionState,id:string,patch:MotionTrackPatch):MotionState=>({motionTracks:state.motionTracks.map(item=>item.id===id?patchMotionTrack(item,patch):item),selectedAnimationId:state.selectedAnimationId});
