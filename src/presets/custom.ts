import {type MotionTrack } from '../core/motion';

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
export function deleteCustomPreset(id:string):CustomPreset[] { const next=loadCustomPresets().filter(p=>p.id!==id); localStorage.setItem(KEY,JSON.stringify(next)); return next; }
function isPreset(value:unknown):value is CustomPreset { if(!value||typeof value!=='object')return false;const p=value as Partial<CustomPreset>;return typeof p.id==='string'&&typeof p.label==='string'&&Array.isArray(p.keyframes)&&typeof p.duration==='number'&&typeof p.easing==='string'; }
