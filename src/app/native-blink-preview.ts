import { store } from '../state/store';

export function mountNativeBlinkPreview(root:HTMLElement):()=>void{
  const api=window.animatorDesktop?.blink,device=root.querySelector<HTMLElement>('[data-device]'),stage=root.querySelector<HTMLElement>('.stage'),webLoader=root.querySelector<HTMLDetailsElement>('.webLoader'),app=root.querySelector<HTMLElement>('.app'),timeline=root.querySelector<HTMLElement>('.timeline');if(!api||!device||!stage)return()=>{};
  let disposed=false,currentKey='',raf=0,syncRunning=false,syncQueued=false;

  const removeLegacyFrame=():void=>{if(store.get().project?.browserSessionId)return;device.querySelectorAll<HTMLIFrameElement>('[data-preview-frame]').forEach(frame=>frame.remove());};
  const blinkActive=():boolean=>{const project=store.get().project;return Boolean(project&&!project.browserSessionId);};
  const overlaps=(a:DOMRect,b:DOMRect):boolean=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const floatingOverlayOpen=():boolean=>{
    const stageRect=stage.getBoundingClientRect();
    for(const element of root.querySelectorAll<HTMLElement>('dialog[open],details[open]')){
      if(timeline?.contains(element))continue;
      if(element instanceof HTMLDialogElement){const rect=element.getBoundingClientRect();if(rect.width>0&&rect.height>0&&overlaps(rect,stageRect))return true;continue;}
      for(const child of [...element.children]){
        if(!(child instanceof HTMLElement)||child.tagName==='SUMMARY')continue;
        const style=getComputedStyle(child);if(style.display==='none'||style.visibility==='hidden')continue;
        const rect=child.getBoundingClientRect();if(rect.width>0&&rect.height>0&&overlaps(rect,stageRect))return true;
      }
    }
    return false;
  };
  const syncSurfaceVisibility=():boolean=>{
    const occluded=floatingOverlayOpen();
    api.setVisible(blinkActive()&&!occluded);
    return occluded;
  };
  const visibleClip=():DOMRect=>{
    const stageRect=stage.getBoundingClientRect();let bottom=stageRect.bottom;
    if(app?.classList.contains('timeline-open')&&timeline&&timeline.getAttribute('aria-hidden')!=='true'){
      const appRect=app.getBoundingClientRect(),timelineHeight=Math.max(0,timeline.getBoundingClientRect().height||timeline.offsetHeight),timelineTop=appRect.bottom-timelineHeight;
      bottom=Math.min(bottom,timelineTop);
    }
    return new DOMRect(stageRect.left,stageRect.top,Math.max(0,stageRect.width),Math.max(0,bottom-stageRect.top));
  };
  const syncViewport=():boolean=>{
    if(disposed||store.get().project?.browserSessionId)return false;
    if(syncSurfaceVisibility())return false;
    const rect=device.getBoundingClientRect(),clip=visibleClip(),layoutWidth=Math.max(1,device.offsetWidth||rect.width),zoomFactor=Math.max(.05,rect.width/layoutWidth);
    if(rect.width<1||rect.height<1||clip.width<1||clip.height<1)return false;
    api.setViewport({x:rect.left,y:rect.top,width:rect.width,height:rect.height,zoomFactor,clipX:clip.left,clipY:clip.top,clipWidth:clip.width,clipHeight:clip.height});
    return true;
  };
  const scheduledViewport=():void=>{raf=0;syncViewport();};
  const scheduleViewport=():void=>{
    if(disposed)return;
    syncViewport();
    if(!raf)raf=requestAnimationFrame(scheduledViewport);
  };

  const resolveUrl=async():Promise<string|undefined>=>{
    const project=store.get().project;if(!project||project.browserSessionId)return undefined;
    if(project.sourceUrl&&project.kind==='remote')return project.sourceUrl;
    const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/native-preview?entry=${encodeURIComponent(project.selectedEntry)}`,{cache:'no-store'}),body=await response.json() as{url?:string;error?:string};
    if(!response.ok||!body.url)throw new Error(body.error??'Native preview unavailable');return body.url;
  };

  const projectKey=():string=>{const project=store.get().project;return project&&!project.browserSessionId?`${project.id}:${project.selectedEntry}:${project.sourceUrl??''}`:'';};
  const syncOnce=async():Promise<void>=>{
    const project=store.get().project;if(!project||project.browserSessionId){if(!currentKey)return;currentKey='';api.setVisible(false);await api.close();return;}
    removeLegacyFrame();const key=projectKey();syncViewport();if(key===currentKey){syncSurfaceVisibility();syncViewport();return;}
    try{
      const url=await resolveUrl();if(disposed||!url||projectKey()!==key)return;
      syncViewport();
      await api.open(url);
      if(disposed||projectKey()!==key)return;
      currentKey=key;removeLegacyFrame();syncSurfaceVisibility();syncViewport();
    }
    catch(error){if(disposed||projectKey()!==key)return;currentKey='';store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
  };
  const drainSync=async():Promise<void>=>{if(syncRunning)return;syncRunning=true;try{while(syncQueued&&!disposed){syncQueued=false;await syncOnce();}}finally{syncRunning=false;}};
  const requestSync=():void=>{if(disposed)return;syncQueued=true;syncSurfaceVisibility();void drainSync();};

  const unsubscribe=store.subscribe(requestSync);
  const mutations=new MutationObserver(()=>{removeLegacyFrame();scheduleViewport();});mutations.observe(device,{childList:true,attributes:true,attributeFilter:['style','class']});
  const resize=new ResizeObserver(scheduleViewport);resize.observe(device);resize.observe(stage);if(timeline)resize.observe(timeline);
  const syncLoaderState=():void=>{const occluded=floatingOverlayOpen();syncSurfaceVisibility();if(!occluded)syncViewport();};
  const loaderObserver=webLoader?new MutationObserver(syncLoaderState):null;loaderObserver?.observe(webLoader!,{attributes:true,attributeFilter:['open']});
  const workspaceObserver=app?new MutationObserver(scheduleViewport):null;workspaceObserver?.observe(app!,{attributes:true,attributeFilter:['class']});
  const timelineObserver=timeline?new MutationObserver(scheduleViewport):null;timelineObserver?.observe(timeline!,{attributes:true,attributeFilter:['aria-hidden','style','class']});
  const floatingObserver=new MutationObserver(scheduleViewport);floatingObserver.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
  const onWebLoaderToggle=():void=>syncLoaderState();
  const loaderSummary=webLoader?.querySelector<HTMLElement>('summary');
  const onLoaderPointerDown=():void=>{if(webLoader&&!webLoader.open)api.setVisible(false);};
  const onCameraChange=():void=>scheduleViewport();
  const onTimelineTransition=():void=>scheduleViewport();
  webLoader?.addEventListener('toggle',onWebLoaderToggle);loaderSummary?.addEventListener('pointerdown',onLoaderPointerDown,true);timeline?.addEventListener('transitionrun',onTimelineTransition);timeline?.addEventListener('transitionend',onTimelineTransition);root.addEventListener('animator:workspace-camera-change',onCameraChange);
  window.addEventListener('resize',scheduleViewport);window.addEventListener('scroll',scheduleViewport,true);
  syncSurfaceVisibility();syncViewport();requestSync();
  return()=>{disposed=true;syncQueued=false;unsubscribe();mutations.disconnect();resize.disconnect();loaderObserver?.disconnect();workspaceObserver?.disconnect();timelineObserver?.disconnect();floatingObserver.disconnect();webLoader?.removeEventListener('toggle',onWebLoaderToggle);loaderSummary?.removeEventListener('pointerdown',onLoaderPointerDown,true);timeline?.removeEventListener('transitionrun',onTimelineTransition);timeline?.removeEventListener('transitionend',onTimelineTransition);root.removeEventListener('animator:workspace-camera-change',onCameraChange);window.removeEventListener('resize',scheduleViewport);window.removeEventListener('scroll',scheduleViewport,true);if(raf)cancelAnimationFrame(raf);api.setVisible(false);void api.close();};
}
