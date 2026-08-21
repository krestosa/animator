export const runtimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_RUNTIME__)return;window.__ANIMATOR_RUNTIME__=true;
  const SOURCE='animator-preview';
  const ids=new WeakMap(),byId=new Map(),animations=new Map(),animationMeta=new Map(),originals=new Map(),created=new Set();
  const attributeIndex=new WeakMap(),attributeTracks=[];
  const nodeIndex=new WeakMap(),nodeTracks=[];
  let seq=0,picker=false,recording=true,hover=null,reducedStyle=null,baselineReady=document.readyState!=='loading';
  let controlled=false,playing=false,masterTime=0,masterRate=1,masterPerf=performance.now(),loop=false,applyingReplay=false;
  const started=performance.now();
  const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancelRAF=window.cancelAnimationFrame.bind(window);
  let virtualRafSeq=1000000;const suspendedRafs=new Map();
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*');
  const realNow=()=>performance.now()-started;
  const timelineNow=()=>controlled?masterTime:realNow();
  const idFor=(el)=>{let id=ids.get(el);if(!id){id='el-'+(++seq);ids.set(el,id);byId.set(id,el);}return id;};
  const meta=(el)=>{const r=el.getBoundingClientRect();return{id:idFor(el),tag:el.tagName.toLowerCase(),domId:el.id||undefined,classes:[...el.classList],text:(el.textContent||'').trim().slice(0,80)||undefined,rect:{x:r.x,y:r.y,width:r.width,height:r.height},alive:el.isConnected};};
  const event=(kind,el,label,data={})=>{if(!recording||applyingReplay)return;post('EVENT',{event:{id:'ev-'+Math.random().toString(36).slice(2),at:timelineNow(),kind,elementId:el?idFor(el):undefined,label,data}});};
  const postTimeline=()=>post('TIMELINE_STATE',{time:masterTime,playing,controlled});

  window.requestAnimationFrame=function(callback){
    if(!controlled)return nativeRAF(callback);
    const id=++virtualRafSeq;suspendedRafs.set(id,callback);return id;
  };
  window.cancelAnimationFrame=function(id){if(suspendedRafs.delete(id))return;nativeCancelRAF(id);};

  const normalize=(anim,el,type,name)=>{
    const effect=anim.effect;let timing={},frames=[];
    try{timing=effect?.getComputedTiming?.()||{};frames=effect?.getKeyframes?.()||[];}catch{}
    const id=anim.__animatorId||(anim.__animatorId='anim-'+Math.random().toString(36).slice(2));
    let info=animationMeta.get(id);
    if(!info){
      const current=Number(anim.currentTime);const rate=Math.abs(Number(anim.playbackRate))||1;
      const start=Math.max(0,timelineNow()-(Number.isFinite(current)?Math.max(0,current)/rate:0));
      info={startTime:start,type:type||'unknown',name:name||undefined};animationMeta.set(id,info);
    }else{if(type&&info.type==='unknown')info.type=type;if(name&&!info.name)info.name=name;}
    const props=[...new Set(frames.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))].map(prop=>({name:prop,values:frames.map(frame=>frame[prop]).filter(value=>value!=null).map(String)}));
    return{id,elementId:idFor(el),type:info.type||type||'unknown',name:info.name||name,startTime:info.startTime,duration:Number(timing.duration)||undefined,delay:Number(timing.delay)||undefined,iterations:Number(timing.iterations)||undefined,direction:timing.direction,easing:timing.easing,fill:timing.fill,properties:props,confidence:'runtime-observed',runtimeState:controlled?(playing?'running':'paused'):(anim.playState==='finished'?'finished':anim.playState==='paused'?'paused':anim.playState==='idle'?'idle':'running'),keyframes:frames};
  };
  const snapshot=(id,animation)=>{if(originals.has(id)||!animation.effect)return;let timing=null,frames=null;try{timing=animation.effect.getTiming();frames=animation.effect.getKeyframes();}catch{}originals.set(id,{timing,frames,playbackRate:animation.playbackRate});};
  const reportAnimation=(animation,type,name)=>{
    const el=animation.effect?.target;if(!(el instanceof Element))return;
    const normalized=normalize(animation,el,type,name);animations.set(normalized.id,animation);
    if(controlled){snapshot(normalized.id,animation);try{animation.pause();applyAnimationAt(normalized.id,animation,masterTime);}catch{}}
    post('ANIMATION',{animation:normalized});
  };

  const nativeAnimate=Element.prototype.animate;
  Element.prototype.animate=function(keyframes,options){const animation=nativeAnimate.call(this,keyframes,options);queueMicrotask(()=>reportAnimation(animation,'web-animation'));return animation;};
  document.addEventListener('animationstart',e=>{event('animationstart',e.target,e.animationName);queueMicrotask(()=>document.getAnimations().filter(a=>a.effect?.target===e.target).forEach(a=>reportAnimation(a,'css-animation',e.animationName)));},true);
  document.addEventListener('transitionrun',e=>{event('transition',e.target,e.propertyName,{elapsedTime:e.elapsedTime});queueMicrotask(()=>document.getAnimations().filter(a=>a.effect?.target===e.target).forEach(a=>reportAnimation(a,'css-transition',e.propertyName)));},true);
  ['animationend','transitionend'].forEach(type=>document.addEventListener(type,e=>event(type,e.target,e.animationName||e.propertyName),true));

  const getAttributeTrack=(el,name,oldValue)=>{
    let map=attributeIndex.get(el);if(!map){map=new Map();attributeIndex.set(el,map);}
    let track=map.get(name);if(!track){track={el,name,baseline:oldValue,events:[]};map.set(name,track);attributeTracks.push(track);}return track;
  };
  const recordAttribute=(record)=>{
    if(!baselineReady||applyingReplay||!(record.target instanceof Element)||!record.attributeName)return;
    const track=getAttributeTrack(record.target,record.attributeName,record.oldValue);
    track.events.push({at:timelineNow(),value:record.target.getAttribute(record.attributeName)});
  };
  const getNodeTrack=(node,kind,parent,nextSibling)=>{
    let track=nodeIndex.get(node);if(!track){track={node,baselineConnected:kind==='remove',baselineParent:parent,baselineNext:nextSibling,events:[]};nodeIndex.set(node,track);nodeTracks.push(track);}return track;
  };
  const recordChild=(record)=>{
    if(!baselineReady||applyingReplay)return;
    record.addedNodes.forEach(node=>{if(!(node instanceof Element))return;const track=getNodeTrack(node,'insert',record.target,record.nextSibling);track.events.push({at:timelineNow(),kind:'insert',parent:record.target,nextSibling:record.nextSibling});event('dom-insert',node,'Element inserted');post('ELEMENTS',{elements:[meta(node),...Array.from(node.querySelectorAll('*')).slice(0,200).map(meta)]});});
    record.removedNodes.forEach(node=>{if(!(node instanceof Element))return;const track=getNodeTrack(node,'remove',record.target,record.nextSibling);track.events.push({at:timelineNow(),kind:'remove',parent:record.target,nextSibling:record.nextSibling});event('dom-remove',node,'Element removed');});
  };
  const observer=new MutationObserver(records=>records.forEach(record=>{if(record.type==='attributes'){recordAttribute(record);if(record.target instanceof Element)event(record.attributeName==='class'?'class-mutation':record.attributeName==='style'?'style-mutation':'attribute-mutation',record.target,(record.attributeName||'attribute')+' changed',{attribute:record.attributeName});}else if(record.type==='childList')recordChild(record);}));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['class','style','hidden','open','aria-expanded','aria-hidden']});
  if(!baselineReady)addEventListener('DOMContentLoaded',()=>{baselineReady=true;},{once:true});

  const userEvents=['click','pointerdown','pointerup','focus','blur','input','change','submit','keydown','scroll'];
  userEvents.forEach(type=>document.addEventListener(type,e=>{if(e.target instanceof Element)event('user-'+type,e.target,type,{key:e.key});},true));
  const outline=document.createElement('div');Object.assign(outline.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'1px solid #58a6ff',background:'rgba(88,166,255,.08)',display:'none'});document.documentElement.appendChild(outline);
  document.addEventListener('mousemove',e=>{if(!picker)return;const el=document.elementFromPoint(e.clientX,e.clientY);if(!(el instanceof Element)||el===outline)return;hover=el;const r=el.getBoundingClientRect();Object.assign(outline.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});},true);
  document.addEventListener('click',e=>{if(!picker||!(e.target instanceof Element))return;e.preventDefault();e.stopPropagation();picker=false;outline.style.display='none';post('SELECT_ELEMENT',{element:meta(e.target)});},true);

  const animationEnd=(animation)=>{try{const timing=animation.effect?.getComputedTiming?.();const delay=Number(timing?.delay)||0;const active=Number(timing?.activeDuration);return Number.isFinite(active)?Math.max(0,delay+active):Infinity;}catch{return Infinity;}};
  function applyAnimationAt(id,animation,time){
    const info=animationMeta.get(id);if(!info)return;
    const local=time-info.startTime;
    try{
      animation.pause();
      if(local<0){animation.currentTime=null;return;}
      const end=animationEnd(animation);animation.currentTime=Number.isFinite(end)?Math.min(local,end):local;
    }catch{}
  }
  const replayAttributes=(time)=>{for(const track of attributeTracks){let value=track.baseline;for(const change of track.events){if(change.at>time)break;value=change.value;}try{if(value==null)track.el.removeAttribute(track.name);else track.el.setAttribute(track.name,value);}catch{}}};
  const replayNodes=(time)=>{for(const track of nodeTracks){let connected=track.baselineConnected,parent=track.baselineParent,next=track.baselineNext;for(const change of track.events){if(change.at>time)break;connected=change.kind==='insert';parent=change.parent;next=change.nextSibling;}try{if(connected){if(!track.node.isConnected&&parent&&parent.isConnected)parent.insertBefore(track.node,next&&next.parentNode===parent?next:null);}else if(track.node.isConnected)track.node.remove();}catch{}}};
  const forceVisualSample=()=>{void document.documentElement.getBoundingClientRect();};
  const applyMasterTime=(time)=>{
    applyingReplay=true;
    try{replayNodes(time);replayAttributes(time);for(const [id,animation] of animations)applyAnimationAt(id,animation,time);forceVisualSample();}finally{applyingReplay=false;}
  };
  const recordedEnd=()=>{
    let end=0;
    for(const [id,animation] of animations){const info=animationMeta.get(id);if(!info)continue;const duration=animationEnd(animation);if(Number.isFinite(duration))end=Math.max(end,info.startTime+duration);}
    for(const track of attributeTracks)for(const change of track.events)end=Math.max(end,change.at);
    for(const track of nodeTracks)for(const change of track.events)end=Math.max(end,change.at);
    return end;
  };
  const scanAnimations=()=>document.getAnimations({subtree:true}).forEach(animation=>reportAnimation(animation,'unknown'));
  const enterControl=(time)=>{
    scanAnimations();controlled=true;playing=false;masterTime=Math.max(0,Number.isFinite(time)?time:masterTime);masterPerf=performance.now();
    for(const [id,animation] of animations){snapshot(id,animation);try{animation.pause();}catch{}}
    applyMasterTime(masterTime);postTimeline();
  };
  const playMaster=()=>{if(!controlled)enterControl(masterTime);playing=true;masterPerf=performance.now();postTimeline();};
  const pauseMaster=()=>{if(!controlled)enterControl(masterTime);playing=false;applyMasterTime(masterTime);postTimeline();};
  const restartMaster=()=>{enterControl(0);playing=true;masterPerf=performance.now();postTimeline();};
  const scrubMaster=(time)=>{if(!controlled)enterControl(time);else{playing=false;masterTime=Math.max(0,time);masterPerf=performance.now();applyMasterTime(masterTime);postTimeline();}};
  const setRateAll=(rate)=>{if(Number.isFinite(rate)&&rate>0)masterRate=rate;};
  const setReduced=(enabled)=>{if(enabled&&!reducedStyle){reducedStyle=document.createElement('style');reducedStyle.dataset.animatorReducedMotion='';reducedStyle.textContent='*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0ms!important}';document.head.appendChild(reducedStyle);}else if(!enabled&&reducedStyle){reducedStyle.remove();reducedStyle=null;}post('DIAGNOSTIC',{level:'info',message:enabled?'Reduced-motion emulation enabled':'Reduced-motion emulation disabled'});};
  const releaseControl=()=>{controlled=false;playing=false;for(const [id,original] of originals){const animation=animations.get(id);if(!animation)continue;try{if(animation.effect&&original.timing)animation.effect.updateTiming(original.timing);if(animation.effect&&original.frames)animation.effect.setKeyframes(original.frames);animation.playbackRate=original.playbackRate;animation.play();}catch{}}for(const callback of suspendedRafs.values())nativeRAF(callback);suspendedRafs.clear();postTimeline();};

  const commands={
    SET_PICKER:m=>{picker=!!m.enabled;outline.style.display='none';},
    SET_RECORDING:m=>{recording=!!m.enabled;},
    SET_ANIMATION_TIME:m=>{const start=animationMeta.get(m.id)?.startTime||0;scrubMaster(start+Math.max(0,Number(m.time)||0));},
    SCRUB_TIMELINE:m=>{if(Number.isFinite(m.time))scrubMaster(Math.max(0,m.time));},
    PLAY_ALL:()=>playMaster(),
    PAUSE_ALL:()=>pauseMaster(),
    RESTART_ALL:()=>restartMaster(),
    SET_LOOP_ALL:m=>{loop=!!m.enabled;},
    SET_ALL_PLAYBACK_RATE:m=>setRateAll(Number(m.rate)),
    SET_REDUCED_MOTION:m=>setReduced(!!m.enabled),
    SET_PLAYBACK_RATE:m=>setRateAll(Number(m.rate)),
    PLAY_ANIMATION:()=>playMaster(),
    PAUSE_ANIMATION:()=>pauseMaster(),
    RESTART_ANIMATION:m=>{const start=animationMeta.get(m.id)?.startTime||0;scrubMaster(start);playMaster();},
    APPLY_OVERRIDE:m=>{const animation=animations.get(m.animationId);if(!animation)return;snapshot(m.animationId,animation);if(animation.effect){const timing={};if(m.duration!=null)timing.duration=m.duration;if(m.delay!=null)timing.delay=m.delay;if(m.easing)timing.easing=m.easing;if(Object.keys(timing).length)animation.effect.updateTiming(timing);}if(animation.effect&&m.keyframes)animation.effect.setKeyframes(m.keyframes);reportAnimation(animation,'web-animation');if(controlled)applyMasterTime(masterTime);},
    CREATE_ANIMATION:m=>{const el=byId.get(m.elementId);if(!el)return;const animation=el.animate(m.keyframes,{duration:m.duration,delay:m.delay||0,easing:m.easing,iterations:m.iterations||1,direction:m.direction||'normal',fill:m.fill||'both'});const id=animation.__animatorId||(animation.__animatorId='anim-'+Math.random().toString(36).slice(2));created.add(id);reportAnimation(animation,'web-animation','Created animation');if(controlled){const info=animationMeta.get(id);if(info)info.startTime=masterTime;applyMasterTime(masterTime);}},
    CLEAR_OVERRIDES:()=>{for(const id of created){try{animations.get(id)?.cancel();}catch{}animations.delete(id);animationMeta.delete(id);}created.clear();setReduced(false);releaseControl();originals.clear();post('DIAGNOSTIC',{level:'info',message:'Temporary animation overrides cleared; live page clock restored'});}
  };
  addEventListener('message',e=>{const m=e.data;if(!m||m.source!=='animator-editor'||typeof m.type!=='string')return;commands[m.type]?.(m);});

  const discover=()=>post('ELEMENTS',{elements:Array.from(document.querySelectorAll('body *')).slice(0,1200).map(meta)});
  nativeRAF(()=>{discover();scanAnimations();post('READY');});
  const scanTimer=setInterval(()=>{if(!controlled)scanAnimations();},350);
  const tick=(perf)=>{
    if(controlled&&playing){
      const delta=Math.max(0,perf-masterPerf)*masterRate;masterPerf=perf;masterTime+=delta;
      const end=recordedEnd();if(loop&&end>0&&masterTime>end)masterTime=masterTime%end;
      applyMasterTime(masterTime);postTimeline();
    }
    nativeRAF(tick);
  };
  nativeRAF(tick);
  window.addEventListener('beforeunload',()=>{observer.disconnect();clearInterval(scanTimer);},{once:true});
})();`;
