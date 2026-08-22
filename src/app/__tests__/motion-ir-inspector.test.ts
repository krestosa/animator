import {describe,expect,it} from 'vitest';
import type {MotionTrack} from '../../core/motion';
import {legacyPatchToMotion,motionTrackPreview,selectMotionTrack} from '../motion-ir-inspector';
const track:MotionTrack={id:'a',target:{elementId:'el'},timing:{start:10,duration:300,delay:20,easing:'linear'},properties:[{name:'opacity'}],keyframes:[{offset:0,values:{opacity:0}},{offset:1,values:{opacity:1}}],trigger:{kind:'unknown'},source:{kind:'waapi',confidence:'runtime-observed'},runtimeState:'running'};
describe('Motion IR inspector',()=>{
 it('selects directly from canonical tracks',()=>expect(selectMotionTrack([track],'a')).toBe(track));
 it('converts legacy UI edits without replacing unrelated timing',()=>{const patch=legacyPatchToMotion({duration:500,easing:'ease-in'});expect(patch).toEqual({timing:{duration:500,easing:'ease-in'}});expect(motionTrackPreview(track,patch)).toMatchObject({duration:500,delay:20,easing:'ease-in'});});
 it('round-trips inspector keyframes through Motion IR',()=>{const patch=legacyPatchToMotion({keyframes:[{offset:0,opacity:0},{offset:.5,easing:'ease-out',opacity:.8},{offset:1,opacity:1}]});expect(patch.keyframes?.[1]).toEqual({offset:.5,easing:'ease-out',values:{opacity:.8}});expect(motionTrackPreview(track,patch).keyframes?.[1]).toEqual({offset:.5,easing:'ease-out',opacity:.8});});
});
