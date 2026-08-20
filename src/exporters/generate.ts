import type { DetectedAnimation } from '../types/domain';

const safe = (value:string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');
export function generateCss(animation:DetectedAnimation): string {
  const name = `animator-${safe(animation.name || animation.id)}`;
  const frames = animation.keyframes?.length ? animation.keyframes : [{opacity:0},{opacity:1}];
  const body = frames.map((frame,index)=>{
    const offset = typeof frame.offset === 'number' ? Number(frame.offset) * 100 : (index/(Math.max(frames.length-1,1)))*100;
    const decl = Object.entries(frame).filter(([k,v])=>k!=='offset'&&v!=null).map(([k,v])=>`    ${k}: ${String(v)};`).join('\n');
    return `  ${Math.round(offset)}% {\n${decl}\n  }`;
  }).join('\n');
  return `@keyframes ${name} {\n${body}\n}\n\n[data-animator-target="${animation.elementId}"] {\n  animation: ${name} ${animation.duration ?? 400}ms ${animation.easing ?? 'ease'} ${animation.delay ?? 0}ms;\n}`;
}
export function generateTs(animation:DetectedAnimation): string {
  return `element.animate(${JSON.stringify(animation.keyframes ?? [{opacity:0},{opacity:1}], null, 2)}, {\n  duration: ${animation.duration ?? 400},\n  delay: ${animation.delay ?? 0},\n  easing: ${JSON.stringify(animation.easing ?? 'ease')},\n  fill: ${JSON.stringify(animation.fill ?? 'both')}\n});`;
}
export function generateUnifiedDiff(animation:DetectedAnimation): string {
  const css = generateCss(animation).split('\n').map(line=>`+${line}`).join('\n');
  const target = animation.source?.file ?? '.animator/animator-overrides.css';
  return `--- ${target}\n+++ .animator/animator-overrides.css\n@@ proposed non-destructive override @@\n${css}`;
}
export function generateOverrideFiles(animations:DetectedAnimation[]) {
  return { css: animations.map(generateCss).join('\n\n'), ts: animations.map(generateTs).join('\n\n') };
}
