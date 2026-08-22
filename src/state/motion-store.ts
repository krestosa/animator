import { detectedAnimationToMotionTrack,detectedAnimationsToMotionTracks,type MotionTrack } from '../core/motion';
import type { DetectedAnimation } from '../types/domain';

export type MotionState={animations:DetectedAnimation[];motionTracks:MotionTrack[];selectedAnimationId:string|undefined};
export const emptyMotionState=():MotionState=>({animations:[],motionTracks:[],selectedAnimationId:undefined});
export const syncMotionTracks=(animations:DetectedAnimation[]):MotionTrack[]=>detectedAnimationsToMotionTracks(animations);
export const replaceMotionAnimations=(state:MotionState,animations:DetectedAnimation[]):MotionState=>({...state,animations,motionTracks:syncMotionTracks(animations)});
export const updateMotionAnimation=(state:MotionState,id:string,animation:DetectedAnimation):MotionState=>({...state,animations:state.animations.map(item=>item.id===id?animation:item),motionTracks:state.motionTracks.map(track=>track.id===id?detectedAnimationToMotionTrack(animation):track)});
