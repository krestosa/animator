import { describe,expect,it } from 'vitest';
import { timelineDuration,timeToPercent } from '../utils/timeline';
import { generateCss,generateTs } from '../exporters/generate';
import type { DetectedAnimation } from '../types/domain';
const animation:DetectedAnimation={id:'a',elementId:'e',type:'web-animation',startTime:100,duration:500,easing:'ease-out',properties:[],confidence:'runtime-observed',runtimeState:'running',keyframes:[{opacity:0},{opacity:1}]};
describe('timeline',()=>{it('calculates extent and percentages',()=>{expect(timelineDuration([animation],[])).toBe(1000);expect(timeToPercent(500,1000)).toBe(50);});});
describe('export',()=>{it('generates CSS and TS',()=>{expect(generateCss(animation)).toContain('@keyframes');expect(generateTs(animation)).toContain('element.animate');});});
