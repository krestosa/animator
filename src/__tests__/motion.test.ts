import { describe, expect, it } from 'vitest';
import { addKeyframe, buildTransform, filterAnimations, normalizedKeyframes, overview, parseBezier, parseTransform, performanceIssues } from '../editor/motion';
import type { DetectedAnimation } from '../types/domain';

const animation:DetectedAnimation={id:'a',elementId:'e',type:'css-animation',name:'fade',startTime:0,duration:300,easing:'cubic-bezier(.2,.8,.2,1)',properties:[{name:'width',values:['10px','20px']}],confidence:'exact',runtimeState:'running',keyframes:[{offset:0,opacity:0},{offset:1,opacity:1}]};

describe('motion editor utilities',()=>{
  it('filters and summarizes animations',()=>{expect(overview([animation]).cssAnimations).toBe(1);expect(filterAnimations([animation],'fade','running')).toHaveLength(1);expect(filterAnimations([animation],'opacity','css')).toHaveLength(0);});
  it('edits normalized keyframes',()=>{const frames=normalizedKeyframes(animation);expect(frames[0]?.offset).toBe(0);expect(addKeyframe(frames)).toHaveLength(3);});
  it('parses easing and transforms',()=>{expect(parseBezier('cubic-bezier(.2,.8,.2,1)')).toEqual([.2,.8,.2,1]);const parsed=parseTransform('translateX(12px) scale(1.2) rotate(15deg)');expect(parsed.translateX).toBe(12);expect(parsed.scaleX).toBe(1.2);expect(buildTransform(parsed)).toContain('rotate(15deg)');});
  it('flags layout-sensitive properties',()=>{expect(performanceIssues([animation])[0]?.severity).toBe('warn');});
});
