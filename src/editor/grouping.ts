import type {MotionTrack} from '../core/motion';

export interface AnimationGroup{key:string;representative:MotionTrack;instances:MotionTrack[];}

export function animationGroupKey(track:MotionTrack):string{
  const type=track.source.kind,name=cleanName(track.name);
  if(type==='css-animation'&&name)return`css-animation:${name}`;
  if(type==='css-transition'){const property=name||track.properties.map(item=>item.name).sort().join(',')||'all';return`css-transition:${property}`;}
  const frames=frameSignature(track);
  if(['waapi','javascript','raf','runtime-style','gsap','framer-motion','scroll-timeline','svg','canvas'].includes(type)&&frames)return`${type}:${frames}`;
  if(name)return`${type}:${name}`;
  const source=track.source.reference;if(source?.file)return`${type}:${source.file}:${source.line??0}:${source.selector??''}:${propertySignature(track)}`;
  return`${type}:${propertySignature(track)}`;
}
export function groupAnimations(tracks:MotionTrack[],selectedId?:string):AnimationGroup[]{
  const grouped=new Map<string,MotionTrack[]>();for(const track of tracks){const key=animationGroupKey(track),items=grouped.get(key)??[];items.push(track);grouped.set(key,items);}
  return[...grouped].map(([key,instances])=>({key,instances,representative:instances.find(item=>item.id===selectedId)||bestRepresentative(instances)})).sort((a,b)=>Math.min(...a.instances.map(startTime))-Math.min(...b.instances.map(startTime)));
}
export function sameAnimationGroup(a:MotionTrack,b:MotionTrack):boolean{return animationGroupKey(a)===animationGroupKey(b);}
function bestRepresentative(items:MotionTrack[]):MotionTrack{return[...items].sort((a,b)=>score(b)-score(a))[0]??items[0]!;}
function score(track:MotionTrack):number{const confidence=track.source.confidence;return(confidence==='exact'?8:confidence==='source-correlated'?7:confidence==='runtime-observed'?6:2)+(track.keyframes.length?4:0)+(track.source.reference?3:0)+(track.target.elementId.startsWith('static:')?0:2);}
function propertySignature(track:MotionTrack):string{return track.properties.map(item=>item.name).sort().join(',')||'motion';}
function frameSignature(track:MotionTrack):string{if(!track.keyframes.length)return'';return track.keyframes.map(frame=>Object.entries(frame.values).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}:${String(value)}`).join(';')).join('|');}
function startTime(track:MotionTrack):number{return track.timing.start;}
function cleanName(value:string|undefined):string{if(!value)return'';const normalized=value.trim();return/^(unknown|created animation)$/i.test(normalized)?'':normalized;}
