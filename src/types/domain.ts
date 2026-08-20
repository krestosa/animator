export type DetectionConfidence = 'exact' | 'runtime-observed' | 'source-correlated' | 'inferred' | 'unknown';
export type AnimationType = 'css-animation' | 'css-transition' | 'web-animation' | 'javascript' | 'raf' | 'runtime-style' | 'unknown';

export interface SourceReference { file: string; line?: number; column?: number; selector?: string; snippet?: string; }
export interface AnimatedProperty { name: string; from?: string; to?: string; values?: string[]; }
export interface DetectedAnimation {
  id: string; elementId: string; type: AnimationType; name?: string; startTime: number; duration?: number | undefined; delay?: number;
  iterations?: number; direction?: string; easing?: string | undefined; fill?: string; properties: AnimatedProperty[];
  source?: SourceReference; confidence: DetectionConfidence; runtimeState: 'idle' | 'running' | 'paused' | 'finished';
  keyframes?: Array<Record<string, string | number | null>> | undefined;
}
export interface RuntimeElement { id: string; tag: string; domId?: string; classes: string[]; text?: string; rect?: {x:number;y:number;width:number;height:number}; alive: boolean; }
export interface TimelineEvent { id: string; at: number; kind: string; elementId?: string; label: string; data?: Record<string, unknown>; }
export interface ProjectFile { path: string; name: string; type: 'file' | 'directory'; children?: ProjectFile[]; }
export interface ProjectDescriptor { id: string; root: string; entries: string[]; selectedEntry: string; tree: ProjectFile[]; }
export interface StaticAnalysis { animations: DetectedAnimation[]; transitions: Array<{selector:string; properties:string[]; source:SourceReference}>; candidates: Array<{kind:string; file:string; line:number; snippet:string}>; reducedMotion: boolean; }
export type PreviewMessage =
 | {source:'animator-preview'; type:'READY'}
 | {source:'animator-preview'; type:'ELEMENTS'; elements:RuntimeElement[]}
 | {source:'animator-preview'; type:'SELECT_ELEMENT'; element:RuntimeElement}
 | {source:'animator-preview'; type:'ANIMATION'; animation:DetectedAnimation}
 | {source:'animator-preview'; type:'EVENT'; event:TimelineEvent}
 | {source:'animator-preview'; type:'DIAGNOSTIC'; level:'info'|'warn'|'error'; message:string};

export type EditorCommand =
 | {source:'animator-editor'; type:'SET_PICKER'; enabled:boolean}
 | {source:'animator-editor'; type:'SET_RECORDING'; enabled:boolean}
 | {source:'animator-editor'; type:'SET_ANIMATION_TIME'; id:string; time:number}
 | {source:'animator-editor'; type:'SET_PLAYBACK_RATE'; id:string; rate:number}
 | {source:'animator-editor'; type:'PLAY_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'PAUSE_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'RESTART_ANIMATION'; id:string}
 | {source:'animator-editor'; type:'APPLY_OVERRIDE'; animationId:string; duration?:number | undefined; easing?:string | undefined; keyframes?:Array<Record<string, string | number | null>> | undefined}
 | {source:'animator-editor'; type:'CREATE_ANIMATION'; elementId:string; keyframes:Array<Record<string,string|number|null>>; duration:number; easing:string}
 | {source:'animator-editor'; type:'CLEAR_OVERRIDES'};
