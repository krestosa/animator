import { filterAnimations, type MotionFilter } from '../editor/motion';
import { store } from '../state/store';

const ROW_HEIGHT=34;
const OVERSCAN=7;

export function mountMotionCatalog(root:HTMLElement):()=>void{
  let raf=0,lastDataset='',disposed=false;
  const schedule=(reset=false):void=>{if(reset)lastDataset='';if(!raf&&!disposed)raf=requestAnimationFrame(render);};
  const render=():void=>{
    raf=0;if(disposed)return;
    const rows=root.querySelector<HTMLElement>('.motionRows');if(!rows)return;
    const search=root.querySelector<HTMLInputElement>('[data-motion-search]')?.value??'';
    const filter=(root.querySelector<HTMLSelectElement>('[data-motion-filter]')?.value??'all') as MotionFilter;
    const state=store.get(),animations=filterAnimations(state.animations,search,filter);
    const dataset=`${search}\u0000${filter}\u0000${animations.map(animation=>animation.id).join('\u0001')}`;
    if(dataset!==lastDataset){lastDataset=dataset;rows.scrollTop=0;}
    const viewportHeight=Math.max(rows.clientHeight,190),start=Math.max(0,Math.floor(rows.scrollTop/ROW_HEIGHT)-OVERSCAN),count=Math.ceil(viewportHeight/ROW_HEIGHT)+OVERSCAN*2,end=Math.min(animations.length,start+count);
    rows.classList.add('motionRowsVirtual');rows.dataset.motionTotal=String(animations.length);rows.setAttribute('aria-label',`${animations.length} matching animations`);
    if(!animations.length){rows.innerHTML='<p class="muted">No matching motion.</p>';return;}
    const before=start*ROW_HEIGHT,after=Math.max(0,(animations.length-end)*ROW_HEIGHT);
    rows.innerHTML=`<div class="motionVirtualSpacer" style="height:${before}px"></div>${animations.slice(start,end).map(animation=>`<button class="motionRow${state.selectedAnimationId===animation.id?' selected':''}" data-animation-id="${attr(animation.id)}" title="${attr(animation.name??animation.type)}"><span>${html(animation.name??animation.type)}</span><small>${html(animation.type)} · ${html(animation.confidence)} · ${Math.round(animation.startTime)}ms</small></button>`).join('')}<div class="motionVirtualSpacer" style="height:${after}px"></div>`;
  };
  const scroll=(event:Event):void=>{if(event.target instanceof Element&&event.target.matches('.motionRows'))schedule();};
  const uiChange=(event:Event):void=>{const target=event.target as Element|null;if(target?.matches('[data-motion-search],[data-motion-filter],[data-filter]'))requestAnimationFrame(()=>schedule(true));};
  const unsubscribe=store.subscribe(()=>schedule());
  root.addEventListener('scroll',scroll,true);root.addEventListener('input',uiChange);root.addEventListener('change',uiChange);root.addEventListener('click',uiChange);schedule(true);
  return()=>{disposed=true;if(raf)cancelAnimationFrame(raf);unsubscribe();root.removeEventListener('scroll',scroll,true);root.removeEventListener('input',uiChange);root.removeEventListener('change',uiChange);root.removeEventListener('click',uiChange);};
}

function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
