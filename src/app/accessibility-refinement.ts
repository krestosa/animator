import {TIMELINE_FRAME_MS} from '../core/timeline';
import {sendCommand} from '../preview/bridge';
import {store} from '../state/store';

const controlLabels:ReadonlyArray<[string,string]>=[
  ['[data-path-input]','Project path'],
  ['[data-playback-rate]','Playback rate'],
  ['[data-viewport]','Preview viewport'],
  ['[data-entry]','Preview page'],
  ['[data-web-url]','Web page URL'],
  ['[data-web-engine]','Preview engine'],
  ['[data-reduced-motion]','Emulate reduced motion'],
  ['[data-global-search]','Search files, elements and animations'],
  ['[data-custom-width]','Custom viewport width'],
  ['[data-custom-height]','Custom viewport height'],
  ['[data-loop-all]','Loop all animations'],
  ['[data-preview-auto]','Automatically capture viewport motion'],
  ['[data-dialog-close]','Close create animation dialog'],
  ['.motionDialog','Create animation'],
  ['[data-assets-refresh]','Refresh asset references'],
  ['[data-canvas-hand]','Toggle hand tool'],
  ['[data-canvas-zoom-out]','Zoom out canvas'],
  ['[data-canvas-zoom-label]','Reset canvas zoom'],
  ['[data-canvas-zoom-in]','Zoom in canvas'],
  ['[data-canvas-fit]','Fit preview to view'],
  ['[data-action="add-keyframe"]','Add keyframe'],
  ['[data-delete-preset]','Delete custom preset']
];

type ResizeKind='left'|'right'|'timeline';
type ResizeDrag={handle:HTMLElement;kind:ResizeKind;startX:number;startY:number;initial:number};
type TimelineFocusToken={attribute:'data-v2-toggle'|'data-v2-detail-toggle'|'data-v2-inspect'|'data-v2-instance'|'data-v2-group';value:string;row:'group'|'instance'|'none';className:string};
const resizeBounds=(kind:ResizeKind):[number,number]=>kind==='left'?[160,520]:kind==='right'?[220,600]:[150,560];
const timelineFocusAttributes:TimelineFocusToken['attribute'][]=['data-v2-toggle','data-v2-detail-toggle','data-v2-inspect','data-v2-instance','data-v2-group'];

export function mountAccessibilityRefinement(root:HTMLElement):()=>void{
  let raf=0,resizeDrag:ResizeDrag|undefined;
  const resizeHandle=(value:EventTarget|null):HTMLElement|undefined=>value instanceof Element?value.closest<HTMLElement>('.panelResizer,.timelineResizer')??undefined:undefined;
  const resizeKind=(handle:HTMLElement):ResizeKind|undefined=>handle.dataset.resize==='left'||handle.dataset.resize==='right'||handle.dataset.resize==='timeline'?handle.dataset.resize:undefined;
  const resizeValue=(kind:ResizeKind):number=>kind==='left'?(root.querySelector<HTMLElement>('.leftPanel')?.getBoundingClientRect().width??250):kind==='right'?(root.querySelector<HTMLElement>('.rightPanel')?.getBoundingClientRect().width??340):(root.querySelector<HTMLElement>('.timeline')?.getBoundingClientRect().height??270);
  const syncResizeValue=(handle:HTMLElement):void=>{const kind=resizeKind(handle);if(kind)handle.setAttribute('aria-valuenow',String(Math.round(resizeValue(kind))));};
  const applyResize=(handle:HTMLElement,kind:ResizeKind,value:number):void=>{const workspace=root.querySelector<HTMLElement>('.workspace'),app=root.querySelector<HTMLElement>('.app');if(!workspace||!app)return;const [min,max]=resizeBounds(kind),next=Math.max(min,Math.min(max,value));if(kind==='left')workspace.style.setProperty('--left-panel',`${next}px`,'important');else if(kind==='right')workspace.style.setProperty('--right-panel',`${next}px`,'important');else app.style.setProperty('--timeline-height',`${next}px`,'important');handle.setAttribute('aria-valuenow',String(Math.round(next)));};
  const enhanceResizer=(handle:HTMLElement):void=>{
    const kind=resizeKind(handle);if(!kind)return;const [min,max]=resizeBounds(kind);handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation',kind==='timeline'?'horizontal':'vertical');handle.setAttribute('aria-label',kind==='left'?'Resize left panel':kind==='right'?'Resize right panel':'Resize timeline');handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));syncResizeValue(handle);
  };
  const timelineSlider=(value:EventTarget|null):HTMLElement|undefined=>value instanceof Element?value.closest<HTMLElement>('[data-v2-scrub-rail]')??undefined:undefined;
  const timelineBounds=(rail:HTMLElement):{timeline:HTMLElement;origin:number;duration:number;max:number;pxPerMs:number}|undefined=>{const timeline=rail.closest<HTMLElement>('[data-timeline-v2]');if(!timeline)return undefined;const origin=Number(timeline.dataset.originMs??0),duration=Math.max(0,Number(timeline.dataset.duration??0)),pxPerMs=Math.max(.0001,Number(timeline.dataset.pxPerMs??.1));if(!Number.isFinite(origin)||!Number.isFinite(duration)||!Number.isFinite(pxPerMs))return undefined;return{timeline,origin,duration,max:origin+duration,pxPerMs};};
  const syncTimelineSlider=():void=>{for(const rail of root.querySelectorAll<HTMLElement>('[data-v2-scrub-rail]')){const bounds=timelineBounds(rail);if(!bounds)continue;const value=Math.max(bounds.origin,Math.min(bounds.max,store.get().playhead));rail.tabIndex=0;rail.setAttribute('role','slider');rail.setAttribute('aria-label','Timeline playhead');rail.setAttribute('aria-orientation','horizontal');rail.setAttribute('aria-valuemin',String(bounds.origin));rail.setAttribute('aria-valuemax',String(bounds.max));rail.setAttribute('aria-valuenow',String(value));rail.setAttribute('aria-valuetext',`${Math.round(value)} ms · frame ${Math.round((value-bounds.origin)/TIMELINE_FRAME_MS)}`);}};
  const setTimelineTime=(rail:HTMLElement,time:number):void=>{const bounds=timelineBounds(rail);if(!bounds)return;const next=Math.max(bounds.origin,Math.min(bounds.max,time));bounds.timeline.style.setProperty('--timeline-playhead',`${Math.max(0,(next-bounds.origin)*bounds.pxPerMs)}px`);store.set({playhead:next});sendCommand(root.querySelector<HTMLIFrameElement>('[data-preview-frame]'),{type:'SCRUB_TIMELINE',time:next});rail.setAttribute('aria-valuenow',String(next));rail.setAttribute('aria-valuetext',`${Math.round(next)} ms · frame ${Math.round((next-bounds.origin)/TIMELINE_FRAME_MS)}`);};
  const timelineFocusToken=(target:HTMLElement):TimelineFocusToken|undefined=>{for(const attribute of timelineFocusAttributes){const value=target.getAttribute(attribute);if(value===null)continue;const row=target.closest('.v2GroupRow')?'group':target.closest('.v2InstanceRow')?'instance':'none';return{attribute,value,row,className:target.className};}return undefined;};
  const restoreTimelineFocus=(token:TimelineFocusToken):void=>{const candidates=[...root.querySelectorAll<HTMLElement>(`[${token.attribute}]`)].filter(candidate=>candidate.getAttribute(token.attribute)===token.value);const matchingRow=candidates.find(candidate=>(token.row==='group'?!!candidate.closest('.v2GroupRow'):token.row==='instance'?!!candidate.closest('.v2InstanceRow'):!candidate.closest('.v2GroupRow,.v2InstanceRow'))&&candidate.className===token.className),fallback=candidates.find(candidate=>token.row==='group'?!!candidate.closest('.v2GroupRow'):token.row==='instance'?!!candidate.closest('.v2InstanceRow'):true);(matchingRow??fallback)?.focus();};
  const apply=():void=>{
    raf=0;
    root.querySelectorAll<HTMLElement>('.recordStateBadge,[data-preview-chrome] .previewMode,[data-assets-status],[data-preview-capture-status]').forEach(status=>{
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      status.setAttribute('aria-atomic','true');
    });
    root.querySelectorAll<HTMLElement>('.workspaceResourceTabWrap').forEach(wrapper=>wrapper.setAttribute('role','presentation'));
    root.querySelectorAll<HTMLElement>('.workspaceTabEmpty').forEach(empty=>empty.setAttribute('role','presentation'));
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
      if(button.getAttribute('aria-label'))return;const text=button.textContent?.trim()??'',label=button.title.trim();
      if(label&&(!text||/^[×+−↻◎▾▸⌄›]+$/.test(text)))button.setAttribute('aria-label',label);
    });
    for(const [selector,label] of controlLabels)root.querySelectorAll<HTMLElement>(selector).forEach(control=>{if(!control.getAttribute('aria-label'))control.setAttribute('aria-label',label);});
    root.querySelectorAll<HTMLElement>('.panelResizer,.timelineResizer').forEach(enhanceResizer);syncTimelineSlider();
  };
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(apply);};
  const openPopup=():HTMLDetailsElement|null=>root.querySelector<HTMLDetailsElement>('.toolbarMore[open],.webLoader[open]');
  const keydown=(event:KeyboardEvent):void=>{
    const rail=timelineSlider(event.target),bounds=rail&&timelineBounds(rail);if(rail&&bounds&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){const step=TIMELINE_FRAME_MS*(event.shiftKey?10:1),current=Math.max(bounds.origin,Math.min(bounds.max,store.get().playhead));let next=current;if(event.key==='Home')next=bounds.origin;else if(event.key==='End')next=bounds.max;else if(event.key==='ArrowLeft'||event.key==='ArrowDown')next=current-step;else next=current+step;event.preventDefault();event.stopPropagation();setTimelineTime(rail,next);return;}
    const handle=resizeHandle(event.target),kind=handle&&resizeKind(handle);
    if(handle&&kind){const [min,max]=resizeBounds(kind),step=event.shiftKey?32:12;let next=resizeValue(kind);if(event.key==='Home')next=min;else if(event.key==='End')next=max;else if(kind==='left'&&event.key==='ArrowLeft')next-=step;else if(kind==='left'&&event.key==='ArrowRight')next+=step;else if(kind==='right'&&event.key==='ArrowLeft')next+=step;else if(kind==='right'&&event.key==='ArrowRight')next-=step;else if(kind==='timeline'&&event.key==='ArrowUp')next+=step;else if(kind==='timeline'&&event.key==='ArrowDown')next-=step;else next=Number.NaN;if(Number.isFinite(next)){event.preventDefault();applyResize(handle,kind,next);return;}}
    if(event.key!=='Escape')return;
    const details=openPopup();if(!details)return;
    details.open=false;details.querySelector<HTMLElement>('summary')?.focus();event.stopPropagation();
  };
  const click=(event:MouseEvent):void=>{if(event.detail!==0)return;const target=(event.target as Element|null)?.closest<HTMLElement>('[data-v2-toggle],[data-v2-detail-toggle],[data-v2-inspect],[data-v2-instance],[data-v2-group]');if(!target)return;const token=timelineFocusToken(target);if(!token)return;requestAnimationFrame(()=>requestAnimationFrame(()=>restoreTimelineFocus(token)));};
  const pointerdown=(event:PointerEvent):void=>{
    const handle=resizeHandle(event.target),kind=handle&&resizeKind(handle);if(handle&&kind){resizeDrag={handle,kind,startX:event.clientX,startY:event.clientY,initial:resizeValue(kind)};syncResizeValue(handle);}
    const details=openPopup();if(!details)return;
    const target=event.target;if(target instanceof Node&&!details.contains(target))details.open=false;
  };
  const pointermove=(event:PointerEvent):void=>{if(!resizeDrag)return;const {handle,kind,startX,startY,initial}=resizeDrag;if(kind==='left')applyResize(handle,kind,initial+event.clientX-startX);else if(kind==='right')applyResize(handle,kind,initial-(event.clientX-startX));else applyResize(handle,kind,initial-(event.clientY-startY));};
  const endResize=():void=>{if(resizeDrag)syncResizeValue(resizeDrag.handle);resizeDrag=undefined;};
  const focusin=(event:FocusEvent):void=>{const handle=resizeHandle(event.target);if(handle)syncResizeValue(handle);const rail=timelineSlider(event.target);if(rail)syncTimelineSlider();};
  const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});const unsubscribeStore=store.subscribe(syncTimelineSlider);
  root.addEventListener('keydown',keydown,true);root.addEventListener('click',click,true);root.addEventListener('focusin',focusin);document.addEventListener('pointerdown',pointerdown,true);window.addEventListener('pointermove',pointermove,true);window.addEventListener('pointerup',endResize,true);window.addEventListener('pointercancel',endResize,true);schedule();
  return()=>{unsubscribeStore();observer.disconnect();if(raf)cancelAnimationFrame(raf);root.removeEventListener('keydown',keydown,true);root.removeEventListener('click',click,true);root.removeEventListener('focusin',focusin);document.removeEventListener('pointerdown',pointerdown,true);window.removeEventListener('pointermove',pointermove,true);window.removeEventListener('pointerup',endResize,true);window.removeEventListener('pointercancel',endResize,true);};
}
