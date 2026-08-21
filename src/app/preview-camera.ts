import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const CAMERA_MIN_SCALE=1.15;
const CAMERA_MAX_SCALE=6;

export function mountPreviewCamera(root:HTMLElement):()=>void{
  const tools=root.querySelector<HTMLElement>('.timelineProTools');
  const zoomButton=tools?.querySelector<HTMLButtonElement>('[data-magnify-mode]');
  const focusGroup=tools?.querySelector<HTMLElement>('.focusGroup');
  if(!tools||!zoomButton||!focusGroup)return()=>{};

  zoomButton.title='Camera zoom · center the real viewport on the selected element';
  const mouseButton=document.createElement('button');
  mouseButton.type='button';mouseButton.dataset.webInteraction='';mouseButton.className='webMouseToggle active';mouseButton.textContent='↖';mouseButton.setAttribute('aria-pressed','true');mouseButton.title='Mouse interaction with preview: on';
  const reset=focusGroup.querySelector('[data-inspection-clear]');focusGroup.insertBefore(mouseButton,reset);

  let cameraActive=false,mouseEnabled=true,raf=0;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const stage=()=>root.querySelector<HTMLElement>('.stage');
  const device=()=>root.querySelector<HTMLElement>('[data-device]');
  const selectedElement=()=>{
    const state=store.get();
    const animation=state.selectedAnimationId?state.animations.find(item=>item.id===state.selectedAnimationId):undefined;
    const id=animation?.elementId??state.selectedElementId;
    return id?state.elements.find(element=>element.id===id):undefined;
  };
  const selectedAnimation=()=>{const state=store.get();return state.selectedAnimationId?state.animations.find(item=>item.id===state.selectedAnimationId):undefined;};

  const updateMouse=():void=>{
    const preview=frame();if(preview)preview.style.pointerEvents=mouseEnabled?'auto':'none';
    stage()?.classList.toggle('webMouseLocked',!mouseEnabled);mouseButton.classList.toggle('active',mouseEnabled);mouseButton.setAttribute('aria-pressed',String(mouseEnabled));mouseButton.textContent=mouseEnabled?'↖':'⊘';mouseButton.title=`Mouse interaction with preview: ${mouseEnabled?'on':'off'}`;
  };
  const resetCamera=():void=>{
    const preview=frame();if(preview){preview.style.removeProperty('transform');preview.style.removeProperty('transform-origin');preview.style.removeProperty('will-change');preview.dataset.cameraZoom='off';preview.removeAttribute('data-camera-scale');}
    device()?.classList.remove('cameraZoomActive');
  };
  const applyCamera=():void=>{
    raf=0;if(!cameraActive){resetCamera();return;}
    const preview=frame(),target=selectedElement();if(!preview||!target?.rect)return;
    const rect=target.rect,vw=Math.max(1,preview.clientWidth),vh=Math.max(1,preview.clientHeight),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const scale=Math.max(CAMERA_MIN_SCALE,Math.min(CAMERA_MAX_SCALE,(vw*.72)/width,(vh*.72)/height));
    const centerX=rect.x+width/2,centerY=rect.y+height/2;
    const tx=vw/2-centerX*scale,ty=vh/2-centerY*scale;
    preview.style.transformOrigin='0 0';preview.style.willChange='transform';preview.style.transform=`translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;preview.dataset.cameraZoom='on';preview.dataset.cameraScale=scale.toFixed(4);device()?.classList.add('cameraZoomActive');
  };
  const scheduleCamera=():void=>{if(!cameraActive||raf)return;raf=requestAnimationFrame(applyCamera);};
  const refreshTarget=():void=>{
    const animation=selectedAnimation();if(animation)sendCommand(frame(),{type:'HIGHLIGHT_ANIMATION',id:animation.id});
    scheduleCamera();window.setTimeout(scheduleCamera,90);window.setTimeout(scheduleCamera,260);
  };
  const setCamera=(enabled:boolean):void=>{
    cameraActive=enabled;zoomButton.classList.toggle('active',enabled);zoomButton.setAttribute('aria-pressed',String(enabled));
    if(!enabled){resetCamera();return;}
    if(store.get().recording){store.set({recording:false});sendCommand(frame(),{type:'SET_RECORDING',enabled:false});}
    refreshTarget();
  };
  const setMouse=(enabled:boolean):void=>{mouseEnabled=enabled;updateMouse();};

  const intercept=(event:MouseEvent):void=>{
    const target=event.target as Element|null;
    if(target?.closest('[data-magnify-mode]')){event.preventDefault();event.stopImmediatePropagation();setCamera(!cameraActive);return;}
    if(target?.closest('[data-web-interaction]')){event.preventDefault();event.stopImmediatePropagation();setMouse(!mouseEnabled);return;}
    if(target?.closest('[data-inspection-clear]'))setCamera(false);
    if(target?.closest('[data-isolate="all"]'))setCamera(false);
  };
  const key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&cameraActive){event.preventDefault();setCamera(false);}};
  const unsubscribe=store.subscribe(()=>{updateMouse();scheduleCamera();});
  const mutation=new MutationObserver(()=>{updateMouse();scheduleCamera();});mutation.observe(root,{subtree:true,childList:true});
  const resize=new ResizeObserver(scheduleCamera);const initialDevice=device();if(initialDevice)resize.observe(initialDevice);

  tools.addEventListener('click',intercept,true);window.addEventListener('keydown',key);updateMouse();
  return()=>{if(raf)cancelAnimationFrame(raf);setCamera(false);unsubscribe();mutation.disconnect();resize.disconnect();tools.removeEventListener('click',intercept,true);window.removeEventListener('keydown',key);mouseButton.remove();};
}
