export const runtimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_RUNTIME__) return; window.__ANIMATOR_RUNTIME__=true;
  const SOURCE='animator-preview', ids=new WeakMap(), byId=new Map(), animations=new Map(), animationMeta=new Map(), originals=new Map(), created=new Set(); let seq=0, picker=false, recording=true, hover=null, started=performance.now(), reducedStyle=null;
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*'); const now=()=>performance.now()-started;
  const idFor=(el)=>{let id=ids.get(el);if(!id){id='el-'+(++seq);ids.set(el,id);byId.set(id,el);}return id;};
  const meta=(el)=>{const r=el.getBoundingClientRect();return{id:idFor(el),tag:el.tagName.toLowerCase(),domId:el.id||undefined,classes:[...el.classList],text:(el.textContent||'').trim().slice(0,80)||undefined,rect:{x:r.x,y:r.y,width:r.width,height:r.height},alive:el.isConnected};};
  const event=(kind,el,label,data={})=>{if(!recording)return;post('EVENT',{event:{id:'ev-'+Math.random().toString(36).slice(2),at:now(),kind,elementId:el?idFor(el):undefined,label,data}});};
  const normalize=(anim,el,type,name)=>{const effect=anim.effect;let timing={};let frames=[];try{timing=effect?.getComputedTiming?.()||{};frames=effect?.getKeyframes?.()||[];}catch{} const id=anim.__animatorId||(anim.__animatorId='anim-'+Math.random().toString(36).slice(2));let info=animationMeta.get(id);if(!info){info={startTime:now(),type,name};animationMeta.set(id,info);}else{if(type&&info.type==='unknown')info.type=type;if(name&&!info.name)info.name=name;}const props=[...new Set(frames.flatMap(f=>Object.keys(f).filter(k=>!['offset','easing','composite','computedOffset'].includes(k))))].map(name=>({name,values:frames.map(f=>f[name]).filter(v=>v!=null).map(String)})); return{id,elementId:idFor(el),type:info.type||type,name:info.name||name,startTime:info.startTime,duration:Number(timing.duration)||undefined,delay:Number(timing.delay)||undefined,iterations:Number(timing.iterations)||undefined,direction:timing.direction,easing:timing.easing,fill:timing.fill,properties:props,confidence:'runtime-observed',runtimeState:anim.playState==='finished'?'finished':anim.playState==='paused'?'paused':'running',keyframes:frames};};
  const reportAnimation=(anim,type,name)=>{const el=anim.effect?.target;if(!(el instanceof Element))return;const n=normalize(anim,el,type,name);animations.set(n.id,anim);post('ANIMATION',{animation:n});};
  const snapshot=(id,a)=>{if(originals.has(id)||!a.effect)return;let timing=null,frames=null;try{timing=a.effect.getTiming();frames=a.effect.getKeyframes();}catch{} originals.set(id,{timing,frames,playbackRate:a.playbackRate});};
  const nativeAnimate=Element.prototype.animate; Element.prototype.animate=function(k,o){const a=nativeAnimate.call(this,k,o);queueMicrotask(()=>reportAnimation(a,'web-animation'));return a;};
  document.addEventListener('animationstart',e=>{event('animationstart',e.target,e.animationName);queueMicrotask(()=>document.getAnimations().filter(a=>a.effect?.target===e.target).forEach(a=>reportAnimation(a,'css-animation',e.animationName)));},true);
  document.addEventListener('transitionrun',e=>{event('transition',e.target,e.propertyName,{elapsedTime:e.elapsedTime});queueMicrotask(()=>document.getAnimations().filter(a=>a.effect?.target===e.target).forEach(a=>reportAnimation(a,'css-transition',e.propertyName)));},true);
  ['animationend','transitionend'].forEach(t=>document.addEventListener(t,e=>event(t,e.target,e.animationName||e.propertyName),true));
  const observer=new MutationObserver(records=>records.forEach(r=>{if(r.type==='childList'){r.addedNodes.forEach(n=>{if(n instanceof Element){event('dom-insert',n,'Element inserted');post('ELEMENTS',{elements:[meta(n),...Array.from(n.querySelectorAll('*')).slice(0,200).map(meta)]});}});r.removedNodes.forEach(n=>{if(n instanceof Element)event('dom-remove',n,'Element removed');});}else if(r.target instanceof Element)event(r.attributeName==='class'?'class-mutation':'attribute-mutation',r.target,r.attributeName+' changed',{attribute:r.attributeName});}));
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-expanded']});
  const userEvents=['click','pointerdown','pointerup','focus','blur','input','change','submit','keydown','scroll'];userEvents.forEach(t=>document.addEventListener(t,e=>{if(e.target instanceof Element)event('user-'+t,e.target,t,{key:e.key});},true));
  const outline=document.createElement('div');Object.assign(outline.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'1px solid #58a6ff',background:'rgba(88,166,255,.08)',display:'none'});document.documentElement.appendChild(outline);
  document.addEventListener('mousemove',e=>{if(!picker)return;const el=document.elementFromPoint(e.clientX,e.clientY);if(!(el instanceof Element)||el===outline)return;hover=el;const r=el.getBoundingClientRect();Object.assign(outline.style,{display:'block',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});},true);
  document.addEventListener('click',e=>{if(!picker||!(e.target instanceof Element))return;e.preventDefault();e.stopPropagation();picker=false;outline.style.display='none';post('SELECT_ELEMENT',{element:meta(e.target)});},true);

  const clampLocalTime=(a,globalTime,startTime)=>{let end=Infinity;try{const timing=a.effect?.getComputedTiming?.();const active=Number(timing?.activeDuration);const delay=Number(timing?.delay)||0;if(Number.isFinite(active))end=Math.max(0,delay+active);}catch{}const local=globalTime-startTime;if(local<0)return local;if(Number.isFinite(end))return Math.min(local,end);return local;};
  const forceVisualSample=()=>{void document.documentElement.getBoundingClientRect();for(const a of animations.values()){const target=a.effect?.target;if(target instanceof Element){void getComputedStyle(target).transform;void getComputedStyle(target).opacity;}}};
  const scrubAll=(globalTime)=>{for(const [id,a] of animations){const info=animationMeta.get(id);if(!info)continue;try{a.pause();a.currentTime=clampLocalTime(a,globalTime,info.startTime);}catch{}}forceVisualSample();};
  const playAll=()=>{for(const a of animations.values())try{a.play();}catch{}};
  const pauseAll=()=>{for(const a of animations.values())try{a.pause();}catch{}};
  const restartAll=()=>{for(const a of animations.values())try{a.currentTime=0;a.play();}catch{}};
  const setRateAll=(rate)=>{for(const [id,a] of animations){if(!Number.isFinite(rate)||rate<=0)continue;try{snapshot(id,a);a.playbackRate=rate;}catch{}}};
  const setReduced=(enabled)=>{if(enabled&&!reducedStyle){reducedStyle=document.createElement('style');reducedStyle.dataset.animatorReducedMotion='';reducedStyle.textContent='*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0ms!important}';document.head.appendChild(reducedStyle);}else if(!enabled&&reducedStyle){reducedStyle.remove();reducedStyle=null;}post('DIAGNOSTIC',{level:'info',message:enabled?'Reduced-motion emulation enabled':'Reduced-motion emulation disabled'});};

  const commands={
    SET_PICKER:m=>{picker=!!m.enabled;outline.style.display='none';},
    SET_RECORDING:m=>{recording=!!m.enabled;},
    SET_ANIMATION_TIME:m=>{const selectedStart=animationMeta.get(m.id)?.startTime??0;scrubAll(selectedStart+m.time);},
    SCRUB_TIMELINE:m=>{if(Number.isFinite(m.time))scrubAll(Math.max(0,m.time));},
    PLAY_ALL:()=>playAll(),
    PAUSE_ALL:()=>pauseAll(),
    RESTART_ALL:()=>restartAll(),
    SET_ALL_PLAYBACK_RATE:m=>setRateAll(Number(m.rate)),
    SET_REDUCED_MOTION:m=>setReduced(!!m.enabled),
    SET_PLAYBACK_RATE:m=>{const a=animations.get(m.id);if(a&&Number.isFinite(m.rate)&&m.rate>0){snapshot(m.id,a);a.playbackRate=m.rate;reportAnimation(a,'web-animation');}},
    PLAY_ANIMATION:m=>animations.get(m.id)?.play(),
    PAUSE_ANIMATION:m=>animations.get(m.id)?.pause(),
    RESTART_ANIMATION:m=>{const a=animations.get(m.id);if(a){a.currentTime=0;a.play();}},
    APPLY_OVERRIDE:m=>{const a=animations.get(m.animationId);if(!a)return;snapshot(m.animationId,a);if(a.effect){const timing={};if(m.duration!=null)timing.duration=m.duration;if(m.delay!=null)timing.delay=m.delay;if(m.easing)timing.easing=m.easing;if(Object.keys(timing).length)a.effect.updateTiming(timing);}if(a.effect&&m.keyframes)a.effect.setKeyframes(m.keyframes);reportAnimation(a,'web-animation');forceVisualSample();},
    CREATE_ANIMATION:m=>{const el=byId.get(m.elementId);if(el){const a=el.animate(m.keyframes,{duration:m.duration,delay:m.delay||0,easing:m.easing,iterations:m.iterations||1,direction:m.direction||'normal',fill:m.fill||'both'});const id=a.__animatorId||(a.__animatorId='anim-'+Math.random().toString(36).slice(2));created.add(id);reportAnimation(a,'web-animation','Created animation');}},
    CLEAR_OVERRIDES:()=>{for(const [id,original] of originals){const a=animations.get(id);if(!a)continue;try{if(a.effect&&original.timing)a.effect.updateTiming(original.timing);if(a.effect&&original.frames)a.effect.setKeyframes(original.frames);a.playbackRate=original.playbackRate;}catch{}}for(const id of created){try{animations.get(id)?.cancel();}catch{}animations.delete(id);animationMeta.delete(id);}originals.clear();created.clear();setReduced(false);post('DIAGNOSTIC',{level:'info',message:'Temporary animation overrides cleared'});}
  };
  addEventListener('message',e=>{const m=e.data;if(!m||m.source!=='animator-editor'||typeof m.type!=='string')return;commands[m.type]?.(m);});
  const discover=()=>post('ELEMENTS',{elements:Array.from(document.querySelectorAll('body *')).slice(0,1200).map(meta)});
  const scanAnimations=()=>document.getAnimations().forEach(a=>reportAnimation(a,'unknown'));
  requestAnimationFrame(()=>{discover();scanAnimations();post('READY');});
  const scanTimer=setInterval(scanAnimations,500);
  window.addEventListener('beforeunload',()=>{observer.disconnect();clearInterval(scanTimer);},{once:true});
})();`;
