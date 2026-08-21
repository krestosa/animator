import { store } from '../state/store';
import type { TimelineEvent } from '../types/domain';

export function mountLoadTimeline(root:HTMLElement):()=>void{
  let outerRaf=0,innerRaf=0,signature='',disposed=false,lastEvents:TimelineEvent[]|undefined,dom:TimelineEvent[]=[],network:TimelineEvent[]=[],lifecycle:TimelineEvent[]=[];
  const render=():void=>{
    innerRaf=0;if(disposed)return;const viewport=root.querySelector<HTMLElement>('[data-timeline-v2]');if(!viewport)return;
    const events=store.get().events;if(events!==lastEvents){lastEvents=events;dom=events.filter(event=>event.kind==='dom-build');network=events.filter(event=>event.kind==='network-resource');lifecycle=events.filter(event=>event.kind==='document-lifecycle');}
    const pxPerMs=Number(viewport.dataset.pxPerMs??.1);const next=`${pxPerMs}|${dom.length}:${dom.at(-1)?.id??''}|${network.length}:${network.at(-1)?.id??''}|${lifecycle.length}:${lifecycle.at(-1)?.id??''}`;if(next===signature)return;signature=next;
    viewport.querySelectorAll('[data-load-timeline]').forEach(node=>node.remove());
    if(!dom.length&&!network.length&&!lifecycle.length)return;
    const target=viewport.querySelector('.v2EventRow');const holder=document.createElement('div');holder.dataset.loadTimeline='';holder.className='loadTimelineRows';
    holder.innerHTML=`${lifecycle.length?row('Lifecycle',lifecycle.length,lifecycle.map(event=>marker(event,pxPerMs,'v2LifecycleMark')).join('')):''}${dom.length?row('DOM build',dom.length,dom.map(event=>marker(event,pxPerMs,'v2DomMark')).join('')):''}${network.length?row('Network',network.length,network.map((event,index)=>networkBar(event,index,pxPerMs)).join('')):''}`;
    if(target)target.before(holder);else viewport.append(holder);
  };
  const schedule=():void=>{if(disposed||outerRaf||innerRaf)return;outerRaf=requestAnimationFrame(()=>{outerRaf=0;if(disposed)return;innerRaf=requestAnimationFrame(render);});};
  const changed=():void=>{const viewport=root.querySelector<HTMLElement>('[data-timeline-v2]'),pxPerMs=viewport?.dataset.pxPerMs;if(store.get().events!==lastEvents||(viewport&&pxPerMs!==undefined&&!signature.startsWith(`${pxPerMs}|`)))schedule();};
  const unsubscribe=store.subscribe(changed);const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});schedule();
  return()=>{disposed=true;unsubscribe();observer.disconnect();if(outerRaf)cancelAnimationFrame(outerRaf);if(innerRaf)cancelAnimationFrame(innerRaf);root.querySelectorAll('[data-load-timeline]').forEach(node=>node.remove());};
}
function row(label:string,count:number,content:string):string{return `<div class="v2Row v2LoadRow"><div class="v2Label"><span class="v2GroupTitle">${html(label)}</span><small>${count}</small></div><div class="v2Motion v2LoadMotion">${content}</div></div>`;}
function marker(event:TimelineEvent,pxPerMs:number,className:string):string{return `<i class="${className}" style="left:${Math.max(0,event.at*pxPerMs)}px" title="${attr(`${event.label} · ${Math.round(event.at)}ms`)}"></i>`;}
function networkBar(event:TimelineEvent,index:number,pxPerMs:number):string{const start=number(event.data?.start,event.at),end=number(event.data?.end,event.at),duration=Math.max(1,end-start),type=String(event.data?.initiatorType??'resource'),url=String(event.data?.url??event.label);return `<i class="v2NetworkBar" data-resource-type="${attr(type)}" style="left:${Math.max(0,start*pxPerMs)}px;width:${Math.max(2,duration*pxPerMs)}px;top:${5+(index%3)*5}px" title="${attr(`${type} · ${Math.round(duration)}ms · ${url}`)}"></i>`;}
function number(value:unknown,fallback:number):number{const n=Number(value);return Number.isFinite(n)?n:fallback;}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
