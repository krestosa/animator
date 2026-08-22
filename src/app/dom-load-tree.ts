import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import type { TimelineEvent } from '../types/domain';

const ROW_HEIGHT=19,OVERSCAN=10;

export function mountDomLoadTree(root:HTMLElement):()=>void{
  const left=root.querySelector<HTMLElement>('.leftPanel');const project=left?.querySelector<HTMLElement>('[data-project-region]');if(!left||!project)return()=>{};
  const section=document.createElement('section');section.className='domLoadTree';section.innerHTML='<header><h3>DOM load <small data-dom-count>0</small></h3><span data-dom-time>document-start</span></header><div class="domTreeScroller" data-dom-tree><div class="domTreeCanvas"></div></div>';
  project.parentElement?.insertBefore(section,project.nextSibling);
  const scroller=section.querySelector<HTMLElement>('[data-dom-tree]')!,canvas=section.querySelector<HTMLElement>('.domTreeCanvas')!;
  let nodes:TimelineEvent[]=[],signature='',raf=0,lastEvents:TimelineEvent[]|undefined;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const updateNodes=():void=>{const events=store.get().events;if(events===lastEvents)return;lastEvents=events;const all=events.filter(event=>event.kind==='dom-build'),next=`${all.length}:${all.at(-1)?.id??''}`;if(next===signature)return;signature=next;nodes=all;canvas.style.height=`${nodes.length*ROW_HEIGHT}px`;const count=section.querySelector<HTMLElement>('[data-dom-count]');if(count)count.textContent=String(nodes.length);};
  const renderWindow=():void=>{raf=0;const height=scroller.clientHeight||180,start=Math.max(0,Math.floor(scroller.scrollTop/ROW_HEIGHT)-OVERSCAN),end=Math.min(nodes.length,Math.ceil((scroller.scrollTop+height)/ROW_HEIGHT)+OVERSCAN),rows=[];for(let index=start;index<end;index++){const event=nodes[index];if(!event)continue;const data=event.data??{},depth=Math.min(24,Math.max(0,Number(data.depth)||0)),tag=String(data.tag??event.label),id=String(data.domId??''),classes=Array.isArray(data.classes)?data.classes.map(String).slice(0,2):[],selector=String(data.selector??'');rows.push(`<button class="domTreeRow" data-dom-selector="${attr(selector)}" data-dom-id="${attr(id)}" style="top:${index*ROW_HEIGHT}px;padding-left:${7+depth*9}px"><span class="domBranch">${depth?'└':'•'}</span><code>&lt;${html(tag)}</code>${id?`<b>#${html(id)}</b>`:''}${classes.map(value=>`<em>.${html(value)}</em>`).join('')}<code>&gt;</code><small>${Math.round(event.at)}ms</small></button>`);}canvas.innerHTML=rows.join('');};
  const schedule=():void=>{if(!raf)raf=requestAnimationFrame(()=>{updateNodes();renderWindow();});};
  const scroll=():void=>{if(!raf)raf=requestAnimationFrame(renderWindow);};
  const click=(event:MouseEvent):void=>{const row=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-dom-selector]');if(!row)return;const selector=row.dataset.domSelector??'';if(selector)sendCommand(frame(),{type:'HIGHLIGHT_DOM_PATH',selector});const domId=row.dataset.domId;if(domId){const match=store.get().elements.find(element=>element.domId===domId);if(match)store.set({selectedElementId:match.id});}};
  const timeline=():void=>{const label=section.querySelector<HTMLElement>('[data-dom-time]');if(label)label.textContent=`${Math.round(store.get().playhead)} ms`;};
  scroller.addEventListener('scroll',scroll,{passive:true});section.addEventListener('click',click);const unsubscribe=store.subscribe(()=>{if(store.get().events!==lastEvents)schedule();timeline();});schedule();timeline();
  return()=>{unsubscribe();if(raf)cancelAnimationFrame(raf);scroller.removeEventListener('scroll',scroll);section.removeEventListener('click',click);section.remove();};
}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
