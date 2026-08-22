import {describe,expect,it} from 'vitest';
import {addMotionKeyframe,createMotionProperty,duplicateMotionKeyframe,filterMotionTracks,motionPerformanceIssues,normalizedMotionKeyframes,overviewMotionTracks,type MotionTrack} from '../core/motion';
import {buildTransform,parseBezier,parseTransform} from '../editor/motion';

const track:MotionTrack={id:'a',name:'fade',target:{elementId:'e'},timing:{start:0,duration:300,easing:'cubic-bezier(.2,.8,.2,1)'},properties:[createMotionProperty('width',{values:['10px','20px']})],keyframes:[{offset:0,values:{opacity:0}},{offset:1,values:{opacity:1}}],trigger:{kind:'auto'},source:{kind:'css-animation',confidence:'exact'},runtimeState:'running'};

describe('motion editor utilities',()=>{
  it('filters and summarizes animations',()=>{expect(overviewMotionTracks([track]).cssAnimations).toBe(1);expect(filterMotionTracks([track],'fade','running')).toHaveLength(1);expect(filterMotionTracks([track],'opacity','css')).toHaveLength(0);});
  it('edits normalized keyframes',()=>{const frames=normalizedMotionKeyframes(track);expect(frames[0]?.offset).toBe(0);expect(addMotionKeyframe(frames)).toHaveLength(3);});
  it('places a duplicate of the final keyframe before the endpoint',()=>{const frames=[{offset:0,values:{opacity:0}},{offset:.4,values:{opacity:.5}},{offset:1,values:{opacity:1}}];const duplicated=duplicateMotionKeyframe(frames,2);expect(duplicated).toHaveLength(4);expect(duplicated[2]?.offset).toBe(.7);expect(duplicated[2]?.values.opacity).toBe(1);expect(duplicated[3]?.offset).toBe(1);});
  it('parses easing and transforms',()=>{expect(parseBezier('cubic-bezier(.2,.8,.2,1)')).toEqual([.2,.8,.2,1]);const parsed=parseTransform('translateX(12px) scale(1.2) rotate(15deg)');expect(parsed.translateX).toBe(12);expect(parsed.scaleX).toBe(1.2);expect(buildTransform(parsed)).toContain('rotate(15deg)');});
  it('preserves zero axis scales',()=>{const parsed=parseTransform('scaleX(0) scaleY(0)');expect(parsed.scaleX).toBe(0);expect(parsed.scaleY).toBe(0);expect(buildTransform(parsed)).toContain('scaleX(0) scaleY(0)');});
  it('flags layout-sensitive properties',()=>{expect(motionPerformanceIssues([track])[0]?.severity).toBe('warn');});
});
