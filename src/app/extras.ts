import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import type { TimelineEvent } from '../types/domain';

export function mountEditorExtras(root:HTMLElement):()=>void {
  const toolbar=root.querySelector<HTMLElement>('.toolbar');
  const left=root.querySelector<HTMLElement>('.leftPanel');
  const right=root.querySelector<HTMLElement>('[data-right-region]');
  const controls=document.createElement('span');
  controls.className='extraControls';
  controls.innerHTML='<label class="toolbarToggle"><input type="checkbox" data-loop-all> Loop</label><input data-custom-width type="number" min="200" max="5000" value="1100" title="Custom viewport width"><span>×</span><input data-custom-height type="number" min="200" max="5000" value="700" title="Custom viewport height"><button data-apply-custom-viewport>Custom</button>';
  toolbar?.append(controls);

  const graph=document.createElement('section');
  graph.className='eventGraph';
  graph.innerHTML='<h3>Event graph</h3><p class="muted">Interactions, mutations and motion will appear here.</p>';
  left?.insertBefore(graph,left.querySelector('.elementList'));

  const getFrame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const click=(event:MouseEvent):void=>{
    const target=event.target;
    if(!(target instanceof HTMLElement))return;
    if(target.matches('[data-apply-custom-viewport]')){
      const width=Number(controls.querySelector<HTMLInputElement>('[data-custom-width]')?.value??1100);
      const height=Number(controls.querySelector<HTMLInputElement>('[data-custom-height]')?.value??700);
      applyViewport(root,width,height);
    }
  };
  const change=(event:Event):void=>{
    const target=event.target;
    if(target instanceof HTMLInputElement&&target.matches('[data-loop-all]'))sendCommand(getFrame(),{type:'SET_LOOP_ALL',enabled:target.checked});
    if(target instanceof HTMLSelectElement&&target.matches('[data-viewport]'))queueMicrotask(()=>syncViewportInputs(root,controls));
  };
  root.addEventListener('click',click);
  root.addEventListener('change',change);

  const renderGraph=():void=>{graph.innerHTML=`<h3>Event graph <small>${store.get().events.length}</small></h3>${eventGraph(store.get().events)}`;};
  const unsubscribe=store.subscribe(renderGraph);renderGraph();

  const observer=right?new MutationObserver(()=>enhanceSource(right)):undefined;
  if(right)observer?.observe(right,{childList:true,subtree:true});
  enhanceSource(right);

  return()=>{unsubscribe();observer?.disconnect();root.removeEventListener('click',click);root.removeEventListener('change',change);controls.remove();graph.remove();};
}

function applyViewport(root:HTMLElement,width:number,height:number):void {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<200||height<200)return;
  const device=root.querySelector<HTMLElement>('[data-device]');
  const stage=root.querySelector<HTMLElement>('.stage');
  const label=root.querySelector<HTMLElement>('[data-viewport-label]');
  if(!device||!stage)return;
  const availableWidth=Math.max(200,stage.clientWidth-32),availableHeight=Math.max(200,stage.clientHeight-32);
  const scale=Math.min(1,availableWidth/width,availableHeight/height);
  device.style.width=`${width}px`;device.style.height=`${height}px`;device.style.transform=`scale(${scale})`;
  if(label)label.textContent=`${width}×${height}`;
}
function syncViewportInputs(root:HTMLElement,controls:HTMLElement):void {const label=root.querySelector<HTMLElement>('[data-viewport-label]')?.textContent??'';const [w,h]=label.split('×').map(Number);const wi=controls.querySelector<HTMLInputElement>('[data-custom-width]'),hi=controls.querySelector<HTMLInputElement>('[data-custom-height]');if(wi&&Number.isFinite(w))wi.value=String(w);if(hi&&Number.isFinite(h))hi.value=String(h);}

function eventGraph(events:TimelineEvent[]):string {
  const recent=events.slice(-80);if(!recent.length)return '<p class="muted">No recorded events yet.</p>';
  const groups:Array<{root:TimelineEvent;children:TimelineEvent[]}>=[];let current:{root:TimelineEvent;children:TimelineEvent[]}|undefined;
  for(const event of recent){if(event.kind.startsWith('user-')){current={root:event,children:[]};groups.push(current);}else if(current&&event.at-current.root.at<2500)current.children.push(event);else{current={root:event,children:[]};groups.push(current);}}
  return `<div class="eventGraphRows">${groups.slice(-20).map(group=>`<div class="eventNode"><div><span>${Math.round(group.root.at)}ms</span>${escapeHtml(group.root.label)}</div>${group.children.slice(0,12).map(child=>`<div class="eventChild"><span>${Math.round(child.at-group.root.at)}ms</span>${escapeHtml(child.label)} <small>${escapeHtml(child.kind)}</small></div>`).join('')}</div>`).join('')}</div>`;
}

function enhanceSource(root:HTMLElement|null|undefined):void {
  const pre=root?.querySelector<HTMLElement>('.sourceView pre');if(!pre||pre.dataset.enhanced==='1')return;
  const source=pre.textContent??'';pre.dataset.enhanced='1';pre.classList.add('sourceLines');pre.innerHTML=source.split('\n').map((line,index)=>`<span data-line="${index+1}">${highlight(line)}</span>`).join('');
}
function highlight(line:string):string {let value=escapeHtml(line);value=value.replace(/\b(const|let|var|function|return|if|else|for|while|class|interface|type|import|from|export|async|await|new|true|false|null|undefined)\b/g,'<b class="tok-keyword">$1</b>');value=value.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,'<i class="tok-string">$1</i>');return value;}
function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
