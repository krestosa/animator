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

  let busy=false,toast:HTMLDivElement|null=null,toastTimer=0;
  const update=():void=>{button.disabled=busy||!store.get().project;button.classList.toggle('busy',busy);button.setAttribute('aria-busy',String(busy));};
  const removeToast=():void=>{if(toastTimer)clearTimeout(toastTimer);toastTimer=0;toast?.remove();toast=null;};
  const showToast=(message:string,kind:'loading'|'success'|'error'):void=>{
    removeToast();
    toast=document.createElement('div');
    toast.className=`viewportCaptureToast ${kind}`;
    toast.dataset.viewportCaptureToast=kind;
    toast.setAttribute('role','status');
    toast.innerHTML=`<span class="viewportCaptureToastIcon" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    document.body.append(toast);
    requestAnimationFrame(()=>toast?.classList.add('visible'));
    if(kind!=='loading')toastTimer=window.setTimeout(()=>{toast?.classList.add('leaving');toastTimer=window.setTimeout(removeToast,260);},TOAST_LIFETIME);
  };
  const onClick=async():Promise<void>=>{
    if(busy||!store.get().project)return;
    busy=true;update();showToast('Capturing viewport…','loading');
    try{
      const blob=await captureViewport(root);
      if(!('ClipboardItem'in window)||!navigator.clipboard?.write)throw new Error('Image clipboard is not supported by this browser');
      const png=blob.type==='image/png'?blob:new Blob([await blob.arrayBuffer()],{type:'image/png'});
      await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
      showToast('Screenshot copied','success');
    }catch(error){showToast(error instanceof Error?error.message:'Could not copy screenshot','error');}
    finally{busy=false;update();}
  };
  const click=():void=>{void onClick();};
  button.addEventListener('click',click);
  const unsubscribe=store.subscribe(update);update();
  return()=>{unsubscribe();button.removeEventListener('click',click);button.remove();removeToast();};
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
  if(!frame?.src)throw new Error('Viewport is not ready');
  const size=viewportSize(root,browserSurface,frame);
  const scroll=frameScroll(frame);
  const response=await fetch('/api/viewport-screenshot',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:frame.src,width:size.width,height:size.height,scrollX:scroll.x,scrollY:scroll.y})});
  if(!response.ok)throw new Error(await response.text()||'Could not capture viewport');
  return response.blob();
}

function viewportSize(root:HTMLElement,browserSurface:HTMLElement|null,frame:HTMLIFrameElement):{width:number;height:number}{
  const browserWidth=Number(browserSurface?.dataset.browserWidth),browserHeight=Number(browserSurface?.dataset.browserHeight);
  if(browserWidth>0&&browserHeight>0)return{width:browserWidth,height:browserHeight};
  const device=root.querySelector<HTMLElement>('[data-device]');
  const width=Math.round(Number.parseFloat(device?.style.width||'')||frame.clientWidth||1100);
  const height=Math.round(Number.parseFloat(device?.style.height||'')||frame.clientHeight||700);
  return{width:Math.max(1,width),height:Math.max(1,height)};
}

function frameScroll(frame:HTMLIFrameElement):{x:number;y:number}{
  try{return{x:Math.max(0,Math.round(frame.contentWindow?.scrollX??0)),y:Math.max(0,Math.round(frame.contentWindow?.scrollY??0))};}catch{return{x:0,y:0};}
}

function escapeHtml(value:string):string{return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
