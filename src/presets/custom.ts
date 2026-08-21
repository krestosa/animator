import type { DetectedAnimation } from '../types/domain';

export interface CustomPreset { id:string; label:string; keyframes:Array<Record<string,string|number|null>>; duration:number; easing:string; }
const KEY='animator.custom-presets.v1';

export function loadCustomPresets():CustomPreset[] {
  try { const raw=localStorage.getItem(KEY); if(!raw) return []; const parsed=JSON.parse(raw) as unknown; if(!Array.isArray(parsed)) return []; return parsed.filter(isPreset); } catch { return []; }
}
export function saveCustomPreset(label:string,animation:DetectedAnimation):CustomPreset[] {
  const all=loadCustomPresets();
  const preset:CustomPreset={id:`custom-${Date.now().toString(36)}`,label:label.trim()||'Custom preset',keyframes:animation.keyframes?.map(f=>({...f}))??[{opacity:0},{opacity:1}],duration:animation.duration??400,easing:animation.easing??'ease'};
  const next=[...all,preset].slice(-50); localStorage.setItem(KEY,JSON.stringify(next)); return next;
}
export function deleteCustomPreset(id:string):CustomPreset[] { const next=loadCustomPresets().filter(p=>p.id!==id); localStorage.setItem(KEY,JSON.stringify(next)); return next; }
function isPreset(value:unknown):value is CustomPreset { if(!value||typeof value!=='object')return false;const p=value as Partial<CustomPreset>;return typeof p.id==='string'&&typeof p.label==='string'&&Array.isArray(p.keyframes)&&typeof p.duration==='number'&&typeof p.easing==='string'; }
