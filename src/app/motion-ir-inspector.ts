import type { MotionKeyframe,MotionTrack,MotionValue } from '../core/motion';
import {sendCommand} from '../preview/bridge';
import {store,type MotionTrackPatch} from '../state/store';
import type { DetectedAnimation } from '../types/domain';

export type InspectorMotionPatch={timing?:Partial<MotionTrack['timing']>;keyframes?:MotionKeyframe[]};

export function selectMotionTrack(tracks:MotionTrack[],selectedId:string|undefined):MotionTrack|undefined{return selectedId?tracks.find(track=>track.id===selectedId):undefined;}
export function motionKeyframesToLegacy(frames:MotionKeyframe[]):Array<Record<string,MotionValue>>{return frames.map(frame=>({...frame.values,...(frame.offset!==undefined?{offset:frame.offset}:{}),...(frame.easing!==undefined?{easing:frame.easing}:{}),...(frame.composite!==undefined?{composite:frame.composite}:{})}));}
export function legacyKeyframesToMotion(frames:Array<Record<string,string|number|null>>):MotionKeyframe[]{return frames.map(frame=>{const values:Record<string,MotionValue>={};let offset:number|undefined,easing:string|undefined,composite:string|undefined;for(const [key,value] of Object.entries(frame)){if(key==='offset'&&typeof value==='number'){offset=value;continue;}if(key==='easing'&&typeof value==='string'){easing=value;continue;}if(key==='composite'&&typeof value==='string'){composite=value;continue;}values[key]=value;}return{values,...(offset!==undefined?{offset}:{}),...(easing!==undefined?{easing}:{}),...(composite!==undefined?{composite}:{})};});}
export function legacyPatchToMotion(patch:Partial<DetectedAnimation>):InspectorMotionPatch{const timing:Partial<MotionTrack['timing']>={};if(patch.duration!==undefined)timing.duration=patch.duration;if(patch.delay!==undefined)timing.delay=patch.delay;if(patch.easing!==undefined)timing.easing=patch.easing;if(patch.iterations!==undefined)timing.iterations=patch.iterations;if(patch.direction!==undefined)timing.direction=patch.direction;if(patch.fill!==undefined)timing.fill=patch.fill;return{...(Object.keys(timing).length?{timing}:{}),...(patch.keyframes!==undefined?{keyframes:legacyKeyframesToMotion(patch.keyframes)}:{})};}
export function motionTrackPreview(track:MotionTrack,patch:InspectorMotionPatch={}):{duration:number|undefined;delay:number|undefined;easing:string|undefined;keyframes:Array<Record<string,MotionValue>>|undefined}{const timing={...track.timing,...patch.timing},frames=patch.keyframes??track.keyframes;return{duration:timing.duration,delay:timing.delay,easing:timing.easing,keyframes:frames.length?motionKeyframesToLegacy(frames):undefined};}

export function mountMotionIrInspector(root:HTMLElement):()=>void{
 const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
 const current=()=>selectMotionTrack(store.get().motionTracks,store.get().selectedAnimationId);
 const preview=(track:MotionTrack,patch:InspectorMotionPatch={})=>{const value=motionTrackPreview(track,patch);sendCommand(frame(),{type:'APPLY_OVERRIDE',animationId:track.id,duration:value.duration,delay:value.delay,easing:value.easing,keyframes:value.keyframes});};
 const commit=(track:MotionTrack,patch:MotionTrackPatch)=>{store.updateMotionTrack(track.id,patch);const updated=store.getMotionTrack(track.id);if(updated)preview(updated);};
 const change=(event:Event)=>{const target=event.target;if(!(target instanceof HTMLInputElement))return;const track=current();if(!track)return;let patch:MotionTrackPatch|undefined;
  if(target.matches('[data-duration-range],[data-duration-number]'))patch={timing:{duration:Number(target.value)}};
  else if(target.matches('[data-delay]'))patch={timing:{delay:Number(target.value)}};
  else if(target.matches('[data-easing-text]'))patch={timing:{easing:target.value}};
  else if(target.matches('[data-iterations]'))patch={timing:{iterations:Number(target.value)}};
  else if(target.matches('[data-kf-index][data-kf-key]')){const index=Number(target.dataset.kfIndex),key=target.dataset.kfKey;if(!Number.isInteger(index)||!key||!track.keyframes[index])return;const frames=track.keyframes.map(frame=>({...frame,values:{...frame.values}})),frame=frames[index]!;if(key==='offset')frame.offset=Math.max(0,Math.min(1,Number(target.value)));else if(key==='easing')frame.easing=target.value;else frame.values[key]=target.value;patch={keyframes:frames};}
  if(!patch)return;event.stopImmediatePropagation();commit(track,patch);
 };
 const input=(event:Event)=>{const target=event.target;if(!(target instanceof HTMLInputElement)||!target.matches('[data-duration-range]'))return;const track=current();if(!track)return;const duration=Number(target.value),number=root.querySelector<HTMLInputElement>('[data-duration-number]');if(number)number.value=target.value;preview(track,{timing:{duration}});event.stopImmediatePropagation();};
 root.addEventListener('change',change,true);root.addEventListener('input',input,true);
 return()=>{root.removeEventListener('change',change,true);root.removeEventListener('input',input,true);};
}
