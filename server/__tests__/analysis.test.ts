import { afterEach, describe,expect,it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeProject } from '../analysis.js';

const root=path.resolve('fixture');
const temporary:string[]=[];
afterEach(()=>{for(const dir of temporary.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe('analysis',()=>{
  it('finds CSS and JS motion',()=>{const result=analyzeProject({id:'fixture',root,entries:['index.html'],selectedEntry:'index.html',tree:[]});expect(result.motionTracks.length).toBeGreaterThan(0);expect(result.transitions.length).toBeGreaterThan(0);expect(result.candidates.some(x=>x.kind==='waapi')).toBe(true);expect(result.candidates.some(x=>x.kind==='raf')).toBe(true);expect(result.reducedMotion).toBe(true);});
  it('resolves multiple animations across files and media context',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'animator-analysis-'));temporary.push(dir);
    fs.writeFileSync(path.join(dir,'a.css'),'@media (max-width: 700px){.box{animation: fade 200ms ease, slide 0.5s 100ms linear;transition: opacity 120ms ease, transform 240ms linear}}');
    fs.writeFileSync(path.join(dir,'b.css'),'@keyframes fade{from{opacity:0}to{opacity:1}}@keyframes slide{from{transform:translateX(10px)}to{transform:translateX(0)}}');
    fs.writeFileSync(path.join(dir,'main.ts'),"const run=()=>el.animate([{opacity:0},{opacity:1}],{duration:300}); requestAnimationFrame(()=>run());");
    const result=analyzeProject({id:'x',root:dir,entries:[],selectedEntry:'',tree:[]}),css=result.motionTracks.filter(track=>track.source.kind==='css-animation');
    expect(css).toHaveLength(2);
    expect(css.map(track=>track.name)).toEqual(['fade','slide']);
    expect(css[1]?.timing.delay).toBe(100);
    const first=css[0],media=first?.source.reference?.media;expect(first).toBeDefined();expect(media).toBeDefined();expect(media).toContain('max-width');
    expect(result.motionTracks.some(track=>track.source.kind==='waapi')).toBe(true);
    expect(result.motionTracks.some(track=>track.source.kind==='raf')).toBe(true);
    expect(result.transitions[0]?.properties).toEqual(['opacity','transform']);
    expect(result.candidates.some(candidate=>candidate.functionName==='run')).toBe(true);
  });
});