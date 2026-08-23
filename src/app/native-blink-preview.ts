import { store } from '../state/store';

export function mountNativeBlinkPreview(root:HTMLElement):()=>void{
  const api=window.animatorDesktop?.blink,device=root.querySelector<HTMLElement>('[data-device]');if(!api||!device)return()=>{};
  let disposed=false,currentKey='',generation=0,raf=0;

  const removeLegacyFrame=():void=>{if(store.get().project?.browserSessionId)return;device.querySelectorAll<HTMLIFrameElement>('[data-preview-frame]').forEach(frame=>frame.remove());};
  const syncViewport=():void=>{
    raf=0;if(disposed||store.get().project?.browserSessionId)return;
    const rect=device.getBoundingClientRect(),layoutWidth=Math.max(1,device.offsetWidth||rect.width),zoomFactor=Math.max(.05,rect.width/layoutWidth);
    if(rect.width<1||rect.height<1)return;
    api.setViewport({x:rect.left,y:rect.top,width:rect.width,height:rect.height,zoomFactor});
  };
  const scheduleViewport=():void=>{if(!disposed&&!raf)raf=requestAnimationFrame(syncViewport);};

  const resolveUrl=async():Promise<string|undefined>=>{
    const project=store.get().project;if(!project||project.browserSessionId)return undefined;
    if(project.sourceUrl&&project.kind==='remote')return project.sourceUrl;
    const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/native-preview?entry=${encodeURIComponent(project.selectedEntry)}`,{cache:'no-store'}),body=await response.json() as{url?:string;error?:string};
    if(!response.ok||!body.url)throw new Error(body.error??'Native preview unavailable');return body.url;
  };

  const sync=async():Promise<void>=>{
    const project=store.get().project;if(!project||project.browserSessionId){currentKey='';generation++;await api.close();return;}
    removeLegacyFrame();const key=`${project.id}:${project.selectedEntry}:${project.sourceUrl??''}`;scheduleViewport();if(key===currentKey)return;
    currentKey=key;const request=++generation;
    try{const url=await resolveUrl();if(disposed||request!==generation||!url)return;await api.open(url);removeLegacyFrame();scheduleViewport();}
    catch(error){if(disposed||request!==generation)return;store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
  };

  const unsubscribe=store.subscribe(()=>void sync());
  const mutations=new MutationObserver(()=>{removeLegacyFrame();scheduleViewport();});mutations.observe(device,{childList:true,attributes:true,attributeFilter:['style','class']});
  const resize=new ResizeObserver(scheduleViewport);resize.observe(device);if(device.parentElement)resize.observe(device.parentElement);
  window.addEventListener('resize',scheduleViewport);window.addEventListener('scroll',scheduleViewport,true);
  void sync();
  return()=>{disposed=true;generation++;unsubscribe();mutations.disconnect();resize.disconnect();window.removeEventListener('resize',scheduleViewport);window.removeEventListener('scroll',scheduleViewport,true);if(raf)cancelAnimationFrame(raf);void api.close();};
}
