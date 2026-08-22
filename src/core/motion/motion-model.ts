import type { DetectionConfidence, SourceReference } from '../../types/domain';

export type MotionSourceKind='css-animation'|'css-transition'|'waapi'|'javascript'|'raf'|'runtime-style'|'gsap'|'framer-motion'|'scroll-timeline'|'svg'|'canvas'|'unknown';
export type MotionRuntimeState='idle'|'running'|'paused'|'finished';
export type MotionValue=string|number|null;

export interface MotionTarget { elementId:string; selector?:string; }
export interface MotionPropertyTrack { name:string; from?:string; to?:string; values?:string[]; }
export interface MotionKeyframe { offset?:number; easing?:string; composite?:string; values:Record<string,MotionValue>; }
export interface MotionTiming {
  start:number;
  duration?:number;
  delay?:number;
  iterations?:number;
  direction?:string;
  easing?:string;
  fill?:string;
}
export interface MotionTrigger { kind:'auto'|'interaction'|'scroll'|'timeline'|'unknown'; source?:string; }
export interface MotionSource { kind:MotionSourceKind; reference?:SourceReference; confidence:DetectionConfidence; }
export interface MotionTrack {
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
