export const auxiliaryRuntimeSource = String.raw`(()=>{
  if(window.__ANIMATOR_AUX_RUNTIME__)return;window.__ANIMATOR_AUX_RUNTIME__=true;
  const SOURCE='animator-preview',started=performance.now();let loop=false,lastFrame=started,lastDrop=0,lastConcurrent=0;
  const post=(type,payload={})=>parent.postMessage({source:SOURCE,type,...payload},'*');
  const event=(kind,label,data={})=>post('EVENT',{event:{id:'ev-'+Math.random().toString(36).slice(2),at:performance.now()-started,kind,label,data}});
  addEventListener('message',message=>{const data=message.data;if(!data||data.source!=='animator-editor')return;if(data.type==='SET_LOOP_ALL')loop=!!data.enabled;});
  const restartFinished=()=>{if(!loop)return;for(const animation of document.getAnimations()){try{if(animation.playState==='finished'){animation.currentTime=0;animation.play();}}catch{}}};
  try{const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())event('performance-long-task',`Long task ${Math.round(entry.duration)} ms`,{duration:entry.duration,startTime:entry.startTime});});observer.observe({entryTypes:['longtask']});addEventListener('beforeunload',()=>observer.disconnect(),{once:true});}catch{}
  const frame=t=>{const delta=t-lastFrame;lastFrame=t;restartFinished();if(delta>50&&t-lastDrop>750){lastDrop=t;event('performance-frame-drop',`Frame gap ${Math.round(delta)} ms`,{duration:delta});}const running=document.getAnimations().filter(a=>a.playState==='running').length;if(running>=10&&running!==lastConcurrent){lastConcurrent=running;event('performance-concurrency',`${running} concurrent animations`,{count:running});}requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
})();`;
