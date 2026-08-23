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
const resizeBounds=(kind:ResizeKind):[number,number]=>kind==='left'?[160,520]:kind==='right'?[220,600]:[150,560];

export function mountAccessibilityRefinement(root:HTMLElement):()=>void{
  let raf=0;
  const resizeKind=(handle:HTMLElement):ResizeKind|undefined=>handle.dataset.resize==='left'||handle.dataset.resize==='right'||handle.dataset.resize==='timeline'?handle.dataset.resize:undefined;
  const resizeValue=(kind:ResizeKind):number=>kind==='left'?(root.querySelector<HTMLElement>('.leftPanel')?.getBoundingClientRect().width??250):kind==='right'?(root.querySelector<HTMLElement>('.rightPanel')?.getBoundingClientRect().width??340):(root.querySelector<HTMLElement>('.timeline')?.getBoundingClientRect().height??270);
  const syncResizeValue=(handle:HTMLElement):void=>{const kind=resizeKind(handle);if(kind)handle.setAttribute('aria-valuenow',String(Math.round(resizeValue(kind))));};
  const applyResize=(handle:HTMLElement,kind:ResizeKind,value:number):void=>{const workspace=root.querySelector<HTMLElement>('.workspace'),app=root.querySelector<HTMLElement>('.app');if(!workspace||!app)return;const [min,max]=resizeBounds(kind),next=Math.max(min,Math.min(max,value));if(kind==='left')workspace.style.setProperty('--left-panel',`${next}px`);else if(kind==='right')workspace.style.setProperty('--right-panel',`${next}px`);else app.style.setProperty('--timeline-height',`${next}px`);handle.setAttribute('aria-valuenow',String(Math.round(next)));};
  const resizeKeydown=(event:KeyboardEvent):void=>{const handle=event.currentTarget as HTMLElement,kind=resizeKind(handle);if(!kind)return;const [min,max]=resizeBounds(kind),step=event.shiftKey?32:12;let next=resizeValue(kind);if(event.key==='Home')next=min;else if(event.key==='End')next=max;else if(kind==='left'&&event.key==='ArrowLeft')next-=step;else if(kind==='left'&&event.key==='ArrowRight')next+=step;else if(kind==='right'&&event.key==='ArrowLeft')next+=step;else if(kind==='right'&&event.key==='ArrowRight')next-=step;else if(kind==='timeline'&&event.key==='ArrowUp')next+=step;else if(kind==='timeline'&&event.key==='ArrowDown')next-=step;else return;event.preventDefault();applyResize(handle,kind,next);};
  const enhanceResizer=(handle:HTMLElement):void=>{
    if(handle.dataset.keyboardResize==='1'){syncResizeValue(handle);return;}
    const kind=resizeKind(handle);if(!kind)return;const [min,max]=resizeBounds(kind);handle.dataset.keyboardResize='1';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation',kind==='timeline'?'horizontal':'vertical');handle.setAttribute('aria-label',kind==='left'?'Resize left panel':kind==='right'?'Resize right panel':'Resize timeline');handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));syncResizeValue(handle);handle.addEventListener('keydown',resizeKeydown);handle.addEventListener('focus',()=>syncResizeValue(handle));handle.addEventListener('pointerup',()=>syncResizeValue(handle));
  };
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
    root.querySelectorAll<HTMLElement>('.panelResizer,.timelineResizer').forEach(enhanceResizer);
  };
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(apply);};
  const openPopup=():HTMLDetailsElement|null=>root.querySelector<HTMLDetailsElement>('.toolbarMore[open],.webLoader[open]');
  const keydown=(event:KeyboardEvent):void=>{
    if(event.key!=='Escape')return;
    const details=openPopup();if(!details)return;
    details.open=false;details.querySelector<HTMLElement>('summary')?.focus();event.stopPropagation();
  };
  const pointerdown=(event:PointerEvent):void=>{
    const details=openPopup();if(!details)return;
    const target=event.target;if(target instanceof Node&&!details.contains(target))details.open=false;
  };
  const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});
  root.addEventListener('keydown',keydown,true);document.addEventListener('pointerdown',pointerdown,true);schedule();
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);root.querySelectorAll<HTMLElement>('.panelResizer,.timelineResizer').forEach(handle=>handle.removeEventListener('keydown',resizeKeydown));root.removeEventListener('keydown',keydown,true);document.removeEventListener('pointerdown',pointerdown,true);};
}
