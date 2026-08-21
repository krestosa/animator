export const seekRuntimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_SEEK_RUNTIME__)return;window.__ANIMATOR_SEEK_RUNTIME__=true;
  const IN='animator-timeline',OUT='animator-preview',started=performance.now();
  const registry=new Set(),meta=new WeakMap(),mirrors=new WeakMap(),snapshots=new WeakMap();
  const attrIndex=new WeakMap(),attrTracks=[];
  const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancelRAF=window.cancelAnimationFrame.bind(window),nativeAnimate=Element.prototype.animate;
  let controlled=false,playing=false,masterTime=0,rate=1,loop=false,lastPerf=performance.now(),raf=0,highlight=null,applyingReplay=false,replayGeneration=0,virtualRafId=1000000;
  const suspendedRafs=new Map();
  const post=(type,payload={})=>parent.postMessage({source:OUT,type,...payload},'*');
  const now=()=>performance.now()-started;
  const documentAnimations=()=>{try{return document.getAnimations({subtree:true});}catch{return document.getAnimations();}};
  const captureAnimation=a=>{if(!a||a.__animatorMirror)return a;registry.add(a);remember(a);return a;};
  const capture=()=>{for(const animation of documentAnimations())captureAnimation(animation);};
  Element.prototype.animate=function(keyframes,options){const animation=nativeAnimate.call(this,keyframes,options);captureAnimation(animation);return animation;};
  window.requestAnimationFrame=function(callback){if(!controlled)return nativeRAF(callback);const id=++virtualRafId;suspendedRafs.set(id,callback);return id;};
  window.cancelAnimationFrame=function(id){if(suspendedRafs.delete(id))return;nativeCancelRAF(id);};
  document.addEventListener('animationstart',()=>queueMicrotask(capture),true);
  document.addEventListener('transitionrun',()=>queueMicrotask(capture),true);
  const all=()=>{capture();return [...registry].filter(animation=>{const target=animation.effect?.target;return !(target instanceof Element)||target.isConnected;});};
  function remember(animation){
    let value=meta.get(animation);if(value)return value;
    const current=Number(animation.currentTime),playback=Math.abs(Number(animation.playbackRate))||1;
    let timing=null,frames=[],target=null;
    try{timing=animation.effect?.getTiming?.()||null;frames=animation.effect?.getKeyframes?.()||[];target=animation.effect?.target||null;}catch{}
    value={start:Math.max(0,now()-(Number.isFinite(current)?current/playback:0)),timing,frames,target};meta.set(animation,value);return value;
  }
  const endOf=animation=>{try{const timing=animation.effect?.getComputedTiming?.();const end=Number(timing?.endTime);if(Number.isFinite(end))return Math.max(0,end);const active=Number(timing?.activeDuration),delay=Number(timing?.delay)||0;return Number.isFinite(active)?Math.max(0,delay+active):Infinity;}catch{return Infinity;}};
  const snapshot=animation=>{if(snapshots.has(animation))return;try{snapshots.set(animation,{timing:animation.effect?.getTiming?.(),frames:animation.effect?.getKeyframes?.(),rate:animation.playbackRate,currentTime:animation.currentTime,playState:animation.playState});}catch{}};
  const ensureMirror=animation=>{
    const existing=mirrors.get(animation);if(existing)return existing;
    const info=remember(animation),target=info.target;
    if(!(target instanceof Element)||!info.frames.length||!info.timing)return animation;
    snapshot(animation);
    try{animation.pause();const effect=new KeyframeEffect(target,info.frames,info.timing);const mirror=new Animation(effect,document.timeline);mirror.__animatorMirror=true;mirror.pause();mirrors.set(animation,mirror);return mirror;}catch{return animation;}
  };
  const controllerFor=animation=>controlled?ensureMirror(animation):animation;
  const seekOne=(animation,time)=>{
    const info=remember(animation),controller=controllerFor(animation),local=time-info.start;
    try{controller.pause();const end=endOf(controller);controller.currentTime=Number.isFinite(end)?Math.min(local,end):local;}catch{}
  };
  const attrTrack=(el,name,oldValue)=>{let map=attrIndex.get(el);if(!map){map=new Map();attrIndex.set(el,map);}let track=map.get(name);if(!track){track={el,name,baseline:oldValue,events:[]};map.set(name,track);attrTracks.push(track);}return track;};
  const mutationObserver=new MutationObserver(records=>{if(applyingReplay||controlled)return;for(const record of records){if(record.type!=='attributes'||!(record.target instanceof Element)||!record.attributeName)continue;const track=attrTrack(record.target,record.attributeName,record.oldValue);track.events.push({at:now(),value:record.target.getAttribute(record.attributeName)});}});
  mutationObserver.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['style','class','hidden','open','aria-expanded','aria-hidden']});
  const replayAttributes=time=>{for(const track of attrTracks){let value=track.baseline;for(const change of track.events){if(change.at>time)break;value=change.value;}try{if(value==null)track.el.removeAttribute(track.name);else track.el.setAttribute(track.name,value);}catch{}}};
  const seekAll=time=>{
    const generation=++replayGeneration;applyingReplay=true;
    try{replayAttributes(time);for(const animation of all())seekOne(animation,time);void document.documentElement.getBoundingClientRect();for(const animation of all()){const target=animation.effect?.target;if(target instanceof Element){void getComputedStyle(target).transform;void getComputedStyle(target).opacity;}}}
    finally{queueMicrotask(()=>{if(generation===replayGeneration)applyingReplay=false;});}
  };
  const totalEnd=()=>{let end=0;for(const animation of all()){const info=remember(animation),duration=endOf(animation);if(Number.isFinite(duration))end=Math.max(end,info.start+duration);}for(const track of attrTracks)for(const change of track.events)end=Math.max(end,change.at);return end;};
  const frameSignature=animation=>{try{return JSON.stringify((animation.effect?.getKeyframes?.()||[]).map(frame=>Object.fromEntries(Object.entries(frame).filter(([key])=>!['offset','computedOffset','easing','composite'].includes(key)).sort(([a],[b])=>a.localeCompare(b)))));}catch{return'';}};
  const groupKey=animation=>{const cssName=typeof animation.animationName==='string'?animation.animationName:'';if(cssName)return'css:'+cssName;const transition=typeof animation.transitionProperty==='string'?animation.transitionProperty:'';if(transition)return'transition:'+transition;const frames=frameSignature(animation);return frames?'frames:'+frames:'animation';};
  const applyGroup=m=>{
    const items=all(),selected=items.find(animation=>animation.__animatorId===m.animationId);if(!selected)return;
    const key=groupKey(selected);
    for(const animation of items){if(groupKey(animation)!==key)continue;snapshot(animation);const controllers=[animation,mirrors.get(animation)].filter(Boolean);for(const controller of controllers){try{if(controller.effect){const timing={};if(m.duration!=null)timing.duration=m.duration;if(m.delay!=null)timing.delay=m.delay;if(m.easing)timing.easing=m.easing;if(Object.keys(timing).length)controller.effect.updateTiming(timing);if(m.keyframes)controller.effect.setKeyframes(m.keyframes);}}catch{}}}
    if(controlled)seekAll(masterTime);
  };
  const resumeSuspendedRafs=()=>{const callbacks=[...suspendedRafs.values()];suspendedRafs.clear();for(const callback of callbacks)nativeRAF(callback);};
  const enter=time=>{capture();controlled=true;playing=false;masterTime=Math.max(0,Number(time)||0);for(const animation of all())ensureMirror(animation);seekAll(masterTime);post('TIMELINE_STATE',{time:masterTime,playing,controlled});post('DIAGNOSTIC',{level:'info',message:'Timeline controls '+all().length+' animation instance(s) and '+attrTracks.length+' mutation track(s)'});};
  const scrub=time=>{if(!controlled)enter(time);else{playing=false;masterTime=Math.max(0,Number(time)||0);seekAll(masterTime);post('TIMELINE_STATE',{time:masterTime,playing,controlled});}};
  const schedule=()=>{if(!raf)raf=nativeRAF(tick);};
  const tick=perf=>{raf=0;if(!playing)return;const delta=Math.max(0,perf-lastPerf);lastPerf=perf;masterTime+=delta*rate;const end=totalEnd();if(loop&&end>0&&masterTime>end)masterTime%=end;seekAll(masterTime);post('TIMELINE_STATE',{time:masterTime,playing,controlled});schedule();};
  const play=()=>{if(!controlled)enter(masterTime);playing=true;lastPerf=performance.now();post('TIMELINE_STATE',{time:masterTime,playing,controlled});schedule();};
  const pause=()=>{if(!controlled)enter(masterTime);playing=false;if(raf){nativeCancelRAF(raf);raf=0;}seekAll(masterTime);post('TIMELINE_STATE',{time:masterTime,playing,controlled});};
  const restart=()=>{if(!controlled)enter(0);masterTime=0;playing=true;lastPerf=performance.now();seekAll(0);post('TIMELINE_STATE',{time:0,playing,controlled});schedule();};
  const release=()=>{
    playing=false;if(raf){nativeCancelRAF(raf);raf=0;}
    for(const animation of all()){
      const mirror=mirrors.get(animation);try{mirror?.cancel();}catch{}mirrors.delete(animation);
      const info=remember(animation),local=masterTime-info.start;
      try{animation.pause();const end=endOf(animation);animation.currentTime=Number.isFinite(end)?Math.min(local,end):local;animation.play();}catch{}
    }
    controlled=false;resumeSuspendedRafs();post('TIMELINE_STATE',{time:masterTime,playing:false,controlled:false});post('DIAGNOSTIC',{level:'info',message:'Live capture resumed'});
  };
  const restore=()=>{
    playing=false;if(raf){nativeCancelRAF(raf);raf=0;}
    for(const animation of all()){
      const mirror=mirrors.get(animation);try{mirror?.cancel();}catch{}mirrors.delete(animation);
      const original=snapshots.get(animation);if(!original)continue;
      try{if(animation.effect&&original.timing)animation.effect.updateTiming(original.timing);if(animation.effect&&original.frames)animation.effect.setKeyframes(original.frames);animation.playbackRate=original.rate;animation.currentTime=original.currentTime;if(original.playState==='running')animation.play();else if(original.playState==='paused')animation.pause();}catch{}
    }
    controlled=false;resumeSuspendedRafs();post('TIMELINE_STATE',{time:masterTime,playing:false,controlled:false});
  };
  const highlightAnimation=id=>{
    const animation=all().find(item=>item.__animatorId===id);const target=animation?.effect?.target;if(!(target instanceof Element))return;
    const rect=target.getBoundingClientRect();if(!highlight){highlight=document.createElement('div');Object.assign(highlight.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483646',border:'2px solid #58a6ff',background:'rgba(88,166,255,.08)',boxSizing:'border-box',transition:'opacity .15s'});document.documentElement.appendChild(highlight);}Object.assign(highlight.style,{display:'block',opacity:'1',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});setTimeout(()=>{if(highlight)highlight.style.opacity='0';},900);
  };
  addEventListener('message',event=>{const m=event.data;if(!m||m.source!==IN||typeof m.type!=='string')return;
    if(m.type==='SCRUB_TIMELINE'){scrub(m.time);return;}
    if(m.type==='SET_ANIMATION_TIME'){const selected=all().find(animation=>animation.__animatorId===m.id);scrub(selected?remember(selected).start+Math.max(0,Number(m.time)||0):Math.max(0,Number(m.time)||0));return;}
    if(m.type==='PLAY_ALL'||m.type==='PLAY_ANIMATION'){play();return;}
    if(m.type==='PAUSE_ALL'||m.type==='PAUSE_ANIMATION'){pause();return;}
    if(m.type==='RESTART_ALL'){restart();return;}
    if(m.type==='RELEASE_TIMELINE'){release();return;}
    if(m.type==='RESTART_ANIMATION'){const selected=all().find(animation=>animation.__animatorId===m.id);scrub(selected?remember(selected).start:0);play();return;}
    if(m.type==='SET_ALL_PLAYBACK_RATE'||m.type==='SET_PLAYBACK_RATE'){const next=Number(m.rate);if(Number.isFinite(next)&&next>0)rate=next;return;}
    if(m.type==='SET_LOOP_ALL'){loop=!!m.enabled;return;}
    if(m.type==='APPLY_OVERRIDE'){applyGroup(m);return;}
    if(m.type==='HIGHLIGHT_ANIMATION'){highlightAnimation(m.id);return;}
    if(m.type==='CLEAR_OVERRIDES'){restore();return;}
  });
  capture();nativeRAF(capture);setInterval(()=>{if(!controlled)capture();},50);
})();`;
