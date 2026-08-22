import { store } from '../state/store';
import type { MotionTrack } from '../core/motion';

export function mountMotionIrTimeline(root:HTMLElement):()=>void{
  let disposed=false,raf=0,writing=false,signature='';
  const tracks=():HTMLElement|null=>root.querySelector<HTMLElement>('[data-tracks]');
  const schedule=():void=>{if(disposed||raf)return;raf=requestAnimationFrame(()=>{raf=0;render();});};
  const render=():void=>{
    if(disposed)return;
    const container=tracks();if(!container)return;
    const state=store.get(),pxPerMs=Number(root.querySelector<HTMLElement>('[data-timeline]')?.dataset.pxPerMs??.1);
    // app-core remains the owner of search/filtering during the compatibility phase.
    // Read the ids it made visible, then replace their visual representation with Motion IR rows.
    const visibleIds=[...container.querySelectorAll<HTMLElement>('[data-animation-id]')].map(node=>node.dataset.animationId).filter((id):id is string=>!!id);
    const ids=visibleIds.length?visibleIds:state.motionTracks.slice(0,160).map(track=>track.id);
    const byId=new Map(state.motionTracks.map(track=>[track.id,track]));
    const visible=ids.map(id=>byId.get(id)).filter((track):track is MotionTrack=>!!track).slice(0,160);
    const next=`${pxPerMs}|${state.selectedAnimationId??''}|${visible.map(trackSignature).join(',')}`;
    if(next===signature&&container.dataset.motionIr==='true')return;
    signature=next;writing=true;
    container.innerHTML=visible.map(track=>renderTrack(track,pxPerMs,state.selectedAnimationId===track.id)).join('');
    container.dataset.motionIr='true';
    writing=false;
  };
  const unsubscribe=store.subscribe(schedule);
  const observer=new MutationObserver(()=>{if(!writing)schedule();});
  const container=tracks();if(container)observer.observe(container,{childList:true,subtree:true});
  schedule();
  return()=>{disposed=true;unsubscribe();observer.disconnect();if(raf)cancelAnimationFrame(raf);};
}

export function renderTrack(track:MotionTrack,pxPerMs:number,selected:boolean):string{
  const left=Math.max(0,track.timing.start*pxPerMs),width=Math.max(4,(track.timing.duration??100)*pxPerMs);
  const markers=selected?track.keyframes.map((frame,index)=>`<i class="keyframeMarker" data-kf-marker data-kf-index="${index}" style="left:${clamp01(frame.offset??fallbackOffset(index,track.keyframes.length))*width}px"></i>`).join(''):'';
  const label=track.name??sourceLabel(track);
  return `<button class="track${selected?' selected':''}" data-animation-id="${attr(track.id)}" data-motion-source="${attr(track.source.kind)}"><span class="trackLabel">${html(label)}</span><span class="clip" style="left:${left}px;width:${width}px">${markers}</span></button>`;
}

export function motionTimelineDuration(tracks:MotionTrack[]):number{
  return tracks.reduce((max,track)=>Math.max(max,track.timing.start+(track.timing.delay??0)+(track.timing.duration??100)*Math.max(1,track.timing.iterations??1)),1000);
}

function trackSignature(track:MotionTrack):string{return `${track.id}:${track.timing.start}:${track.timing.duration??100}:${track.timing.delay??0}:${track.source.kind}:${track.keyframes.map(frame=>frame.offset??'').join('/')}`;}
function sourceLabel(track:MotionTrack):string{return track.source.kind==='waapi'?'WAAPI':track.source.kind.replaceAll('-',' ');}
function fallbackOffset(index:number,count:number):number{return count<=1?0:index/(count-1);}
function clamp01(value:number):number{return Math.max(0,Math.min(1,Number.isFinite(value)?value:0));}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
