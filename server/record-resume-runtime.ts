import { themeLiveRuntimeSource } from './theme-live-runtime.js';
import { viewHistoryRuntimeSource } from './view-history-runtime.js';

export const recordResumeRuntimeSource=themeLiveRuntimeSource+viewHistoryRuntimeSource+String.raw`(()=>{
  if(window.__ANIMATOR_RECORD_RESUME_RUNTIME__)return;window.__ANIMATOR_RECORD_RESUME_RUNTIME__=true;
  const SOURCE='animator-preview';
  const internal=el=>el instanceof Element&&(el.hasAttribute('data-animator-internal')||el.hasAttribute('data-animator-focus-overlay')||el.hasAttribute('data-animator-selection-highlight')||el.hasAttribute('data-animator-dom-highlight')||el.hasAttribute('data-animator-picker-outline'));
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*');
  const canonicalFrames=frames=>(frames||[]).map(frame=>{const values={};let offset,easing,composite;for(const[key,value]of Object.entries(frame)){if(key==='offset'&&typeof value==='number'){offset=value;continue;}if(key==='easing'&&typeof value==='string'){easing=value;continue;}if(key==='composite'&&typeof value==='string'){composite=value;continue;}if(key==='computedOffset')continue;values[key]=value===null||typeof value==='string'||typeof value==='number'?value:String(value);}return{values,...(offset!==undefined?{offset}:{}),...(easing!==undefined?{easing}:{}),...(composite!==undefined?{composite}:{})};});
  const report=animation=>{
    if(!animation||animation.__animatorMirror||animation.__animatorMutationMirror)return;
    const el=animation.effect?.target,idFor=window.__ANIMATOR_ELEMENT_ID__;if(!(el instanceof Element)||internal(el)||typeof idFor!=='function')return;
    let timing={},frames=[];try{timing=animation.effect?.getComputedTiming?.()||{};frames=animation.effect?.getKeyframes?.()||[];}catch{}
    const id=animation.__animatorId||(animation.__animatorId='anim-'+Math.random().toString(36).slice(2)),elementId=idFor(el),rect=el.getBoundingClientRect(),current=Number(animation.currentTime),rate=Math.abs(Number(animation.playbackRate))||1;
    const properties=[...new Set(frames.flatMap(frame=>Object.keys(frame).filter(key=>!['offset','easing','composite','computedOffset'].includes(key))))].map(name=>({name,values:frames.map(frame=>frame[name]).filter(value=>value!=null).map(String)}));
    post('ELEMENTS',{elements:[{id:elementId,tag:el.tagName.toLowerCase(),domId:el.id||undefined,classes:[...el.classList],text:(el.textContent||'').trim().slice(0,80)||undefined,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},alive:el.isConnected}]});
    post('MOTION_TRACK',{track:{id,target:{elementId},timing:{start:Math.max(0,performance.now()-(Number.isFinite(current)?Math.max(0,current)/rate:0)),...(Number(timing.duration)?{duration:Number(timing.duration)}:{}),...(Number(timing.delay)?{delay:Number(timing.delay)}:{}),...(Number(timing.iterations)?{iterations:Number(timing.iterations)}:{}),...(timing.direction?{direction:timing.direction}:{}),...(timing.easing?{easing:timing.easing}:{}),...(timing.fill?{fill:timing.fill}:{})},properties,keyframes:canonicalFrames(frames),trigger:{kind:'unknown'},source:{kind:'waapi',confidence:'runtime-observed'},runtimeState:animation.playState==='finished'?'finished':animation.playState==='paused'?'paused':animation.playState==='idle'?'idle':'running'}});
  };
  const scan=()=>{for(const animation of document.getAnimations?.()??[])report(animation);};
  const reportRecording=(requestId)=>queueMicrotask(()=>post('RECORDING_STATE',{enabled:!!window.__ANIMATOR_CAPTURE_GATE__?.recording,requestId:requestId||undefined}));
  addEventListener('message',event=>{const message=event.data;if(!message||message.source!=='animator-editor'||message.type!=='SET_RECORDING')return;reportRecording(message.requestId);if(message.enabled){queueMicrotask(scan);requestAnimationFrame(scan);}});
  queueMicrotask(()=>reportRecording());
})();`;
