const controlLabels:ReadonlyArray<[string,string]>=[
  ['[data-path-input]','Project path'],
  ['[data-playback-rate]','Playback rate'],
  ['[data-viewport]','Preview viewport'],
  ['[data-entry]','Preview page'],
  ['[data-web-url]','Web page URL'],
  ['[data-web-engine]','Preview engine'],
  ['[data-reduced-motion]','Emulate reduced motion']
];

export function mountAccessibilityRefinement(root:HTMLElement):()=>void{
  let raf=0;
  const apply=():void=>{
    raf=0;
    root.querySelectorAll<HTMLElement>('.recordStateBadge,[data-preview-chrome] .previewMode').forEach(status=>{
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      status.setAttribute('aria-atomic','true');
    });
    root.querySelectorAll<HTMLElement>('.workspaceResourceTabWrap').forEach(wrapper=>wrapper.setAttribute('role','presentation'));
    root.querySelectorAll<HTMLElement>('.workspaceTabEmpty').forEach(empty=>empty.setAttribute('role','presentation'));
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
      if(button.getAttribute('aria-label')||button.textContent?.trim())return;
      const label=button.title.trim();if(label)button.setAttribute('aria-label',label);
    });
    for(const [selector,label] of controlLabels)root.querySelectorAll<HTMLElement>(selector).forEach(control=>{if(!control.getAttribute('aria-label'))control.setAttribute('aria-label',label);});
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
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);root.removeEventListener('keydown',keydown,true);document.removeEventListener('pointerdown',pointerdown,true);};
}
