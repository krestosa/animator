import { store } from '../state/store';

type PendingInput={type:string;[key:string]:unknown};

export function mountBrowserPreview(root:HTMLElement):()=>void{
  const device=root.querySelector<HTMLElement>('[data-device]');if(!device)return()=>{};
  let sessionId='',surface:HTMLDivElement|null=null,image:HTMLImageElement|null=null,disposed=false,stateTimer=0,inputTimer=0,lastWidth=1100,lastHeight=700,pendingMove:PendingInput|null=null,wheelX=0,wheelY=0;
  const endpoint=(path:string)=>`/api/browser-sessions/${encodeURIComponent(sessionId)}${path}`;
  const postInput=(payload:Record<string,unknown>):void=>{if(!sessionId)return;void fetch(endpoint('/input'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});};
  const coords=(event:PointerEvent|MouseEvent)=>{if(!surface)return{x:0,y:0};const box=surface.getBoundingClientRect(),scaleX=lastWidth/Math.max(1,box.width),scaleY=lastHeight/Math.max(1,box.height);return{x:Math.max(0,Math.min(lastWidth,(event.clientX-box.left)*scaleX)),y:Math.max(0,Math.min(lastHeight,(event.clientY-box.top)*scaleY))};};
  const flushInput=():void=>{
    if(inputTimer)clearTimeout(inputTimer);inputTimer=0;const events:PendingInput[]=[];
    if(pendingMove){events.push(pendingMove);pendingMove=null;}if(wheelX||wheelY){events.push({type:'wheel',dx:wheelX,dy:wheelY});wheelX=0;wheelY=0;}
    if(events.length===1)postInput(events[0]!);else if(events.length>1)postInput({type:'batch',events});
  };
  const scheduleInput=():void=>{if(!inputTimer)inputTimer=window.setTimeout(flushInput,24);};
  const pointerMove=(event:PointerEvent):void=>{pendingMove={type:'move',...coords(event)};scheduleInput();};
  const pointerDown=(event:PointerEvent):void=>{surface?.focus();flushInput();postInput({type:'down',button:event.button,...coords(event)});};
  const pointerUp=(event:PointerEvent):void=>{flushInput();postInput({type:'up',button:event.button,...coords(event)});};
  const wheel=(event:WheelEvent):void=>{event.preventDefault();wheelX+=event.deltaX;wheelY+=event.deltaY;scheduleInput();};
  const keyDown=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();flushInput();postInput({type:'keyDown',key:event.key});};
  const keyUp=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();postInput({type:'keyUp',key:event.key});};
  const removeSurface=():void=>{
    if(stateTimer)clearTimeout(stateTimer);if(inputTimer)clearTimeout(inputTimer);stateTimer=0;inputTimer=0;pendingMove=null;wheelX=0;wheelY=0;
    surface?.removeEventListener('pointermove',pointerMove);surface?.removeEventListener('pointerdown',pointerDown);surface?.removeEventListener('pointerup',pointerUp);surface?.removeEventListener('wheel',wheel);surface?.removeEventListener('keydown',keyDown);surface?.removeEventListener('keyup',keyUp);
    if(image)image.src='';surface?.remove();surface=null;image=null;
  };
  const removeIframes=():void=>device.querySelectorAll<HTMLIFrameElement>('[data-preview-frame]').forEach(frame=>frame.remove());
  const pollState=async():Promise<void>=>{
    if(disposed||!sessionId||!surface)return;
    try{const response=await fetch(endpoint('/state'),{cache:'no-store'});if(response.ok){const state=await response.json() as{url:string;title:string;width:number;height:number;engine:string;profile:string};lastWidth=state.width;lastHeight=state.height;surface.title=`${state.title||'Browser preview'} — ${state.url}`;surface.dataset.browserEngine=state.engine;surface.dataset.browserProfile=state.profile;}}
    catch{}finally{if(!disposed&&sessionId)stateTimer=window.setTimeout(()=>void pollState(),750);}
  };
  const mount=():void=>{
    const project=store.get().project,next=project?.browserSessionId??'';
    if(next)removeIframes();
    if(next===sessionId&&surface?.isConnected)return;
    const previous=sessionId;removeSurface();sessionId=next;if(previous&&previous!==next)void fetch(`/api/browser-sessions/${encodeURIComponent(previous)}`,{method:'DELETE'}).catch(()=>{});if(!sessionId)return;
    removeIframes();lastWidth=project?.browserProfile==='mobile'?390:1100;lastHeight=project?.browserProfile==='mobile'?844:700;
    surface=document.createElement('div');surface.className='browserPreviewSurface';surface.dataset.browserPreview='';surface.tabIndex=0;surface.setAttribute('role','application');surface.setAttribute('aria-label','Interactive browser preview');
    image=document.createElement('img');image.draggable=false;image.alt='';image.src=`${endpoint('/stream')}?v=${Date.now()}`;surface.append(image);device.append(surface);
    surface.addEventListener('pointermove',pointerMove);surface.addEventListener('pointerdown',pointerDown);surface.addEventListener('pointerup',pointerUp);surface.addEventListener('wheel',wheel,{passive:false});surface.addEventListener('keydown',keyDown);surface.addEventListener('keyup',keyUp);void pollState();
  };
  const observer=new MutationObserver(mount);observer.observe(device,{childList:true});const unsubscribe=store.subscribe(mount);mount();
  return()=>{disposed=true;const current=sessionId;unsubscribe();observer.disconnect();removeSurface();sessionId='';if(current)void fetch(`/api/browser-sessions/${encodeURIComponent(current)}`,{method:'DELETE'}).catch(()=>{});};
}
