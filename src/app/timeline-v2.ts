import { groupAnimations, type AnimationGroup } from '../editor/grouping';
import { sendCommand, TIMELINE_STATE_EVENT } from '../preview/bridge';
import { store } from '../state/store';
import type { DetectedAnimation, PreviewMessage, RuntimeElement } from '../types/domain';

const LABEL_WIDTH=228;
type TimelineStateMessage=Extract<PreviewMessage,{type:'TIMELINE_STATE'}>;

export function mountTimelineV2(root:HTMLElement):()=>void {
  const timeline=root.querySelector<HTMLElement>('.timeline');
  const legacy=root.querySelector<HTMLElement>('.timelineScroll');
  if(!timeline||!legacy)return()=>{};
  legacy.classList.add('legacyTimeline');
  const viewport=document.createElement('div');viewport.className='timelineV2Viewport';viewport.dataset.timelineV2='';timeline.append(viewport);
  const expanded=new Set<string>();
  let structuralSignature='',dragging=false,dragMotion:HTMLElement|null=null,raf=0,livePxPerMs=.1;

  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(render);};
  const render=():void=>{
    raf=0;const state=store.get(),groups=groupAnimations(state.animations,state.selectedAnimationId);
    const duration=timelineEnd(groups,state.events.map(event=>event.at));
    const pxPerMs=Math.max(.05,state.zoom/10);livePxPerMs=pxPerMs;
    const canvasWidth=Math.max(720,Math.ceil(duration*pxPerMs+180));
    viewport.style.setProperty('--timeline-label-width',`${LABEL_WIDTH}px`);
    viewport.style.setProperty('--timeline-canvas-width',`${canvasWidth}px`);
    viewport.style.setProperty('--timeline-playhead',`${Math.max(0,state.playhead*pxPerMs)}px`);
    viewport.dataset.pxPerMs=String(pxPerMs);viewport.dataset.duration=String(duration);
    const signature=[state.zoom,state.selectedAnimationId??'',groups.map(group=>groupSignature(group)).join('|'),state.events.map(event=>`${event.id}:${event.at}`).join(','),[...expanded].sort().join(',')].join('::');
    if(signature===structuralSignature)return;structuralSignature=signature;
    const elements=new Map(state.elements.map(element=>[element.id,element]));
    viewport.innerHTML=`<div class="v2Row v2RulerRow"><div class="v2Label v2Corner"><span>Components</span></div><div class="v2Motion v2RulerMotion">${ruler(duration,pxPerMs)}</div></div>${groups.map(group=>groupRows(group,elements,expanded,state.selectedAnimationId,pxPerMs)).join('')}<div class="v2Row v2EventRow"><div class="v2Label"><span class="v2GroupTitle">Events</span><small>${state.events.length}</small></div><div class="v2Motion">${state.events.slice(-400).map(event=>`<i class="v2Event" title="${attr(event.label)}" style="left:${Math.max(0,event.at*pxPerMs)}px"></i>`).join('')}</div></div>`;
  };

  const liveState=(event:Event):void=>{const detail=(event as CustomEvent<TimelineStateMessage>).detail;if(!detail)return;viewport.style.setProperty('--timeline-playhead',`${Math.max(0,detail.time*livePxPerMs)}px`);};
  const click=(event:MouseEvent):void=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('[data-v2-toggle],[data-v2-instance],[data-v2-group]');if(!target)return;
    if(target.dataset.v2Toggle){const key=target.dataset.v2Toggle;if(expanded.has(key))expanded.delete(key);else expanded.add(key);structuralSignature='';schedule();event.stopPropagation();return;}
    const id=target.dataset.v2Instance??target.dataset.v2Group;if(!id)return;
    const animation=store.get().animations.find(item=>item.id===id);if(!animation)return;
    store.set({selectedAnimationId:animation.id,selectedElementId:animation.elementId.startsWith('static:')?store.get().selectedElementId:animation.elementId});
    sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id});
  };
  const scrub=(event:PointerEvent,motion:HTMLElement):void=>{
    const pxPerMs=Number(viewport.dataset.pxPerMs??.1),duration=Number(viewport.dataset.duration??0),rect=motion.getBoundingClientRect();
    const x=event.clientX-rect.left;
    const time=Math.max(0,Math.min(duration,x/pxPerMs));
    store.set({playhead:time});sendCommand(frame(),{type:'SCRUB_TIMELINE',time});
  };
  const down=(event:PointerEvent):void=>{const motion=(event.target as Element|null)?.closest<HTMLElement>('.v2Motion');if(!motion)return;dragging=true;dragMotion=motion;viewport.setPointerCapture(event.pointerId);scrub(event,motion);};
  const move=(event:PointerEvent):void=>{if(dragging&&dragMotion&&viewport.hasPointerCapture(event.pointerId))scrub(event,dragMotion);};
  const up=(event:PointerEvent):void=>{dragging=false;dragMotion=null;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);};

  viewport.addEventListener('click',click);viewport.addEventListener('pointerdown',down);viewport.addEventListener('pointermove',move);viewport.addEventListener('pointerup',up);viewport.addEventListener('pointercancel',up);window.addEventListener(TIMELINE_STATE_EVENT,liveState);
  const unsubscribe=store.subscribe(schedule);render();
  return()=>{unsubscribe();if(raf)cancelAnimationFrame(raf);viewport.removeEventListener('click',click);viewport.removeEventListener('pointerdown',down);viewport.removeEventListener('pointermove',move);viewport.removeEventListener('pointerup',up);viewport.removeEventListener('pointercancel',up);window.removeEventListener(TIMELINE_STATE_EVENT,liveState);viewport.remove();legacy.classList.remove('legacyTimeline');};
}

function groupRows(group:AnimationGroup,elements:Map<string,RuntimeElement>,expanded:Set<string>,selectedId:string|undefined,pxPerMs:number):string {
  const runtime=group.instances.filter(instance=>!instance.elementId.startsWith('static:'));
  const instances=runtime.length?runtime:group.instances;
  const selected=group.instances.some(instance=>instance.id===selectedId);
  const representative=instances.find(instance=>instance.id===selectedId)??instances[0]??group.representative;
  const open=expanded.has(group.key);
  const title=group.representative.name??group.representative.type;
  const groupRow=`<div class="v2Row v2GroupRow${selected?' selected':''}"><div class="v2Label"><button class="v2Disclosure" data-v2-toggle="${attr(group.key)}" title="${open?'Collapse':'Show component instances'}">${open?'▾':'▸'}</button><button class="v2GroupButton" data-v2-group="${attr(representative.id)}"><span class="v2GroupTitle">${html(title)}</span><small>${instances.length} component${instances.length===1?'':'s'} · ${html(group.representative.type)}</small></button></div><div class="v2Motion">${instances.map(instance=>clip(instance,pxPerMs,instance.id===selectedId,'v2GroupClip')).join('')}</div></div>`;
  if(!open)return groupRow;
  return groupRow+instances.map((instance,index)=>`<div class="v2Row v2InstanceRow${instance.id===selectedId?' selected':''}"><div class="v2Label v2InstanceLabel"><span class="v2Branch">${index===instances.length-1?'└':'├'}</span><button data-v2-instance="${attr(instance.id)}" title="Select and highlight this component"><span>${html(componentName(instance,elements))}</span><small>${html(componentDetail(instance,elements))}</small></button></div><div class="v2Motion">${clip(instance,pxPerMs,true,'v2InstanceClip')}</div></div>`).join('');
}
function clip(animation:DetectedAnimation,pxPerMs:number,selected:boolean,className:string):string {
  const delay=Number(animation.delay)||0,iterations=Number.isFinite(animation.iterations)&&Number(animation.iterations)>0?Number(animation.iterations):1;
  const start=Math.max(0,(animation.startTime+Math.max(0,delay))*pxPerMs),duration=Math.max(1,(animation.duration??100)*iterations*pxPerMs);
  return `<button class="v2Clip ${className}${selected?' selected':''}" data-v2-instance="${attr(animation.id)}" style="left:${start}px;width:${Math.max(5,duration)}px" title="${attr(`${animation.name??animation.type} · ${Math.round(animation.startTime)}ms · ${Math.round(animation.duration??0)}ms`)}"></button>`;
}
function componentName(animation:DetectedAnimation,elements:Map<string,RuntimeElement>):string {
  const element=elements.get(animation.elementId);if(element){if(element.domId)return `#${element.domId}`;if(element.classes.length)return `${element.tag}.${element.classes.slice(0,2).join('.')}`;return element.tag;}
  return animation.source?.selector??animation.elementId.replace(/^static:/,'source:');
}
function componentDetail(animation:DetectedAnimation,elements:Map<string,RuntimeElement>):string {
  const element=elements.get(animation.elementId);if(element)return element.text?`${element.tag} · ${element.text.slice(0,36)}`:`${element.tag} · ${element.classes.join('.')||'runtime element'}`;
  return animation.source?.file?`${animation.source.file}:${animation.source.line??'?'}`:animation.confidence;
}
function ruler(duration:number,pxPerMs:number):string {const step=rulerStep(pxPerMs),marks:string[]=[];for(let time=0;time<=duration+step;time+=step)marks.push(`<span style="left:${time*pxPerMs}px">${formatTime(time)}</span>`);return marks.join('');}
function timelineEnd(groups:AnimationGroup[],events:number[]):number {let end=1000;for(const group of groups)for(const animation of group.instances){const iterations=Number.isFinite(animation.iterations)&&Number(animation.iterations)>0?Number(animation.iterations):1;end=Math.max(end,animation.startTime+Math.max(0,animation.delay??0)+(animation.duration??100)*iterations);}for(const at of events)end=Math.max(end,at);return end;}
function groupSignature(group:AnimationGroup):string {return `${group.key}:${group.instances.map(instance=>`${instance.id}:${instance.startTime}:${instance.duration??0}:${instance.delay??0}:${instance.iterations??1}:${instance.runtimeState}`).join(',')}`;}
function rulerStep(pxPerMs:number):number{return[10,20,50,100,200,500,1000,2000,5000,10000].find(value=>value>=90/pxPerMs)??10000;}
function formatTime(ms:number):string{return ms>=1000?`${(ms/1000).toFixed(ms%1000===0?0:1)}s`:`${Math.round(ms)}ms`;}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
