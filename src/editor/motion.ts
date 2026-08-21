import type { DetectedAnimation } from '../types/domain';

export type MotionFilter = 'all' | 'running' | 'css' | 'waapi' | 'transition' | 'inferred' | 'exact';
export type MotionOverview = { cssAnimations:number; cssTransitions:number; waapi:number; javascript:number; unknown:number; total:number };
export type PerformanceIssue = { animationId:string; severity:'info'|'warn'; message:string };

const risky = new Set(['width','height','top','left','right','bottom','margin','margin-left','margin-right','margin-top','margin-bottom','padding','padding-left','padding-right','padding-top','padding-bottom']);

export function overview(animations:DetectedAnimation[]):MotionOverview {
  return animations.reduce<MotionOverview>((out,a)=>{
    out.total++;
    if(a.type==='css-animation') out.cssAnimations++;
    else if(a.type==='css-transition') out.cssTransitions++;
    else if(a.type==='web-animation') out.waapi++;
    else if(a.type==='unknown') out.unknown++;
    else out.javascript++;
    return out;
  },{cssAnimations:0,cssTransitions:0,waapi:0,javascript:0,unknown:0,total:0});
}

export function filterAnimations(animations:DetectedAnimation[], query:string, filter:MotionFilter):DetectedAnimation[] {
  const needle=query.trim().toLowerCase();
  return animations.filter(a=>{
    const matchesFilter = filter==='all' ||
      (filter==='running' && a.runtimeState==='running') ||
      (filter==='css' && a.type==='css-animation') ||
      (filter==='waapi' && a.type==='web-animation') ||
      (filter==='transition' && a.type==='css-transition') ||
      (filter==='inferred' && (a.confidence==='inferred'||a.confidence==='unknown')) ||
      (filter==='exact' && (a.confidence==='exact'||a.confidence==='source-correlated'));
    if(!matchesFilter) return false;
    if(!needle) return true;
    const haystack=[a.name,a.type,a.confidence,a.source?.file,a.source?.selector,...a.properties.map(p=>p.name)].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

export function performanceIssues(animations:DetectedAnimation[]):PerformanceIssue[] {
  const issues:PerformanceIssue[]=[];
  for(const animation of animations){
    for(const property of animation.properties){
      if(risky.has(property.name)) issues.push({animationId:animation.id,severity:'warn',message:`${property.name} can trigger layout; measure before optimizing.`});
      if(property.name==='filter') issues.push({animationId:animation.id,severity:'info',message:'filter can be GPU-expensive depending on blur radius and affected area.'});
    }
  }
  return issues;
}

export function parseBezier(value:string):[number,number,number,number]|undefined {
  const m=value.trim().match(/^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i);
  if(!m) return undefined;
  return [Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4])];
}

export function bezierPath(points:[number,number,number,number]):string {
  const [x1,y1,x2,y2]=points;
  const x=(v:number)=>10+v*140;
  const y=(v:number)=>150-v*140;
  return `M 10 150 C ${x(x1)} ${y(y1)}, ${x(x2)} ${y(y2)}, 150 10`;
}

export type TransformParts={translateX:number;translateY:number;scaleX:number;scaleY:number;rotate:number;skewX:number;skewY:number;origin:string};
export function defaultTransform():TransformParts{return{translateX:0,translateY:0,scaleX:1,scaleY:1,rotate:0,skewX:0,skewY:0,origin:'50% 50%'};}

export function parseTransform(value:string|undefined):TransformParts {
  const out=defaultTransform(); if(!value||value==='none') return out;
  const read=(name:string)=>value.match(new RegExp(`${name}\\(([^)]+)\\)`,'i'))?.[1]?.trim();
  const tx=read('translateX'); const ty=read('translateY'); const scale=read('scale'); const sx=read('scaleX'); const sy=read('scaleY'); const rotate=read('rotate'); const skewX=read('skewX'); const skewY=read('skewY');
  if(tx) out.translateX=parseFloat(tx)||0; if(ty) out.translateY=parseFloat(ty)||0;
  if(scale){const n=parseFloat(scale);if(Number.isFinite(n)){out.scaleX=n;out.scaleY=n;}}
  if(sx) out.scaleX=parseFloat(sx)||1; if(sy) out.scaleY=parseFloat(sy)||1;
  if(rotate) out.rotate=parseFloat(rotate)||0; if(skewX) out.skewX=parseFloat(skewX)||0; if(skewY) out.skewY=parseFloat(skewY)||0;
  return out;
}

export function buildTransform(parts:TransformParts):string {
  return `translateX(${parts.translateX}px) translateY(${parts.translateY}px) scaleX(${parts.scaleX}) scaleY(${parts.scaleY}) rotate(${parts.rotate}deg) skewX(${parts.skewX}deg) skewY(${parts.skewY}deg)`;
}

export function normalizedKeyframes(animation:DetectedAnimation):Array<Record<string,string|number|null>> {
  const frames=animation.keyframes?.map(frame=>({...frame})) ?? [{offset:0,opacity:0},{offset:1,opacity:1}];
  const count=Math.max(1,frames.length-1);
  return frames.map((frame,index)=>({offset:typeof frame.offset==='number'?frame.offset:index/count,...frame}));
}

export function updateKeyframe(frames:Array<Record<string,string|number|null>>,index:number,key:string,value:string|number|null):Array<Record<string,string|number|null>> {
  return frames.map((frame,i)=>i===index?{...frame,[key]:value}:frame);
}

export function addKeyframe(frames:Array<Record<string,string|number|null>>):Array<Record<string,string|number|null>> {
  const copy=frames.map(f=>({...f})); const last=copy.at(-1)??{opacity:1,offset:1};
  copy.splice(Math.max(1,copy.length-1),0,{...last,offset:0.5});
  return copy.sort((a,b)=>Number(a.offset??0)-Number(b.offset??0));
}

export function duplicateKeyframe(frames:Array<Record<string,string|number|null>>,index:number):Array<Record<string,string|number|null>> {
  const copy=frames.map(f=>({...f})); const base=copy[index]; if(!base) return copy;
  const next=copy[index+1]; const offset=(Number(base.offset??0)+Number(next?.offset??1))/2;
  copy.splice(index+1,0,{...base,offset}); return copy;
}

export function deleteKeyframe(frames:Array<Record<string,string|number|null>>,index:number):Array<Record<string,string|number|null>> {
  if(frames.length<=2) return frames; return frames.filter((_,i)=>i!==index);
}
