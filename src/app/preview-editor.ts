import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const FRAME_MS=1000/60;

export function mountPreviewEditor(root:HTMLElement):()=>void{
  const top=root.querySelector<HTMLElement>('.timelineTop');if(!top)return()=>{};
  const controls=document.createElement('div');controls.className='previewEditorControls';controls.innerHTML='<button data-preview-frame-back title="Previous frame">−1f</button><button data-preview-frame-forward title="Next frame">+1f</button><button data-preview-recapture title="Reload page and capture startup animations">Recapture</button><span data-preview-capture-status>Waiting for preview</span>';
  top.append(controls);
  let captureTimer=0;let activeFrame:Window|null=null;let destroyed=false;
  const iframe=()=>root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
  const status=()=>controls.querySelector<HTMLElement>('[data-preview-capture-status]');
  const seek=(time:number):void=>{const next=Math.max(0,time);store.set({playhead:next});sendCommand(iframe(),{type:'SCRUB_TIMELINE',time:next});};
  const step=(direction:number):void=>seek(store.get().playhead+FRAME_MS*direction);
  const recapture=():void=>{
    const frame=iframe();if(!frame)return;
    if(captureTimer)window.clearTimeout(captureTimer);
    const state=store.get();store.set({animations:state.analysis?.animations??[],events:[],elements:[],selectedAnimationId:undefined,selectedElementId:undefined,playhead:0});
    const url=new URL(frame.dataset.previewOrigin??frame.src,location.href);url.searchParams.set('__animator_capture',String(Date.now()));frame.src=url.toString();
    const label=status();if(label)label.textContent='Reloading preview…';
  };
  const click=(event:MouseEvent):void=>{const target=(event.target as Element|null)?.closest<HTMLElement>('[data-preview-frame-back],[data-preview-frame-forward],[data-preview-recapture]');if(!target)return;if(target.hasAttribute('data-preview-frame-back'))step(-1);else if(target.hasAttribute('data-preview-frame-forward'))step(1);else recapture();};
  const key=(event:KeyboardEvent):void=>{
    const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'){event.preventDefault();step(event.shiftKey?-10:-1);}else if(event.key==='ArrowRight'){event.preventDefault();step(event.shiftKey?10:1);}else if(event.key===' '){event.preventDefault();sendCommand(iframe(),{type:event.repeat?'PAUSE_ALL':'PLAY_ALL'});}
  };
  const message=(event:MessageEvent<unknown>):void=>{
    const frame=iframe();if(!frame||event.source!==frame.contentWindow||!event.data||typeof event.data!=='object')return;
    const data=event.data as {source?:unknown;type?:unknown};if(data.source!=='animator-preview'||data.type!=='READY')return;
    activeFrame=event.source as Window;const label=status();if(label)label.textContent='Capturing startup motion…';
    if(captureTimer)window.clearTimeout(captureTimer);
    captureTimer=window.setTimeout(()=>{
      if(destroyed||activeFrame!==iframe()?.contentWindow)return;
      seek(0);const runtimeCount=store.get().animations.filter(animation=>!animation.elementId.startsWith('static:')).length;const current=status();if(current)current.textContent=`Ready · ${runtimeCount} runtime motion${runtimeCount===1?'':'s'} · 60 fps`;
    },1400);
  };
  controls.addEventListener('click',click);window.addEventListener('keydown',key);window.addEventListener('message',message);
  return()=>{destroyed=true;if(captureTimer)window.clearTimeout(captureTimer);controls.removeEventListener('click',click);window.removeEventListener('keydown',key);window.removeEventListener('message',message);controls.remove();};
}
