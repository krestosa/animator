export const seekRuntimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_SEEK_RUNTIME__)return;window.__ANIMATOR_SEEK_RUNTIME__=true;
  const SOURCE='animator-editor',started=performance.now(),meta=new WeakMap(),originals=new WeakMap();
  let controlled=false,playing=false,masterTime=0,rate=1,loop=false,lastPerf=performance.now(),timer=0;
  const now=()=>performance.now()-started;
  const animations=()=>{try{return document.getAnimations({subtree:true});}catch{return document.getAnimations();}};
  const remember=a=>{let value=meta.get(a);if(value)return value;const current=Number(a.currentTime),playback=Math.abs(Number(a.playbackRate))||1;value={start:Math.max(0,now()-(Number.isFinite(current)?current/playback:0))};meta.set(a,value);return value;};
  const endOf=a=>{try{const timing=a.effect?.getComputedTiming?.();const end=Number(timing?.endTime);if(Number.isFinite(end))return Math.max(0,end);const active=Number(timing?.activeDuration),delay=Number(timing?.delay)||0;return Number.isFinite(active)?Math.max(0,delay+active):Infinity;}catch{return Infinity;}};
  const seekOne=(a,time)=>{const info=remember(a);const local=time-info.start;try{a.pause();const end=endOf(a);a.currentTime=Number.isFinite(end)?Math.min(local,end):local;}catch{}};
  const seekAll=time=>{for(const animation of animations())seekOne(animation,time);void document.documentElement.getBoundingClientRect();};
  const totalEnd=()=>{let end=0;for(const animation of animations()){const info=remember(animation),duration=endOf(animation);if(Number.isFinite(duration))end=Math.max(end,info.start+duration);}return end;};
  const frameSignature=a=>{try{return JSON.stringify((a.effect?.getKeyframes?.()||[]).map(frame=>Object.fromEntries(Object.entries(frame).filter(([key])=>!['offset','computedOffset','easing','composite'].includes(key)).sort(([a],[b])=>a.localeCompare(b)))));}catch{return'';}};
  const groupKey=a=>{const cssName=typeof a.animationName==='string'?a.animationName:'';if(cssName)return'css:'+cssName;const transition=typeof a.transitionProperty==='string'?a.transitionProperty:'';if(transition)return'transition:'+transition;const frames=frameSignature(a);return frames?'frames:'+frames:'animation';};
  const snapshot=a=>{if(originals.has(a))return;try{originals.set(a,{timing:a.effect?.getTiming?.(),frames:a.effect?.getKeyframes?.(),rate:a.playbackRate});}catch{}};
  const applyGroup=m=>{const all=animations(),selected=all.find(a=>a.__animatorId===m.animationId);if(!selected)return;const key=groupKey(selected);for(const animation of all){if(groupKey(animation)!==key)continue;snapshot(animation);try{if(animation.effect){const timing={};if(m.duration!=null)timing.duration=m.duration;if(m.delay!=null)timing.delay=m.delay;if(m.easing)timing.easing=m.easing;if(Object.keys(timing).length)animation.effect.updateTiming(timing);if(m.keyframes)animation.effect.setKeyframes(m.keyframes);}if(controlled)seekOne(animation,masterTime);}catch{}}};
  const restore=()=>{for(const animation of animations()){const original=originals.get(animation);if(!original)continue;try{if(animation.effect&&original.timing)animation.effect.updateTiming(original.timing);if(animation.effect&&original.frames)animation.effect.setKeyframes(original.frames);animation.playbackRate=original.rate;}catch{}}originals.clear();};
  const schedule=()=>{if(timer)return;timer=setTimeout(tick,16);};
  const tick=()=>{timer=0;if(!playing)return;const perf=performance.now(),delta=Math.max(0,perf-lastPerf);lastPerf=perf;masterTime+=delta*rate;const end=totalEnd();if(loop&&end>0&&masterTime>end)masterTime%=end;seekAll(masterTime);schedule();};
  addEventListener('message',event=>{const m=event.data;if(!m||m.source!==SOURCE||typeof m.type!=='string')return;
    if(m.type==='SCRUB_TIMELINE'){controlled=true;playing=false;masterTime=Math.max(0,Number(m.time)||0);seekAll(masterTime);return;}
    if(m.type==='SET_ANIMATION_TIME'){controlled=true;playing=false;const selected=animations().find(a=>a.__animatorId===m.id);masterTime=selected?remember(selected).start+Math.max(0,Number(m.time)||0):Math.max(0,Number(m.time)||0);seekAll(masterTime);return;}
    if(m.type==='PLAY_ALL'||m.type==='PLAY_ANIMATION'){controlled=true;playing=true;lastPerf=performance.now();seekAll(masterTime);schedule();return;}
    if(m.type==='PAUSE_ALL'||m.type==='PAUSE_ANIMATION'){controlled=true;playing=false;seekAll(masterTime);return;}
    if(m.type==='RESTART_ALL'){controlled=true;playing=true;masterTime=0;lastPerf=performance.now();seekAll(0);schedule();return;}
    if(m.type==='SET_ALL_PLAYBACK_RATE'||m.type==='SET_PLAYBACK_RATE'){const next=Number(m.rate);if(Number.isFinite(next)&&next>0)rate=next;return;}
    if(m.type==='SET_LOOP_ALL'){loop=!!m.enabled;return;}
    if(m.type==='APPLY_OVERRIDE'){applyGroup(m);return;}
    if(m.type==='CLEAR_OVERRIDES'){playing=false;controlled=false;restore();return;}
  });
  setInterval(()=>{if(!controlled)for(const animation of animations())remember(animation);},100);
})();`;
