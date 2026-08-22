import {filterMotionTracks,moveMotionKeyframe,normalizedMotionKeyframes,type MotionTrack} from '../core/motion';
import {TimelineEngine,layoutMotionTrack,timelineRulerMarks,timelineTimeFromPointer,timelineTimeToPx} from '../core/timeline';
import {sendCommand} from '../preview/bridge';
import {store} from '../state/store';
import {motionTrackPreview} from './motion-ir-inspector';
import {motionViewStore} from './motion-view-store';

type DragState={trackId:string;index:number;frames:ReturnType<typeof normalizedMotionKeyframes>;marker:HTMLElement};

export function mountMotionIrTimeline(root:HTMLElement):()=>void{
  let disposed=false,raf=0,signature='',drag:DragState|undefined;
  const engine=new TimelineEngine();
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const schedule=():void=>{if(disposed||raf)return;raf=requestAnimationFrame(()=>{raf=0;render();});};
  const render=():void=>{
    if(disposed||drag)return;
    const canvas=root.querySelector<HTMLElement>('[data-timeline]'),ruler=root.querySelector<HTMLElement>('[data-ruler]'),tracks=root.querySelector<HTMLElement>('[data-tracks]'),events=root.querySelector<HTMLElement>('[data-event-track]'),playhead=root.querySelector<HTMLElement>('[data-playhead]'),label=root.querySelector<HTMLElement>('[data-playhead-label]');
    if(!canvas||!ruler||!tracks||!events||!playhead)return;
    const state=store.get(),view=motionViewStore.get(),visible=filterMotionTracks(state.motionTracks,view.query,view.filter).slice(0,160),metrics=engine.measure({tracks:visible,events:state.events,zoom:state.zoom,playhead:state.playhead,minCanvasWidth:100,canvasPaddingPx:100}),next=`${view.query}|${view.filter}|${state.selectedAnimationId??''}|${state.zoom}|${state.playhead}|${visible.map(trackSignature).join(',')}|${state.events.slice(-300).map(event=>`${event.id}:${event.at}`).join(',')}`;
    if(next===signature&&tracks.dataset.motionIr==='true')return;signature=next;
    canvas.dataset.duration=String(metrics.duration);canvas.dataset.pxPerMs=String(metrics.pxPerMs);canvas.dataset.timelineOrigin=String(metrics.origin);canvas.style.width=`${metrics.canvasWidth}px`;
    ruler.innerHTML=timelineRulerMarks(metrics.duration,metrics.pxPerMs).map(time=>`<span style="left:${time*metrics.pxPerMs}px">${Math.round(metrics.origin+time)}ms</span>`).join('');
    tracks.innerHTML=visible.map(track=>renderTrack(track,metrics.pxPerMs,state.selectedAnimationId===track.id,metrics.origin)).join('');tracks.dataset.motionIr='true';
    events.innerHTML=state.events.slice(-300).map(event=>`<i title="${attr(event.label)}" style="left:${timelineTimeToPx(event.at,metrics.origin,metrics.pxPerMs)}px"></i>`).join('');
    playhead.style.left=`${metrics.playheadPx}px`;if(label)label.textContent=`${Math.round(state.playhead)} ms`;
  };
  const click=(event:MouseEvent)=>{const row=(event.target as Element|null)?.closest<HTMLElement>('[data-animation-id]');if(!row?.dataset.animationId)return;event.preventDefault();event.stopImmediatePropagation();store.set({selectedAnimationId:row.dataset.animationId});};
  const down=(event:PointerEvent)=>{const marker=(event.target as Element|null)?.closest<HTMLElement>('[data-kf-marker]');if(marker){const row=marker.closest<HTMLElement>('[data-animation-id]'),track=row?.dataset.animationId?store.getMotionTrack(row.dataset.animationId):undefined,index=Number(marker.dataset.kfIndex);if(!track||!Number.isInteger(index))return;marker.setPointerCapture(event.pointerId);drag={trackId:track.id,index,frames:normalizedMotionKeyframes(track),marker};event.preventDefault();event.stopImmediatePropagation();return;}const canvas=(event.target as Element|null)?.closest<HTMLElement>('[data-timeline]');if(canvas){canvas.setPointerCapture(event.pointerId);scrub(event,canvas);event.preventDefault();event.stopImmediatePropagation();}};
  const move=(event:PointerEvent)=>{if(drag){const track=store.getMotionTrack(drag.trackId),canvas=root.querySelector<HTMLElement>('[data-timeline]');if(!track||!canvas)return;const rect=canvas.getBoundingClientRect(),pxPerMs=Number(canvas.dataset.pxPerMs??.1),origin=Number(canvas.dataset.timelineOrigin??0),duration=Number(canvas.dataset.duration??1000),time=timelineTimeFromPointer(event.clientX,rect.left,{origin,duration,pxPerMs,rulerStep:100},{frame:true,thresholdPx:6}),trackStart=track.timing.start+Math.max(0,track.timing.delay??0),trackDuration=Math.max(1,(track.timing.duration??100)*Math.max(1,track.timing.iterations??1)),offset=Math.max(0,Math.min(1,(time-trackStart)/trackDuration));drag.frames=moveMotionKeyframe(drag.frames,drag.index,offset);const movedIndex=drag.frames.findIndex(frame=>Math.abs((frame.offset??0)-offset)<1e-9);drag.index=movedIndex>=0?movedIndex:drag.index;drag.marker.style.left=`${offset*Math.max(4,trackDuration*pxPerMs)}px`;preview(track,{keyframes:drag.frames});event.preventDefault();event.stopImmediatePropagation();return;}const canvas=(event.target as Element|null)?.closest<HTMLElement>('[data-timeline]');if(canvas&&canvas.hasPointerCapture(event.pointerId)){scrub(event,canvas);event.preventDefault();event.stopImmediatePropagation();}};
  const up=(event:PointerEvent)=>{if(!drag)return;const current=drag;drag=undefined;store.updateMotionTrack(current.trackId,{keyframes:current.frames});const track=store.getMotionTrack(current.trackId);if(track)preview(track);event.preventDefault();event.stopImmediatePropagation();schedule();};
  const scrub=(event:PointerEvent,canvas:HTMLElement)=>{const rect=canvas.getBoundingClientRect(),origin=Number(canvas.dataset.timelineOrigin??0),duration=Number(canvas.dataset.duration??1000),pxPerMs=Number(canvas.dataset.pxPerMs??.1),time=timelineTimeFromPointer(event.clientX,rect.left,{origin,duration,pxPerMs,rulerStep:100},{frame:true,thresholdPx:4});store.set({playhead:time});sendCommand(frame(),{type:'SCRUB_TIMELINE',time});};
  const preview=(track:MotionTrack,patch:{keyframes?:ReturnType<typeof normalizedMotionKeyframes>}={})=>{const value=motionTrackPreview(track,patch);sendCommand(frame(),{type:'APPLY_OVERRIDE',animationId:track.id,duration:value.duration,delay:value.delay,easing:value.easing,keyframes:value.keyframes});};
  root.addEventListener('click',click,true);root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);const offStore=store.subscribe(schedule),offView=motionViewStore.subscribe(schedule);schedule();
  return()=>{disposed=true;offStore();offView();root.removeEventListener('click',click,true);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);if(raf)cancelAnimationFrame(raf);};
}

export function renderTrack(track:MotionTrack,pxPerMs:number,selected:boolean,origin=0):string{const {left,width}=layoutMotionTrack(track,{origin,pxPerMs},4),markers=selected?normalizedMotionKeyframes(track).map((frame,index)=>`<i class="keyframeMarker" data-kf-marker data-kf-index="${index}" style="left:${clamp01(frame.offset??fallbackOffset(index,track.keyframes.length))*width}px"></i>`).join(''):'',label=track.name??sourceLabel(track);return `<button class="track${selected?' selected':''}" data-animation-id="${attr(track.id)}" data-motion-source="${attr(track.source.kind)}"><span class="trackLabel">${html(label)}</span><span class="clip" style="left:${left}px;width:${width}px">${markers}</span></button>`;}
function trackSignature(track:MotionTrack):string{return `${track.id}:${track.timing.start}:${track.timing.duration??100}:${track.timing.delay??0}:${track.source.kind}:${track.keyframes.map(frame=>frame.offset??'').join('/')}`;}
function sourceLabel(track:MotionTrack):string{return track.source.kind==='waapi'?'WAAPI':track.source.kind.replaceAll('-',' ');}
function fallbackOffset(index:number,count:number):number{return count<=1?0:index/(count-1);}
function clamp01(value:number):number{return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
