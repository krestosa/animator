import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={motionTracks:[],transitions:[],candidates:[],reducedMotion:false};
const instrumentationIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l-5 7 5 7M16 5l5 7-5 7M14 3l-4 18"/></svg>';

export function mountNativeRenderUi(root:HTMLElement):()=>void{
  const api=window.animatorDesktop?.blink;if(!api)return()=>{};
  const details=root.querySelector<HTMLDetailsElement>('.webLoader'),input=details?.querySelector<HTMLInputElement>('[data-web-url]'),legacyMode=details?.querySelector<HTMLSelectElement>('[data-web-engine]'),browserOptions=details?.querySelector<HTMLElement>('[data-browser-options]'),browserEngine=details?.querySelector<HTMLSelectElement>('[data-browser-engine]'),profile=details?.querySelector<HTMLSelectElement>('[data-browser-profile]'),openButton=details?.querySelector<HTMLButtonElement>('[data-web-open]'),toolbar=root.querySelector<HTMLElement>('.toolbar');
  if(!details||!input||!legacyMode||!browserOptions||!browserEngine||!profile||!openButton||!toolbar)return()=>{};
  legacyMode.value='browser';legacyMode.remove();
  const intro=details.querySelector<HTMLElement>('.webLoaderPanel>p');if(intro)intro.textContent='Blink se renderiza directamente dentro de Electron. No usa iframe, proxy, streaming ni reconstrucción.';
  const chromium=browserEngine.querySelector<HTMLOptionElement>('option[value="chromium"]');chromium?.remove();if(browserEngine.value==='chromium')browserEngine.value='firefox';
  browserOptions.querySelector<HTMLInputElement>('[data-runtime-install][value="chromium"]')?.closest('label')?.remove();
  openButton.textContent='Abrir en Blink';
  const blinkLabel=document.createElement('div');blinkLabel.className='nativeRenderPrimary';blinkLabel.innerHTML='<strong>Render</strong><span>Blink · Electron nativo</span>';input.after(blinkLabel);
  const switcher=document.createElement('details');switcher.className='renderSwitcher';switcher.innerHTML='<summary>Cambiar render</summary>';
  const altButton=document.createElement('button');altButton.type='button';altButton.dataset.nativeAlternateOpen='';altButton.textContent='Abrir render alternativo';
  switcher.append(browserOptions,altButton);openButton.after(switcher);browserOptions.hidden=false;

  const instrumentationButton=document.createElement('button');
  instrumentationButton.type='button';instrumentationButton.className='blinkInstrumentationToggle active';instrumentationButton.dataset.blinkInstrumentation='';instrumentationButton.innerHTML=`${instrumentationIcon}<span data-blink-mode-label>Injected</span>`;instrumentationButton.setAttribute('aria-pressed','true');
  toolbar.insertBefore(instrumentationButton,toolbar.querySelector('.grow'));
  const instrumentationLabel=instrumentationButton.querySelector<HTMLElement>('[data-blink-mode-label]');
  let instrumentationEnabled=true,togglingInstrumentation=false;
  const updateInstrumentationUi=():void=>{
    const project=store.get().project,blinkActive=Boolean(project&&!project.browserSessionId);
    instrumentationButton.hidden=!blinkActive;
    instrumentationButton.classList.toggle('active',instrumentationEnabled);
    instrumentationButton.classList.toggle('clean',!instrumentationEnabled);
    instrumentationButton.setAttribute('aria-pressed',String(instrumentationEnabled));
    if(instrumentationLabel)instrumentationLabel.textContent=instrumentationEnabled?'Injected':'Clean';
    instrumentationButton.title=instrumentationEnabled?'Cambiar a Clean: quitar preload/CDP de Animator, conservar sesión, cookies, storage y caché':'Cambiar a Injected: reactivar la instrumentación de Animator';
    instrumentationButton.setAttribute('aria-label',instrumentationButton.title);
  };

  let opening=false;
  const openBlink=async():Promise<void>=>{
    const url=normalizeUrl(input.value);if(!url||opening)return;opening=true;openButton.disabled=true;openButton.textContent='Abriendo Blink…';
    try{
      await api.close();const state=await api.setInstrumentation(true);instrumentationEnabled=state.enabled;updateInstrumentationUi();
      const project:ProjectDescriptor={id:`blink-${hash(url)}`,root:url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:url,kind:'remote'};store.set({project,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: Blink native render ${url}`].slice(-100)});details.open=false;
    }
    finally{opening=false;openButton.disabled=false;openButton.textContent='Abrir en Blink';}
  };
  const openAlternate=async():Promise<void>=>{
    const url=normalizeUrl(input.value);if(!url||opening)return;opening=true;altButton.disabled=true;altButton.textContent='Abriendo…';
    try{
      const engine=browserEngine.value as BrowserEngine,selectedProfile=profile.value as BrowserProfile,width=selectedProfile==='mobile'?390:1100,height=selectedProfile==='mobile'?844:700;
      const response=await fetch('/api/browser-sessions/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,width,height,engine,profile:selectedProfile})}),session=await response.json() as{id?:string;url?:string;engine?:BrowserEngine;profile?:BrowserProfile;width?:number;height?:number;external?:boolean;error?:string};
      if(!response.ok||!session.id)throw new Error(session.error??'No se pudo abrir el render alternativo');
      const project:ProjectDescriptor={id:session.id,root:session.url??url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:session.url??url,kind:'remote',browserSessionId:session.id,browserEngine:session.engine??engine,browserProfile:session.profile??selectedProfile,browserWidth:session.width??width,browserHeight:session.height??height,browserExternal:session.external??false};
      store.set({project,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: ${engine==='firefox'?'Firefox':'WebKit'} render ${url}`].slice(-100)});details.open=false;
    }catch(error){store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{opening=false;altButton.disabled=false;altButton.textContent='Abrir render alternativo';}
  };
  const toggleInstrumentation=async():Promise<void>=>{
    const project=store.get().project;if(!project||project.browserSessionId||togglingInstrumentation)return;
    togglingInstrumentation=true;instrumentationButton.disabled=true;
    const desired=!instrumentationEnabled;
    try{
      const state=await api.setInstrumentation(desired);instrumentationEnabled=state.enabled;
      const label=instrumentationEnabled?'Injected':'Clean';
      store.set({diagnostics:[...store.get().diagnostics,`info: Blink ${label}; página recargada sobre la misma sesión y caché`].slice(-100)});
    }catch(error){store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{togglingInstrumentation=false;instrumentationButton.disabled=false;updateInstrumentationUi();}
  };
  const click=(event:MouseEvent):void=>{const target=event.target as Element|null;if(target?.closest('[data-web-open]')){event.preventDefault();event.stopImmediatePropagation();void openBlink();}else if(target?.closest('[data-native-alternate-open]')){event.preventDefault();event.stopImmediatePropagation();void openAlternate();}else if(target?.closest('[data-blink-instrumentation]')){event.preventDefault();event.stopImmediatePropagation();void toggleInstrumentation();}};
  const key=(event:KeyboardEvent):void=>{if(event.key==='Enter'&&event.target===input){event.preventDefault();event.stopImmediatePropagation();void openBlink();}};
  const unsubscribe=store.subscribe(updateInstrumentationUi);
  details.addEventListener('click',click,true);details.addEventListener('keydown',key,true);toolbar.addEventListener('click',click,true);updateInstrumentationUi();
  return()=>{unsubscribe();details.removeEventListener('click',click,true);details.removeEventListener('keydown',key,true);toolbar.removeEventListener('click',click,true);blinkLabel.remove();switcher.remove();instrumentationButton.remove();};
}

function normalizeUrl(value:string):string|undefined{try{const url=new URL(value.trim());return url.protocol==='http:'||url.protocol==='https:'?url.toString():undefined;}catch{return undefined;}}
function hash(value:string):string{let result=2166136261;for(let index=0;index<value.length;index++){result^=value.charCodeAt(index);result=Math.imul(result,16777619);}return(result>>>0).toString(36);}
