import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {detectSourceMotion} from '../motion-source-detectors.js';

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
function fixture(name:string,source:string):{root:string;file:string}{const root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-detector-'));roots.push(root);const file=path.join(root,name);fs.writeFileSync(file,source);return{root,file};}

describe('extended motion source detectors',()=>{
  it('detects literal GSAP tween timing and properties',()=>{const{root,file}=fixture('motion.ts',`gsap.to('.card',{x:120,opacity:0.4,duration:0.8,delay:0.2,ease:'power2.out'});`),result=detectSourceMotion(file,root),track=result.motions.find(item=>item.type==='gsap');expect(track).toBeDefined();expect(track).toMatchObject({duration:800,delay:200,easing:'power2.out',confidence:'inferred'});expect(track?.properties.map(property=>property.name)).toEqual(expect.arrayContaining(['x','opacity']));});
  it('detects Framer Motion JSX without claiming runtime certainty',()=>{const{root,file}=fixture('card.tsx',`export const Card=()=> <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5,delay:0.1}} />;`),result=detectSourceMotion(file,root),track=result.motions.find(item=>item.type==='framer-motion');expect(track).toBeDefined();expect(track).toMatchObject({duration:500,delay:100,confidence:'inferred'});expect(track?.keyframes).toHaveLength(2);});
  it('detects WAAPI backed by a ScrollTimeline',()=>{const{root,file}=fixture('scroll.js',`const timeline=new ScrollTimeline({source:document.scrollingElement}); box.animate([{opacity:0},{opacity:1}],{duration:1000,timeline});`),result=detectSourceMotion(file,root);expect(result.candidates.some(candidate=>candidate.kind==='scroll-timeline')).toBe(true);const track=result.motions.find(item=>item.type==='scroll-timeline');expect(track).toBeDefined();expect(track?.properties.map(property=>property.name)).toContain('opacity');});
  it('detects SVG SMIL as exact markup motion',()=>{const{root,file}=fixture('icon.svg',`<svg><circle><animate attributeName="opacity" from="0" to="1" dur="500ms" begin="100ms" /></circle></svg>`),result=detectSourceMotion(file,root),track=result.motions[0];expect(track).toMatchObject({type:'svg',duration:500,delay:100,confidence:'exact'});expect(track?.properties[0]).toMatchObject({name:'opacity',values:['0','1']});});
  it('classifies requestAnimationFrame canvas loops as canvas motion',()=>{const{root,file}=fixture('canvas.js',`const ctx=canvas.getContext('2d'); function draw(){ctx.clearRect(0,0,100,100);ctx.fillRect(0,0,20,20);requestAnimationFrame(draw);} requestAnimationFrame(draw);`),result=detectSourceMotion(file,root);expect(result.motions.some(item=>item.type==='canvas')).toBe(true);expect(result.candidates.some(candidate=>candidate.kind==='canvas-raf')).toBe(true);});
});
