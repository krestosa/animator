export const viewportCaptureRuntimeSource=String.raw`(()=>{
  if(window.__ANIMATOR_VIEWPORT_CAPTURE_RUNTIME__)return;window.__ANIMATOR_VIEWPORT_CAPTURE_RUNTIME__=true;
  const reply=(requestId,payload)=>{try{parent.postMessage({source:'animator-preview',type:'VIEWPORT_CAPTURE_RESULT',requestId,...payload},'*');}catch{}};
  const capture=async requestId=>{
    const renderer=window.html2canvas;
    if(typeof renderer!=='function'){reply(requestId,{error:'Viewport renderer is not available'});return;}
    const animations=Array.from(document.getAnimations?.()??[]),running=[];
    for(const animation of animations){if(animation.playState==='running'||animation.playState==='pending'){running.push(animation);try{animation.pause();}catch{}}}
    try{
      await Promise.resolve();
      const canvas=await renderer(document.documentElement,{backgroundColor:null,logging:false,useCORS:true,allowTaint:false,scale:1,width:innerWidth,height:innerHeight,x:scrollX,y:scrollY,scrollX,scrollY,windowWidth:innerWidth,windowHeight:innerHeight,removeContainer:true});
      reply(requestId,{dataUrl:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height});
    }catch(error){reply(requestId,{error:error instanceof Error?error.message:String(error)});}
    finally{for(const animation of running)try{animation.play();}catch{}}
  };
  addEventListener('message',event=>{const message=event.data;if(!message||message.source!=='animator-editor'||message.type!=='CAPTURE_VIEWPORT_PNG'||typeof message.requestId!=='string')return;void capture(message.requestId);});
})();`;
