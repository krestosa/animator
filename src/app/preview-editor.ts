import { sendCommand, TIMELINE_STATE_EVENT } from '../preview/bridge';
import { store } from '../state/store';
import type { PreviewMessage } from '../types/domain';

const FPS=60;
const FRAME_MS=1000/FPS;

type TimelineStateMessage=Extract<PreviewMessage,{type:'TIMELINE_STATE'}>;

export function mountPreviewEditor(root:HTMLElement):()=>void{
  const top=root.querySelector<HTMLElement>('.timelineTop');if(!top)return()=>{};
  const controls=document.createElement('div');controls.className='previewEditorControls';
  controls.innerHTML='<button data-preview-live title="Release timeline and interact with the live page">Live</button><span class="previewFrameCluster"><button data-preview-step="-10" title="Previous 10 frames">−10f</button><button data-preview-step="-1" title="Previous frame">−1f</button><b data-preview-frame-label>Frame 0</b><button data-preview-step="1" title="Next frame">+1f</button><button data-preview-step="10" title="Next 10 frames">+10f</button></span><button data-preview-recapture title="Reload page and capture startup animations">Recapture</button><span data-preview-capture-status>Waiting for preview</span>';
  top.append(controls);
  let captureTimer=0,activeFrame:Window|null=null,destroyed=false,timelinePlaying=false,controlled=false,currentTime=0,currentFrame=0;
  const iframe=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const status=()=>controls.querySelector<HTMLElement>('[data-preview-capture-status]');
  const liveButton=()=>controls.querySelector<HTMLButtonElement>('[data-preview-live]');
  const frameLabel=()=>controls.querySelector<HTMLElement>('[data-preview-frame-label]');
  const updateMode=():void=>{const button=liveButton();if(button){button.classList.toggle('active',!controlled);button.textContent=controlled?'Live':'Live ●';}};
  const updateFrameLabel=():void=>{const label=frameLabel();if(label)label.textContent=`Frame ${currentFrame} · ${Math.round(currentTime)} ms`;const playhead=root.querySelector<HTMLElement>('[data-playhead-label]');if(playhead)playhead.textContent=`${Math.round(currentTime)} ms`;};
  const step=(delta:number):void=>{timelinePlaying=false;controlled=true;updateMode();sendCommand(iframe(),{type:'STEP_FRAME',delta});};
  const seekFrame=(frame:number):void=>{timelinePlaying=false;controlled=true;updateMode();sendCommand(iframe(),{type:'SEEK_FRAME',frame:Math.max(0,Math.round(frame))});};
  const release=():void=>{timelinePlaying=false;controlled=false;updateMode();sendCommand(iframe(),{type:'RELEASE_TIMELINE'});const label=status();if(label)label.textContent='Live capture · interact with the page';};
  const recapture=():void=>{
    const frame=iframe();if(!frame)return;
    timelinePlaying=false;controlled=false;currentTime=0;currentFrame=0;updateMode();updateFrameLabel();if(captureTimer)window.clearTimeout(captureTimer);
    const state=store.get();store.set({animations:state.analysis?.animations??[],events:[],elements:[],selectedAnimationId:undefined,selectedElementId:undefined,playhead:0});
    const url=new URL(frame.dataset.previewOrigin??frame.src,location.href);url.searchParams.set('__animator_capture',String(Date.now()));frame.src=url.toString();
    const label=status();if(label)label.textContent='Reloading preview…';
  };
  const click=(event:MouseEvent):void=>{const target=(event.target as Element|null)?.closest<HTMLElement>('[data-preview-live],[data-preview-step],[data-preview-recapture]');if(!target)return;if(target.hasAttribute('data-preview-live'))release();else if(target.dataset.previewStep)step(Number(target.dataset.previewStep));else recapture();};
  const key=(event:KeyboardEvent):void=>{
    const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();step(event.shiftKey?-10:-1);}else if(event.key==='ArrowRight'){event.preventDefault();step(event.shiftKey?10:1);}else if(event.key==='Home'){event.preventDefault();seekFrame(0);}else if(event.key===' '&&!event.repeat){event.preventDefault();sendCommand(iframe(),{type:timelinePlaying?'PAUSE_ALL':'PLAY_ALL'});}
  };
  const timelineState=(event:Event):void=>{const detail=(event as CustomEvent<TimelineStateMessage>).detail;if(!detail)return;currentTime=Math.max(0,detail.time);currentFrame=Number.isFinite(detail.frame)?Math.max(0,Math.round(detail.frame!)):Math.max(0,Math.round(currentTime/FRAME_MS));timelinePlaying=detail.playing;controlled=detail.controlled;updateMode();updateFrameLabel();};
  const message=(event:MessageEvent<unknown>):void=>{
    const frame=iframe();if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
    const data=event.data as {source?:unknown;type?:unknown};if(data.source!=='animator-preview'||data.type!=='READY')return;
    activeFrame=event.source as Window;const label=status();if(label)label.textContent='Capturing startup motion…';if(captureTimer)window.clearTimeout(captureTimer);
    captureTimer=window.setTimeout(()=>{if(destroyed||activeFrame!==iframe()?.contentWindow)return;seekFrame(0);const runtimeCount=store.get().animations.filter(animation=>!animation.elementId.startsWith('static:')).length;const current=status();if(current)current.textContent=`Ready · ${runtimeCount} runtime motion${runtimeCount===1?'':'s'} · ${FPS} fps`;},1400);
  };
  updateMode();updateFrameLabel();controls.addEventListener('click',click);window.addEventListener('keydown',key);window.addEventListener('message',message);window.addEventListener(TIMELINE_STATE_EVENT,timelineState);
  return()=>{destroyed=true;if(captureTimer)window.clearTimeout(captureTimer);controls.removeEventListener('click',click);window.removeEventListener('keydown',key);window.removeEventListener('message',message);window.removeEventListener(TIMELINE_STATE_EVENT,timelineState);controls.remove();};
}
