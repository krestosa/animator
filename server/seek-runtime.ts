export const seekRuntimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_SEEK_RUNTIME__)return;window.__ANIMATOR_SEEK_RUNTIME__=true;
  const IN='animator-timeline',OUT='animator-preview',FPS=60,FRAME_MS=1000/FPS,started=performance.now();
  const registry=new Set(),meta=new WeakMap(),mirrors=new WeakMap(),snapshots=new WeakMap(),suspendedRafs=new Map();
  const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancelRAF=window.cancelAnimationFrame.bind(window),nativeAnimate=Element.prototype.animate;
  let active=[],controlled=false,playing=false,masterTime=0,masterFrame=0,rate=1,loop=false,highlight=null,virtualRafId=1000000,endCache=0;
  let fallbackRaf=0,playOriginTime=0,playOriginPerf=0,lastAppliedPerf=0,clock=null;
  const post=(type,payload={})=>parent.postMessage({source:OUT,type,...payload},'*');
  const now=()=>performance.now()-started;
  const mutationReplay=()=>window.__ANIMATOR_MUTATION_REPLAY__;
  const documentAnimations=()=>{try{return document.getAnimations({subtree:true});}catch{return document.getAnimations();}};
  const connected=animation=>{const target=animation?.effect?.target;return !(target instanceof Element)||target.isConnected;};
  const captureAnimation=animation=>{if(!animation||animation.__animatorMirror)return animation;registry.add(animation);remember(animation);return animation;};
  const capture=()=>{if(controlled)return;for(const animation of documentAnimations())captureAnimation(animation);};
  const refreshActive=()=>{capture();active=[...registry].filter(connected);};
  const all=()=>controlled?active.filter(connected):(capture(),[...registry].filter(connected));
  Element.prototype.animate=function(keyframes,options){const animation=nativeAnimate.call(this,keyframes,options);captureAnimation(animation);return animation;};
  window.requestAnimationFrame=function(callback){if(!controlled)return nativeRAF(callback);const id=++virtualRafId;suspendedRafs.set(id,callback);return id;};
  window.cancelAnimationFrame=function(id){if(suspendedRafs.delete(id))return;nativeCancelRAF(id);};
  document.addEventListener('animationstart',()=>queueMicrotask(capture),true);
  document.addEventListener('transitionrun',()=>queueMicrotask(capture),true);
  function remember(animation){
    let value=meta.get(animation);if(value)return value;
    const current=Number(animation.currentTime),playback=Math.abs(Number(animation.playbackRate))||1;let timing=null,frames=[],target=null;
    try{timing=animation.effect?.getTiming?.()||null;frames=animation.effect?.getKeyframes?.()||[];target=animation.effect?.target||null;}catch{}
    value={start:Math.max(0,now()-(Number.isFinite(current)?current/playback:0)),timing,frames,target};meta.set(animation,value);return value;
  }
  const endOf=animation=>{try{const timing=animation.effect?.getComputedTiming?.();const end=Number(timing?.endTime);if(Number.isFinite(end))return Math.max(0,end);const activeDuration=Number(timing?.activeDuration),delay=Number(timing?.delay)||0;return Number.isFinite(activeDuration)?Math.max(0,delay+activeDuration):Infinity;}catch{return Infinity;}};
  const snapshot=animation=>{if(snapshots.has(animation))return;try{snapshots.set(animation,{timing:animation.effect?.getTiming?.(),frames:animation.effect?.getKeyframes?.(),rate:animation.playbackRate,currentTime:animation.currentTime,playState:animation.playState});}catch{}};
  const ensureMirror=animation=>{
    const existing=mirrors.get(animation);if(existing)return existing;const info=remember(animation),target=info.target;
    if(!(target instanceof Element)||!info.frames.length||!info.timing)return animation;snapshot(animation);
    try{animation.pause();const effect=new KeyframeEffect(target,info.frames,info.timing);const mirror=new Animation(effect,document.timeline);mirror.__animatorMirror=true;mirror.pause();mirrors.set(animation,mirror);return mirror;}catch{return animation;}
  };
  const seekOne=(animation,time)=>{const info=remember(animation),controller=ensureMirror(animation),local=time-info.start;try{controller.pause();if(local<0){controller.currentTime=null;return;}const end=endOf(controller);controller.currentTime=Number.isFinite(end)?Math.min(local,end):local;}catch{}};
  const seekAll=time=>{for(const animation of active)if(connected(animation))seekOne(animation,time);mutationReplay()?.seek?.(time);};
  const recomputeEnd=()=>{let end=0;for(const animation of active){const duration=endOf(animation);if(Number.isFinite(duration))end=Math.max(end,remember(animation).start+duration);}const mutationEnd=Number(mutationReplay()?.end?.());if(Number.isFinite(mutationEnd))end=Math.max(end,mutationEnd);endCache=end;};
  const frameSignature=animation=>{try{return JSON.stringify((animation.effect?.getKeyframes?.()||[]).map(frame=>Object.fromEntries(Object.entries(frame).filter(([key])=>!['offset','computedOffset','easing','composite'].includes(key)).sort(([a],[b])=>a.localeCompare(b)))));}catch{return'';}};
  const groupKey=animation=>{const cssName=typeof animation.animationName==='string'?animation.animationName:'';if(cssName)return'css:'+cssName;const transition=typeof animation.transitionProperty==='string'?animation.transitionProperty:'';if(transition)return'transition:'+transition;const frames=frameSignature(animation);return frames?'frames:'+frames:'animation';};
  const postState=()=>post('TIMELINE_STATE',{time:masterTime,frame:masterFrame,fps:FPS,playing,controlled});
  const applyGroup=m=>{const items=all(),selected=items.find(animation=>animation.__animatorId===m.animationId);if(!selected)return;const key=groupKey(selected);for(const animation of items){if(groupKey(animation)!==key)continue;snapshot(animation);for(const controller of [animation,mirrors.get(animation)].filter(Boolean)){try{if(!controller.effect)continue;const timing={};if(m.duration!=null)timing.duration=m.duration;if(m.delay!=null)timing.delay=m.delay;if(m.easing)timing.easing=m.easing;if(Object.keys(timing).length)controller.effect.updateTiming(timing);if(m.keyframes)controller.effect.setKeyframes(m.keyframes);}catch{}}}recomputeEnd();if(controlled)seekAll(masterTime);};
  const stopClock=()=>{if(clock)clock.postMessage({type:'stop'});if(fallbackRaf){nativeCancelRAF(fallbackRaf);fallbackRaf=0;}};
  const applyClock=()=>{if(!playing)return;const perf=performance.now();if(perf-lastAppliedPerf<12)return;lastAppliedPerf=perf;let next=playOriginTime+(perf-playOriginPerf)*rate;if(loop&&endCache>0&&next>endCache)next%=endCache;masterTime=Math.max(0,next);masterFrame=Math.round(masterTime/FRAME_MS);seekAll(masterTime);postState();};
  const fallbackTick=()=>{fallbackRaf=0;applyClock();if(playing)fallbackRaf=nativeRAF(fallbackTick);};
  const startClock=()=>{playOriginTime=masterTime;playOriginPerf=performance.now();lastAppliedPerf=0;if(clock)clock.postMessage({type:'start',fps:FPS});else if(!fallbackRaf)fallbackRaf=nativeRAF(fallbackTick);};
  try{clock=new Worker('/__animator/clock-worker.js',{name:'animator-playback-clock'});clock.addEventListener('message',event=>{if(event.data?.type==='tick')applyClock();});clock.addEventListener('error',()=>{try{clock?.terminate();}catch{}clock=null;if(playing&&!fallbackRaf)fallbackRaf=nativeRAF(fallbackTick);},{once:true});}catch{clock=null;}
  const enter=time=>{stopClock();refreshActive();controlled=true;playing=false;masterTime=Math.max(0,Number(time)||0);masterFrame=Math.round(masterTime/FRAME_MS);for(const animation of active)ensureMirror(animation);recomputeEnd();seekAll(masterTime);postState();post('DIAGNOSTIC',{level:'info',message:'Timeline owns '+active.length+' animation instance(s); playback clock '+(clock?'worker-backed':'main-thread fallback')});};
  const scrub=time=>{if(!controlled)enter(time);else{stopClock();playing=false;masterTime=Math.max(0,Number(time)||0);masterFrame=Math.round(masterTime/FRAME_MS);seekAll(masterTime);postState();}};
  const seekFrame=frame=>{const next=Math.max(0,Math.round(Number(frame)||0));if(!controlled)enter(next*FRAME_MS);else{stopClock();playing=false;masterFrame=next;masterTime=masterFrame*FRAME_MS;seekAll(masterTime);postState();}};
  const stepFrame=delta=>{const base=controlled?masterFrame:Math.round(masterTime/FRAME_MS);seekFrame(base+Math.trunc(Number(delta)||0));};
  const play=()=>{if(!controlled)enter(masterTime);if(playing)return;playing=true;startClock();postState();};
  const pause=()=>{if(!controlled)enter(masterTime);stopClock();playing=false;seekAll(masterTime);postState();};
  const restart=()=>{if(!controlled)enter(0);else seekFrame(0);playing=true;startClock();postState();};
  const resumeSuspendedRafs=()=>{const callbacks=[...suspendedRafs.values()];suspendedRafs.clear();for(const callback of callbacks)nativeRAF(callback);};
  const release=()=>{stopClock();playing=false;for(const animation of active){const mirror=mirrors.get(animation);try{mirror?.cancel();}catch{}mirrors.delete(animation);const info=remember(animation),local=masterTime-info.start;try{animation.pause();const end=endOf(animation);animation.currentTime=local<0?null:Number.isFinite(end)?Math.min(local,end):local;animation.play();}catch{}}controlled=false;mutationReplay()?.release?.();resumeSuspendedRafs();postState();post('DIAGNOSTIC',{level:'info',message:'Live capture resumed'});};
  const restore=()=>{stopClock();playing=false;for(const animation of active){const mirror=mirrors.get(animation);try{mirror?.cancel();}catch{}mirrors.delete(animation);const original=snapshots.get(animation);if(!original)continue;try{if(animation.effect&&original.timing)animation.effect.updateTiming(original.timing);if(animation.effect&&original.frames)animation.effect.setKeyframes(original.frames);animation.playbackRate=original.rate;animation.currentTime=original.currentTime;if(original.playState==='running')animation.play();else if(original.playState==='paused')animation.pause();}catch{}}controlled=false;mutationReplay()?.release?.();resumeSuspendedRafs();postState();};
  const highlightAnimation=id=>{const animation=all().find(item=>item.__animatorId===id);const target=animation?.effect?.target;if(!(target instanceof Element))return;const rect=target.getBoundingClientRect();if(!highlight){highlight=document.createElement('div');Object.assign(highlight.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483646',border:'2px solid #58a6ff',background:'rgba(88,166,255,.08)',boxSizing:'border-box',transition:'opacity .15s'});document.documentElement.appendChild(highlight);}Object.assign(highlight.style,{display:'block',opacity:'1',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});setTimeout(()=>{if(highlight)highlight.style.opacity='0';},900);};
  addEventListener('message',event=>{const m=event.data;if(!m||m.source!==IN||typeof m.type!=='string')return;
    if(m.type==='SCRUB_TIMELINE'){scrub(m.time);return;}if(m.type==='SEEK_FRAME'){seekFrame(m.frame);return;}if(m.type==='STEP_FRAME'){stepFrame(m.delta);return;}
    if(m.type==='SET_ANIMATION_TIME'){const selected=all().find(animation=>animation.__animatorId===m.id);scrub(selected?remember(selected).start+Math.max(0,Number(m.time)||0):Math.max(0,Number(m.time)||0));return;}
    if(m.type==='PLAY_ALL'||m.type==='PLAY_ANIMATION'){play();return;}if(m.type==='PAUSE_ALL'||m.type==='PAUSE_ANIMATION'){pause();return;}if(m.type==='RESTART_ALL'){restart();return;}if(m.type==='RELEASE_TIMELINE'){release();return;}
    if(m.type==='RESTART_ANIMATION'){const selected=all().find(animation=>animation.__animatorId===m.id);scrub(selected?remember(selected).start:0);play();return;}
    if(m.type==='SET_ALL_PLAYBACK_RATE'||m.type==='SET_PLAYBACK_RATE'){const next=Number(m.rate);if(Number.isFinite(next)&&next>0){if(playing){applyClock();rate=next;startClock();}else rate=next;}return;}
    if(m.type==='SET_LOOP_ALL'){loop=!!m.enabled;return;}if(m.type==='APPLY_OVERRIDE'){applyGroup(m);return;}if(m.type==='HIGHLIGHT_ANIMATION'){highlightAnimation(m.id);return;}if(m.type==='CLEAR_OVERRIDES'){restore();return;}
  });
  capture();nativeRAF(capture);setInterval(()=>{if(!controlled)capture();},200);
})();`;
