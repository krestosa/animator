import { store } from '../state/store';
import type { TimelineEvent } from '../types/domain';

type NetworkItem={event:TimelineEvent;start:number;end:number;lane:number};

export function mountLoadTimeline(root:HTMLElement):()=>void{
  let outerRaf=0,innerRaf=0,signature='',disposed=false,lastEvents:TimelineEvent[]|undefined,dom:TimelineEvent[]=[],network:TimelineEvent[]=[],lifecycle:TimelineEvent[]=[];
  const render=():void=>{
    innerRaf=0;if(disposed)return;const viewport=root.querySelector<HTMLElement>('[data-timeline-v2]');if(!viewport)return;
    const events=store.get().events;if(events!==lastEvents){lastEvents=events;dom=events.filter(event=>event.kind==='dom-build');network=events.filter(event=>event.kind==='network-resource');lifecycle=events.filter(event=>event.kind==='document-lifecycle');}
    const pxPerMs=Number(viewport.dataset.pxPerMs??.1),origin=Number(viewport.dataset.originMs??0);const next=`${pxPerMs}:${origin}|${dom.length}:${dom.at(-1)?.id??''}|${network.length}:${network.at(-1)?.id??''}|${lifecycle.length}:${lifecycle.at(-1)?.id??''}`;if(next===signature)return;signature=next;
    viewport.querySelectorAll('[data-load-timeline]').forEach(node=>node.remove());
    if(!dom.length&&!network.length&&!lifecycle.length)return;
    const target=viewport.querySelector('.v2EventRow'),holder=document.createElement('div');holder.dataset.loadTimeline='';holder.className='loadTimelineRows';
    const packed=packNetwork(network);
    holder.innerHTML=`${lifecycle.length?row('Lifecycle',lifecycle.length,clusterMarkers(lifecycle,pxPerMs,origin,'v2LifecycleMark'),'lifecycle'):''}${dom.length?row('DOM build',dom.length,clusterMarkers(dom,pxPerMs,origin,'v2DomMark'),'dom'):''}${network.length?networkRow(network.length,packed,pxPerMs,origin):''}`;
    if(target)target.before(holder);else viewport.append(holder);
  };
  const schedule=():void=>{if(disposed||outerRaf||innerRaf)return;outerRaf=requestAnimationFrame(()=>{outerRaf=0;if(disposed)return;innerRaf=requestAnimationFrame(render);});};
  const changed=():void=>{const viewport=root.querySelector<HTMLElement>('[data-timeline-v2]'),pxPerMs=viewport?.dataset.pxPerMs,origin=viewport?.dataset.originMs;if(store.get().events!==lastEvents||(viewport&&pxPerMs!==undefined&&origin!==undefined&&!signature.startsWith(`${pxPerMs}:${origin}|`)))schedule();};
  const unsubscribe=store.subscribe(changed);const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});schedule();
  return()=>{disposed=true;unsubscribe();observer.disconnect();if(outerRaf)cancelAnimationFrame(outerRaf);if(innerRaf)cancelAnimationFrame(innerRaf);root.querySelectorAll('[data-load-timeline]').forEach(node=>node.remove());};
}

function row(label:string,count:number,content:string,kind:string):string{return `<div class="v2Row v2LoadRow" data-load-kind="${kind}"><div class="v2Label"><span class="v2LaneIcon ${kind}"></span><span class="v2GroupTitle">${html(label)}</span><small>${count}</small></div><div class="v2Motion v2LoadMotion">${content}</div></div>`;}
function networkRow(count:number,items:NetworkItem[],pxPerMs:number,origin:number):string{const lanes=Math.max(1,...items.map(item=>item.lane+1));return `<div class="v2Row v2LoadRow v2LoadNetworkRow" data-load-kind="network" style="--network-lanes:${lanes}"><div class="v2Label"><span class="v2LaneIcon network"></span><span class="v2GroupTitle">Network</span><small>${count} · ${lanes} lane${lanes===1?'':'s'}</small></div><div class="v2Motion v2LoadMotion">${items.map(item=>networkBar(item,pxPerMs,origin)).join('')}</div></div>`;}
function packNetwork(events:TimelineEvent[]):NetworkItem[]{const sorted=events.map(event=>{const start=number(event.data?.start,event.at),end=Math.max(start+1,number(event.data?.end,event.at));return{event,start,end,lane:0};}).sort((a,b)=>a.start-b.start||a.end-b.end),ends:number[]=[];for(const item of sorted){let lane=ends.findIndex(end=>end<=item.start);if(lane<0){lane=ends.length;ends.push(item.end);}else ends[lane]=item.end;item.lane=lane;}return sorted;}
function clusterMarkers(events:TimelineEvent[],pxPerMs:number,origin:number,className:string):string{const threshold=7/Math.max(.0001,pxPerMs),sorted=[...events].sort((a,b)=>a.at-b.at),clusters:Array<{at:number;events:TimelineEvent[]}>=[];for(const event of sorted){const last=clusters.at(-1);if(last&&event.at-last.at<=threshold){last.events.push(event);last.at=last.events.reduce((sum,item)=>sum+item.at,0)/last.events.length;}else clusters.push({at:event.at,events:[event]});}return clusters.map(cluster=>{const many=cluster.events.length>1,title=cluster.events.slice(0,4).map(item=>item.label).join(' · ')+(cluster.events.length>4?` · +${cluster.events.length-4}`:'');return `<i class="${className}${many?' cluster':''}" style="left:${Math.max(0,(cluster.at-origin)*pxPerMs)}px" title="${attr(title)}">${many?cluster.events.length:''}</i>`;}).join('');}
function networkBar(item:NetworkItem,pxPerMs:number,origin:number):string{const duration=Math.max(1,item.end-item.start),type=String(item.event.data?.initiatorType??'resource'),url=String(item.event.data?.url??item.event.label);return `<i class="v2NetworkBar" data-resource-type="${attr(type)}" style="left:${Math.max(0,(item.start-origin)*pxPerMs)}px;width:${Math.max(3,duration*pxPerMs)}px;--network-lane:${item.lane}" title="${attr(`${type} · ${Math.round(duration)}ms · ${url}`)}"></i>`;}
function number(value:unknown,fallback:number):number{const n=Number(value);return Number.isFinite(n)?n:fallback;}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
