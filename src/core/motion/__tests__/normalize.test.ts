import { describe, expect, it } from 'vitest';
import type { DetectedAnimation } from '../../../types/domain';
import { detectedAnimationToMotionTrack,motionTrackToDetectedAnimation } from '../normalize';

const sample:DetectedAnimation={id:'a1',elementId:'el1',type:'web-animation',name:'fade',startTime:120,duration:300,delay:40,iterations:2,direction:'alternate',easing:'ease-in-out',fill:'both',confidence:'runtime-observed',runtimeState:'running',properties:[{name:'opacity',from:'0',to:'1'}],source:{file:'src/a.css',line:10,selector:'.card'},keyframes:[{offset:0,opacity:'0',easing:'linear'},{offset:1,opacity:'1'}]};

describe('motion IR normalization',()=>{
  it('preserves legacy animation semantics and adds property metadata',()=>{const track=detectedAnimationToMotionTrack(sample);expect(track.id).toBe(sample.id);expect(track.target).toEqual({elementId:'el1',selector:'.card'});expect(track.source.kind).toBe('waapi');expect(track.source.reference).toEqual(sample.source);expect(track.source.confidence).toBe(sample.confidence);expect(track.runtimeState).toBe(sample.runtimeState);expect(track.timing).toEqual({start:120,duration:300,delay:40,iterations:2,direction:'alternate',easing:'ease-in-out',fill:'both'});expect(track.properties).toEqual([{name:'opacity',from:'0',to:'1',valueKind:'number',interpolable:true}]);expect(track.keyframes).toEqual([{offset:0,easing:'linear',values:{opacity:'0'}},{offset:1,values:{opacity:'1'}}]);});
  it('round trips through canonical MotionTrack without semantic loss',()=>{expect(motionTrackToDetectedAnimation(detectedAnimationToMotionTrack(sample))).toEqual(sample);});
  it('does not mutate the legacy object',()=>{const before=JSON.stringify(sample);detectedAnimationToMotionTrack(sample);expect(JSON.stringify(sample)).toBe(before);});
});