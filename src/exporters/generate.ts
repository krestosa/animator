import {type MotionKeyframe,type MotionTrack} from '../core/motion';

const safe=(value:string)=>value.replace(/[^a-zA-Z0-9_-]/g,'-');
const frameObject=(frame:MotionKeyframe):Record<string,string|number|null>=>({...frame.values,...(frame.offset!==undefined?{offset:frame.offset}:{}),...(frame.easing!==undefined?{easing:frame.easing}:{}),...(frame.composite!==undefined?{composite:frame.composite}:{})});
const framesFor=(track:MotionTrack):MotionKeyframe[]=>track.keyframes.length?track.keyframes:[{offset:0,values:{opacity:0}},{offset:1,values:{opacity:1}}];

export function generateMotionCss(track:MotionTrack):string{
  const name=`animator-${safe(track.name||track.id)}`,frames=framesFor(track),body=frames.map((frame,index)=>{const offset=typeof frame.offset==='number'?frame.offset*100:(index/Math.max(frames.length-1,1))*100,decl=Object.entries(frame.values).filter(([,value])=>value!=null).map(([key,value])=>`    ${key}: ${String(value)};`).join('\n');return `  ${Math.round(offset)}% {\n${decl}\n  }`;}).join('\n');
  const iteration=track.timing.iterations!==undefined?` ${track.timing.iterations}`:'',direction=track.timing.direction&&track.timing.direction!=='normal'?` ${track.timing.direction}`:'',fill=track.timing.fill&&track.timing.fill!=='none'?` ${track.timing.fill}`:'';
  return `@keyframes ${name} {\n${body}\n}\n\n[data-animator-target="${track.target.elementId}"] {\n  animation: ${name} ${track.timing.duration??400}ms ${track.timing.easing??'ease'} ${track.timing.delay??0}ms${iteration}${direction}${fill};\n}`;
}
export function generateMotionTs(track:MotionTrack):string{
  const frames=framesFor(track).map(frameObject);
  return `element.animate(${JSON.stringify(frames,null,2)}, {\n  duration: ${track.timing.duration??400},\n  delay: ${track.timing.delay??0},\n  iterations: ${track.timing.iterations??1},\n  direction: ${JSON.stringify(track.timing.direction??'normal')},\n  easing: ${JSON.stringify(track.timing.easing??'ease')},\n  fill: ${JSON.stringify(track.timing.fill??'both')}\n});`;
}
export function generateMotionUnifiedDiff(track:MotionTrack):string{const css=generateMotionCss(track).split('\n').map(line=>`+${line}`).join('\n'),target=track.source.reference?.file??'.animator/animator-overrides.css';return `--- ${target}\n+++ .animator/animator-overrides.css\n@@ proposed non-destructive override @@\n${css}`;}
export function generateMotionOverrideFiles(tracks:MotionTrack[]){return{css:tracks.map(generateMotionCss).join('\n\n'),ts:tracks.map(generateMotionTs).join('\n\n')};}
