import { detectedAnimationToMotionTrack,detectedAnimationsToMotionTracks,motionTracksToDetectedAnimations,type MotionTrack } from '../core/motion';
import type { DetectedAnimation } from '../types/domain';

export type MotionState={motionTracks:MotionTrack[];selectedAnimationId:string|undefined};
export const emptyMotionState=():MotionState=>({motionTracks:[],selectedAnimationId:undefined});
export const ingestDetectedAnimations=(animations:DetectedAnimation[]):MotionTrack[]=>detectedAnimationsToMotionTracks(animations);
export const legacyAnimations=(state:MotionState):DetectedAnimation[]=>motionTracksToDetectedAnimations(state.motionTracks);
export const replaceMotionTracks=(state:MotionState,motionTracks:MotionTrack[]):MotionState=>({motionTracks,selectedAnimationId:state.selectedAnimationId});
export const replaceDetectedAnimations=(state:MotionState,animations:DetectedAnimation[]):MotionState=>replaceMotionTracks(state,ingestDetectedAnimations(animations));
export const updateMotionTrack=(state:MotionState,id:string,track:MotionTrack):MotionState=>({motionTracks:state.motionTracks.map(item=>item.id===id?track:item),selectedAnimationId:state.selectedAnimationId});
export const updateDetectedAnimation=(state:MotionState,id:string,animation:DetectedAnimation):MotionState=>updateMotionTrack(state,id,detectedAnimationToMotionTrack(animation));
