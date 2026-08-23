import {addMotionKeyframe,addMotionProperty,deleteMotionKeyframe,duplicateMotionKeyframe,normalizedMotionKeyframes,updateMotionKeyframe,type MotionKeyframe,type MotionTrack,type MotionValue} from '../core/motion';
import {buildTransform,parseTransform,type TransformParts} from '../editor/motion';
import {presets} from '../presets/presets';
import {deleteCustomPreset,loadCustomPresets,saveCustomMotionPreset} from '../presets/custom';
import {sendCommand} from '../preview/bridge';
import {store,type MotionTrackPatch} from '../state/store';
export {addMotionKeyframe,addMotionProperty,deleteMotionKeyframe,duplicateMotionKeyframe,normalizedMotionKeyframes,updateMotionKeyframe};

export type InspectorMotionPatch={timing?:Partial<MotionTrack['timing']>;keyframes?:MotionKeyframe[]};

export function selectMotionTrack(tracks:MotionTrack[],selectedId:string|undefined):MotionTrack|undefined{return selectedId?tracks.find(track=>track.id===selectedId):undefined;}
export function motionKeyframesToLegacy(frames:MotionKeyframe[]):Array<Record<string,MotionValue>>{return frames.map(frame=>({...frame.values,...(frame.offset!==undefined?{offset:frame.offset}:{}),...(frame.easing!==undefined?{easing:frame.easing}:{}),...(frame.composite!==undefined?{composite:frame.composite}:{})}));}
export function legacyKeyframesToMotion(frames:Array<Record<string,string|number|null>>):MotionKeyframe[]{return frames.map(frame=>{const values:Record<string,MotionValue>={};let offset:number|undefined,easing:string|undefined,composite:string|undefined;for(const [key,value] of Object.entries(frame)){if(key==='offset'&&typeof value==='number'){offset=value;continue;}if(key==='easing'&&typeof value==='string'){easing=value;continue;}if(key==='composite'&&typeof value==='string'){composite=value;continue;}values[key]=value;}return{values,...(offset!==undefined?{offset}:{}),...(easing!==undefined?{easing}:{}),...(composite!==undefined?{composite}:{})};});}
export function motionTrackPreview(track:MotionTrack,patch:InspectorMotionPatch={}):{duration:number|undefined;delay:number|undefined;easing:string|undefined;keyframes:Array<Record<string,MotionValue>>|undefined}{const timing={...track.timing,...patch.timing},frames=patch.keyframes??track.keyframes;return{duration:timing.duration,delay:timing.delay,easing:timing.easing,keyframes:frames.length?motionKeyframesToLegacy(frames):undefined};}
export function sanitizeMotionDuration(value:unknown,fallback=400):number{const numeric=Number(value);return Number.isFinite(numeric)&&numeric>0?numeric:Math.max(1,fallback);}
export function sanitizeMotionIterations(value:unknown,fallback=1):number{const numeric=Number(value);return Number.isFinite(numeric)&&numeric>0?numeric:Math.max(1,fallback);}
export function sanitizeMotionDelay(value:unknown,fallback=0):number{const numeric=Number(value);return Number.isFinite(numeric)?numeric:fallback;}
export function sanitizeKeyframeOffset(value:unknown,fallback=0):number{const numeric=Number(value);return Math.max(0,Math.min(1,Number.isFinite(numeric)?numeric:fallback));}
export function sanitizeBezierPoints(values:unknown[]):[number,number,number,number]|undefined{if(values.length!==4)return undefined;const points=values.map(Number);if(points.some(value=>!Number.isFinite(value)))return undefined;return[Math.max(0,Math.min(1,points[0]!)),points[1]!,Math.max(0,Math.min(1,points[2]!)),points[3]!] as [number,number,number,number];}

export function mountMotionIrInspector(root:HTMLElement):()=>void{
 const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
 const current=()=>selectMotionTrack(store.get().motionTracks,store.get().selectedAnimationId);
 const preview=(track:MotionTrack,patch:InspectorMotionPatch={})=>{const value=motionTrackPreview(track,patch);sendCommand(frame(),{type:'APPLY_OVERRIDE',animationId:track.id,duration:value.duration,delay:value.delay,easing:value.easing,keyframes:value.keyframes});};
 const commit=(track:MotionTrack,patch:MotionTrackPatch)=>{store.updateMotionTrack(track.id,patch);const updated=store.getMotionTrack(track.id);if(updated)preview(updated);};
 const click=(event:MouseEvent)=>{const target=(event.target as Element|null)?.closest<HTMLElement>('[data-action],[data-duplicate-kf],[data-delete-kf],[data-delete-preset]');if(!target)return;const action=target.dataset.action;
  if(target.dataset.deletePreset!==undefined){event.preventDefault();event.stopImmediatePropagation();deleteCustomPreset(target.dataset.deletePreset);store.touch();return;}
  const track=current();if(!track)return;let frames:MotionKeyframe[]|undefined;
  if(action==='add-keyframe')frames=addMotionKeyframe(normalizedMotionKeyframes(track));
  else if(action==='add-property'){const name=prompt('CSS property to animate')?.trim();if(name)frames=addMotionProperty(normalizedMotionKeyframes(track),name);else return;}
  else if(action==='save-preset'){const label=prompt('Preset name',track.name??'Custom preset');if(label===null)return;event.preventDefault();event.stopImmediatePropagation();saveCustomMotionPreset(label,track);store.touch();return;}
  else if(target.dataset.duplicateKf!==undefined)frames=duplicateMotionKeyframe(normalizedMotionKeyframes(track),Number(target.dataset.duplicateKf));
  else if(target.dataset.deleteKf!==undefined)frames=deleteMotionKeyframe(normalizedMotionKeyframes(track),Number(target.dataset.deleteKf));
  else return;
  event.preventDefault();event.stopImmediatePropagation();commit(track,{keyframes:frames});
 };
 const change=(event:Event)=>{const target=event.target;
  if(target instanceof HTMLSelectElement&&target.matches('[data-preset]')){const track=current();if(!track||!target.value)return;const preset=[...presets,...loadCustomPresets()].find(item=>item.id===target.value);if(!preset)return;event.stopImmediatePropagation();commit(track,{timing:{duration:preset.duration,easing:preset.easing},keyframes:legacyKeyframesToMotion(preset.keyframes)});target.value='';return;}
  if(!(target instanceof HTMLInputElement))return;const track=current();if(!track)return;let patch:MotionTrackPatch|undefined;
  if(target.matches('[data-duration-range],[data-duration-number]')){const value=sanitizeMotionDuration(target.value,track.timing.duration??400);target.value=String(value);patch={timing:{duration:value}};}
  else if(target.matches('[data-delay]')){const value=sanitizeMotionDelay(target.value,track.timing.delay??0);target.value=String(value);patch={timing:{delay:value}};}
  else if(target.matches('[data-easing-text]')){const value=target.value.trim()||track.timing.easing||'ease';target.value=value;patch={timing:{easing:value}};}
  else if(target.matches('[data-iterations]')){const value=sanitizeMotionIterations(target.value,track.timing.iterations??1);target.value=String(value);patch={timing:{iterations:value}};}
  else if(target.matches('[data-kf-index][data-kf-key]')){const index=Number(target.dataset.kfIndex),key=target.dataset.kfKey;if(!Number.isInteger(index)||!key)return;const frames=normalizedMotionKeyframes(track),existing=frames[index];if(!existing)return;const value:string|number=key==='offset'?sanitizeKeyframeOffset(target.value,existing.offset??index/Math.max(1,frames.length-1)):target.value;if(key==='offset')target.value=String(value);patch={keyframes:updateMotionKeyframe(frames,index,key,value)};}
  else if(target.dataset.transformKey){const frames=normalizedMotionKeyframes(track),last=frames.at(-1);if(!last)return;const transform=parseTransform(typeof last.values.transform==='string'?last.values.transform:undefined),key=target.dataset.transformKey as keyof TransformParts,numeric=Number(target.value);if(!Number.isFinite(numeric)){target.value=String(transform[key]);target.setAttribute('aria-invalid','true');return;}target.removeAttribute('aria-invalid');transform[key]=numeric;frames[frames.length-1]={...last,values:{...last.values,transform:buildTransform(transform)}};patch={keyframes:frames};}
  else if(target.dataset.bezierIndex!==undefined){const inputs=[...root.querySelectorAll<HTMLInputElement>('[data-bezier-index]')],points=sanitizeBezierPoints(inputs.map(input=>input.value));if(!points){target.setAttribute('aria-invalid','true');return;}inputs.forEach((input,index)=>{input.value=String(points[index]);input.removeAttribute('aria-invalid');});patch={timing:{easing:`cubic-bezier(${points.join(',')})`}};}
  if(!patch)return;event.stopImmediatePropagation();commit(track,patch);
 };
 const input=(event:Event)=>{const target=event.target;if(!(target instanceof HTMLInputElement)||!target.matches('[data-duration-range]'))return;const track=current();if(!track)return;const duration=sanitizeMotionDuration(target.value,track.timing.duration??400),number=root.querySelector<HTMLInputElement>('[data-duration-number]');if(number)number.value=String(duration);preview(track,{timing:{duration}});event.stopImmediatePropagation();};
 root.addEventListener('click',click,true);root.addEventListener('change',change,true);root.addEventListener('input',input,true);
 return()=>{root.removeEventListener('click',click,true);root.removeEventListener('change',change,true);root.removeEventListener('input',input,true);};
}
