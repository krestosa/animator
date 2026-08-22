import type { MotionTrack } from '../core/motion';
import type { DetectedAnimation } from '../types/domain';
import { motionTrackToDetectedAnimation } from '../core/motion';

export interface CustomPreset { id:string; label:string; keyframes:Array<Record<string,string|number|null>>; duration:number; easing:string; }
const KEY='animator.custom-presets.v1';

export function loadCustomPresets():CustomPreset[] {
  try { const raw=localStorage.getItem(KEY); if(!raw) return []; const parsed=JSON.parse(raw) as unknown; if(!Array.isArray(parsed)) return []; return parsed.filter(isPreset); } catch { return []; }
}
export function saveCustomMotionPreset(label:string,track:MotionTrack):CustomPreset[] {
  const all=loadCustomPresets();
  const keyframes=track.keyframes.length?track.keyframes.map(frame=>({...frame.values,...(frame.offset!==undefined?{offset:frame.offset}:{}),...(frame.easing!==undefined?{easing:frame.easing}:{}),...(frame.composite!==undefined?{composite:frame.composite}:{})})):[{opacity:0},{opacity:1}];
  const preset:CustomPreset={id:`custom-${Date.now().toString(36)}`,label:label.trim()||'Custom preset',keyframes,duration:track.timing.duration??400,easing:track.timing.easing??'ease'};
  const next=[...all,preset].slice(-50); localStorage.setItem(KEY,JSON.stringify(next)); return next;
}
export function saveCustomPreset(label:string,animation:DetectedAnimation):CustomPreset[] {
  return saveCustomMotionPreset(label,{...motionTrackFromLegacy(animation)});
}
export function deleteCustomPreset(id:string):CustomPreset[] { const next=loadCustomPresets().filter(p=>p.id!==id); localStorage.setItem(KEY,JSON.stringify(next)); return next; }
function isPreset(value:unknown):value is CustomPreset { if(!value||typeof value!=='object')return false;const p=value as Partial<CustomPreset>;return typeof p.id==='string'&&typeof p.label==='string'&&Array.isArray(p.keyframes)&&typeof p.duration==='number'&&typeof p.easing==='string'; }
function motionTrackFromLegacy(animation:DetectedAnimation):MotionTrack {
  const legacy=motionTrackToDetectedAnimation as unknown as undefined;
  void legacy;
  const keyframes=(animation.keyframes??[]).map(frame=>{const values:Record<string,string|number|null>={};let offset:number|undefined,easing:string|undefined,composite:string|undefined;for(const [key,value] of Object.entries(frame)){if(key==='offset'&&typeof value==='number'){offset=value;continue;}if(key==='easing'&&typeof value==='string'){easing=value;continue;}if(key==='composite'&&typeof value==='string'){composite=value;continue;}values[key]=value;}return{values,...(offset!==undefined?{offset}:{}),...(easing!==undefined?{easing}:{}),...(composite!==undefined?{composite}:{})};});
  return{id:animation.id,...(animation.name?{name:animation.name}:{}),target:{elementId:animation.elementId},timing:{start:animation.startTime,...(animation.duration!==undefined?{duration:animation.duration}:{}),...(animation.delay!==undefined?{delay:animation.delay}:{}),...(animation.iterations!==undefined?{iterations:animation.iterations}:{}),...(animation.direction?{direction:animation.direction}:{}),...(animation.easing?{easing:animation.easing}:{}),...(animation.fill?{fill:animation.fill}:{})},properties:animation.properties.map(property=>({name:property.name,...(property.values?{values:property.values}:{})})),keyframes,trigger:{kind:'unknown'},source:{kind:animation.type==='css-animation'?'css-animation':animation.type==='css-transition'?'css-transition':animation.type==='web-animation'?'waapi':'unknown',confidence:animation.confidence},runtimeState:animation.runtimeState};
}
