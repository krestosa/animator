export const clockWorkerSource = String.raw`(()=>{
  let timer=0,running=false,fps=60,sequence=0;
  const stop=()=>{running=false;if(timer){clearInterval(timer);timer=0;}};
  const start=()=>{if(running)return;running=true;const interval=Math.max(4,1000/fps);timer=setInterval(()=>{postMessage({type:'tick',sequence:++sequence});},interval);};
  addEventListener('message',event=>{const message=event.data;if(!message||typeof message.type!=='string')return;if(message.type==='start'){if(Number.isFinite(message.fps)&&message.fps>0)fps=Math.min(120,Math.max(15,message.fps));stop();start();}else if(message.type==='stop')stop();else if(message.type==='pulse')postMessage({type:'tick',sequence:++sequence});});
})();`;
