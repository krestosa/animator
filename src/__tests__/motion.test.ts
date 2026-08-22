import {describe,expect,it} from 'vitest';
import {addMotionKeyframe,detectedAnimationToMotionTrack,duplicateMotionKeyframe,filterMotionTracks,motionPerformanceIssues,normalizedMotionKeyframes,overviewMotionTracks} from '../core/motion';
import {buildTransform,parseBezier,parseTransform} from '../editor/motion';
import type {DetectedAnimation} from '../types/domain';

const animation:DetectedAnimation={id:'a',elementId:'e',type:'css-animation',name:'fade',startTime:0,duration:300,easing:'cubic-bezier(.2,.8,.2,1)',properties:[{name:'width',values:['10px','20px']}],confidence:'exact',runtimeState:'running',keyframes:[{offset:0,opacity:0},{offset:1,opacity:1}]};
const track=detectedAnimationToMotionTrack(animation);

describe('motion editor utilities',()=>{
  it('filters and summarizes animations',()=>{expect(overviewMotionTracks([track]).cssAnimations).toBe(1);expect(filterMotionTracks([track],'fade','running')).toHaveLength(1);expect(filterMotionTracks([track],'opacity','css')).toHaveLength(0);});
  it('edits normalized keyframes',()=>{const frames=normalizedMotionKeyframes(track);expect(frames[0]?.offset).toBe(0);expect(addMotionKeyframe(frames)).toHaveLength(3);});
  it('places a duplicate of the final keyframe before the endpoint',()=>{const frames=[{offset:0,values:{opacity:0}},{offset:.4,values:{opacity:.5}},{offset:1,values:{opacity:1}}];const duplicated=duplicateMotionKeyframe(frames,2);expect(duplicated).toHaveLength(4);expect(duplicated[3]?.offset).toBe(.7);expect(duplicated[3]?.values.opacity).toBe(1);});
  it('parses easing and transforms',()=>{expect(parseBezier('cubic-bezier(.2,.8,.2,1)')).toEqual([.2,.8,.2,1]);const parsed=parseTransform('translateX(12px) scale(1.2) rotate(15deg)');expect(parsed.translateX).toBe(12);expect(parsed.scaleX).toBe(1.2);expect(buildTransform(parsed)).toContain('rotate(15deg)');});
  it('preserves zero axis scales',()=>{const parsed=parseTransform('scaleX(0) scaleY(0)');expect(parsed.scaleX).toBe(0);expect(parsed.scaleY).toBe(0);expect(buildTransform(parsed)).toContain('scaleX(0) scaleY(0)');});
  it('flags layout-sensitive properties',()=>{expect(motionPerformanceIssues([track])[0]?.severity).toBe('warn');});
});
