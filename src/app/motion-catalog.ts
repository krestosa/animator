import { groupAnimations } from '../editor/grouping';
import { filterAnimations, type MotionFilter } from '../editor/motion';
import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import { ANIMATION_INSPECT_EVENT } from './timeline-v2';

const ROW_HEIGHT=36;
const OVERSCAN=7;

type InspectionDetail={id:string;elementId:string;origin:number};

export function mountMotionCatalog(root:HTMLElement):()=>void{
  let raf=0,uiRaf=0,lastDataset='',disposed=false,lastAnimations=store.get().animations,lastSelected=store.get().selectedAnimationId;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const schedule=(reset=false):void=>{if(reset)lastDataset='';if(!raf&&!disposed)raf=requestAnimationFrame(render);};
  const render=():void=>{
    raf=0;if(disposed)return;
    const rows=root.querySelector<HTMLElement>('.motionRows');if(!rows)return;
    const search=root.querySelector<HTMLInputElement>('[data-motion-search]')?.value??'';
    const filter=(root.querySelector<HTMLSelectElement>('[data-motion-filter]')?.value??'all') as MotionFilter;
    const state=store.get(),animations=filterAnimations(state.animations,search,filter),groups=groupAnimations(animations,state.selectedAnimationId);
    const dataset=`${search}\u0000${filter}\u0000${groups.map(group=>`${group.key}:${group.representative.id}:${group.instances.length}`).join('\u0001')}`;
    if(dataset!==lastDataset){lastDataset=dataset;rows.scrollTop=0;}
    const viewportHeight=Math.max(rows.clientHeight,190),start=Math.max(0,Math.floor(rows.scrollTop/ROW_HEIGHT)-OVERSCAN),count=Math.ceil(viewportHeight/ROW_HEIGHT)+OVERSCAN*2,end=Math.min(groups.length,start+count);
    rows.classList.add('motionRowsVirtual');rows.dataset.motionTotal=String(animations.length);rows.dataset.motionGroups=String(groups.length);rows.setAttribute('aria-label',`${groups.length} motion groups · ${animations.length} animation instances`);
    if(!groups.length){rows.innerHTML='<p class="muted">No matching motion.</p>';return;}
    const before=start*ROW_HEIGHT,after=Math.max(0,(groups.length-end)*ROW_HEIGHT);
    rows.innerHTML=`<div class="motionVirtualSpacer" style="height:${before}px"></div>${groups.slice(start,end).map(group=>{
      const animation=group.representative,selected=group.instances.some(item=>item.id===state.selectedAnimationId),countText=group.instances.length>1?` · ×${group.instances.length}`:'';
      return `<div class="motionCatalogRow${selected?' selected':''}"><button class="motionRow${selected?' selected':''}" data-animation-id="${attr(animation.id)}" title="Select and highlight · ${attr(animation.name??animation.type)}"><span>${html(animation.name??animation.type)}</span><small>${html(animation.type)} · ${html(animation.confidence)}${html(countText)}</small></button><button class="motionCatalogInspect" data-motion-inspect="${attr(animation.id)}" title="Inspect / isolate only this animation">◎</button></div>`;
    }).join('')}<div class="motionVirtualSpacer" style="height:${after}px"></div>`;
  };
  const scroll=(event:Event):void=>{if(event.target instanceof Element&&event.target.matches('.motionRows'))schedule();};
  const uiChange=(event:Event):void=>{const target=event.target as Element|null;if(!target?.matches('[data-motion-search],[data-motion-filter],[data-filter]'))return;if(uiRaf)cancelAnimationFrame(uiRaf);uiRaf=requestAnimationFrame(()=>{uiRaf=0;schedule(true);});};
  const inspect=(event:MouseEvent):void=>{
    const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-motion-inspect]');if(!button)return;const id=button.dataset.motionInspect;if(!id)return;
    const animation=store.get().animations.find(item=>item.id===id);if(!animation)return;event.preventDefault();event.stopPropagation();
    const origin=Math.max(0,animation.startTime+Math.max(0,Number(animation.delay)||0));
    store.set({selectedAnimationId:animation.id,selectedElementId:animation.elementId.startsWith('static:')?store.get().selectedElementId:animation.elementId});
    sendCommand(frame(),{type:'SET_SOLO_ANIMATION',id:animation.id,elementId:animation.elementId,anchorTime:origin});
    sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id,reveal:true});
    window.dispatchEvent(new CustomEvent<InspectionDetail>(ANIMATION_INSPECT_EVENT,{detail:{id:animation.id,elementId:animation.elementId,origin}}));
  };
  const changed=():void=>{const state=store.get();if(state.animations===lastAnimations&&state.selectedAnimationId===lastSelected)return;lastAnimations=state.animations;lastSelected=state.selectedAnimationId;schedule();};
  const unsubscribe=store.subscribe(changed);
  root.addEventListener('scroll',scroll,true);root.addEventListener('input',uiChange);root.addEventListener('change',uiChange);root.addEventListener('click',uiChange);root.addEventListener('click',inspect);schedule(true);
  return()=>{disposed=true;if(raf)cancelAnimationFrame(raf);if(uiRaf)cancelAnimationFrame(uiRaf);unsubscribe();root.removeEventListener('scroll',scroll,true);root.removeEventListener('input',uiChange);root.removeEventListener('change',uiChange);root.removeEventListener('click',uiChange);root.removeEventListener('click',inspect);};
}

function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}