import type {MotionTrack} from '../types/motion';
import type {StaticAnalysis} from '../types/domain';

export function requireStaticMotionTracks(analysis:StaticAnalysis):MotionTrack[]{
  if(!Array.isArray(analysis.motionTracks))throw new Error('Static analysis did not return Motion IR');
  return analysis.motionTracks;
}
