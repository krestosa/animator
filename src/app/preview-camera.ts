import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const CAMERA_MAX_SCALE=6;
const CAMERA_FIT_RATIO=.9;

export function mountPreviewCamera(root:HTMLElement):()=>void{
  const tools=root.querySelector<HTMLElement>('.timelineProTools');
  const zoomButton=tools?.querySelector<HTMLButtonElement>('[data-magnify-mode]');
  const focusGroup=tools?.querySelector<HTMLElement>('.focusGroup');
  const previewDevice=root.querySelector<HTMLElement>('[data-device]');
  if(!tools||!zoomButton||!focusGroup||!previewDevice)return()=>{};

  zoomButton.title='Camera fit · center the selected element without changing page zoom';
  const mouseButton=document.createElement('button');
  mouseButton.type='button';mouseButton.dataset.webInteraction='';mouseButton.className='webMouseToggle active';mouseButton.textContent='↖';mouseButton.setAttribute('aria-pressed','true');mouseButton.title='Mouse interaction with preview: on';
  const reset=focusGroup.querySelector('[data-inspection-clear]');focusGroup.insertBefore(mouseButton,reset);

  let cameraActive=false,mouseEnabled=true,raf=0,lastFrame:HTMLIFrameElement|null=null,cameraElementId:string|undefined,cameraAnimationId:string|undefined,lastProjectContext=projectContext();
  let dragging=false,dragPointerId=-1,lastDragX=0,lastDragY=0;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const stage=()=>root.querySelector<HTMLElement>('.stage');
  const selectedAnimation=()=>{const state=store.get();return state.selectedAnimationId?state.motionTracks.find(item=>item.id===state.selectedAnimationId):undefined;};
  const cameraElement=()=>cameraElementId?store.get().elements.find(element=>element.id===cameraElementId):undefined;
  const postInput=(message:Record<string,unknown>):void=>{frame()?.contentWindow?.postMessage({source:'animator-editor',...message},'*');};

  const updateMouse=():void=>{
    const preview=frame();
    if(preview&&preview!==lastFrame){lastFrame=preview;preview.style.pointerEvents=mouseEnabled?'auto':'none';postInput({type:'SET_INPUT_LOCK',enabled:!mouseEnabled});}
    else if(preview&&preview.style.pointerEvents!==(mouseEnabled?'auto':'none'))preview.style.pointerEvents=mouseEnabled?'auto':'none';
    const locked=!mouseEnabled;const previewStage=stage();if(previewStage?.classList.contains('webMouseLocked')!==locked)previewStage?.classList.toggle('webMouseLocked',locked);
    if(!locked&&dragging)endDrag();
    if(mouseButton.classList.contains('active')!==mouseEnabled)mouseButton.classList.toggle('active',mouseEnabled);
    const pressed=String(mouseEnabled);if(mouseButton.getAttribute('aria-pressed')!==pressed)mouseButton.setAttribute('aria-pressed',pressed);
    const text=mouseEnabled?'↖':'⊘';if(mouseButton.textContent!==text)mouseButton.textContent=text;
    const title=mouseEnabled?'Mouse interaction with preview: on':'Preview passive · wheel or drag to pan without sending input to the web';if(mouseButton.title!==title)mouseButton.title=title;
  };
  const resetCamera=():void=>{
    const preview=frame();if(preview){preview.style.removeProperty('transform');preview.style.removeProperty('transform-origin');preview.style.removeProperty('will-change');preview.dataset.cameraZoom='off';preview.removeAttribute('data-camera-scale');}
    previewDevice.classList.remove('cameraZoomActive');cameraElementId=undefined;cameraAnimationId=undefined;
  };
  const applyCamera=():void=>{
    raf=0;if(!cameraActive){resetCamera();return;}
    const preview=frame(),target=cameraElement();if(!preview||!target?.rect)return;
    const rect=target.rect,vw=Math.max(1,preview.clientWidth),vh=Math.max(1,preview.clientHeight),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const fitX=(vw*CAMERA_FIT_RATIO)/width,fitY=(vh*CAMERA_FIT_RATIO)/height;
    const scale=Math.max(1,Math.min(CAMERA_MAX_SCALE,fitX,fitY));
    const centerX=rect.x+width/2,centerY=rect.y+height/2;
    const tx=vw/2-centerX*scale,ty=vh/2-centerY*scale;
    const transform=`translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
    if(preview.style.transformOrigin!=='0px 0px'&&preview.style.transformOrigin!=='0 0')preview.style.transformOrigin='0 0';
    if(preview.style.willChange!=='transform')preview.style.willChange='transform';
    if(preview.style.transform!==transform)preview.style.transform=transform;
    if(preview.dataset.cameraZoom!=='on')preview.dataset.cameraZoom='on';
    const scaleText=scale.toFixed(4);if(preview.dataset.cameraScale!==scaleText)preview.dataset.cameraScale=scaleText;
    previewDevice.classList.add('cameraZoomActive');
  };
  const scheduleCamera=():void=>{if(!cameraActive||raf)return;raf=requestAnimationFrame(applyCamera);};
  const refreshTarget=():void=>{
    if(cameraAnimationId)sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:cameraAnimationId,reveal:true});
    scheduleCamera();window.setTimeout(scheduleCamera,90);window.setTimeout(scheduleCamera,260);
  };
  const setCamera=(enabled:boolean):void=>{
    if(enabled){const animation=selectedAnimation();if(!animation)return;cameraAnimationId=animation.id;cameraElementId=animation.target.elementId;}
    cameraActive=enabled;zoomButton.classList.toggle('active',enabled);zoomButton.setAttribute('aria-pressed',String(enabled));
    if(!enabled){resetCamera();return;}refreshTarget();
  };
  const setMouse=(enabled:boolean):void=>{mouseEnabled=enabled;postInput({type:'SET_INPUT_LOCK',enabled:!enabled});updateMouse();};
  const wheel=(event:WheelEvent):void=>{
    if(mouseEnabled)return;
    const previewStage=stage();if(!previewStage||!previewStage.contains(event.target as Node))return;
    event.preventDefault();event.stopImmediatePropagation();
    const dx=event.shiftKey&&Math.abs(event.deltaX)<Math.abs(event.deltaY)?event.deltaY:event.deltaX;
    const dy=event.shiftKey&&Math.abs(event.deltaX)<Math.abs(event.deltaY)?0:event.deltaY;
    postInput({type:'PAN_VIEWPORT',dx,dy});
  };
  function endDrag():void{
    if(!dragging)return;const previewStage=stage();
    if(previewStage&&dragPointerId>=0&&previewStage.hasPointerCapture?.(dragPointerId)){try{previewStage.releasePointerCapture(dragPointerId);}catch{}}
    dragging=false;dragPointerId=-1;previewStage?.classList.remove('webMousePanning');
  }
  const pointerDown=(event:PointerEvent):void=>{
    if(mouseEnabled||event.button!==0)return;const previewStage=stage();if(!previewStage||!previewStage.contains(event.target as Node))return;
    event.preventDefault();event.stopImmediatePropagation();dragging=true;dragPointerId=event.pointerId;lastDragX=event.clientX;lastDragY=event.clientY;previewStage.classList.add('webMousePanning');
    try{previewStage.setPointerCapture(event.pointerId);}catch{}
  };
  const pointerMove=(event:PointerEvent):void=>{
    if(!dragging||event.pointerId!==dragPointerId)return;event.preventDefault();event.stopImmediatePropagation();
    const dx=lastDragX-event.clientX,dy=lastDragY-event.clientY;lastDragX=event.clientX;lastDragY=event.clientY;
    if(Math.abs(dx)>.01||Math.abs(dy)>.01)postInput({type:'PAN_VIEWPORT',dx,dy});
  };
  const pointerEnd=(event:PointerEvent):void=>{if(!dragging||event.pointerId!==dragPointerId)return;event.preventDefault();event.stopImmediatePropagation();endDrag();};

  const intercept=(event:MouseEvent):void=>{
    const target=event.target as Element|null;
    if(target?.closest('[data-magnify-mode]')){event.preventDefault();event.stopImmediatePropagation();setCamera(!cameraActive);return;}
    if(target?.closest('[data-web-interaction]')){event.preventDefault();event.stopImmediatePropagation();setMouse(!mouseEnabled);return;}
    if(target?.closest('[data-inspection-clear]'))setCamera(false);
  };
  const key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&cameraActive){event.preventDefault();setCamera(false);}};
  const stateChanged=():void=>{const context=projectContext();if(context!==lastProjectContext){lastProjectContext=context;endDrag();if(cameraActive)setCamera(false);else{cameraElementId=undefined;cameraAnimationId=undefined;}}updateMouse();scheduleCamera();};
  const unsubscribe=store.subscribe(stateChanged);
  const frameObserver=new MutationObserver(()=>{updateMouse();scheduleCamera();});frameObserver.observe(previewDevice,{childList:true});
  const resize=new ResizeObserver(scheduleCamera);resize.observe(previewDevice);

  tools.addEventListener('click',intercept,true);root.addEventListener('wheel',wheel,{capture:true,passive:false});root.addEventListener('pointerdown',pointerDown,true);root.addEventListener('pointermove',pointerMove,true);root.addEventListener('pointerup',pointerEnd,true);root.addEventListener('pointercancel',pointerEnd,true);window.addEventListener('keydown',key);updateMouse();
  return()=>{if(raf)cancelAnimationFrame(raf);endDrag();postInput({type:'SET_INPUT_LOCK',enabled:false});setCamera(false);unsubscribe();frameObserver.disconnect();resize.disconnect();tools.removeEventListener('click',intercept,true);root.removeEventListener('wheel',wheel,true);root.removeEventListener('pointerdown',pointerDown,true);root.removeEventListener('pointermove',pointerMove,true);root.removeEventListener('pointerup',pointerEnd,true);root.removeEventListener('pointercancel',pointerEnd,true);window.removeEventListener('keydown',key);mouseButton.remove();};

  function projectContext():string{const project=store.get().project;return project?`${project.id}:${project.selectedEntry}`:'';}
}