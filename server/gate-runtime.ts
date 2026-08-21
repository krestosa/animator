export const gateRuntimeSource=String.raw`(()=>{
  if(window.__ANIMATOR_GATE_RUNTIME__)return;window.__ANIMATOR_GATE_RUNTIME__=true;
  const SESSION_KEY='__animator_recording_gate';
  let recording=true,inputLocked=false,stoppedDuringLoad=false;
  try{recording=sessionStorage.getItem(SESSION_KEY)!=='0';}catch{}
  const activeFetches=new Set(),activeXhrs=new Set(),activeSockets=new Set(),activeSources=new Set(),pausedAnimations=new Set(),bornWhileStopped=new Map();
  const nativeFetch=window.fetch?.bind(window),NativeXHR=window.XMLHttpRequest,NativeWebSocket=window.WebSocket,NativeEventSource=window.EventSource,nativeBeacon=navigator.sendBeacon?.bind(navigator),NativeIntersectionObserver=window.IntersectionObserver,nativeAnimate=Element.prototype.animate;
  const abortError=()=>new DOMException('Animator recording is stopped','AbortError');
  const remember=value=>{try{sessionStorage.setItem(SESSION_KEY,value?'1':'0');}catch{}};
  const blockInput=event=>{if(!inputLocked)return;event.preventDefault?.();event.stopImmediatePropagation?.();};
  for(const type of ['pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','click','dblclick','contextmenu','wheel','touchstart','touchmove','touchend','keydown','keyup','input','change','submit'])window.addEventListener(type,blockInput,{capture:true,passive:false});
  window.addEventListener('scroll',event=>{if(inputLocked)event.stopImmediatePropagation();},true);
  if(NativeIntersectionObserver){window.IntersectionObserver=class extends NativeIntersectionObserver{constructor(callback,options){super((entries,observer)=>{if(!inputLocked)callback(entries,observer);},options);}};}
  if(nativeFetch){window.fetch=function(input,init={}){if(!recording)return Promise.reject(abortError());const controller=new AbortController(),signal=init?.signal;if(signal){if(signal.aborted)controller.abort(signal.reason);else signal.addEventListener('abort',()=>controller.abort(signal.reason),{once:true});}activeFetches.add(controller);return nativeFetch(input,{...init,signal:controller.signal}).finally(()=>activeFetches.delete(controller));};}
  if(NativeXHR){const open=NativeXHR.prototype.open,send=NativeXHR.prototype.send,abort=NativeXHR.prototype.abort;NativeXHR.prototype.open=function(...args){this.__animatorOpened=true;return open.apply(this,args);};NativeXHR.prototype.send=function(...args){if(!recording){try{abort.call(this);}catch{}return;}activeXhrs.add(this);this.addEventListener('loadend',()=>activeXhrs.delete(this),{once:true});return send.apply(this,args);};}
  if(NativeWebSocket){window.WebSocket=new Proxy(NativeWebSocket,{construct(target,args,newTarget){if(!recording)throw abortError();const socket=Reflect.construct(target,args,newTarget);activeSockets.add(socket);socket.addEventListener('close',()=>activeSockets.delete(socket),{once:true});return socket;}});}
  if(NativeEventSource){window.EventSource=new Proxy(NativeEventSource,{construct(target,args,newTarget){if(!recording)throw abortError();const source=Reflect.construct(target,args,newTarget);activeSources.add(source);return source;}});}
  if(nativeBeacon){navigator.sendBeacon=function(...args){if(!recording)return false;return nativeBeacon(...args);};}
  const pauseOne=animation=>{if(!animation||animation.__animatorMirror||animation.__animatorMutationMirror||animation.playState!=='running')return;pausedAnimations.add(animation);try{animation.pause();}catch{}};
  const discardBorn=animation=>{const entry=bornWhileStopped.get(animation);if(entry?.timer)clearTimeout(entry.timer);bornWhileStopped.delete(animation);pausedAnimations.delete(animation);try{animation.cancel();}catch{}};
  const markBornWhileStopped=animation=>{if(recording||!animation||animation.__animatorMirror||animation.__animatorMutationMirror||bornWhileStopped.has(animation))return;pauseOne(animation);const entry={at:Date.now(),timer:0};entry.timer=setTimeout(()=>{if(!recording)discardBorn(animation);},250);bornWhileStopped.set(animation,entry);};
  Element.prototype.animate=function(...args){const animation=nativeAnimate.apply(this,args);if(!recording)markBornWhileStopped(animation);return animation;};
  const pauseAnimations=()=>{for(const animation of document.getAnimations?.()??[])pauseOne(animation);};
  const freezeNewMotion=event=>{if(recording)return;const target=event.target;queueMicrotask(()=>{for(const animation of document.getAnimations?.()??[])if(!(target instanceof Element)||animation.effect?.target===target)markBornWhileStopped(animation);});};
  document.addEventListener('animationstart',freezeNewMotion,true);document.addEventListener('transitionrun',freezeNewMotion,true);
  const reportRescued=animation=>{
    const el=animation?.effect?.target,idFor=window.__ANIMATOR_ELEMENT_ID__;if(!(el instanceof Element)||typeof idFor!=='function')return;
    let timing={},frames=[];try{timing=animation.effect?.getComputedTiming?.()||{};frames=animation.effect?.getKeyframes?.()||[];}catch{}
    const id=animation.__animatorId||(animation.__animatorId='anim-'+Math.random().toString(36).slice(2)),elementId=idFor(el),rect=el.getBoundingClientRect(),current=Number(animation.currentTime),rate=Math.abs(Number(animation.playbackRate))||1;
    const properties=[...new Set(frames.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))].map(name=>({name,values:frames.map(frame=>frame[name]).filter(value=>value!=null).map(String)}));
    parent.postMessage({source:'animator-preview',type:'ELEMENTS',elements:[{id:elementId,tag:el.tagName.toLowerCase(),domId:el.id||undefined,classes:[...el.classList],text:(el.textContent||'').trim().slice(0,80)||undefined,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},alive:el.isConnected}]},'*');
    parent.postMessage({source:'animator-preview',type:'ANIMATION',animation:{id,elementId,type:'web-animation',startTime:Math.max(0,performance.now()-(Number.isFinite(current)?Math.max(0,current)/rate:0)),duration:Number(timing.duration)||undefined,delay:Number(timing.delay)||undefined,iterations:Number(timing.iterations)||undefined,direction:timing.direction,easing:timing.easing,fill:timing.fill,properties,confidence:'runtime-observed',runtimeState:animation.playState==='finished'?'finished':animation.playState==='paused'?'paused':animation.playState==='idle'?'idle':'running',keyframes:frames}},'*');
  };
  const resumeAnimations=requestedAt=>{
    const threshold=Number.isFinite(Number(requestedAt))?Number(requestedAt):Date.now(),rescued=[];
    for(const [animation,entry] of [...bornWhileStopped]){if(entry.timer)clearTimeout(entry.timer);bornWhileStopped.delete(animation);if(entry.at+1<threshold){pausedAnimations.delete(animation);try{animation.cancel();}catch{}}else rescued.push(animation);}
    for(const animation of [...pausedAnimations]){try{if(animation.playState==='paused')animation.play();}catch{}pausedAnimations.delete(animation);}
    queueMicrotask(()=>rescued.forEach(reportRescued));
  };
  const hardStop=()=>{recording=false;remember(false);stoppedDuringLoad=document.readyState!=='complete';for(const controller of activeFetches){try{controller.abort(abortError());}catch{}}activeFetches.clear();for(const xhr of activeXhrs){try{xhr.abort();}catch{}}activeXhrs.clear();for(const socket of activeSockets){try{socket.close(1000,'Animator recording stopped');}catch{}}activeSockets.clear();for(const source of activeSources){try{source.close();}catch{}}activeSources.clear();pauseAnimations();try{window.stop();}catch{}};
  const hardStart=requestedAt=>{recording=true;remember(true);resumeAnimations(requestedAt);if(stoppedDuringLoad){stoppedDuringLoad=false;queueMicrotask(()=>location.reload());}};
  const pan=(dx,dy)=>{if(!inputLocked)return;const x=Number(dx)||0,y=Number(dy)||0;try{window.scrollBy({left:x,top:y,behavior:'instant'});}catch{window.scrollBy(x,y);}};
  window.__ANIMATOR_CAPTURE_GATE__={get recording(){return recording;},get inputLocked(){return inputLocked;},stop:hardStop,start:hardStart,pan};
  addEventListener('message',event=>{const message=event.data;if(!message||message.source!=='animator-editor')return;if(message.type==='SET_RECORDING'){message.enabled?hardStart(message.requestedAt):hardStop();return;}if(message.type==='SET_INPUT_LOCK'){inputLocked=!!message.enabled;return;}if(message.type==='PAN_VIEWPORT'){pan(message.dx,message.dy);}});
  if(!recording)queueMicrotask(hardStop);
})();`;
