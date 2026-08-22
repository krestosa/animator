import type {AnimationType} from '../../types/domain';
import type {MotionSourceKind,MotionTrigger} from './motion-model';

export interface MotionSourceAdapter{animationType:AnimationType;sourceKind:MotionSourceKind;defaultTrigger:MotionTrigger;editable:boolean;}
const adapter=(animationType:AnimationType,sourceKind:MotionSourceKind,defaultTrigger:MotionTrigger={kind:'unknown'},editable=true):MotionSourceAdapter=>({animationType,sourceKind,defaultTrigger,editable});
export const motionSourceAdapters:readonly MotionSourceAdapter[]=[
  adapter('css-animation','css-animation',{kind:'auto'}),
  adapter('css-transition','css-transition',{kind:'interaction'}),
  adapter('web-animation','waapi',{kind:'unknown'}),
  adapter('javascript','javascript',{kind:'unknown'}),
  adapter('raf','raf',{kind:'unknown'},false),
  adapter('runtime-style','runtime-style',{kind:'unknown'}),
  adapter('gsap','gsap',{kind:'unknown'}),
  adapter('framer-motion','framer-motion',{kind:'unknown'}),
  adapter('scroll-timeline','scroll-timeline',{kind:'scroll-progress',source:'scroll-timeline'}),
  adapter('svg','svg',{kind:'unknown'}),
  adapter('canvas','canvas',{kind:'unknown'},false),
  adapter('unknown','unknown',{kind:'unknown'},false)
];
const byAnimationType=new Map(motionSourceAdapters.map(item=>[item.animationType,item]));
const bySourceKind=new Map(motionSourceAdapters.map(item=>[item.sourceKind,item]));
export function motionAdapterForAnimationType(type:AnimationType):MotionSourceAdapter{return byAnimationType.get(type)??byAnimationType.get('unknown')!;}
export function motionAdapterForSourceKind(kind:MotionSourceKind):MotionSourceAdapter{return bySourceKind.get(kind)??bySourceKind.get('unknown')!;}
