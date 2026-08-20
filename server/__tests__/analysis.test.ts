import { describe,expect,it } from 'vitest';
import path from 'node:path';
import { analyzeProject } from '../analysis.js';
const root=path.resolve('fixture');
describe('analysis',()=>{it('finds CSS and JS motion',()=>{const result=analyzeProject({id:'fixture',root,entries:['index.html'],selectedEntry:'index.html',tree:[]});expect(result.animations.length).toBeGreaterThan(0);expect(result.transitions.length).toBeGreaterThan(0);expect(result.candidates.some(x=>x.kind==='waapi')).toBe(true);expect(result.candidates.some(x=>x.kind==='raf')).toBe(true);expect(result.reducedMotion).toBe(true);});});
