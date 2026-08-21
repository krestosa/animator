export const browserSnapshotRuntimeSource=String.raw`(()=>{
  if(window.__ANIMATOR_BROWSER_SNAPSHOT_RUNTIME__)return;window.__ANIMATOR_BROWSER_SNAPSHOT_RUNTIME__=true;
  const definitions=Array.isArray(window.__ANIMATOR_SNAPSHOT_ANIMATIONS__)?window.__ANIMATOR_SNAPSHOT_ANIMATIONS__:[],visuals=Array.isArray(window.__ANIMATOR_SNAPSHOT_VISUALS__)?window.__ANIMATOR_SNAPSHOT_VISUALS__:[],elements=new Map();
  for(const element of document.querySelectorAll('[data-animator-capture-id]'))elements.set(element.getAttribute('data-animator-capture-id'),element);
  const nativeAnimate=Element.prototype.animate;
  for(const definition of definitions){
    const element=elements.get(definition.elementId);if(!(element instanceof Element)||!Array.isArray(definition.keyframes)||!definition.keyframes.length)continue;
    try{
      const iterations=definition.iterations==='Infinity'?Infinity:Number(definition.iterations??1);
      const options={duration:Math.max(0,Number(definition.duration)||0),delay:Number(definition.delay)||0,iterations:Number.isFinite(iterations)?iterations:Infinity,direction:definition.direction||'normal',easing:definition.easing||'linear',fill:definition.fill||'both'};
      const animation=nativeAnimate.call(element,definition.keyframes,options);animation.__animatorId=definition.id;animation.__animatorStartTime=Math.max(0,Number(definition.startTime)||0);animation.pause();const current=Number(definition.currentTime);if(Number.isFinite(current))animation.currentTime=Math.max(0,current);if(Number.isFinite(Number(definition.playbackRate))&&Number(definition.playbackRate)!==0)animation.playbackRate=Number(definition.playbackRate);
    }catch{}
  }
  const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  for(const visual of visuals){
    if(!visual||typeof visual.id!=='string'||typeof visual.dataUrl!=='string'||!visual.dataUrl.startsWith('data:image/'))continue;
    const element=document.querySelector('[data-animator-visual-id="'+escape(visual.id)+'"]');if(!(element instanceof Element))continue;
    try{
      if(element instanceof HTMLCanvasElement){element.style.backgroundImage='url("'+visual.dataUrl+'")';element.style.backgroundSize='100% 100%';element.style.backgroundRepeat='no-repeat';element.style.backgroundPosition='center';element.dataset.animatorVisualRestored='canvas';continue;}
      if(element instanceof HTMLVideoElement){try{element.pause();}catch{}element.removeAttribute('src');element.removeAttribute('autoplay');for(const source of element.querySelectorAll('source'))source.remove();element.poster=visual.dataUrl;element.dataset.animatorVisualRestored='video';continue;}
      if(element instanceof HTMLIFrameElement){element.removeAttribute('src');element.removeAttribute('srcdoc');const image=visual.dataUrl.replace(/&/g,'&amp;').replace(/"/g,'&quot;');element.srcdoc='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%;object-fit:fill}</style></head><body><img src="'+image+'"></body></html>';element.dataset.animatorVisualRestored='iframe';continue;}
      const image=document.createElement('img');image.src=visual.dataUrl;image.alt='';image.dataset.animatorVisualRestored=String(visual.tag||'surface');image.className=element.className;image.setAttribute('aria-hidden','true');image.style.cssText=element.getAttribute('style')||'';if(Number(visual.width)>0&&!image.style.width)image.style.width=Number(visual.width)+'px';if(Number(visual.height)>0&&!image.style.height)image.style.height=Number(visual.height)+'px';image.style.objectFit='fill';element.replaceWith(image);
    }catch{}
  }
  const state=window.__ANIMATOR_SNAPSHOT_STATE__;if(state&&Number.isFinite(Number(state.scrollX))&&Number.isFinite(Number(state.scrollY)))requestAnimationFrame(()=>scrollTo(Number(state.scrollX),Number(state.scrollY)));
})();`;