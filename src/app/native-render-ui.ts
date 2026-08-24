import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={motionTracks:[],transitions:[],candidates:[],reducedMotion:false};

export function mountNativeRenderUi(root:HTMLElement):()=>void{
  const api=window.animatorDesktop?.blink;if(!api)return()=>{};
  const details=root.querySelector<HTMLDetailsElement>('.webLoader'),input=details?.querySelector<HTMLInputElement>('[data-web-url]'),legacyMode=details?.querySelector<HTMLSelectElement>('[data-web-engine]'),browserOptions=details?.querySelector<HTMLElement>('[data-browser-options]'),browserEngine=details?.querySelector<HTMLSelectElement>('[data-browser-engine]'),profile=details?.querySelector<HTMLSelectElement>('[data-browser-profile]'),openButton=details?.querySelector<HTMLButtonElement>('[data-web-open]');
  if(!details||!input||!legacyMode||!browserOptions||!browserEngine||!profile||!openButton)return()=>{};
  legacyMode.value='browser';legacyMode.remove();
  const intro=details.querySelector<HTMLElement>('.webLoaderPanel>p');if(intro)intro.textContent='Blink se renderiza directamente dentro de Electron. No usa iframe, proxy, streaming ni reconstrucción.';
  const chromium=browserEngine.querySelector<HTMLOptionElement>('option[value="chromium"]');chromium?.remove();if(browserEngine.value==='chromium')browserEngine.value='firefox';
  browserOptions.querySelector<HTMLInputElement>('[data-runtime-install][value="chromium"]')?.closest('label')?.remove();
  openButton.textContent='Abrir en Blink';
  const blinkLabel=document.createElement('div');blinkLabel.className='nativeRenderPrimary';blinkLabel.innerHTML='<strong>Render</strong><span>Blink · Electron nativo</span>';input.after(blinkLabel);
  const instrumentationOption=document.createElement('label');instrumentationOption.className='blinkInstrumentationOption';instrumentationOption.innerHTML='<input type="checkbox" data-blink-instrumentation-option checked><span><strong>Inyectar inspector</strong><small>Desmarcar para navegar limpio. Conserva sesión, cookies, storage y caché.</small></span>';
  blinkLabel.after(instrumentationOption);
  const instrumentationCheckbox=instrumentationOption.querySelector<HTMLInputElement>('[data-blink-instrumentation-option]')!;
  const switcher=document.createElement('details');switcher.className='renderSwitcher';switcher.innerHTML='<summary>Cambiar render</summary>';
  const altButton=document.createElement('button');altButton.type='button';altButton.dataset.nativeAlternateOpen='';altButton.textContent='Abrir render alternativo';
  switcher.append(browserOptions,altButton);openButton.after(switcher);browserOptions.hidden=false;

  let instrumentationEnabled=true,togglingInstrumentation=false,opening=false,disposed=false,openRequest=0;
  const updateInstrumentationUi=():void=>{
    instrumentationCheckbox.checked=instrumentationEnabled;
    instrumentationOption.classList.toggle('clean',!instrumentationEnabled);
    instrumentationCheckbox.disabled=togglingInstrumentation||opening;
  };
  const setOpeningUi=(busy:boolean,mode:'blink'|'alternate'):void=>{opening=busy;openButton.disabled=busy;altButton.disabled=busy;if(busy){if(mode==='blink')openButton.textContent='Abriendo Blink…';else altButton.textContent='Abriendo…';}else{openButton.textContent='Abrir en Blink';altButton.textContent='Abrir render alternativo';}updateInstrumentationUi();};
  const setInputError=(message?:string):void=>{
    if(message){input.setAttribute('aria-invalid','true');input.title=message;}
    else{input.removeAttribute('aria-invalid');input.removeAttribute('title');}
  };
  const resolveInputUrl=():string|undefined=>{
    const url=normalizeUrl(input.value);if(!url){setInputError('Ingresá una dirección web válida');store.set({diagnostics:[...store.get().diagnostics,'error: Dirección web inválida'].slice(-100)});return undefined;}
    setInputError();input.value=url;return url;
  };
  const applyInstrumentation=async(desired:boolean):Promise<void>=>{
    if(togglingInstrumentation||opening||disposed)return;
    const project=store.get().project,blinkActive=Boolean(project&&!project.browserSessionId),startedContext=projectContext(project);
    if(!blinkActive){instrumentationEnabled=desired;updateInstrumentationUi();return;}
    togglingInstrumentation=true;updateInstrumentationUi();
    try{
      const state=await api.setInstrumentation(desired);if(disposed||projectContext(store.get().project)!==startedContext)return;instrumentationEnabled=state.enabled;
      const label=instrumentationEnabled?'activada':'desactivada';
      store.set({diagnostics:[...store.get().diagnostics,`info: Instrumentación Blink ${label}; página recargada sobre la misma sesión y caché`].slice(-100)});
    }catch(error){
      if(!disposed&&projectContext(store.get().project)===startedContext)store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});
    }finally{togglingInstrumentation=false;if(!disposed)updateInstrumentationUi();}
  };
  const openBlink=async():Promise<void>=>{
    const url=resolveInputUrl();if(!url||opening||disposed)return;const request=++openRequest,startedContext=projectContext(store.get().project);setOpeningUi(true,'blink');
    try{
      await api.close();if(disposed||request!==openRequest||projectContext(store.get().project)!==startedContext)return;
      const desired=instrumentationCheckbox.checked,state=await api.setInstrumentation(desired);if(disposed||request!==openRequest||projectContext(store.get().project)!==startedContext)return;instrumentationEnabled=state.enabled;updateInstrumentationUi();
      const project:ProjectDescriptor={id:`blink-${hash(url)}`,root:url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:url,kind:'remote'};
      store.set({project,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: Blink native render ${url}${instrumentationEnabled?'':' · clean'}`].slice(-100)});
      details.open=false;
    }catch(error){if(!disposed&&request===openRequest&&projectContext(store.get().project)===startedContext)store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{if(request===openRequest&&!disposed)setOpeningUi(false,'blink');}
  };
  const openAlternate=async():Promise<void>=>{
    const url=resolveInputUrl();if(!url||opening||disposed)return;const request=++openRequest,startedContext=projectContext(store.get().project);setOpeningUi(true,'alternate');
    try{
      const engine=browserEngine.value as BrowserEngine,selectedProfile=profile.value as BrowserProfile,width=selectedProfile==='mobile'?390:1100,height=selectedProfile==='mobile'?844:700;
      const response=await fetch('/api/browser-sessions/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,width,height,engine,profile:selectedProfile})}),session=await response.json() as{id?:string;url?:string;engine?:BrowserEngine;profile?:BrowserProfile;width?:number;height?:number;external?:boolean;error?:string};
      if(!response.ok||!session.id)throw new Error(session.error??'No se pudo abrir el render alternativo');
      if(disposed||request!==openRequest||projectContext(store.get().project)!==startedContext){void fetch(`/api/browser-sessions/${encodeURIComponent(session.id)}`,{method:'DELETE'}).catch(()=>{});return;}
      const project:ProjectDescriptor={id:session.id,root:session.url??url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:session.url??url,kind:'remote',browserSessionId:session.id,browserEngine:session.engine??engine,browserProfile:selectedProfile,browserWidth:session.width??width,browserHeight:session.height??height,browserExternal:session.external??false};
      store.set({project,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: ${engine==='firefox'?'Firefox':'WebKit'} render ${url}`].slice(-100)});details.open=false;
    }catch(error){if(!disposed&&request===openRequest&&projectContext(store.get().project)===startedContext)store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{if(request===openRequest&&!disposed)setOpeningUi(false,'alternate');}
  };
  const click=(event:MouseEvent):void=>{const target=event.target as Element|null;if(target?.closest('[data-web-open]')){event.preventDefault();event.stopImmediatePropagation();void openBlink();}else if(target?.closest('[data-native-alternate-open]')){event.preventDefault();event.stopImmediatePropagation();void openAlternate();}};
  const change=(event:Event):void=>{if(event.target===instrumentationCheckbox)void applyInstrumentation(instrumentationCheckbox.checked);};
  const inputEvent=():void=>setInputError();
  const key=(event:KeyboardEvent):void=>{if(event.key==='Enter'&&event.target===input){event.preventDefault();event.stopImmediatePropagation();void openBlink();}};
  details.addEventListener('click',click,true);details.addEventListener('change',change);details.addEventListener('keydown',key,true);input.addEventListener('input',inputEvent);updateInstrumentationUi();
  return()=>{disposed=true;openRequest++;details.removeEventListener('click',click,true);details.removeEventListener('change',change);details.removeEventListener('keydown',key,true);input.removeEventListener('input',inputEvent);blinkLabel.remove();instrumentationOption.remove();switcher.remove();};
}

function projectContext(project:ProjectDescriptor|undefined):string{return project?`${project.id}:${project.selectedEntry}`:'';}
function normalizeUrl(value:string):string|undefined{
  const raw=value.trim();if(!raw)return undefined;
  const hasScheme=/^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const local=/^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?::\d+)?(?:[/?#]|$)/i.test(raw);
  const candidate=hasScheme?raw:`${local?'http':'https'}://${raw}`;
  try{const url=new URL(candidate);return url.protocol==='http:'||url.protocol==='https:'?url.toString():undefined;}catch{return undefined;}
}
function hash(value:string):string{let result=2166136261;for(let index=0;index<value.length;index++){result^=value.charCodeAt(index);result=Math.imul(result,16777619);}return(result>>>0).toString(36);}
