import { store } from '../state/store';
import type { ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={animations:[],transitions:[],candidates:[],reducedMotion:false};
const globe='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';

export function mountRemoteOpen(root:HTMLElement):()=>void{
  const toolbar=root.querySelector<HTMLElement>('.toolbar');if(!toolbar)return()=>{};
  const details=document.createElement('details');details.className='webLoader';
  details.innerHTML=`<summary title="Open web page" aria-label="Open web page">${globe}</summary><div class="webLoaderPanel"><b>Load web page</b><p>Choose Proxy or Browser preview.</p><input data-web-url spellcheck="false" inputmode="url" placeholder="https://example.com"><select data-web-engine><option value="proxy">Proxy</option><option value="browser">Browser</option></select><button data-web-open>Load URL</button></div>`;
  toolbar.insertBefore(details,toolbar.querySelector('.grow'));
  const input=details.querySelector<HTMLInputElement>('[data-web-url]')!,engine=details.querySelector<HTMLSelectElement>('[data-web-engine]')!;
  input.value=localStorage.getItem('animator.last-url')??'';engine.value=localStorage.getItem('animator.web-engine')==='browser'?'browser':'proxy';
  let opening=false;
  const open=async():Promise<void>=>{
    const url=input.value.trim();if(!url||opening)return;opening=true;const button=details.querySelector<HTMLButtonElement>('[data-web-open]');if(button){button.disabled=true;button.textContent='Loading…';}
    try{
      localStorage.setItem('animator.web-engine',engine.value);let body:ProjectDescriptor&{error?:string};
      if(engine.value==='browser'){
        const response=await fetch('/api/browser-sessions/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,width:1100,height:700})});
        const session=await response.json() as{id?:string;url?:string;error?:string};if(!response.ok||!session.id)throw new Error(session.error??'Could not start browser preview');
        body={id:session.id,root:session.url??url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:session.url??url,kind:'remote',browserSessionId:session.id};
      }else{
        const response=await fetch('/api/projects/open-url',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})});body=await response.json() as ProjectDescriptor&{error?:string};if(!response.ok)throw new Error(body.error??'Could not load web page');
      }
      localStorage.setItem('animator.last-url',body.sourceUrl??url);store.set({project:body,analysis:emptyAnalysis,animations:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: ${body.browserSessionId?'Browser':'Proxy'} preview ${body.sourceUrl??url}`].slice(-100)});details.open=false;
    }catch(error){store.set({diagnostics:[...store.get().diagnostics,`error: ${error instanceof Error?error.message:String(error)}`].slice(-100)});}
    finally{opening=false;if(button){button.disabled=false;button.textContent='Load URL';}}
  };
  const click=(event:MouseEvent):void=>{if((event.target as Element|null)?.closest('[data-web-open]'))void open();};
  const key=(event:KeyboardEvent):void=>{if(event.key==='Enter'&&event.target===input){event.preventDefault();void open();}};
  details.addEventListener('click',click);details.addEventListener('keydown',key);
  return()=>{details.removeEventListener('click',click);details.removeEventListener('keydown',key);details.remove();};
}
