export type DetectionConfidence='exact'|'runtime-observed'|'source-correlated'|'inferred'|'unknown';
export interface SourceReference{file:string;line?:number|undefined;column?:number|undefined;selector?:string|undefined;snippet?:string|undefined;media?:string|undefined;}
export type MotionSourceKind='css-animation'|'css-transition'|'waapi'|'javascript'|'raf'|'runtime-style'|'gsap'|'framer-motion'|'scroll-timeline'|'svg'|'canvas'|'unknown';
export type MotionRuntimeState='idle'|'running'|'paused'|'finished';
export type MotionValue=string|number|null;
export type MotionValueKind='number'|'length'|'angle'|'color'|'transform'|'filter'|'path'|'custom-property'|'discrete'|'unknown';
export type MotionTriggerKind='auto'|'interaction'|'hover'|'click'|'focus'|'pointer'|'viewport'|'scroll'|'scroll-progress'|'timeline'|'unknown';

export interface MotionTarget{elementId:string;selector?:string;}
export interface MotionPropertyTrack{name:string;from?:string;to?:string;values?:string[];valueKind?:MotionValueKind;interpolable?:boolean;}
export interface MotionKeyframe{offset?:number;easing?:string;composite?:string;values:Record<string,MotionValue>;}
export interface MotionTiming{start:number;duration?:number;delay?:number;iterations?:number;direction?:string;easing?:string;fill?:string;}
export interface MotionTrigger{kind:MotionTriggerKind;source?:string;event?:string;axis?:'x'|'y'|'both';range?:{start?:number;end?:number};}
export interface MotionSource{kind:MotionSourceKind;reference?:SourceReference;confidence:DetectionConfidence;}
export interface MotionTrack{
  id:string;
  name?:string;
  target:MotionTarget;
  timing:MotionTiming;
  properties:MotionPropertyTrack[];
  keyframes:MotionKeyframe[];
  trigger:MotionTrigger;
  source:MotionSource;
  runtimeState:MotionRuntimeState;
  metadata?:Record<string,unknown>;
}
