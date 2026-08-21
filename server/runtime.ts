export const runtimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_RUNTIME__)return;window.__ANIMATOR_RUNTIME__=true;
  const SOURCE='animator-preview',started=performance.now(),ids=new WeakMap(),byId=new Map(),animationMeta=new Map(),lastAnimationReport=new Map(),reportedElements=new WeakSet(),created=new Set();
  let seq=0,picker=false,recording=true,hover=null,reducedStyle=null,externalControl=false;
  const nativeAnimate=Element.prototype.animate;
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*');
  const now=()=>performance.now()-started;
  const idFor=el=>{let id=ids.get(el);if(!id){id='el-'+(++seq);ids.set(el,id);byId.set(id,el);}return id;};
  const meta=el=>{const rect=el.getBoundingClientRect();return{id:idFor(el),tag:el.tagName.toLowerCase(),domId:el.id||undefined,classes:[...el.classList],text:(el.textContent||'').trim().slice(0,80)||undefined,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},alive:el.isConnected};};
  const ensureElement=el=>{if(reportedElements.has(el))return;reportedElements.add(el);post('ELEMENTS',{elements:[meta(el)]});};
  const emitEvent=(kind,el,label,data={})=>{if(!recording||externalControl)return;post('EVENT',{event:{id:'ev-'+Math.random().toString(36).slice(2),at:now(),kind,elementId:el?idFor(el):undefined,label,data}});};
  const timingEnd=animation=>{try{const timing=animation.effect?.getComputedTiming?.();const delay=Number(timing?.delay)||0,active=Number(timing?.activeDuration);return Number.isFinite(active)?Math.max(0,delay+active):Infinity;}catch{return Infinity;}};
  const normalize=(animation,el,type,name)=>{
    let timing={},frames=[];try{timing=animation.effect?.getComputedTiming?.()||{};frames=animation.effect?.getKeyframes?.()||[];}catch{}
    const id=animation.__animatorId||(animation.__animatorId='anim-'+Math.random().toString(36).slice(2));let info=animationMeta.get(id);
    if(!info){const current=Number(animation.currentTime),playback=Math.abs(Number(animation.playbackRate))||1;info={startTime:Math.max(0,now()-(Number.isFinite(current)?Math.max(0,current)/playback:0)),type:type||'unknown',name:name||undefined};animationMeta.set(id,info);}else{if(type&&info.type==='unknown')info.type=type;if(name&&!info.name)info.name=name;}
    const props=[...new Set(frames.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))].map(prop=>({name:prop,values:frames.map(frame=>frame[prop]).filter(value=>value!=null).map(String)}));
    return{id,elementId:idFor(el),type:info.type||type||'unknown',name:info.name||name,startTime:info.startTime,duration:Number(timing.duration)||undefined,delay:Number(timing.delay)||undefined,iterations:Number(timing.iterations)||undefined,direction:timing.direction,easing:timing.easing,fill:timing.fill,properties:props,confidence:'runtime-observed',runtimeState:externalControl?'paused':animation.playState==='finished'?'finished':animation.playState==='paused'?'paused':animation.playState==='idle'?'idle':'running',keyframes:frames};
  };
  const reportAnimation=(animation,type='unknown',name)=>{const el=animation.effect?.target;if(!(el instanceof Element))return;const normalized=normalize(animation,el,type,name);ensureElement(el);const signature=JSON.stringify([normalized.type,normalized.name,normalized.startTime,normalized.duration,normalized.delay,normalized.iterations,normalized.easing,normalized.runtimeState,normalized.properties.map(prop=>prop.name)]);if(lastAnimationReport.get(normalized.id)===signature)return;lastAnimationReport.set(normalized.id,signature);post('ANIMATION',{animation:normalized});};
  Element.prototype.animate=function(keyframes,options){const animation=nativeAnimate.call(this,keyframes,options);queueMicrotask(()=>reportAnimation(animation,'web-animation'));return animation;};
  document.addEventListener('animationstart',event=>{emitEvent('animationstart',event.target,event.animationName);queueMicrotask(()=>document.getAnimations().filter(animation=>animation.effect?.target===event.target).forEach(animation=>reportAnimation(animation,'css-animation',event.animationName)));},true);
  document.addEventListener('transitionrun',event=>{emitEvent('transition',event.target,event.propertyName,{elapsedTime:event.elapsedTime});queueMicrotask(()=>document.getAnimations().filter(animation=>animation.effect?.target===event.target).forEach(animation=>reportAnimation(animation,'css-transition',event.propertyName)));},true);
  ['animationend','transitionend'].forEach(type=>document.addEventListener(type,event=>emitEvent(type,event.target,event.animationName||event.propertyName),true));

  const observer=new MutationObserver(records=>{if(externalControl)return;for(const record of records){if(record.type==='attributes'&&record.target instanceof Element){emitEvent(record.attributeName==='class'?'class-mutation':record.attributeName==='style'?'style-mutation':'attribute-mutation',record.target,(record.attributeName||'attribute')+' changed',{attribute:record.attributeName});continue;}if(record.type!=='childList')continue;for(const node of record.addedNodes){if(!(node instanceof Element))continue;emitEvent('dom-insert',node,'Element inserted');post('ELEMENTS',{elements:[meta(node),...Array.from(node.querySelectorAll('*')).slice(0,200).map(meta)]});}for(const node of record.removedNodes)if(node instanceof Element)emitEvent('dom-remove',node,'Element removed');}});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeOldValue:false,attributeFilter:['class','style','hidden','open','aria-expanded','aria-hidden']});

  const userEvents=['click','pointerdown','pointerup','focus','blur','input','change','submit','keydown','scroll'];
  userEvents.forEach(type=>document.addEventListener(type,event=>{if(event.target instanceof Element)emitEvent('user-'+type,event.target,type,{key:event.key});},true));
  const outline=document.createElement('div');Object.assign(outline.style,{position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'1px solid #58a6ff',background:'rgba(88,166,255,.08)',display:'none'});document.documentElement.appendChild(outline);
  document.addEventListener('mousemove',event=>{if(!picker)return;const el=document.elementFromPoint(event.clientX,event.clientY);if(!(el instanceof Element)||el===outline)return;hover=el;const rect=el.getBoundingClientRect();Object.assign(outline.style,{display:'block',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});},true);
  document.addEventListener('click',event=>{if(!picker||!(event.target instanceof Element))return;event.preventDefault();event.stopPropagation();picker=false;outline.style.display='none';ensureElement(event.target);post('SELECT_ELEMENT',{element:meta(event.target)});},true);

  const setReduced=enabled=>{if(enabled&&!reducedStyle){reducedStyle=document.createElement('style');reducedStyle.dataset.animatorReducedMotion='';reducedStyle.textContent='*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;transition-delay:0ms!important}';document.head.appendChild(reducedStyle);}else if(!enabled&&reducedStyle){reducedStyle.remove();reducedStyle=null;}post('DIAGNOSTIC',{level:'info',message:enabled?'Reduced-motion emulation enabled':'Reduced-motion emulation disabled'});};
  const commands={
    SET_PICKER:message=>{picker=!!message.enabled;outline.style.display='none';},
    SET_RECORDING:message=>{recording=!!message.enabled;},
    SET_REDUCED_MOTION:message=>setReduced(!!message.enabled),
    CREATE_ANIMATION:message=>{const el=byId.get(message.elementId);if(!el)return;const animation=el.animate(message.keyframes,{duration:message.duration,delay:message.delay||0,easing:message.easing,iterations:message.iterations||1,direction:message.direction||'normal',fill:message.fill||'both'});const id=animation.__animatorId||(animation.__animatorId='anim-'+Math.random().toString(36).slice(2));created.add(id);reportAnimation(animation,'web-animation','Created animation');},
    CLEAR_OVERRIDES:()=>{for(const id of created){try{document.getAnimations({subtree:true}).find(animation=>animation.__animatorId===id)?.cancel();}catch{}animationMeta.delete(id);lastAnimationReport.delete(id);}created.clear();setReduced(false);post('DIAGNOSTIC',{level:'info',message:'Temporary animation overrides cleared'});}
  };
  addEventListener('message',event=>{const message=event.data;if(!message||typeof message.type!=='string')return;if(message.source==='animator-editor'){commands[message.type]?.(message);return;}if(message.source!=='animator-timeline')return;if(['SCRUB_TIMELINE','SEEK_FRAME','STEP_FRAME','PLAY_ALL','PAUSE_ALL','RESTART_ALL','SET_ANIMATION_TIME'].includes(message.type))externalControl=true;else if(message.type==='RELEASE_TIMELINE'||message.type==='CLEAR_OVERRIDES')externalControl=false;});

  const scanAnimations=()=>{if(externalControl)return;try{document.getAnimations({subtree:true}).forEach(animation=>reportAnimation(animation,'unknown'));}catch{document.getAnimations().forEach(animation=>reportAnimation(animation,'unknown'));}};
  const discover=()=>{const elements=Array.from(document.querySelectorAll('body *')).slice(0,1200);elements.forEach(element=>reportedElements.add(element));post('ELEMENTS',{elements:elements.map(meta)});};
  requestAnimationFrame(()=>{discover();scanAnimations();post('READY');});
  setInterval(scanAnimations,500);
  addEventListener('beforeunload',()=>observer.disconnect(),{once:true});
})();`;
