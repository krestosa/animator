import { detectedAnimationsToMotionTracks } from '../core/motion';
import { CAPTURE_REPORT_EVENT, sendCommand, TIMELINE_STATE_EVENT } from '../preview/bridge';
import { store } from '../state/store';
import type { PreviewMessage } from '../types/domain';

const FPS=60;
const FRAME_MS=1000/FPS;

type TimelineStateMessage=Extract<PreviewMessage,{type:'TIMELINE_STATE'}>;
type CaptureReportMessage=Extract<PreviewMessage,{type:'CAPTURE_REPORT'}>;

export function mountPreviewEditor(root:HTMLElement):()=>void{
  const top=root.querySelector<HTMLElement>('.timelineTop');if(!top)return()=>{};
  const controls=document.createElement('div');controls.className='previewEditorControls';
  controls.innerHTML='<button data-preview-live title="Release timeline and interact with the live page">Live ●</button><span class="previewFrameCluster"><button data-preview-step="-10" title="Previous 10 frames">−10f</button><button data-preview-step="-1" title="Previous frame">−1f</button><b data-preview-frame-label>Live</b><button data-preview-step="1" title="Next frame">+1f</button><button data-preview-step="10" title="Next 10 frames">+10f</button></span><button data-preview-recalculate title="Rescan visible elements and capture viewport motion without reloading">Recalculate viewport</button><label class="previewAutoCapture" title="Automatically rescan short animations while scrolling and when elements enter the viewport"><input type="checkbox" data-preview-auto checked> Auto viewport</label><button data-preview-recapture title="Reload the preview and capture startup animations again">Recapture page</button><span data-preview-capture-status>Waiting for preview</span>';
  top.append(controls);
  let captureTimer=0,activeFrame:Window|null=null,destroyed=false,timelinePlaying=false,controlled=false,currentTime=0,currentFrame=0,autoCapture=true,lastReport:CaptureReportMessage|undefined,lastRecording=store.get().recording;
  const iframe=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const status=()=>controls.querySelector<HTMLElement>('[data-preview-capture-status]');
  const liveButton=()=>controls.querySelector<HTMLButtonElement>('[data-preview-live]');
  const frameLabel=()=>controls.querySelector<HTMLElement>('[data-preview-frame-label]');
  const recalcButton=()=>controls.querySelector<HTMLButtonElement>('[data-preview-recalculate]');
  const updateMode=():void=>{const button=liveButton();if(button){button.classList.toggle('active',!controlled);button.textContent=controlled?'Live':'Live ●';button.title=controlled?'Release timeline and resume live viewport':'Live page active';}};
  const updateFrameLabel=():void=>{const label=frameLabel();if(label)label.textContent=controlled?`Frame ${currentFrame} · ${Math.round(currentTime)} ms`:'Live';const playhead=root.querySelector<HTMLElement>('[data-playhead-label]');if(playhead)playhead.textContent=`${Math.round(currentTime)} ms`;};
  const reportText=(report:CaptureReportMessage):string=>!store.get().recording?'Recording STOPPED · no new runtime capture':`${report.burstActive?'Scanning':'Viewport'} · ${report.visibleElements} visible · ${report.activeAnimations} active · ${report.capturedAnimations} captured · ${report.styleTracks} JS`;
  const syncRecordingUi=():void=>{const recording=store.get().recording,button=recalcButton();if(button){button.disabled=!recording;button.title=recording?'Rescan visible elements and capture viewport motion without reloading':'Start Record before recalculating viewport motion';}if(recording===lastRecording)return;lastRecording=recording;const label=status();if(label)label.textContent=recording?(lastReport?reportText(lastReport):'Recording active · waiting for runtime activity'):'Recording STOPPED · no new runtime capture';};
  const step=(delta:number):void=>{timelinePlaying=false;controlled=true;updateMode();sendCommand(iframe(),{type:'STEP_FRAME',delta});};
  const seekFrame=(frame:number):void=>{timelinePlaying=false;controlled=true;updateMode();sendCommand(iframe(),{type:'SEEK_FRAME',frame:Math.max(0,Math.round(frame))});};
  const release=():void=>{timelinePlaying=false;controlled=false;updateMode();updateFrameLabel();sendCommand(iframe(),{type:'RELEASE_TIMELINE'});const label=status();if(label)label.textContent=!store.get().recording?'Recording STOPPED · live page is not being captured':lastReport?reportText(lastReport):'Live capture · scroll/interact with the page';};
  const recalculate=():void=>{if(!store.get().recording)return;const frame=iframe(),button=recalcButton();if(button)button.disabled=true;const label=status();if(label)label.textContent='Recalculating viewport…';sendCommand(frame,{type:'RECALCULATE_VIEWPORT'});window.setTimeout(()=>{if(button)button.disabled=!store.get().recording;},450);};
  const setAutoCapture=(enabled:boolean):void=>{autoCapture=enabled;sendCommand(iframe(),{type:'SET_AUTO_VIEWPORT_CAPTURE',enabled});const label=status();if(label)label.textContent=!store.get().recording?`Recording STOPPED · auto viewport ${enabled?'armed':'off'}`:enabled?'Auto viewport capture enabled':'Auto viewport capture disabled';};
  const recapture=():void=>{
    const frame=iframe();if(!frame)return;
    timelinePlaying=false;controlled=false;currentTime=0;currentFrame=0;lastReport=undefined;updateMode();updateFrameLabel();if(captureTimer)window.clearTimeout(captureTimer);
    const state=store.get();store.set({motionTracks:detectedAnimationsToMotionTracks(state.analysis?.animations??[]),events:[],elements:[],selectedAnimationId:undefined,selectedElementId:undefined,playhead:0});
    const url=new URL(frame.dataset.previewOrigin??frame.src,location.href);url.searchParams.set('__animator_capture',String(Date.now()));frame.src=url.toString();
    const label=status();if(label)label.textContent=store.get().recording?'Reloading preview for capture…':'Reloading preview · Record remains STOPPED';
  };
  const click=(event:MouseEvent):void=>{const target=(event.target as Element|null)?.closest<HTMLElement>('[data-preview-live],[data-preview-step],[data-preview-recalculate],[data-preview-recapture]');if(!target)return;if(target.hasAttribute('data-preview-live'))release();else if(target.dataset.previewStep)step(Number(target.dataset.previewStep));else if(target.hasAttribute('data-preview-recalculate'))recalculate();else recapture();};
  const change=(event:Event):void=>{const target=event.target as HTMLInputElement|null;if(target?.matches('[data-preview-auto]'))setAutoCapture(target.checked);};
  const key=(event:KeyboardEvent):void=>{
    const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();step(event.shiftKey?-10:-1);}else if(event.key==='ArrowRight'){event.preventDefault();step(event.shiftKey?10:1);}else if(event.key==='Home'){event.preventDefault();seekFrame(0);}else if(event.key===' '&&!event.repeat){event.preventDefault();sendCommand(iframe(),{type:timelinePlaying?'PAUSE_ALL':'PLAY_ALL'});}
  };
  const timelineState=(event:Event):void=>{const detail=(event as CustomEvent<TimelineStateMessage>).detail;if(!detail)return;currentTime=Math.max(0,detail.time);currentFrame=Number.isFinite(detail.frame)?Math.max(0,Math.round(detail.frame!)):Math.max(0,Math.round(currentTime/FRAME_MS));timelinePlaying=detail.playing;controlled=detail.controlled;updateMode();updateFrameLabel();};
  const captureReport=(event:Event):void=>{const detail=(event as CustomEvent<CaptureReportMessage>).detail;if(!detail)return;lastReport=detail;autoCapture=detail.autoCapture;const toggle=controls.querySelector<HTMLInputElement>('[data-preview-auto]');if(toggle)toggle.checked=autoCapture;const label=status();if(label)label.textContent=reportText(detail);const button=recalcButton();if(button&&!detail.burstActive)button.disabled=!store.get().recording;};
  const message=(event:MessageEvent<unknown>):void=>{
    const frame=iframe();if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
    const data=event.data as {source?:unknown;type?:unknown};if(data.source!=='animator-preview'||data.type!=='READY')return;
    activeFrame=event.source as Window;controlled=false;timelinePlaying=false;updateMode();updateFrameLabel();const recording=store.get().recording;const label=status();if(label)label.textContent=recording?'Capturing startup + viewport motion…':'Recording STOPPED · preview is live but not captured';if(captureTimer)window.clearTimeout(captureTimer);sendCommand(frame,{type:'SET_RECORDING',enabled:recording});sendCommand(frame,{type:'SET_AUTO_VIEWPORT_CAPTURE',enabled:autoCapture});
    captureTimer=window.setTimeout(()=>{captureTimer=0;if(destroyed||activeFrame!==iframe()?.contentWindow)return;const runtimeCount=store.get().motionTracks.filter(track=>!track.target.elementId.startsWith('static:')).length;const current=status();if(current)current.textContent=!store.get().recording?'Recording STOPPED · no new runtime capture':lastReport?reportText(lastReport):`Live ready · ${runtimeCount} runtime motion${runtimeCount===1?'':'s'} · ${FPS} fps`;},1400);
  };
  const stateChanged=():void=>syncRecordingUi();
  updateMode();updateFrameLabel();syncRecordingUi();controls.addEventListener('click',click);controls.addEventListener('change',change);window.addEventListener('keydown',key);window.addEventListener('message',message);window.addEventListener(TIMELINE_STATE_EVENT,timelineState);window.addEventListener(CAPTURE_REPORT_EVENT,captureReport);const unsubscribe=store.subscribe(stateChanged);
  return()=>{destroyed=true;if(captureTimer)window.clearTimeout(captureTimer);unsubscribe();controls.removeEventListener('click',click);controls.removeEventListener('change',change);window.removeEventListener('keydown',key);window.removeEventListener('message',message);window.removeEventListener(TIMELINE_STATE_EVENT,timelineState);window.removeEventListener(CAPTURE_REPORT_EVENT,captureReport);controls.remove();};
}
