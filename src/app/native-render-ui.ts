import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={motionTracks:[],transitions:[],candidates:[],reducedMotion:false};

export function mountNativeRenderUi(root:HTMLElement):()=>void{
  if(!window.animatorDesktop)return()=>{};
  const details=root.querySelector<HTMLDetailsElement>('.webLoader'),input=details?.querySelector<HTMLInputElement>('[data-web-url]'),legacyMode=details?.querySelector<HTMLSelectElement>('[data-web-engine]'),browserOptions=details?.querySelector<HTMLElement>('[data-browser-options]'),browserEngine=details?.querySelector<HTMLSelectElement>('[data-browser-engine]'),profile=details?.querySelector<HTMLSelectElement>('[data-browser-profile]'),openButton=details?.querySelector<HTMLButtonElement>('[data-web-open]');
  if(!details||!input||!legacyMode||!browserOptions||!browserEngine||!profile||!openButton)return()=>{};
  legacyMode.value='browser';legacyMode.hidden=true;
  const intro=details.querySelector<HTMLElement>('.webLoaderPanel>p');if(intro)intro.textContent='Blink se renderiza directamente dentro de Electron. No usa iframe, proxy, streaming ni reconstrucción.';
  const chromium=browserEngine.querySelector<HTMLOptionElement>('option[value="chromium"]');chromium?.remove();if(browserEngine.value==='chromium')browserEngine.value='firefox';
  openButton.textContent='Abrir en Blink';
  const blinkLabel=document.createElement('div');blinkLabel.className='nativeRenderPrimary';blinkLabel.innerHTML='<strong>Render</strong><span>Blink · Electron nativo</span>';input.after(blinkLabel);
  const switcher=document.createElement('details');switcher.className='renderSwitcher';switcher.innerHTML='<summary>Cambiar render</summary>';
  const altButton=document.createElement('button');altButton.type='button';altButton.dataset.nativeAlternateOpen='';altButton.textContent='Abrir render alternativo';
  switcher.append(browserOptions,altButton);openButton.after(switcher);browserOptions.hidden=false;

  let opening=false;
  const openBlink=async():Promise<void>=>{
    const url=normalizeUrl(input.value);if(!url||opening)return;opening=true;openButton.disabled=true;openButton.textContent='Abriendo Blink…';
    try{const project:ProjectDescriptor={id:`blink-${hash(url)}`,root:url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:url,kind:'remote'};store.set({project,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: Blink native render ${url}`].slice(-100)});details.open=false;}
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
  const click=(event:MouseEvent):void=>{const target=event.target as Element|null;if(target?.closest('[data-web-open]')){event.preventDefault();event.stopImmediatePropagation();void openBlink();}else if(target?.closest('[data-native-alternate-open]')){event.preventDefault();event.stopImmediatePropagation();void openAlternate();}};
  const key=(event:KeyboardEvent):void=>{if(event.key==='Enter'&&event.target===input){event.preventDefault();event.stopImmediatePropagation();void openBlink();}};
  details.addEventListener('click',click,true);details.addEventListener('keydown',key,true);
  return()=>{details.removeEventListener('click',click,true);details.removeEventListener('keydown',key,true);blinkLabel.remove();switcher.remove();};
}

function normalizeUrl(value:string):string|undefined{try{const url=new URL(value.trim());return url.protocol==='http:'||url.protocol==='https:'?url.toString():undefined;}catch{return undefined;}}
function hash(value:string):string{let result=2166136261;for(let index=0;index<value.length;index++){result^=value.charCodeAt(index);result=Math.imul(result,16777619);}return(result>>>0).toString(36);}
