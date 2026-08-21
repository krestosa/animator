export const gateRuntimeSource=String.raw`(()=>{
  if(window.__ANIMATOR_GATE_RUNTIME__)return;window.__ANIMATOR_GATE_RUNTIME__=true;
  const SESSION_KEY='__animator_recording_gate';
  let recording=true,inputLocked=false,stoppedDuringLoad=false;
  try{recording=sessionStorage.getItem(SESSION_KEY)!=='0';}catch{}
  const activeFetches=new Set(),activeXhrs=new Set(),activeSockets=new Set(),activeSources=new Set(),pausedAnimations=new Set();
  const nativeFetch=window.fetch?.bind(window),NativeXHR=window.XMLHttpRequest,NativeWebSocket=window.WebSocket,NativeEventSource=window.EventSource,nativeBeacon=navigator.sendBeacon?.bind(navigator),NativeIntersectionObserver=window.IntersectionObserver;
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
  const pauseAnimations=()=>{for(const animation of document.getAnimations?.()??[]){if(animation.__animatorMirror||animation.__animatorMutationMirror)continue;if(animation.playState==='running'){pausedAnimations.add(animation);try{animation.pause();}catch{}}}};
  const resumeAnimations=()=>{for(const animation of pausedAnimations){try{if(animation.playState==='paused')animation.play();}catch{}}pausedAnimations.clear();};
  const hardStop=()=>{recording=false;remember(false);stoppedDuringLoad=document.readyState!=='complete';for(const controller of activeFetches){try{controller.abort(abortError());}catch{}}activeFetches.clear();for(const xhr of activeXhrs){try{xhr.abort();}catch{}}activeXhrs.clear();for(const socket of activeSockets){try{socket.close(1000,'Animator recording stopped');}catch{}}activeSockets.clear();for(const source of activeSources){try{source.close();}catch{}}activeSources.clear();pauseAnimations();try{window.stop();}catch{}};
  const hardStart=()=>{recording=true;remember(true);resumeAnimations();if(stoppedDuringLoad){stoppedDuringLoad=false;queueMicrotask(()=>location.reload());}};
  const pan=(dx,dy)=>{if(!inputLocked)return;const x=Number(dx)||0,y=Number(dy)||0;try{window.scrollBy({left:x,top:y,behavior:'instant'});}catch{window.scrollBy(x,y);}};
  window.__ANIMATOR_CAPTURE_GATE__={get recording(){return recording;},get inputLocked(){return inputLocked;},stop:hardStop,start:hardStart,pan};
  addEventListener('message',event=>{const message=event.data;if(!message||message.source!=='animator-editor')return;if(message.type==='SET_RECORDING'){message.enabled?hardStart():hardStop();return;}if(message.type==='SET_INPUT_LOCK'){inputLocked=!!message.enabled;return;}if(message.type==='PAN_VIEWPORT'){pan(message.dx,message.dy);}});
  if(!recording)queueMicrotask(hardStop);
})();`;
