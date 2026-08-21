import { groupAnimations, type AnimationGroup } from '../editor/grouping';
import { sendCommand, TIMELINE_STATE_EVENT } from '../preview/bridge';
import { store } from '../state/store';
import type { DetectedAnimation, PreviewMessage, RuntimeElement, TimelineEvent } from '../types/domain';

export const ANIMATION_INSPECT_EVENT='animator:inspect-animation';
export const ANIMATION_CLEAR_INSPECTION_EVENT='animator:clear-animation-inspection';
type TimelineStateMessage=Extract<PreviewMessage,{type:'TIMELINE_STATE'}>;
type InspectionDetail={id:string;elementId:string;origin:number};
type DragState={motion:HTMLElement;pointerId:number;rectLeft:number;pxPerMs:number;duration:number;origin:number;scrollLeft:number};

export function mountTimelineV2(root:HTMLElement):()=>void {
  const timeline=root.querySelector<HTMLElement>('.timeline');
  const legacy=root.querySelector<HTMLElement>('.timelineScroll');
  if(!timeline||!legacy)return()=>{};
  legacy.classList.add('legacyTimeline');
  const viewport=document.createElement('div');viewport.className='timelineV2Viewport';viewport.dataset.timelineV2='';timeline.append(viewport);
  const expanded=new Set<string>(),expandedDetails=new Set<string>();
  let structuralSignature='',eventSignature='',drag:DragState|undefined,raf=0,livePxPerMs=.1,viewOriginMs=0,inspectedAnimationId:string|undefined,stableDuration=1000,lastProject='';

  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(render);};
  const render=():void=>{
    raf=0;
    if(drag){viewport.style.setProperty('--timeline-playhead',`${Math.max(0,(store.get().playhead-drag.origin)*drag.pxPerMs)}px`);return;}
    const state=store.get(),projectKey=state.project?.id??'';
    if(projectKey!==lastProject){lastProject=projectKey;stableDuration=1000;viewOriginMs=0;inspectedAnimationId=undefined;structuralSignature='';eventSignature='';}
    const groups=groupAnimations(state.animations,state.selectedAnimationId),elements=new Map(state.elements.map(element=>[element.id,element]));
    const inspected=inspectedAnimationId?state.animations.find(animation=>animation.id===inspectedAnimationId):undefined;
    if(inspectedAnimationId&&!inspected){inspectedAnimationId=undefined;viewOriginMs=0;}
    const origin=inspected?animationStart(inspected):viewOriginMs;if(inspected)viewOriginMs=origin;
    const measured=inspected?Math.max(100,animationLength(inspected)):timelineEnd(groups);
    const duration=inspected?measured:(stableDuration=Math.max(stableDuration,Math.ceil(measured/250)*250));
    const pxPerMs=Math.max(.05,state.zoom/10);livePxPerMs=pxPerMs;
    const canvasWidth=Math.max(720,Math.ceil(duration*pxPerMs+180));
    viewport.style.setProperty('--timeline-canvas-width',`${canvasWidth}px`);
    viewport.style.setProperty('--timeline-playhead',`${Math.max(0,(state.playhead-origin)*pxPerMs)}px`);
    viewport.dataset.pxPerMs=String(pxPerMs);viewport.dataset.duration=String(duration);viewport.dataset.originMs=String(origin);
    const signature=[state.zoom,state.selectedAnimationId??'',inspectedAnimationId??'',origin,duration,groups.map(group=>groupSignature(group)).join('|'),[...expanded].sort().join(','),[...expandedDetails].sort().join(',')].join('::');
    if(signature!==structuralSignature){
      structuralSignature=signature;eventSignature='';
      viewport.innerHTML=`<div class="v2Row v2RulerRow"><div class="v2Label v2Corner"><span>${inspected?'Solo motion':'Components'}</span></div><div class="v2Motion v2RulerMotion" data-v2-scrub-rail>${ruler(duration,pxPerMs)}</div></div>${groups.map(group=>groupRows(group,elements,expanded,expandedDetails,state.selectedAnimationId,pxPerMs,origin)).join('')}<div class="v2Row v2EventRow"><div class="v2Label"><span class="v2GroupTitle">Events</span><small data-v2-event-count>0</small></div><div class="v2Motion" data-v2-event-motion></div></div>`;
    }
    updateEvents(viewport,state.events,pxPerMs,origin,duration);
  };

  const liveState=(event:Event):void=>{if(drag)return;const detail=(event as CustomEvent<TimelineStateMessage>).detail;if(!detail)return;viewport.style.setProperty('--timeline-playhead',`${Math.max(0,(detail.time-viewOriginMs)*livePxPerMs)}px`);};
  const syncInspection=(event:Event):void=>{const detail=(event as CustomEvent<InspectionDetail>).detail;if(!detail)return;inspectedAnimationId=detail.id;viewOriginMs=Math.max(0,detail.origin);structuralSignature='';eventSignature='';schedule();};
  const selectAnimation=(animation:DetectedAnimation,inspect=false):void=>{
    store.set({selectedAnimationId:animation.id,selectedElementId:animation.elementId.startsWith('static:')?store.get().selectedElementId:animation.elementId});sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id,reveal:inspect});if(!inspect)return;
    inspectedAnimationId=animation.id;viewOriginMs=animationStart(animation);structuralSignature='';sendCommand(frame(),{type:'SET_SOLO_ANIMATION',id:animation.id,elementId:animation.elementId,anchorTime:viewOriginMs});window.dispatchEvent(new CustomEvent<InspectionDetail>(ANIMATION_INSPECT_EVENT,{detail:{id:animation.id,elementId:animation.elementId,origin:viewOriginMs}}));schedule();
  };
  const click=(event:MouseEvent):void=>{const target=(event.target as Element|null)?.closest<HTMLElement>('[data-v2-detail-toggle],[data-v2-inspect],[data-v2-toggle],[data-v2-instance],[data-v2-group]');if(!target)return;if(target.dataset.v2DetailToggle){const key=target.dataset.v2DetailToggle;if(expandedDetails.has(key))expandedDetails.delete(key);else expandedDetails.add(key);structuralSignature='';schedule();event.stopPropagation();return;}if(target.dataset.v2Toggle){const key=target.dataset.v2Toggle;if(expanded.has(key))expanded.delete(key);else expanded.add(key);structuralSignature='';schedule();event.stopPropagation();return;}const id=target.dataset.v2Inspect??target.dataset.v2Instance??target.dataset.v2Group;if(!id)return;const animation=store.get().animations.find(item=>item.id===id);if(!animation)return;selectAnimation(animation,!!target.dataset.v2Inspect);event.stopPropagation();};
  const scrubWith=(event:PointerEvent,state:DragState):void=>{if(viewport.scrollLeft!==state.scrollLeft)viewport.scrollLeft=state.scrollLeft;const local=Math.max(0,Math.min(state.duration,(event.clientX-state.rectLeft)/state.pxPerMs)),time=state.origin+local;viewport.style.setProperty('--timeline-playhead',`${local*state.pxPerMs}px`);store.set({playhead:time});sendCommand(frame(),{type:'SCRUB_TIMELINE',time});};
  const canStartScrub=(event:PointerEvent,motion:HTMLElement):boolean=>{if(motion.matches('[data-v2-scrub-rail]'))return true;const rect=motion.getBoundingClientRect(),pxPerMs=Number(viewport.dataset.pxPerMs??.1),origin=Number(viewport.dataset.originMs??0),playheadX=Math.max(0,(store.get().playhead-origin)*pxPerMs);return Math.abs((event.clientX-rect.left)-playheadX)<=7;};
  const down=(event:PointerEvent):void=>{const motion=(event.target as Element|null)?.closest<HTMLElement>('.v2Motion');if(!motion||!canStartScrub(event,motion))return;const rect=motion.getBoundingClientRect(),pxPerMs=Math.max(.0001,Number(viewport.dataset.pxPerMs??.1));drag={motion,pointerId:event.pointerId,rectLeft:rect.left,pxPerMs,duration:Math.max(0,Number(viewport.dataset.duration??0)),origin:Math.max(0,Number(viewport.dataset.originMs??0)),scrollLeft:viewport.scrollLeft};viewport.classList.add('isScrubbing');viewport.setPointerCapture(event.pointerId);scrubWith(event,drag);event.preventDefault();};
  const move=(event:PointerEvent):void=>{if(drag&&drag.pointerId===event.pointerId&&viewport.hasPointerCapture(event.pointerId))scrubWith(event,drag);};
  const up=(event:PointerEvent):void=>{if(!drag||drag.pointerId!==event.pointerId)return;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);drag=undefined;viewport.classList.remove('isScrubbing');structuralSignature='';eventSignature='';schedule();};
  const keepScrollStable=():void=>{if(drag&&viewport.scrollLeft!==drag.scrollLeft)viewport.scrollLeft=drag.scrollLeft;};
  const clearInspection=():void=>{if(!inspectedAnimationId&&viewOriginMs===0)return;inspectedAnimationId=undefined;viewOriginMs=0;structuralSignature='';eventSignature='';schedule();};

  viewport.addEventListener('click',click);viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',up);viewport.addEventListener('scroll',keepScrollStable);window.addEventListener(TIMELINE_STATE_EVENT,liveState);window.addEventListener(ANIMATION_INSPECT_EVENT,syncInspection);window.addEventListener(ANIMATION_CLEAR_INSPECTION_EVENT,clearInspection);
  const unsubscribe=store.subscribe(schedule);render();
  return()=>{unsubscribe();if(raf)cancelAnimationFrame(raf);viewport.removeEventListener('click',click);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',up);viewport.removeEventListener('scroll',keepScrollStable);window.removeEventListener(TIMELINE_STATE_EVENT,liveState);window.removeEventListener(ANIMATION_INSPECT_EVENT,syncInspection);window.removeEventListener(ANIMATION_CLEAR_INSPECTION_EVENT,clearInspection);viewport.remove();legacy.classList.remove('legacyTimeline');};

  function updateEvents(view:HTMLElement,events:TimelineEvent[],pxPerMs:number,origin:number,duration:number):void{const recent=events.slice(-400),next=`${pxPerMs}:${origin}:${duration}:${recent.map(item=>`${item.id}:${item.at}`).join(',')}`;if(next===eventSignature)return;eventSignature=next;const motion=view.querySelector<HTMLElement>('[data-v2-event-motion]'),count=view.querySelector<HTMLElement>('[data-v2-event-count]');if(!motion||!count)return;count.textContent=String(events.length);motion.innerHTML=recent.filter(item=>item.at>=origin&&item.at<=origin+duration).map(item=>`<i class="v2Event" title="${attr(item.label)}" style="left:${Math.max(0,(item.at-origin)*pxPerMs)}px"></i>`).join('');}
}

function groupRows(group:AnimationGroup,elements:Map<string,RuntimeElement>,expanded:Set<string>,expandedDetails:Set<string>,selectedId:string|undefined,pxPerMs:number,originMs:number):string {
  const runtime=group.instances.filter(instance=>!instance.elementId.startsWith('static:')),instances=runtime.length?runtime:group.instances,selected=group.instances.some(instance=>instance.id===selectedId),representative=instances.find(instance=>instance.id===selectedId)??instances[0]??group.representative,open=expanded.has(group.key),title=group.representative.name??group.representative.type;
  const detail=`${instances.length} component${instances.length===1?'':'s'} · ${group.representative.type}${group.representative.source?.selector?` · ${group.representative.source.selector}`:''}`,detailKey=`g:${group.key}`,detailOpen=expandedDetails.has(detailKey),long=needsDisclosure(title,detail),detailToggle=long?`<button class="v2DetailToggle${detailOpen?' open':''}" data-v2-detail-toggle="${attr(detailKey)}" aria-expanded="${detailOpen}" title="${detailOpen?'Collapse details':'Expand full label'}">${detailOpen?'⌄':'›'}</button>`:'';
  const groupRow=`<div class="v2Row v2GroupRow${selected?' selected':''}${detailOpen?' v2DetailsExpanded':''}"><div class="v2Label"><button class="v2Disclosure" data-v2-toggle="${attr(group.key)}" title="${open?'Collapse':'Show component instances'}">${open?'▾':'▸'}</button><button class="v2GroupButton" data-v2-group="${attr(representative.id)}" title="${attr(`${title} · ${detail}`)}"><span class="v2GroupTitle">${html(title)}</span><small>${html(detail)}</small></button>${detailToggle}<button class="v2Inspect" data-v2-inspect="${attr(representative.id)}" title="Inspect / isolate only this animation">◎</button></div><div class="v2Motion">${instances.map(instance=>clip(instance,pxPerMs,instance.id===selectedId,'v2GroupClip',originMs)).join('')}</div></div>`;
  if(!open)return groupRow;return groupRow+instances.map((instance,index)=>instanceRow(instance,index,instances.length,elements,expandedDetails,selectedId,pxPerMs,originMs)).join('');
}
function instanceRow(instance:DetectedAnimation,index:number,total:number,elements:Map<string,RuntimeElement>,expandedDetails:Set<string>,selectedId:string|undefined,pxPerMs:number,originMs:number):string{const name=componentName(instance,elements),detail=componentDetail(instance,elements),detailKey=`i:${instance.id}`,detailOpen=expandedDetails.has(detailKey),long=needsDisclosure(name,detail),detailToggle=long?`<button class="v2DetailToggle${detailOpen?' open':''}" data-v2-detail-toggle="${attr(detailKey)}" aria-expanded="${detailOpen}" title="${detailOpen?'Collapse details':'Expand full label'}">${detailOpen?'⌄':'›'}</button>`:'';return `<div class="v2Row v2InstanceRow${instance.id===selectedId?' selected':''}${detailOpen?' v2DetailsExpanded':''}"><div class="v2Label v2InstanceLabel"><span class="v2Branch">${index===total-1?'└':'├'}</span><button data-v2-instance="${attr(instance.id)}" title="${attr(`${name} · ${detail}`)}"><span>${html(name)}</span><small>${html(detail)}</small></button>${detailToggle}<button class="v2Inspect" data-v2-inspect="${attr(instance.id)}" title="Inspect / isolate only this animation">◎</button></div><div class="v2Motion">${clip(instance,pxPerMs,true,'v2InstanceClip',originMs)}</div></div>`;}
function clip(animation:DetectedAnimation,pxPerMs:number,selected:boolean,className:string,originMs:number):string {const start=Math.max(0,(animationStart(animation)-originMs)*pxPerMs),duration=Math.max(1,animationLength(animation)*pxPerMs);return `<button class="v2Clip ${className}${selected?' selected':''}" data-v2-instance="${attr(animation.id)}" style="left:${start}px;width:${Math.max(5,duration)}px" title="${attr(`${animation.name??animation.type} · ${Math.round(animation.startTime)}ms · ${Math.round(animation.duration??0)}ms`)}"></button>`;}
function animationStart(animation:DetectedAnimation):number{return Math.max(0,animation.startTime+Math.max(0,Number(animation.delay)||0));}
function animationLength(animation:DetectedAnimation):number{const iterations=Number.isFinite(animation.iterations)&&Number(animation.iterations)>0?Number(animation.iterations):1;return Math.max(1,(animation.duration??100)*iterations);}
function componentName(animation:DetectedAnimation,elements:Map<string,RuntimeElement>):string {const element=elements.get(animation.elementId);if(element){if(element.domId)return `#${element.domId}`;if(element.classes.length)return `${element.tag}.${element.classes.slice(0,4).join('.')}`;return element.text?`${element.tag} · ${element.text.slice(0,48)}`:element.tag;}return animation.source?.selector??animation.elementId.replace(/^static:/,'source:');}
function componentDetail(animation:DetectedAnimation,elements:Map<string,RuntimeElement>):string {const element=elements.get(animation.elementId);if(element){const classes=element.classes.length?`.${element.classes.join('.')}`:'runtime element';return element.text?`${classes} · ${element.text.slice(0,96)}`:classes;}return animation.source?.file?`${animation.source.file}:${animation.source.line??'?'}${animation.source.selector?` · ${animation.source.selector}`:''}`:animation.confidence;}
function needsDisclosure(primary:string,secondary:string):boolean{return primary.length>34||secondary.length>42||primary.length+secondary.length>62;}
function ruler(duration:number,pxPerMs:number):string {const step=rulerStep(pxPerMs),marks:string[]=[];for(let time=0;time<=duration+step;time+=step)marks.push(`<span style="left:${time*pxPerMs}px">${formatTime(time)}</span>`);return marks.join('');}
function timelineEnd(groups:AnimationGroup[]):number {let end=1000;for(const group of groups)for(const animation of group.instances)end=Math.max(end,animationStart(animation)+animationLength(animation));return end;}
function groupSignature(group:AnimationGroup):string {return `${group.key}:${group.instances.map(instance=>`${instance.id}:${instance.startTime}:${instance.duration??0}:${instance.delay??0}:${instance.iterations??1}`).join(',')}`;}
function rulerStep(pxPerMs:number):number{return[10,20,50,100,200,500,1000,2000,5000,10000].find(value=>value>=90/pxPerMs)??10000;}
function formatTime(ms:number):string{return ms>=1000?`${(ms/1000).toFixed(ms%1000===0?0:1)}s`:`${Math.round(ms)}ms`;}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
