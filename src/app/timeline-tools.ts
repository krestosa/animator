import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import { ANIMATION_CLEAR_INSPECTION_EVENT, ANIMATION_INSPECT_EVENT } from './timeline-v2';
import type { DetectedAnimation } from '../types/domain';

const MIN_ZOOM=.25,MAX_ZOOM=24,FRAME_MS=1000/60;
type Isolation='all'|'animation'|'element';
type InspectionDetail={id:string;elementId:string;origin:number};

export function mountTimelineTools(root:HTMLElement):()=>void{
  const top=root.querySelector<HTMLElement>('.timelineTop');if(!top)return()=>{};
  const tools=document.createElement('div');tools.className='timelineProTools';
  tools.innerHTML='<span class="timelineToolGroup"><button data-timeline-zoom="out" title="Zoom out · Ctrl/Cmd -">−</button><button data-timeline-zoom="in" title="Zoom in · Ctrl/Cmd +">+</button><button data-timeline-zoom="frame" title="Zoom to 24 px per frame">1f</button><button data-timeline-zoom="fit" title="Fit complete timeline · Ctrl/Cmd 0">Fit</button><small data-timeline-scale>—</small></span><span class="timelineToolGroup isolationGroup"><button data-isolate="animation" title="Isolate and play only the selected animation">Motion</button><button data-isolate="element" title="Show only animations on the selected element">Element</button><button data-isolate="all" class="active" title="Show complete timeline">All</button><small data-isolation-label>All tracks</small></span><span class="timelineToolGroup focusGroup"><button data-focus-mode title="Spotlight the selected animated element without changing isolation">Focus</button><button data-magnify-mode title="Camera zoom to the selected element">Zoom</button><button data-inspection-clear title="Reset Focus, camera and isolation">Reset</button></span>';
  const previewControls=top.querySelector('.previewEditorControls');top.insertBefore(tools,previewControls);
  let isolation:Isolation='all',raf=0,zoomRaf=0,zoomTarget=store.get().zoom,focusMode=false,focusedAnimationId:string|undefined,isolatedAnimationId:string|undefined,isolatedElementId:string|undefined,lastProjectContext=projectContext();
  const viewport=()=>root.querySelector<HTMLElement>('[data-timeline-v2]');
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const labelWidth=():number=>{const view=viewport();if(!view)return 200;const raw=getComputedStyle(view).getPropertyValue('--timeline-label-width');const parsed=Number.parseFloat(raw);return Number.isFinite(parsed)?parsed:200;};
  const updateScale=():void=>{const view=viewport();const label=tools.querySelector<HTMLElement>('[data-timeline-scale]');if(!view||!label)return;const pxPerMs=Number(view.dataset.pxPerMs??.1);label.textContent=`${(pxPerMs*FRAME_MS).toFixed(1)}px/f · ${Math.round(FRAME_MS*10)/10}ms`;};
  const centerPlayhead=():void=>{const view=viewport();if(!view)return;const scale=Number(view.dataset.pxPerMs??.1),origin=Number(view.dataset.originMs??0),x=labelWidth()+Math.max(0,store.get().playhead-origin)*scale-view.clientWidth*.5;view.scrollTo({left:Math.max(0,x),behavior:'smooth'});};
  const setZoom=(next:number):void=>{zoomTarget=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,next));store.set({zoom:zoomTarget});requestAnimationFrame(()=>requestAnimationFrame(()=>{updateScale();centerPlayhead();}));};
  const fit=():void=>{const view=viewport();if(!view)return;const duration=Math.max(1,Number(view.dataset.duration??1000)),available=Math.max(180,view.clientWidth-labelWidth()-24),pxPerMs=available/duration;setZoom(pxPerMs*10);};
  const zoomFrame=():void=>setZoom((24/FRAME_MS)*10);
  const stepZoom=(direction:1|-1):void=>setZoom((store.get().zoom||1)*(direction>0?1.25:.8));
  const selectedAnimation=():DetectedAnimation|undefined=>{const id=store.get().selectedAnimationId;return id?store.get().animations.find(animation=>animation.id===id):undefined;};
  const animationOrigin=(animation:DetectedAnimation):number=>Math.max(0,animation.startTime+Math.max(0,Number(animation.delay)||0));
  const beginInspection=(animation:DetectedAnimation):void=>{
    const origin=animationOrigin(animation);isolatedAnimationId=animation.id;isolatedElementId=animation.elementId;isolation='animation';
    sendCommand(frame(),{type:'SET_SOLO_ANIMATION',id:animation.id,elementId:animation.elementId,anchorTime:origin});
    sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id,reveal:true});
    window.dispatchEvent(new CustomEvent<InspectionDetail>(ANIMATION_INSPECT_EVENT,{detail:{id:animation.id,elementId:animation.elementId,origin}}));
    applyIsolation();requestAnimationFrame(()=>viewport()?.scrollTo({left:0,behavior:'smooth'}));
  };
  const setFocusMode=(enabled:boolean):void=>{
    if(enabled){const animation=selectedAnimation();if(!animation)return;focusedAnimationId=animation.id;sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id,reveal:true});}
    const id=focusedAnimationId;if(id)sendCommand(frame(),{type:'SET_FOCUS_ANIMATION',id,enabled});
    focusMode=enabled;if(!enabled)focusedAnimationId=undefined;
    const button=tools.querySelector<HTMLButtonElement>('[data-focus-mode]');button?.classList.toggle('active',enabled);button?.setAttribute('aria-pressed',String(enabled));
  };
  const leaveSoloInspection=():void=>{
    if(!isolatedAnimationId)return;sendCommand(frame(),{type:'CLEAR_SOLO_ANIMATION'});isolatedAnimationId=undefined;window.dispatchEvent(new Event(ANIMATION_CLEAR_INSPECTION_EVENT));
  };
  const clearIsolation=():void=>{leaveSoloInspection();isolatedElementId=undefined;isolation='all';applyIsolation();requestAnimationFrame(()=>centerPlayhead());};
  const clearInspection=():void=>{if(focusMode)setFocusMode(false);clearIsolation();};
  const resetForProject=():void=>{focusMode=false;focusedAnimationId=undefined;isolatedAnimationId=undefined;isolatedElementId=undefined;isolation='all';const focus=tools.querySelector<HTMLButtonElement>('[data-focus-mode]');focus?.classList.remove('active');focus?.setAttribute('aria-pressed','false');window.dispatchEvent(new Event(ANIMATION_CLEAR_INSPECTION_EVENT));};
  const setIsolation=(mode:Isolation):void=>{
    if(mode==='all'){clearIsolation();return;}
    if(mode==='animation'){const animation=selectedAnimation();if(animation){beginInspection(animation);return;}isolation='animation';applyIsolation();return;}
    if(mode==='element'){
      const animation=selectedAnimation();isolatedElementId=animation?.elementId??store.get().selectedElementId;
      leaveSoloInspection();isolation='element';applyIsolation();return;
    }
  };
  const validateTargets=():void=>{
    const state=store.get();
    if(isolatedAnimationId&&!state.animations.some(animation=>animation.id===isolatedAnimationId)){sendCommand(frame(),{type:'CLEAR_SOLO_ANIMATION'});isolatedAnimationId=undefined;isolatedElementId=undefined;isolation='all';window.dispatchEvent(new Event(ANIMATION_CLEAR_INSPECTION_EVENT));}
    if(isolation==='element'&&isolatedElementId&&!state.elements.some(element=>element.id===isolatedElementId)&&!state.animations.some(animation=>animation.elementId===isolatedElementId)){isolatedElementId=undefined;isolation='all';}
    if(focusMode&&focusedAnimationId&&!state.animations.some(animation=>animation.id===focusedAnimationId))setFocusMode(false);
  };
  const applyIsolation=():void=>{
    const view=viewport();if(!view)return;const state=store.get();let ids:Set<string>|undefined;
    if(isolation==='animation')ids=new Set(isolatedAnimationId?[isolatedAnimationId]:[]);
    else if(isolation==='element')ids=new Set(isolatedElementId?state.animations.filter(animation=>animation.elementId===isolatedElementId).map(animation=>animation.id):[]);
    const isolated=!!ids;
    for(const row of view.querySelectorAll<HTMLElement>('.v2GroupRow,.v2InstanceRow')){
      const clips=[...row.querySelectorAll<HTMLElement>('[data-v2-instance]')].map(item=>item.dataset.v2Instance).filter((id):id is string=>!!id);
      const matches=!ids||clips.some(id=>ids?.has(id));row.hidden=!matches;
      for(const clip of row.querySelectorAll<HTMLElement>('.v2Clip[data-v2-instance]'))clip.hidden=!!ids&&!ids.has(clip.dataset.v2Instance??'');
    }
    for(const row of view.querySelectorAll<HTMLElement>('.v2EventRow,.v2LoadRow'))row.hidden=isolated;
    tools.querySelectorAll<HTMLButtonElement>('[data-isolate]').forEach(button=>{const active=button.dataset.isolate===isolation;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    const label=tools.querySelector<HTMLElement>('[data-isolation-label]');if(label)label.textContent=isolation==='animation'?(isolatedAnimationId?'1 motion':'Select motion'):isolation==='element'?(isolatedElementId?`${ids?.size??0} on element`:'Select element'):'All tracks';
  };
  const updateAvailability=():void=>{
    const animation=selectedAnimation(),hasAnimation=!!animation,hasElement=!!(animation?.elementId??store.get().selectedElementId);
    const motion=tools.querySelector<HTMLButtonElement>('[data-isolate="animation"]'),element=tools.querySelector<HTMLButtonElement>('[data-isolate="element"]'),focus=tools.querySelector<HTMLButtonElement>('[data-focus-mode]'),zoom=tools.querySelector<HTMLButtonElement>('[data-magnify-mode]');
    if(motion)motion.disabled=!hasAnimation;if(element)element.disabled=!hasElement;if(focus)focus.disabled=!hasAnimation;if(zoom)zoom.disabled=!hasAnimation;
  };
  const schedule=():void=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const context=projectContext();if(context!==lastProjectContext){lastProjectContext=context;resetForProject();}validateTargets();updateScale();applyIsolation();updateAvailability();});};
  const click=(event:MouseEvent):void=>{const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-timeline-zoom],[data-isolate],[data-focus-mode],[data-inspection-clear]');if(!button)return;const zoom=button.dataset.timelineZoom;if(zoom==='in')stepZoom(1);else if(zoom==='out')stepZoom(-1);else if(zoom==='fit')fit();else if(zoom==='frame')zoomFrame();else if(button.dataset.isolate)setIsolation(button.dataset.isolate as Isolation);else if(button.hasAttribute('data-focus-mode'))setFocusMode(!focusMode);else clearInspection();};
  const key=(event:KeyboardEvent):void=>{const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,[contenteditable="true"]'))return;if(event.key==='Escape'&&focusMode){event.preventDefault();setFocusMode(false);return;}const mod=event.ctrlKey||event.metaKey;if(mod&&(event.key==='+'||event.key==='=')){event.preventDefault();stepZoom(1);}else if(mod&&event.key==='-'){event.preventDefault();stepZoom(-1);}else if(mod&&event.key==='0'){event.preventDefault();fit();}else if(!mod&&event.key===']'){event.preventDefault();stepZoom(1);}else if(!mod&&event.key==='['){event.preventDefault();stepZoom(-1);}};
  const wheel=(event:WheelEvent):void=>{const view=viewport();if(!view||!view.contains(event.target as Node)||!(event.ctrlKey||event.metaKey))return;event.preventDefault();if(!zoomRaf)zoomTarget=store.get().zoom;zoomTarget=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoomTarget*Math.exp(-event.deltaY*.0025)));if(!zoomRaf)zoomRaf=requestAnimationFrame(()=>{zoomRaf=0;setZoom(zoomTarget);});};
  const inspected=(event:Event):void=>{const detail=(event as CustomEvent<InspectionDetail>).detail;if(!detail)return;isolatedAnimationId=detail.id;isolatedElementId=detail.elementId;isolation='animation';applyIsolation();requestAnimationFrame(()=>viewport()?.scrollTo({left:0,behavior:'smooth'}));};
  tools.addEventListener('click',click);window.addEventListener('keydown',key);window.addEventListener(ANIMATION_INSPECT_EVENT,inspected);root.addEventListener('wheel',wheel,{passive:false});const unsubscribe=store.subscribe(schedule);const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});schedule();
  return()=>{if(focusMode)setFocusMode(false);leaveSoloInspection();unsubscribe();observer.disconnect();if(raf)cancelAnimationFrame(raf);if(zoomRaf)cancelAnimationFrame(zoomRaf);tools.removeEventListener('click',click);window.removeEventListener('keydown',key);window.removeEventListener(ANIMATION_INSPECT_EVENT,inspected);root.removeEventListener('wheel',wheel);tools.remove();};

  function projectContext():string{const project=store.get().project;return project?`${project.id}:${project.selectedEntry}`:'';}
}