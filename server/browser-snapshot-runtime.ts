export const browserSnapshotRuntimeSource=String.raw`(()=>{
  if(window.__ANIMATOR_BROWSER_SNAPSHOT_RUNTIME__)return;window.__ANIMATOR_BROWSER_SNAPSHOT_RUNTIME__=true;
  const definitions=Array.isArray(window.__ANIMATOR_SNAPSHOT_ANIMATIONS__)?window.__ANIMATOR_SNAPSHOT_ANIMATIONS__:[],elements=new Map();
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
  const state=window.__ANIMATOR_SNAPSHOT_STATE__;if(state&&Number.isFinite(Number(state.scrollX))&&Number.isFinite(Number(state.scrollY)))requestAnimationFrame(()=>scrollTo(Number(state.scrollX),Number(state.scrollY)));
})();`;