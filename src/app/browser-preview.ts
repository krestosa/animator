import { store } from '../state/store';

export function mountBrowserPreview(root:HTMLElement):()=>void{
  const device=root.querySelector<HTMLElement>('[data-device]');if(!device)return()=>{};
  let sessionId='',surface:HTMLDivElement|null=null,image:HTMLImageElement|null=null,disposed=false,frameTimer=0,stateTimer=0,objectUrl='',lastMoveAt=0,lastWidth=0,lastHeight=0;
  const endpoint=(path:string)=>`/api/browser-sessions/${encodeURIComponent(sessionId)}${path}`;
  const postInput=(payload:Record<string,unknown>):void=>{if(!sessionId)return;void fetch(endpoint('/input'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});};
  const coords=(event:PointerEvent|MouseEvent)=>{if(!surface)return{x:0,y:0};const box=surface.getBoundingClientRect(),scaleX=lastWidth/Math.max(1,box.width),scaleY=lastHeight/Math.max(1,box.height);return{x:(event.clientX-box.left)*scaleX,y:(event.clientY-box.top)*scaleY};};
  const pointerMove=(event:PointerEvent):void=>{const now=performance.now();if(now-lastMoveAt<16)return;lastMoveAt=now;postInput({type:'move',...coords(event)});};
  const pointerDown=(event:PointerEvent):void=>{surface?.focus();postInput({type:'down',button:event.button,...coords(event)});};
  const pointerUp=(event:PointerEvent):void=>postInput({type:'up',button:event.button,...coords(event)});
  const wheel=(event:WheelEvent):void=>{event.preventDefault();postInput({type:'wheel',dx:event.deltaX,dy:event.deltaY});};
  const keyDown=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();postInput({type:'keyDown',key:event.key});};
  const keyUp=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();postInput({type:'keyUp',key:event.key});};
  const removeSurface=():void=>{if(frameTimer)clearTimeout(frameTimer);if(stateTimer)clearTimeout(stateTimer);frameTimer=0;stateTimer=0;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';surface?.removeEventListener('pointermove',pointerMove);surface?.removeEventListener('pointerdown',pointerDown);surface?.removeEventListener('pointerup',pointerUp);surface?.removeEventListener('wheel',wheel);surface?.removeEventListener('keydown',keyDown);surface?.removeEventListener('keyup',keyUp);surface?.remove();surface=null;image=null;};
  const removeIframes=():void=>device.querySelectorAll<HTMLIFrameElement>('[data-preview-frame]').forEach(frame=>frame.remove());
  const pollFrame=async():Promise<void>=>{if(disposed||!sessionId||!image)return;try{const response=await fetch(`${endpoint('/frame')}?t=${Date.now()}`,{cache:'no-store'});if(response.ok){const blob=await response.blob(),next=URL.createObjectURL(blob),previous=objectUrl;objectUrl=next;image.src=next;if(previous)URL.revokeObjectURL(previous);}}catch{}finally{if(!disposed&&sessionId)frameTimer=window.setTimeout(()=>void pollFrame(),80);}};
  const pollState=async():Promise<void>=>{if(disposed||!sessionId||!surface)return;try{const response=await fetch(endpoint('/state'),{cache:'no-store'});if(response.ok){const state=await response.json() as{url:string;title:string;width:number;height:number};lastWidth=state.width;lastHeight=state.height;surface.title=`${state.title||'Browser preview'} — ${state.url}`;}}catch{}finally{if(!disposed&&sessionId)stateTimer=window.setTimeout(()=>void pollState(),500);}};
  const resize=():void=>{if(!sessionId)return;const width=Math.max(320,Math.round(device.clientWidth)),height=Math.max(240,Math.round(device.clientHeight));if(width===lastWidth&&height===lastHeight)return;lastWidth=width;lastHeight=height;postInput({type:'resize',width,height});};
  const mount=():void=>{
    const next=store.get().project?.browserSessionId??'';
    if(next)removeIframes();
    if(next===sessionId&&surface?.isConnected){resize();return;}
    const previous=sessionId;removeSurface();sessionId=next;if(previous&&previous!==next)void fetch(`/api/browser-sessions/${encodeURIComponent(previous)}`,{method:'DELETE'}).catch(()=>{});if(!sessionId)return;
    removeIframes();
    surface=document.createElement('div');surface.className='browserPreviewSurface';surface.dataset.browserPreview='';surface.tabIndex=0;surface.setAttribute('role','application');surface.setAttribute('aria-label','Interactive browser preview');
    image=document.createElement('img');image.draggable=false;image.alt='';surface.append(image);device.append(surface);
    surface.addEventListener('pointermove',pointerMove);surface.addEventListener('pointerdown',pointerDown);surface.addEventListener('pointerup',pointerUp);surface.addEventListener('wheel',wheel,{passive:false});surface.addEventListener('keydown',keyDown);surface.addEventListener('keyup',keyUp);
    lastWidth=Math.max(320,Math.round(device.clientWidth));lastHeight=Math.max(240,Math.round(device.clientHeight));postInput({type:'resize',width:lastWidth,height:lastHeight});void pollFrame();void pollState();
  };
  const observer=new MutationObserver(mount);observer.observe(device,{childList:true});const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(device);const unsubscribe=store.subscribe(mount);mount();
  return()=>{disposed=true;const current=sessionId;unsubscribe();observer.disconnect();resizeObserver.disconnect();removeSurface();sessionId='';if(current)void fetch(`/api/browser-sessions/${encodeURIComponent(current)}`,{method:'DELETE'}).catch(()=>{});};
}
