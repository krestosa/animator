import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const CAMERA_MIN_SCALE=1.15;
const CAMERA_MAX_SCALE=6;

export function mountPreviewCamera(root:HTMLElement):()=>void{
  const tools=root.querySelector<HTMLElement>('.timelineProTools');
  const zoomButton=tools?.querySelector<HTMLButtonElement>('[data-magnify-mode]');
  const focusGroup=tools?.querySelector<HTMLElement>('.focusGroup');
  const previewDevice=root.querySelector<HTMLElement>('[data-device]');
  if(!tools||!zoomButton||!focusGroup||!previewDevice)return()=>{};

  zoomButton.title='Camera zoom · center the selected element without changing page zoom';
  const mouseButton=document.createElement('button');
  mouseButton.type='button';mouseButton.dataset.webInteraction='';mouseButton.className='webMouseToggle active';mouseButton.textContent='↖';mouseButton.setAttribute('aria-pressed','true');mouseButton.title='Mouse interaction with preview: on';
  const reset=focusGroup.querySelector('[data-inspection-clear]');focusGroup.insertBefore(mouseButton,reset);

  let cameraActive=false,mouseEnabled=true,raf=0,lastFrame:HTMLIFrameElement|null=null,cameraElementId:string|undefined,cameraAnimationId:string|undefined;
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const stage=()=>root.querySelector<HTMLElement>('.stage');
  const selectedAnimation=()=>{const state=store.get();return state.selectedAnimationId?state.animations.find(item=>item.id===state.selectedAnimationId):undefined;};
  const cameraElement=()=>cameraElementId?store.get().elements.find(element=>element.id===cameraElementId):undefined;

  const updateMouse=():void=>{
    const preview=frame();
    if(preview&&preview!==lastFrame){lastFrame=preview;preview.style.pointerEvents=mouseEnabled?'auto':'none';}
    else if(preview&&preview.style.pointerEvents!==(mouseEnabled?'auto':'none'))preview.style.pointerEvents=mouseEnabled?'auto':'none';
    const locked=!mouseEnabled;const previewStage=stage();if(previewStage?.classList.contains('webMouseLocked')!==locked)previewStage?.classList.toggle('webMouseLocked',locked);
    if(mouseButton.classList.contains('active')!==mouseEnabled)mouseButton.classList.toggle('active',mouseEnabled);
    const pressed=String(mouseEnabled);if(mouseButton.getAttribute('aria-pressed')!==pressed)mouseButton.setAttribute('aria-pressed',pressed);
    const text=mouseEnabled?'↖':'⊘';if(mouseButton.textContent!==text)mouseButton.textContent=text;
    const title=`Mouse interaction with preview: ${mouseEnabled?'on':'off'}`;if(mouseButton.title!==title)mouseButton.title=title;
  };
  const resetCamera=():void=>{
    const preview=frame();if(preview){preview.style.removeProperty('transform');preview.style.removeProperty('transform-origin');preview.style.removeProperty('will-change');preview.dataset.cameraZoom='off';preview.removeAttribute('data-camera-scale');}
    previewDevice.classList.remove('cameraZoomActive');cameraElementId=undefined;cameraAnimationId=undefined;
  };
  const applyCamera=():void=>{
    raf=0;if(!cameraActive){resetCamera();return;}
    const preview=frame(),target=cameraElement();if(!preview||!target?.rect)return;
    const rect=target.rect,vw=Math.max(1,preview.clientWidth),vh=Math.max(1,preview.clientHeight),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const scale=Math.max(CAMERA_MIN_SCALE,Math.min(CAMERA_MAX_SCALE,(vw*.72)/width,(vh*.72)/height));
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
    if(enabled){const animation=selectedAnimation();if(!animation)return;cameraAnimationId=animation.id;cameraElementId=animation.elementId;}
    cameraActive=enabled;zoomButton.classList.toggle('active',enabled);zoomButton.setAttribute('aria-pressed',String(enabled));
    if(!enabled){resetCamera();return;}refreshTarget();
  };
  const setMouse=(enabled:boolean):void=>{mouseEnabled=enabled;updateMouse();};

  const intercept=(event:MouseEvent):void=>{
    const target=event.target as Element|null;
    if(target?.closest('[data-magnify-mode]')){event.preventDefault();event.stopImmediatePropagation();setCamera(!cameraActive);return;}
    if(target?.closest('[data-web-interaction]')){event.preventDefault();event.stopImmediatePropagation();setMouse(!mouseEnabled);return;}
    if(target?.closest('[data-inspection-clear]'))setCamera(false);
  };
  const key=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&cameraActive){event.preventDefault();setCamera(false);}};
  const unsubscribe=store.subscribe(()=>{updateMouse();scheduleCamera();});
  const frameObserver=new MutationObserver(()=>{updateMouse();scheduleCamera();});frameObserver.observe(previewDevice,{childList:true});
  const resize=new ResizeObserver(scheduleCamera);resize.observe(previewDevice);

  tools.addEventListener('click',intercept,true);window.addEventListener('keydown',key);updateMouse();
  return()=>{if(raf)cancelAnimationFrame(raf);setCamera(false);unsubscribe();frameObserver.disconnect();resize.disconnect();tools.removeEventListener('click',intercept,true);window.removeEventListener('keydown',key);mouseButton.remove();};
}