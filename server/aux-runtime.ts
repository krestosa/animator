export const auxiliaryRuntimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_AUX_RUNTIME__)return;window.__ANIMATOR_AUX_RUNTIME__=true;
  const SOURCE='animator-preview',started=performance.now(),eventQueue=[],births=[],birthSeen=new WeakSet(),savedVisibility=new WeakMap();
  let lastFrame=started,lastDrop=0,lastConcurrent=0,flushTimer=0,birthCursor=0,loadEnd=0,highlight=null;
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*');
  const now=()=>Math.max(0,performance.now()-started);
  const flush=()=>{flushTimer=0;if(!eventQueue.length)return;post('EVENTS',{events:eventQueue.splice(0,eventQueue.length)});};
  const event=(kind,label,data={},at=now())=>{eventQueue.push({id:'ev-'+Math.random().toString(36).slice(2),at:Math.max(0,at),kind,label,data});if(!flushTimer)flushTimer=setTimeout(flush,16);};
  const escapePart=value=>{try{return CSS.escape(String(value));}catch{return String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');}};
  const selectorFor=el=>{if(!(el instanceof Element))return'';if(el.id)return'#'+escapePart(el.id);const parts=[];let node=el;while(node instanceof Element&&node!==document.documentElement){let part=node.tagName.toLowerCase();const parent=node.parentElement;if(parent){const same=[...parent.children].filter(child=>child.tagName===node.tagName);if(same.length>1)part+=':nth-of-type('+(same.indexOf(node)+1)+')';}parts.unshift(part);node=parent;if(parts.length>=8)break;}return parts.join(' > ');};
  const depthOf=el=>{let depth=0,node=el.parentElement;while(node&&node!==document.documentElement){depth++;node=node.parentElement;}return depth;};
  const recordElement=(el,at)=>{if(!(el instanceof Element)||birthSeen.has(el))return;birthSeen.add(el);const selector=selectorFor(el),entry={el,at,hidden:false};births.push(entry);birthCursor=births.length;loadEnd=Math.max(loadEnd,at);event('dom-build',el.tagName.toLowerCase(),{tag:el.tagName.toLowerCase(),domId:el.id||'',classes:[...el.classList].slice(0,6),depth:depthOf(el),selector},at);};
  const recordTree=(node,at)=>{if(!(node instanceof Element))return;recordElement(node,at);for(const child of node.querySelectorAll('*'))recordElement(child,at);};
  const domObserver=new MutationObserver(records=>{const at=now();for(const record of records)for(const node of record.addedNodes)recordTree(node,at);});
  try{domObserver.observe(document.documentElement||document,{subtree:true,childList:true});}catch{}
  event('document-lifecycle','Frame 0 · empty document',{phase:'bootstrap',url:location.href},0);
  addEventListener('DOMContentLoaded',()=>{const at=now();loadEnd=Math.max(loadEnd,at);event('document-lifecycle','DOMContentLoaded',{phase:'dom-content-loaded'},at);},{once:true});
  addEventListener('load',()=>{const at=now();loadEnd=Math.max(loadEnd,at);event('network-resource','document',{url:location.href,start:0,end:at,duration:at,initiatorType:'navigation'},at);event('document-lifecycle','Window load',{phase:'load'},at);flush();},{once:true});
  try{
    const resources=new PerformanceObserver(list=>{for(const entry of list.getEntries()){
      const start=Math.max(0,Number(entry.startTime)-started),end=Math.max(start,Number(entry.startTime)+Number(entry.duration)-started);loadEnd=Math.max(loadEnd,end);
      event('network-resource',entry.name.split('/').pop()||entry.name,{url:entry.name,start,end,duration:Math.max(0,end-start),initiatorType:entry.initiatorType||'resource'},end);
    }});
    resources.observe({type:'resource',buffered:true});addEventListener('beforeunload',()=>resources.disconnect(),{once:true});
  }catch{}
  try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())event('performance-long-task','Long task '+Math.round(entry.duration)+' ms',{duration:entry.duration,startTime:entry.startTime});});observer.observe({entryTypes:['longtask']});addEventListener('beforeunload',()=>observer.disconnect(),{once:true});}catch{}
  const frame=t=>{const delta=t-lastFrame;lastFrame=t;if(delta>50&&t-lastDrop>750){lastDrop=t;event('performance-frame-drop','Frame gap '+Math.round(delta)+' ms',{duration:delta});}const running=document.getAnimations().filter(a=>a.playState==='running').length;if(running>=10&&running!==lastConcurrent){lastConcurrent=running;event('performance-concurrency',String(running)+' concurrent animations',{count:running});}requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
  const hideBirth=birth=>{if(birth.hidden||!(birth.el instanceof HTMLElement)||!birth.el.isConnected)return;if(!savedVisibility.has(birth.el))savedVisibility.set(birth.el,{value:birth.el.style.getPropertyValue('visibility'),priority:birth.el.style.getPropertyPriority('visibility')});birth.el.style.setProperty('visibility','hidden','important');birth.hidden=true;};
  const showBirth=birth=>{if(!birth.hidden||!(birth.el instanceof HTMLElement))return;const saved=savedVisibility.get(birth.el);if(saved&&saved.value)birth.el.style.setProperty('visibility',saved.value,saved.priority);else birth.el.style.removeProperty('visibility');birth.hidden=false;};
  const seekLoad=time=>{const target=Math.max(0,Number(time)||0);if(target<.5){while(birthCursor>0){birthCursor--;hideBirth(births[birthCursor]);}return;}while(birthCursor>0&&births[birthCursor-1].at>target){birthCursor--;hideBirth(births[birthCursor]);}while(birthCursor<births.length&&births[birthCursor].at<=target){showBirth(births[birthCursor]);birthCursor++;}};
  const releaseLoad=()=>{for(const birth of births)showBirth(birth);birthCursor=births.length;};
  const wrapReplay=()=>{const replay=window.__ANIMATOR_MUTATION_REPLAY__;if(!replay||replay.__animatorLoadWrapped)return false;replay.__animatorLoadWrapped=true;const baseSeek=replay.seek?.bind(replay),baseRelease=replay.release?.bind(replay),baseEnd=replay.end?.bind(replay);replay.seek=time=>{baseSeek?.(time);seekLoad(time);};replay.release=()=>{releaseLoad();baseRelease?.();};replay.end=()=>Math.max(Number(baseEnd?.())||0,loadEnd);replay.loadBirths=births;return true;};
  if(!wrapReplay()){const timer=setInterval(()=>{if(wrapReplay())clearInterval(timer);},10);setTimeout(()=>clearInterval(timer),2000);}
  const showPath=selector=>{let target=null;try{target=document.querySelector(selector);}catch{}if(!(target instanceof Element))return;target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});const rect=target.getBoundingClientRect();if(!highlight){highlight=document.createElement('div');highlight.dataset.animatorDomHighlight='';Object.assign(highlight.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483644',border:'1px solid #8ab4f8',background:'rgba(138,180,248,.08)',boxSizing:'border-box',transition:'opacity .15s'});document.documentElement.appendChild(highlight);}Object.assign(highlight.style,{display:'block',opacity:'1',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});setTimeout(()=>{if(highlight)highlight.style.opacity='0';},800);};
  addEventListener('message',messageEvent=>{const message=messageEvent.data;if(!message||message.source!=='animator-editor')return;if(message.type==='HIGHLIGHT_DOM_PATH'&&typeof message.selector==='string')showPath(message.selector);});
  addEventListener('beforeunload',()=>{domObserver.disconnect();if(flushTimer)clearTimeout(flushTimer);flush();},{once:true});
})();`;
