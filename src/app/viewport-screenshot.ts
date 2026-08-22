import html2canvas from 'html2canvas';
import { store } from '../state/store';

const TOAST_LIFETIME=2100;

export function mountViewportScreenshot(root:HTMLElement):()=>void{
  const toolbar=root.querySelector<HTMLElement>('.toolbar');
  const label=toolbar?.querySelector<HTMLElement>('[data-viewport-label]');
  if(!toolbar||!label)return()=>{};

  const button=document.createElement('button');
  button.type='button';
  button.className='viewportScreenshotButton';
  button.dataset.viewportScreenshot='';
  button.title='Copy viewport screenshot';
  button.setAttribute('aria-label','Copy viewport screenshot');
  button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.4 4.25 7.55 2.7h4.9l1.15 1.55h2.15A2.25 2.25 0 0 1 18 6.5v8A2.25 2.25 0 0 1 15.75 16.75H4.25A2.25 2.25 0 0 1 2 14.5v-8a2.25 2.25 0 0 1 2.25-2.25H6.4Zm3.6 2.1a3.95 3.95 0 1 0 0 7.9 3.95 3.95 0 0 0 0-7.9Zm0 1.55a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z"/></svg>';
  label.insertAdjacentElement('afterend',button);

  let busy=false,toast:HTMLDivElement|null=null,toastTimer=0,disposed=false,lastHasProject=!!store.get().project;
  const update=():void=>{if(disposed)return;button.disabled=busy||!store.get().project;button.classList.toggle('busy',busy);button.setAttribute('aria-busy',String(busy));};
  const removeToast=():void=>{if(toastTimer)clearTimeout(toastTimer);toastTimer=0;toast?.remove();toast=null;};
  const showToast=(message:string,kind:'loading'|'success'|'error'):void=>{
    if(disposed)return;removeToast();
    toast=document.createElement('div');
    toast.className=`viewportCaptureToast ${kind}`;
    toast.dataset.viewportCaptureToast=kind;
    toast.setAttribute('role','status');
    toast.innerHTML=`<span class="viewportCaptureToastIcon" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    document.body.append(toast);
    requestAnimationFrame(()=>{if(!disposed)toast?.classList.add('visible');});
    if(kind!=='loading')toastTimer=window.setTimeout(()=>{if(disposed)return;toast?.classList.add('leaving');toastTimer=window.setTimeout(removeToast,260);},TOAST_LIFETIME);
  };
  const onClick=async():Promise<void>=>{
    if(disposed||busy||!store.get().project)return;
    const startedContext=projectContext();busy=true;update();showToast('Capturing viewport…','loading');
    try{
      const blob=await captureViewport(root);if(disposed)return;if(projectContext()!==startedContext)throw new Error('Preview changed during capture; try again');
      if(!('ClipboardItem'in window)||!navigator.clipboard?.write)throw new Error('Image clipboard is not supported by this browser');
      const png=blob.type==='image/png'?blob:new Blob([await blob.arrayBuffer()],{type:'image/png'});if(disposed||projectContext()!==startedContext)return;
      await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);if(!disposed&&projectContext()===startedContext)showToast('Screenshot copied','success');
    }catch(error){if(!disposed)showToast(error instanceof Error?error.message:'Could not copy screenshot','error');}
    finally{busy=false;if(!disposed)update();}
  };
  const click=():void=>{void onClick();};
  button.addEventListener('click',click);
  const unsubscribe=store.subscribe(()=>{const next=!!store.get().project;if(next===lastHasProject)return;lastHasProject=next;update();});update();
  return()=>{disposed=true;unsubscribe();button.removeEventListener('click',click);button.remove();removeToast();};

  function projectContext():string{const project=store.get().project;return project?`${project.id}:${project.selectedEntry}:${project.browserSessionId??''}`:'';}
}

async function captureViewport(root:HTMLElement):Promise<Blob>{
  const project=store.get().project;
  if(!project)throw new Error('Open a project first');
  const browserSurface=root.querySelector<HTMLElement>('[data-browser-preview]');
  const snapshotFrame=root.querySelector<HTMLIFrameElement>('[data-browser-snapshot-frame]');
  const previewFrame=root.querySelector<HTMLIFrameElement>('[data-preview-frame]');

  if(project.browserSessionId&&browserSurface?.dataset.browserClosed!=='true'&&!snapshotFrame){
    const response=await fetch(`/api/browser-sessions/${encodeURIComponent(project.browserSessionId)}/screenshot`,{cache:'no-store'});
    if(!response.ok)throw new Error(await response.text()||'Could not capture browser viewport');
    return response.blob();
  }

  const frame=snapshotFrame??previewFrame;
  if(!frame?.contentWindow)throw new Error('Viewport is not ready');
  const backgroundColor=effectiveBackgroundColor(frame);
  const document=currentFrameDocument(frame);
  if(document)return captureDocument(document,backgroundColor);
  return captureFrameRuntime(frame,backgroundColor);
}

function currentFrameDocument(frame:HTMLIFrameElement):Document|null{
  try{return frame.contentDocument?.documentElement?frame.contentDocument:null;}catch{return null;}
}

async function captureDocument(document:Document,backgroundColor:string):Promise<Blob>{
  const view=document.defaultView;
  if(!view||!document.documentElement)throw new Error('Viewport document is not ready');
  const running:Animation[]=[];
  for(const animation of document.getAnimations?.()??[]){
    if(animation.playState==='running'){
      running.push(animation);
      try{animation.pause();}catch{}
    }
  }
  try{
    await Promise.resolve();
    const canvas=await html2canvas(document.documentElement,{backgroundColor,logging:false,useCORS:true,allowTaint:false,scale:1,width:view.innerWidth,height:view.innerHeight,x:view.scrollX,y:view.scrollY,scrollX:view.scrollX,scrollY:view.scrollY,windowWidth:view.innerWidth,windowHeight:view.innerHeight,removeContainer:true});
    return await canvasBlob(canvas);
  } finally {
    for(const animation of running)try{animation.play();}catch{}
  }
}

async function captureFrameRuntime(frame:HTMLIFrameElement,backgroundColor:string):Promise<Blob>{
  const target=frame.contentWindow;
  if(!target)throw new Error('Viewport is not ready');
  await waitForCaptureRuntime(target);
  const requestId=`viewport-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error?:Error,blob?:Blob):void=>{
      if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('message',onMessage);if(error)reject(error);else if(blob)resolve(blob);else reject(new Error('Viewport capture failed'));
    };
    const onMessage=(event:MessageEvent):void=>{
      if(event.source!==target)return;
      const message=event.data as {source?:string;type?:string;requestId?:string;dataUrl?:string;error?:string}|null;
      if(!message||message.source!=='animator-preview'||message.type!=='VIEWPORT_CAPTURE_RESULT'||message.requestId!==requestId)return;
      if(message.error){finish(new Error(message.error));return;}
      if(!message.dataUrl){finish(new Error('Viewport did not return image data'));return;}
      void fetch(message.dataUrl).then(response=>response.blob()).then(blob=>finish(undefined,blob),error=>finish(error instanceof Error?error:new Error(String(error))));
    };
    const timer=window.setTimeout(()=>finish(new Error('Viewport rendering took too long')),30000);
    window.addEventListener('message',onMessage);
    target.postMessage({source:'animator-editor',type:'CAPTURE_VIEWPORT_PNG',requestId,backgroundColor},'*');
  });
}

function waitForCaptureRuntime(target:Window):Promise<void>{
  const requestId=`viewport-ready-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  return new Promise((resolve,reject)=>{
    let settled=false,retryTimer=0,attempts=0;
    const finish=(error?:Error):void=>{if(settled)return;settled=true;if(retryTimer)clearTimeout(retryTimer);window.removeEventListener('message',onMessage);error?reject(error):resolve();};
    const onMessage=(event:MessageEvent):void=>{if(event.source!==target)return;const message=event.data as{source?:string;type?:string;requestId?:string}|null;if(message?.source==='animator-preview'&&message.type==='VIEWPORT_CAPTURE_READY'&&message.requestId===requestId)finish();};
    const ping=():void=>{if(settled)return;if(attempts++>=40){finish(new Error('Viewport capture is not ready yet'));return;}target.postMessage({source:'animator-editor',type:'CAPTURE_VIEWPORT_PING',requestId},'*');retryTimer=window.setTimeout(ping,125);};
    window.addEventListener('message',onMessage);ping();
  });
}

function effectiveBackgroundColor(frame:HTMLElement):string{
  let node:HTMLElement|null=frame;
  while(node){const color=getComputedStyle(node).backgroundColor;if(!isTransparent(color))return color;node=node.parentElement;}
  const body=getComputedStyle(document.body).backgroundColor;if(!isTransparent(body))return body;
  const root=getComputedStyle(document.documentElement).backgroundColor;if(!isTransparent(root))return root;
  return '#fff';
}
function isTransparent(color:string):boolean{return color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color);}
function canvasBlob(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode viewport PNG')),'image/png'));}
function escapeHtml(value:string):string{return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
