import { store } from '../state/store';
import type { DetectedAnimation, RuntimeElement } from '../types/domain';

type PendingInput={type:string;[key:string]:unknown};
type MotionSnapshot={elements:RuntimeElement[];animations:DetectedAnimation[];active:number;runtimeReady:boolean};

export function mountBrowserPreview(root:HTMLElement):()=>void{
  const device=root.querySelector<HTMLElement>('[data-device]'),stage=device?.parentElement;if(!device||!stage)return()=>{};
  let sessionId='',surface:HTMLDivElement|null=null,image:HTMLImageElement|null=null,disposed=false,stateTimer=0,inputTimer=0,motionTimer=0,motionBusy=false,lastWidth=1100,lastHeight=700,pendingMove:PendingInput|null=null,wheelX=0,wheelY=0,runtimeHealthy=false,lastUrl='';
  const motionSignatures=new Map<string,string>(),motionElements=new Set<string>();
  const endpoint=(suffix:string)=>`/api/browser-sessions/${encodeURIComponent(sessionId)}${suffix}`;
  const applyDeviceSize=(width:number,height:number):void=>{
    const safeWidth=Math.max(1,width),safeHeight=Math.max(1,height),availableWidth=Math.max(1,stage.clientWidth),availableHeight=Math.max(1,stage.clientHeight),scale=Math.min(1,availableWidth/safeWidth,availableHeight/safeHeight);
    device.dataset.browserDevice='';device.style.setProperty('--browser-device-width',`${safeWidth}px`);device.style.setProperty('--browser-device-height',`${safeHeight}px`);device.style.setProperty('--browser-device-scale',String(scale));
  };
  const resetDeviceSize=():void=>{delete device.dataset.browserDevice;device.style.removeProperty('--browser-device-width');device.style.removeProperty('--browser-device-height');device.style.removeProperty('--browser-device-scale');};
  const postInput=(payload:Record<string,unknown>):void=>{if(!sessionId)return;void fetch(endpoint('/input'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});};
  const coords=(event:PointerEvent|MouseEvent)=>{if(!surface)return{x:0,y:0};const box=surface.getBoundingClientRect(),scaleX=lastWidth/Math.max(1,box.width),scaleY=lastHeight/Math.max(1,box.height);return{x:Math.max(0,Math.min(lastWidth,(event.clientX-box.left)*scaleX)),y:Math.max(0,Math.min(lastHeight,(event.clientY-box.top)*scaleY))};};
  const nextMotionDelay=():number=>runtimeHealthy?4000:650;
  const scheduleMotion=(delay=nextMotionDelay()):void=>{if(disposed||!sessionId)return;if(motionTimer)clearTimeout(motionTimer);motionTimer=window.setTimeout(()=>{motionTimer=0;void pollMotion();},delay);};
  const scheduleInteractionMotion=(delay:number):void=>{if(!runtimeHealthy)scheduleMotion(delay);};
  const applyMotion=(snapshot:MotionSnapshot):void=>{
    runtimeHealthy=snapshot.runtimeReady;
    const freshElements=snapshot.elements.filter(element=>{if(motionElements.has(element.id))return false;motionElements.add(element.id);return true;});if(freshElements.length)store.upsertElements(freshElements);
    if(store.get().recording)for(const animation of snapshot.animations){const signature=JSON.stringify([animation.type,animation.name,animation.startTime,animation.duration,animation.delay,animation.iterations,animation.direction,animation.easing,animation.fill,animation.runtimeState,animation.properties.map(property=>property.name),animation.keyframes?.map(frame=>frame.offset)]);if(motionSignatures.get(animation.id)===signature)continue;motionSignatures.set(animation.id,signature);store.addAnimation(animation);}
    if(surface){surface.dataset.browserMotion=String(snapshot.animations.length);surface.dataset.browserRuntime=String(snapshot.runtimeReady);}
  };
  const pollMotion=async():Promise<void>=>{
    if(disposed||!sessionId||motionBusy)return;const requestedSession=sessionId;motionBusy=true;
    try{const response=await fetch(`/api/browser-sessions/${encodeURIComponent(requestedSession)}/motion`,{cache:'no-store'});if(response.ok&&requestedSession===sessionId)applyMotion(await response.json() as MotionSnapshot);}catch{}finally{motionBusy=false;if(!disposed&&requestedSession===sessionId&&store.get().recording)scheduleMotion();}
  };
  const flushInput=():void=>{
    if(inputTimer)clearTimeout(inputTimer);inputTimer=0;const events:PendingInput[]=[];
    if(pendingMove){events.push(pendingMove);pendingMove=null;}if(wheelX||wheelY){events.push({type:'wheel',dx:wheelX,dy:wheelY});wheelX=0;wheelY=0;}
    if(events.length===1)postInput(events[0]!);else if(events.length>1)postInput({type:'batch',events});
  };
  const scheduleInput=():void=>{if(!inputTimer)inputTimer=window.setTimeout(flushInput,24);};
  const pointerMove=(event:PointerEvent):void=>{pendingMove={type:'move',...coords(event)};scheduleInput();};
  const pointerDown=(event:PointerEvent):void=>{surface?.focus();flushInput();postInput({type:'down',button:event.button,...coords(event)});scheduleInteractionMotion(45);};
  const pointerUp=(event:PointerEvent):void=>{flushInput();postInput({type:'up',button:event.button,...coords(event)});scheduleInteractionMotion(70);};
  const wheel=(event:WheelEvent):void=>{event.preventDefault();wheelX+=event.deltaX;wheelY+=event.deltaY;scheduleInput();scheduleInteractionMotion(90);};
  const keyDown=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();flushInput();postInput({type:'keyDown',key:event.key});scheduleInteractionMotion(60);};
  const keyUp=(event:KeyboardEvent):void=>{if(!surface||document.activeElement!==surface)return;event.preventDefault();postInput({type:'keyUp',key:event.key});scheduleInteractionMotion(90);};
  const removeSurface=():void=>{
    if(stateTimer)clearTimeout(stateTimer);if(inputTimer)clearTimeout(inputTimer);if(motionTimer)clearTimeout(motionTimer);stateTimer=0;inputTimer=0;motionTimer=0;motionBusy=false;pendingMove=null;wheelX=0;wheelY=0;runtimeHealthy=false;lastUrl='';motionSignatures.clear();motionElements.clear();
    surface?.removeEventListener('pointermove',pointerMove);surface?.removeEventListener('pointerdown',pointerDown);surface?.removeEventListener('pointerup',pointerUp);surface?.removeEventListener('wheel',wheel);surface?.removeEventListener('keydown',keyDown);surface?.removeEventListener('keyup',keyUp);
    if(image)image.src='';surface?.remove();surface=null;image=null;resetDeviceSize();
  };
  const removeIframes=():void=>device.querySelectorAll<HTMLIFrameElement>('[data-preview-frame]').forEach(frame=>frame.remove());
  const pollState=async():Promise<void>=>{
    if(disposed||!sessionId||!surface)return;const requestedSession=sessionId,requestedSurface=surface;
    try{const response=await fetch(`/api/browser-sessions/${encodeURIComponent(requestedSession)}/state`,{cache:'no-store'});if(response.ok&&requestedSession===sessionId&&requestedSurface===surface&&requestedSurface.isConnected){const state=await response.json() as{url:string;title:string;width:number;height:number;engine:string;profile:string};if(requestedSession!==sessionId||requestedSurface!==surface||!requestedSurface.isConnected)return;lastWidth=state.width;lastHeight=state.height;applyDeviceSize(lastWidth,lastHeight);if(lastUrl&&state.url!==lastUrl){runtimeHealthy=false;scheduleMotion(40);}lastUrl=state.url;requestedSurface.title=`${state.title||'Browser preview'} — ${state.url}`;requestedSurface.dataset.browserEngineActive=state.engine;requestedSurface.dataset.browserProfileActive=state.profile;requestedSurface.dataset.browserWidth=String(state.width);requestedSurface.dataset.browserHeight=String(state.height);}}
    catch{}finally{if(!disposed&&requestedSession===sessionId&&requestedSurface===surface&&requestedSurface.isConnected)stateTimer=window.setTimeout(()=>void pollState(),750);}
  };
  const mount=():void=>{
    const project=store.get().project,next=project?.browserSessionId??'';
    if(next)removeIframes();
    if(next===sessionId&&surface?.isConnected){applyDeviceSize(lastWidth,lastHeight);if(store.get().recording&&!motionTimer&&!motionBusy)scheduleMotion();return;}
    const previous=sessionId;removeSurface();sessionId=next;if(previous&&previous!==next)void fetch(`/api/browser-sessions/${encodeURIComponent(previous)}`,{method:'DELETE'}).catch(()=>{});if(!sessionId)return;
    removeIframes();lastWidth=project?.browserProfile==='mobile'?390:1100;lastHeight=project?.browserProfile==='mobile'?844:700;applyDeviceSize(lastWidth,lastHeight);
    surface=document.createElement('div');surface.className='browserPreviewSurface';surface.dataset.browserPreview='';surface.tabIndex=0;surface.setAttribute('role','application');surface.setAttribute('aria-label','Interactive browser preview');
    image=document.createElement('img');image.draggable=false;image.alt='';image.src=`${endpoint('/stream')}?v=${Date.now()}`;surface.append(image);device.append(surface);
    surface.addEventListener('pointermove',pointerMove);surface.addEventListener('pointerdown',pointerDown);surface.addEventListener('pointerup',pointerUp);surface.addEventListener('wheel',wheel,{passive:false});surface.addEventListener('keydown',keyDown);surface.addEventListener('keyup',keyUp);void pollState();scheduleMotion(40);
  };
  const observer=new MutationObserver(mount);observer.observe(device,{childList:true});const resizeObserver=new ResizeObserver(()=>{if(sessionId)applyDeviceSize(lastWidth,lastHeight);});resizeObserver.observe(stage);const unsubscribe=store.subscribe(mount);mount();
  return()=>{disposed=true;const current=sessionId;unsubscribe();observer.disconnect();resizeObserver.disconnect();removeSurface();sessionId='';if(current)void fetch(`/api/browser-sessions/${encodeURIComponent(current)}`,{method:'DELETE'}).catch(()=>{});};
}
