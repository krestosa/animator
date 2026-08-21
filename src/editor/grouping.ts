import type { DetectedAnimation } from '../types/domain';

export interface AnimationGroup {
  key:string;
  representative:DetectedAnimation;
  instances:DetectedAnimation[];
}

export function animationGroupKey(animation:DetectedAnimation):string {
  const type=animation.type;
  const name=cleanName(animation.name);
  if(type==='css-animation'&&name)return `css-animation:${name}`;
  if(type==='css-transition'){
    const property=name||animation.properties.map(item=>item.name).sort().join(',')||'all';
    return `css-transition:${property}`;
  }
  const frames=frameSignature(animation);
  if((type==='web-animation'||type==='javascript'||type==='raf'||type==='runtime-style')&&frames)return `${type}:${frames}`;
  if(name)return `${type}:${name}`;
  const source=animation.source;
  if(source?.file)return `${type}:${source.file}:${source.line??0}:${source.selector??''}:${propertySignature(animation)}`;
  return `${type}:${propertySignature(animation)}`;
}

export function groupAnimations(animations:DetectedAnimation[],selectedId?:string):AnimationGroup[] {
  const grouped=new Map<string,DetectedAnimation[]>();
  for(const animation of animations){
    const key=animationGroupKey(animation);
    const items=grouped.get(key)??[];
    items.push(animation);
    grouped.set(key,items);
  }
  return [...grouped].map(([key,instances])=>({
    key,
    instances,
    representative:instances.find(item=>item.id===selectedId)||bestRepresentative(instances)
  })).sort((a,b)=>Math.min(...a.instances.map(item=>item.startTime))-Math.min(...b.instances.map(item=>item.startTime)));
}

export function sameAnimationGroup(a:DetectedAnimation,b:DetectedAnimation):boolean {
  return animationGroupKey(a)===animationGroupKey(b);
}

function bestRepresentative(items:DetectedAnimation[]):DetectedAnimation {
  return [...items].sort((a,b)=>score(b)-score(a))[0]??items[0]!;
}
function score(animation:DetectedAnimation):number {
  return (animation.confidence==='exact'?8:animation.confidence==='source-correlated'?7:animation.confidence==='runtime-observed'?6:2)
    +(animation.keyframes?.length?4:0)+(animation.source?3:0)+(animation.elementId.startsWith('static:')?0:2);
}
function propertySignature(animation:DetectedAnimation):string {
  return animation.properties.map(item=>item.name).sort().join(',')||'motion';
}
function frameSignature(animation:DetectedAnimation):string {
  if(!animation.keyframes?.length)return '';
  return animation.keyframes.map(frame=>Object.entries(frame)
    .filter(([key])=>!['computedOffset','offset','easing','composite'].includes(key))
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([key,value])=>`${key}:${String(value)}`).join(';')).join('|');
}
function cleanName(value:string|undefined):string {
  if(!value)return '';
  const normalized=value.trim();
  return /^(unknown|created animation)$/i.test(normalized)?'':normalized;
}
