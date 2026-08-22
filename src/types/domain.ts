import type {DetectionConfidence,MotionTrack,SourceReference} from './motion';
export type {DetectionConfidence,SourceReference} from './motion';

export type AnimationType = 'css-animation' | 'css-transition' | 'web-animation' | 'javascript' | 'raf' | 'runtime-style' | 'gsap' | 'framer-motion' | 'scroll-timeline' | 'svg' | 'canvas' | 'unknown';
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';
export type BrowserProfile = 'desktop' | 'mobile';

export interface AnimatedProperty { name: string; from?: string | undefined; to?: string | undefined; values?: string[] | undefined; }
export interface DetectedAnimation {
  id: string; elementId: string; type: AnimationType; name?: string | undefined; startTime: number; duration?: number | undefined; delay?: number | undefined;
  iterations?: number | undefined; direction?: string | undefined; easing?: string | undefined; fill?: string | undefined; properties: AnimatedProperty[];
  source?: SourceReference | undefined; confidence: DetectionConfidence; runtimeState: 'idle' | 'running' | 'paused' | 'finished';
  keyframes?: Array<Record<string, string | number | null>> | undefined;
}
export interface RuntimeElement { id: string; tag: string; domId?: string | undefined; classes: string[]; text?: string | undefined; rect?: {x:number;y:number;width:number;height:number} | undefined; alive: boolean; }
export interface TimelineEvent { id: string; at: number; kind: string; elementId?: string | undefined; label: string; data?: Record<string, unknown> | undefined; }
export interface ProjectFile { path: string; name: string; type: 'file' | 'directory'; children?: ProjectFile[] | undefined; }
export interface ProjectDescriptor {
  id: string; root: string; entries: string[]; selectedEntry: string; tree: ProjectFile[];
  previewOrigin?: string | undefined; previewUrl?: string | undefined; sourceUrl?: string | undefined; kind?: 'local' | 'remote' | undefined;
  browserSessionId?: string | undefined; browserEngine?: BrowserEngine | undefined; browserProfile?: BrowserProfile | undefined;
  browserWidth?: number | undefined; browserHeight?: number | undefined; browserExternal?: boolean | undefined;
}
export interface StaticAnalysis { animations: DetectedAnimation[]; motionTracks?:MotionTrack[]; transitions: Array<{selector:string; properties:string[]; source:SourceReference}>; candidates: Array<{kind:string; file:string; line:number; column?:number|undefined; functionName?:string|undefined; snippet:string}>; reducedMotion: boolean; }
export type PreviewMessage =
 | {source:'animator-preview'; type:'READY'}
 | {source:'animator-preview'; type:'ELEMENTS'; elements:RuntimeElement[]}
 | {source:'animator-preview'; type:'SELECT_ELEMENT'; element:RuntimeElement}
 | {source:'animator-preview'; type:'ANIMATION'; animation:DetectedAnimation}
 | {source:'animator-preview'; type:'MOTION_TRACK'; track:MotionTrack}
 | {source:'animator-preview'; type:'EVENT'; event:TimelineEvent}
 | {source:'animator-preview'; type:'EVENTS'; events:TimelineEvent[]}
 | {source:'animator-preview'; type:'TIMELINE_STATE'; time:number; frame?:number | undefined; fps?:number | undefined; playing:boolean; controlled:boolean}
 | {source:'animator-preview'; type:'RECORDING_STATE'; enabled:boolean; requestId?:string | undefined; reason?:string | undefined}
 | {source:'animator-preview'; type:'CAPTURE_REPORT'; reason:string; visibleElements:number; activeAnimations:number; capturedAnimations:number; styleTracks:number; autoCapture:boolean; burstActive:boolean; at:number}
 | {source:'animator-preview'; type:'DIAGNOSTIC'; level:'info'|'warn'|'error'; message:string};

export type EditorCommand =
 | {source:'animator-editor'; type:'SET_PICKER'; enabled:boolean}
 | {source:'animator-editor'; type:'SET_RECORDING'; enabled:boolean; requestId?:string | undefined; reason?:string | undefined}
 | {source:'animator-editor'; type:'SET_COLOR_SCHEME'; mode:'auto'|'light'|'dark'}
 | {source:'animator-editor'; type:'SET_VIEW_HISTORY_CAPTURE'; enabled:boolean; reset?:boolean | undefined}
 | {source:'animator-editor'; type:'SET_VIEW_HISTORY_MODE'; mode:'off'|'attached'|'detached'}
 | {source:'animator-editor'; type:'APPLY_VIEW_HISTORY_TIME'; time:number; controlled:boolean}
 | {source:'animator-editor'; type:'SET_ANIMATION_TIME'; id:string; time:number}
 | {source:'animator-editor'; type:'SCRUB_TIMELINE'; time:number}
 | {source:'animator-editor'; type:'SEEK_FRAME'; frame:number}
 | {source:'animator-editor'; type:'STEP_FRAME'; delta:number}
 | {source:'animator-editor'; type:'PLAY_ALL'}
 | {source:'animator-editor'; type:'PAUSE_ALL'}
 | {source:'animator-editor'; type:'RESTART_ALL'}
 | {source:'animator-editor'; type:'RELEASE_TIMELINE'}
 | {source:'animator-editor'; type:'SET_LOOP_ALL'; enabled:boolean}
 | {source:'animator-editor'; type:'SET_ALL_PLAYBACK_RATE'; rate:number}
 | {source:'animator-editor'; type:'SET_REDUCED_MOTION'; enabled:boolean}
 | {source:'animator-editor'; type:'SET_AUTO_VIEWPORT_CAPTURE'; enabled:boolean}
 | {source:'animator-editor'; type:'RECALCULATE_VIEWPORT'}
 | {source:'animator-editor'; type:'HIGHLIGHT_DOM_PATH'; selector:string}
 | {source:'animator-editor'; type:'SET_PLAYBACK_RATE'; id:string; rate:number}
 | {source:'animator-editor'; type:'PLAY_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'PAUSE_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'RESTART_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'HIGHLIGHT_ANIMATION'; id:string; reveal?:boolean | undefined}
 | {source:'animator-editor'; type:'SET_SOLO_ANIMATION'; id:string; elementId:string; anchorTime:number}
 | {source:'animator-editor'; type:'CLEAR_SOLO_ANIMATION'}
 | {source:'animator-editor'; type:'SET_FOCUS_ANIMATION'; id:string; enabled:boolean}
 | {source:'animator-editor'; type:'SET_MAGNIFY_ANIMATION'; id:string; enabled:boolean}
 | {source:'animator-editor'; type:'APPLY_OVERRIDE'; animationId:string; duration?:number | undefined; delay?:number | undefined; easing?:string | undefined; keyframes?:Array<Record<string, string | number | null>> | undefined}
 | {source:'animator-editor'; type:'CREATE_ANIMATION'; elementId:string; keyframes:Array<Record<string,string|number|null>>; duration:number; delay?:number | undefined; easing:string; iterations?:number | undefined; direction?:string | undefined; fill?:string | undefined}
 | {source:'animator-editor'; type:'CLEAR_OVERRIDES'};
