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
  };
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(apply);};
  const activateInspectorTab=(event:KeyboardEvent):boolean=>{
    const tab=(event.target as Element|null)?.closest<HTMLButtonElement>('.rightPanel [role="tablist"] [role="tab"]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return false;
    const tabs=[...(tab.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')??[])];if(!tabs.length)return false;
    event.preventDefault();let index=tabs.indexOf(tab);
    if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else index=(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    const next=tabs[index];if(next){next.click();next.focus();}return true;
  };
  const keydown=(event:KeyboardEvent):void=>{
    if(activateInspectorTab(event))return;
    if(event.key!=='Escape')return;
    const details=root.querySelector<HTMLDetailsElement>('.toolbarMore[open]');if(!details)return;
    details.open=false;details.querySelector<HTMLElement>('summary')?.focus();event.stopPropagation();
  };
  const pointerdown=(event:PointerEvent):void=>{
    const details=root.querySelector<HTMLDetailsElement>('.toolbarMore[open]');if(!details)return;
    const target=event.target;if(target instanceof Node&&!details.contains(target))details.open=false;
  };
  const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});
  root.addEventListener('keydown',keydown,true);document.addEventListener('pointerdown',pointerdown,true);schedule();
  return()=>{observer.disconnect();if(raf)cancelAnimationFrame(raf);root.removeEventListener('keydown',keydown,true);document.removeEventListener('pointerdown',pointerdown,true);};
}
