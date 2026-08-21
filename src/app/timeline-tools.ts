import { store } from '../state/store';

const MIN_ZOOM=.25,MAX_ZOOM=24,FRAME_MS=1000/60,LABEL_WIDTH=200;
type Isolation='all'|'animation'|'element';

export function mountTimelineTools(root:HTMLElement):()=>void{
  const top=root.querySelector<HTMLElement>('.timelineTop');if(!top)return()=>{};
  const tools=document.createElement('div');tools.className='timelineProTools';
  tools.innerHTML='<span class="timelineToolGroup"><button data-timeline-zoom="out" title="Zoom out · Ctrl/Cmd -">−</button><button data-timeline-zoom="in" title="Zoom in · Ctrl/Cmd +">+</button><button data-timeline-zoom="frame" title="Zoom to 24 px per frame">1f</button><button data-timeline-zoom="fit" title="Fit complete timeline · Ctrl/Cmd 0">Fit</button><small data-timeline-scale>—</small></span><span class="timelineToolGroup isolationGroup"><button data-isolate="animation" title="Show only selected animation">Motion</button><button data-isolate="element" title="Show only animations on selected element">Element</button><button data-isolate="all" class="active" title="Show complete timeline">All</button><small data-isolation-label>All tracks</small></span>';
  const previewControls=top.querySelector('.previewEditorControls');top.insertBefore(tools,previewControls);
  let isolation:Isolation='all',raf=0,zoomTarget=store.get().zoom;
  const viewport=()=>root.querySelector<HTMLElement>('[data-timeline-v2]');
  const updateScale=():void=>{const view=viewport();const label=tools.querySelector<HTMLElement>('[data-timeline-scale]');if(!view||!label)return;const pxPerMs=Number(view.dataset.pxPerMs??.1);label.textContent=`${(pxPerMs*FRAME_MS).toFixed(1)}px/f · ${Math.round(FRAME_MS*10)/10}ms`;};
  const centerPlayhead=():void=>{const view=viewport();if(!view)return;const scale=Number(view.dataset.pxPerMs??.1),x=LABEL_WIDTH+store.get().playhead*scale-view.clientWidth*.5;view.scrollTo({left:Math.max(0,x),behavior:'smooth'});};
  const setZoom=(next:number):void=>{zoomTarget=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,next));store.set({zoom:zoomTarget});requestAnimationFrame(()=>requestAnimationFrame(()=>{updateScale();centerPlayhead();}));};
  const fit=():void=>{const view=viewport();if(!view)return;const duration=Math.max(1,Number(view.dataset.duration??1000)),available=Math.max(180,view.clientWidth-LABEL_WIDTH-24),pxPerMs=available/duration;setZoom(pxPerMs*10);};
  const zoomFrame=():void=>setZoom((24/FRAME_MS)*10);
  const stepZoom=(direction:1|-1):void=>setZoom((store.get().zoom||1)*(direction>0?1.25:.8));
  const setIsolation=(mode:Isolation):void=>{isolation=mode;applyIsolation();};
  const applyIsolation=():void=>{
    const view=viewport();if(!view)return;const state=store.get();let ids:Set<string>|undefined;
    if(isolation==='animation')ids=new Set(state.selectedAnimationId?[state.selectedAnimationId]:[]);
    else if(isolation==='element')ids=new Set(state.animations.filter(animation=>animation.elementId===state.selectedElementId).map(animation=>animation.id));
    const isolated=!!ids;
    for(const row of view.querySelectorAll<HTMLElement>('.v2GroupRow,.v2InstanceRow')){
      const clips=[...row.querySelectorAll<HTMLElement>('[data-v2-instance]')].map(item=>item.dataset.v2Instance).filter((id):id is string=>!!id);
      const matches=!ids||clips.some(id=>ids!.has(id));row.hidden=!matches;
      for(const clip of row.querySelectorAll<HTMLElement>('.v2Clip[data-v2-instance]'))clip.hidden=!!ids&&!ids.has(clip.dataset.v2Instance??'');
    }
    for(const row of view.querySelectorAll<HTMLElement>('.v2EventRow,.v2LoadRow'))row.hidden=isolated;
    tools.querySelectorAll<HTMLButtonElement>('[data-isolate]').forEach(button=>button.classList.toggle('active',button.dataset.isolate===isolation));
    const label=tools.querySelector<HTMLElement>('[data-isolation-label]');if(label)label.textContent=isolation==='animation'?(state.selectedAnimationId?'1 motion':'Select motion'):isolation==='element'?(state.selectedElementId?`${ids?.size??0} on element`:'Select element'):'All tracks';
  };
  const schedule=():void=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;updateScale();applyIsolation();});};
  const click=(event:MouseEvent):void=>{const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-timeline-zoom],[data-isolate]');if(!button)return;const zoom=button.dataset.timelineZoom;if(zoom==='in')stepZoom(1);else if(zoom==='out')stepZoom(-1);else if(zoom==='fit')fit();else if(zoom==='frame')zoomFrame();else if(button.dataset.isolate)setIsolation(button.dataset.isolate as Isolation);};
  const key=(event:KeyboardEvent):void=>{const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,[contenteditable="true"]'))return;const mod=event.ctrlKey||event.metaKey;if(mod&&(event.key==='+'||event.key==='=')){event.preventDefault();stepZoom(1);}else if(mod&&event.key==='-'){event.preventDefault();stepZoom(-1);}else if(mod&&event.key==='0'){event.preventDefault();fit();}else if(!mod&&event.key===']'){event.preventDefault();stepZoom(1);}else if(!mod&&event.key==='['){event.preventDefault();stepZoom(-1);}};
  const wheel=(event:WheelEvent):void=>{const view=viewport();if(!view||!view.contains(event.target as Node)||!(event.ctrlKey||event.metaKey))return;event.preventDefault();zoomTarget=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,zoomTarget*Math.exp(-event.deltaY*.0025)));if(!raf)raf=requestAnimationFrame(()=>{raf=0;setZoom(zoomTarget);});};
  tools.addEventListener('click',click);window.addEventListener('keydown',key);root.addEventListener('wheel',wheel,{passive:false});const unsubscribe=store.subscribe(schedule);const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});schedule();
  return()=>{unsubscribe();observer.disconnect();if(raf)cancelAnimationFrame(raf);tools.removeEventListener('click',click);window.removeEventListener('keydown',key);root.removeEventListener('wheel',wheel);tools.remove();};
}
