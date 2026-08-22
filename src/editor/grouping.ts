import type {MotionTrack} from '../core/motion';
import type {DetectedAnimation} from '../types/domain';

type AnimationLike=MotionTrack|DetectedAnimation;
export interface AnimationGroup<T extends AnimationLike=AnimationLike>{key:string;representative:T;instances:T[];}

export function animationGroupKey<T extends AnimationLike>(animation:T):string{
  const type=kind(animation),name=cleanName(animation.name);
  if(type==='css-animation'&&name)return`css-animation:${name}`;
  if(type==='css-transition'){const property=name||animation.properties.map(item=>item.name).sort().join(',')||'all';return`css-transition:${property}`;}
  const frames=frameSignature(animation);
  if(['web-animation','waapi','javascript','raf','runtime-style','gsap','framer-motion','scroll-timeline','svg','canvas'].includes(type)&&frames)return`${type}:${frames}`;
  if(name)return`${type}:${name}`;
  const source=sourceRef(animation);if(source?.file)return`${type}:${source.file}:${source.line??0}:${source.selector??''}:${propertySignature(animation)}`;
  return`${type}:${propertySignature(animation)}`;
}
export function groupAnimations<T extends AnimationLike>(animations:T[],selectedId?:string):AnimationGroup<T>[]{
  const grouped=new Map<string,T[]>();for(const animation of animations){const key=animationGroupKey(animation),items=grouped.get(key)??[];items.push(animation);grouped.set(key,items);}
  return[...grouped].map(([key,instances])=>({key,instances,representative:instances.find(item=>item.id===selectedId)||bestRepresentative(instances)})).sort((a,b)=>Math.min(...a.instances.map(startTime))-Math.min(...b.instances.map(startTime)));
}
export function sameAnimationGroup<T extends AnimationLike,U extends AnimationLike>(a:T,b:U):boolean{return animationGroupKey(a)===animationGroupKey(b);}
function bestRepresentative<T extends AnimationLike>(items:T[]):T{return[...items].sort((a,b)=>score(b)-score(a))[0]??items[0]!;}
function score(animation:AnimationLike):number{const confidence=isMotionTrack(animation)?animation.source.confidence:animation.confidence,keyframes=isMotionTrack(animation)?animation.keyframes:animation.keyframes??[],source=isMotionTrack(animation)?animation.source.reference:animation.source,elementId=isMotionTrack(animation)?animation.target.elementId:animation.elementId;return(confidence==='exact'?8:confidence==='source-correlated'?7:confidence==='runtime-observed'?6:2)+(keyframes.length?4:0)+(source?3:0)+(elementId.startsWith('static:')?0:2);}
function propertySignature(animation:AnimationLike):string{return animation.properties.map(item=>item.name).sort().join(',')||'motion';}
function frameSignature(animation:AnimationLike):string{const frames=isMotionTrack(animation)?animation.keyframes.map(frame=>frame.values):animation.keyframes??[];if(!frames.length)return'';return frames.map(frame=>Object.entries(frame).filter(([key])=>!['computedOffset','offset','easing','composite'].includes(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}:${String(value)}`).join(';')).join('|');}
function kind(animation:AnimationLike):string{return isMotionTrack(animation)?animation.source.kind:animation.type;}
function sourceRef(animation:AnimationLike){return isMotionTrack(animation)?animation.source.reference:animation.source;}
function startTime(animation:AnimationLike):number{return isMotionTrack(animation)?animation.timing.start:animation.startTime;}
function isMotionTrack(animation:AnimationLike):animation is MotionTrack{return 'target'in animation&&'timing'in animation;}
function cleanName(value:string|undefined):string{if(!value)return'';const normalized=value.trim();return/^(unknown|created animation)$/i.test(normalized)?'':normalized;}
