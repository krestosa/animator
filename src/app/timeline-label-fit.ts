export function mountTimelineLabelFit(root:HTMLElement):()=>void{
  let raf=0,stableWidth=260;
  const viewport=root.querySelector<HTMLElement>('[data-timeline-v2]');
  if(!viewport)return()=>{};
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(measure);};
  const measure=():void=>{
    raf=0;
    let desired=260,seen=0;
    for(const label of viewport.querySelectorAll<HTMLElement>('.v2GroupRow .v2Label,.v2InstanceRow .v2Label')){
      if(seen++>500)break;
      const content=label.querySelector<HTMLElement>('.v2GroupButton,.v2InstanceLabel button[data-v2-instance]');if(!content)continue;
      const primary=content.querySelector<HTMLElement>('span'),secondary=content.querySelector<HTMLElement>('small');
      const natural=Math.max(primary?.scrollWidth??0,secondary?.scrollWidth??0);
      const fixed=[...label.children].filter(child=>child!==content).reduce((sum,child)=>sum+(child as HTMLElement).offsetWidth,0);
      desired=Math.max(desired,natural+fixed+34);
    }
    desired=Math.max(260,Math.min(440,Math.ceil(desired)));
    stableWidth=Math.max(stableWidth,desired);
    const current=Number.parseFloat(getComputedStyle(viewport).getPropertyValue('--timeline-label-width'));
    if(!Number.isFinite(current)||Math.abs(current-stableWidth)>1)viewport.style.setProperty('--timeline-label-width',`${stableWidth}px`,'important');
    for(const row of viewport.querySelectorAll<HTMLElement>('.v2GroupRow,.v2InstanceRow'))updateDisclosure(row);
  };
  const updateDisclosure=(row:HTMLElement):void=>{
    const label=row.querySelector<HTMLElement>('.v2Label');const content=label?.querySelector<HTMLElement>('.v2GroupButton,.v2InstanceLabel button[data-v2-instance]');if(!label||!content)return;
    const primary=content.querySelector<HTMLElement>('span'),secondary=content.querySelector<HTMLElement>('small');
    const expanded=row.classList.contains('v2DetailsExpanded');
    const overflow=(!!primary&&primary.scrollWidth>primary.clientWidth+1)||(!!secondary&&secondary.scrollWidth>secondary.clientWidth+1);
    const full=(content.title??'').length>54;
    let toggle=label.querySelector<HTMLButtonElement>('.v2DetailToggle');
    if(!toggle&&(overflow||full||expanded)){
      const groupKey=label.querySelector<HTMLElement>('[data-v2-toggle]')?.dataset.v2Toggle;
      const instanceId=content.dataset.v2Instance;
      const key=groupKey?`g:${groupKey}`:instanceId?`i:${instanceId}`:'';if(!key)return;
      toggle=document.createElement('button');toggle.className='v2DetailToggle';toggle.dataset.v2DetailToggle=key;toggle.type='button';
      const inspect=label.querySelector('.v2Inspect');label.insertBefore(toggle,inspect);
    }
    if(!toggle)return;
    const show=overflow||full||expanded;if(toggle.hidden===show)toggle.hidden=!show;
    if(toggle.classList.contains('open')!==expanded)toggle.classList.toggle('open',expanded);
    const text=expanded?'⌄':'›';if(toggle.textContent!==text)toggle.textContent=text;
    const aria=String(expanded);if(toggle.getAttribute('aria-expanded')!==aria)toggle.setAttribute('aria-expanded',aria);
    const title=expanded?'Collapse details':'Expand full label';if(toggle.title!==title)toggle.title=title;
  };
  const mutation=new MutationObserver(schedule);mutation.observe(viewport,{subtree:true,childList:true});
  const resize=new ResizeObserver(schedule);resize.observe(viewport);schedule();
  return()=>{if(raf)cancelAnimationFrame(raf);mutation.disconnect();resize.disconnect();};
}
