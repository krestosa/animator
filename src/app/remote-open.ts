import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={animations:[],transitions:[],candidates:[],reducedMotion:false};
const globe='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';
type RuntimeStatus={engine:BrowserEngine;label:string;installed:boolean};

export function mountRemoteOpen(root:HTMLElement):()=>void{
  const toolbar=root.querySelector<HTMLElement>('.toolbar');if(!toolbar)return()=>{};
  const details=document.createElement('details');details.className='webLoader';
  details.innerHTML=`<summary title="Open web page" aria-label="Open web page">${globe}</summary><div class="webLoaderPanel">
    <b>Load web page</b><p>Proxy keeps the old preview. Browser runs the real page in a local Playwright engine.</p>
    <input data-web-url spellcheck="false" inputmode="url" placeholder="https://example.com"><select data-web-engine><option value="proxy">Proxy</option><option value="browser">Browser</option></select>
    <div class="browserOptions" data-browser-options>
      <label>Engine<select data-browser-engine><option value="chromium">Chromium</option><option value="firefox">Firefox</option><option value="webkit">Safari / WebKit</option></select></label>
      <label>Device<select data-browser-profile><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
      <div class="browserRuntimeManager"><span>Install locally</span><label><input type="checkbox" value="chromium" data-runtime-install checked> Chromium</label><label><input type="checkbox" value="firefox" data-runtime-install> Firefox</label><label><input type="checkbox" value="webkit" data-runtime-install> Safari / WebKit</label><button type="button" data-browser-install>Install selected</button><small data-browser-runtime-status>Checking runtimes…</small></div>
    </div>
    <button data-web-open>Load URL</button>
  </div>`;
  toolbar.insertBefore(details,toolbar.querySelector('.grow'));
  const input=details.querySelector<HTMLInputElement>('[data-web-url]')!,engine=details.querySelector<HTMLSelectElement>('[data-web-engine]')!,browserEngine=details.querySelector<HTMLSelectElement>('[data-browser-engine]')!,profile=details.querySelector<HTMLSelectElement>('[data-browser-profile]')!,browserOptions=details.querySelector<HTMLElement>('[data-browser-options]')!,runtimeStatus=details.querySelector<HTMLElement>('[data-browser-runtime-status]')!;
  input.value=localStorage.getItem('animator.last-url')??'';engine.value=localStorage.getItem('animator.web-engine')==='browser'?'browser':'proxy';browserEngine.value=storedEngine();profile.value=localStorage.getItem('animator.browser-profile')==='mobile'?'mobile':'desktop';
  let opening=false,installing=false,disposed=false;
  const syncMode=():void=>{browserOptions.hidden=engine.value!=='browser';};
  const renderRuntimeStatus=(runtimes:RuntimeStatus[]):void=>{if(!disposed)runtimeStatus.textContent=runtimes.map(runtime=>`${runtime.label}: ${runtime.installed?'installed':'not installed'}`).join(' · ');};
  const refreshRuntimes=async():Promise<void>=>{try{const response=await fetch('/api/browser-runtimes',{cache:'no-store'}),body=await response.json() as{runtimes?:RuntimeStatus[]};if(disposed)return;if(response.ok&&body.runtimes)renderRuntimeStatus(body.runtimes);else runtimeStatus.textContent='Could not read browser runtimes';}catch{if(!disposed)runtimeStatus.textContent='Could not read browser runtimes';}};
  const install=async():Promise<void>=>{
    if(disposed||installing)return;const selected=[...details.querySelectorAll<HTMLInputElement>('[data-runtime-install]:checked')].map(item=>item.value as BrowserEngine);if(!selected.length)return;
    installing=true;const button=details.querySelector<HTMLButtonElement>('[data-browser-install]');if(button){button.disabled=true;button.textContent='Installing…';}runtimeStatus.textContent='Installing in .animator-browsers/…';
    try{const response=await fetch('/api/browser-runtimes/install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({engines:selected})}),body=await response.json() as{runtimes?:RuntimeStatus[];error?:string};if(!response.ok)throw new Error(body.error??'Browser installation failed');if(body.runtimes)renderRuntimeStatus(body.runtimes);}
    catch(error){if(!disposed)runtimeStatus.textContent=error instanceof Error?error.message:String(error);}finally{installing=false;if(!disposed&&button){button.disabled=false;button.textContent='Install selected';}}
  };
  const open=async():Promise<void>=>{
    const url=input.value.trim();if(!url||opening||disposed)return;opening=true;const startedContext=projectContext(store.get().project),button=details.querySelector<HTMLButtonElement>('[data-web-open]');if(button){button.disabled=true;button.textContent=engine.value==='browser'?'Starting browser…':'Loading…';}
    try{
      localStorage.setItem('animator.web-engine',engine.value);localStorage.setItem('animator.browser-engine',browserEngine.value);localStorage.setItem('animator.browser-profile',profile.value);let body:ProjectDescriptor&{error?:string};
      if(engine.value==='browser'){
        const selectedEngine=browserEngine.value as BrowserEngine,selectedProfile=profile.value as BrowserProfile,width=selectedProfile==='mobile'?390:1100,height=selectedProfile==='mobile'?844:700;
        const response=await fetch('/api/browser-sessions/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,width,height,engine:selectedEngine,profile:selectedProfile})});
        const session=await response.json() as{id?:string;url?:string;engine?:BrowserEngine;profile?:BrowserProfile;width?:number;height?:number;external?:boolean;error?:string};if(!response.ok||!session.id)throw new Error(session.error??'Could not start browser preview');
        body={id:session.id,root:session.url??url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:session.url??url,kind:'remote',browserSessionId:session.id,browserEngine:session.engine??selectedEngine,browserProfile:session.profile??selectedProfile,browserWidth:session.width??width,browserHeight:session.height??height,browserExternal:session.external??false};void refreshRuntimes();
      }else{
        const response=await fetch('/api/projects/open-url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});body=await response.json() as ProjectDescriptor&{error?:string};if(!response.ok)throw new Error(body.error??'Could not load web page');
      }
      const current=store.get().project,stale=disposed||(projectContext(current)!==startedContext&&current?.id!==body.id);if(stale){if(body.browserSessionId)void fetch(`/api/browser-sessions/${encodeURIComponent(body.browserSessionId)}`,{method:'DELETE'}).catch(()=>{});return;}
      localStorage.setItem('animator.last-url',body.sourceUrl??url);store.set({project:body,analysis:emptyAnalysis,animations:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: ${body.browserSessionId?`${browserLabel(body.browserEngine)} ${body.browserProfile??'desktop'}`:'Proxy'} preview ${body.sourceUrl??url}`].slice(-100)});details.open=false;
    }catch(error){if(!disposed)store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{opening=false;if(!disposed&&button){button.disabled=false;button.textContent='Load URL';}}
  };
  const click=(event:MouseEvent):void=>{const target=(event.target as Element|null);if(target?.closest('[data-web-open]'))void open();else if(target?.closest('[data-browser-install]'))void install();};
  const change=():void=>{syncMode();localStorage.setItem('animator.web-engine',engine.value);localStorage.setItem('animator.browser-engine',browserEngine.value);localStorage.setItem('animator.browser-profile',profile.value);};
  const key=(event:KeyboardEvent):void=>{if(event.key==='Enter'&&event.target===input){event.preventDefault();void open();}};
  details.addEventListener('click',click);details.addEventListener('change',change);details.addEventListener('keydown',key);syncMode();void refreshRuntimes();
  return()=>{disposed=true;details.removeEventListener('click',click);details.removeEventListener('change',change);details.removeEventListener('keydown',key);details.remove();};
}

function projectContext(project:ProjectDescriptor|undefined):string{return project?`${project.id}:${project.selectedEntry}`:'';}
function storedEngine():BrowserEngine{const value=localStorage.getItem('animator.browser-engine');return value==='firefox'?'firefox':value==='webkit'?'webkit':'chromium';}
function browserLabel(engine:BrowserEngine|undefined):string{return engine==='firefox'?'Firefox':engine==='webkit'?'Safari / WebKit':'Chromium';}
