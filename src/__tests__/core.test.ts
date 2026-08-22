import { describe,expect,it } from 'vitest';
import type { MotionTrack } from '../core/motion';
import { generateMotionCss,generateMotionTs } from '../exporters/generate';
import { timelineDuration,timeToPercent } from '../utils/timeline';
const track:MotionTrack={id:'a',target:{elementId:'e'},timing:{start:100,duration:500,easing:'ease-out'},properties:[],keyframes:[{values:{opacity:0}},{values:{opacity:1}}],trigger:{kind:'unknown'},source:{kind:'waapi',confidence:'runtime-observed'},runtimeState:'running'};
describe('timeline',()=>{it('calculates extent and percentages',()=>{expect(timelineDuration([track],[])).toBe(1000);expect(timeToPercent(500,1000)).toBe(50);});});
describe('export',()=>{it('generates CSS and TS',()=>{expect(generateMotionCss(track)).toContain('@keyframes');expect(generateMotionTs(track)).toContain('element.animate');});});
