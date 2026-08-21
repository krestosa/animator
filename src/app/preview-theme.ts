import { store } from '../state/store';
import type { ProjectDescriptor } from '../types/domain';

export type PreviewColorScheme='auto'|'light'|'dark';
export const PREVIEW_THEME_EVENT='animator:preview-theme-change';

let activeParent:string|undefined;
let activeMode:PreviewColorScheme='auto';

function projectParent(project:ProjectDescriptor|undefined):string|undefined{
  if(!project)return undefined;
  if(project.kind==='remote'&&project.sourceUrl){
    try{
      const url=new URL(project.sourceUrl);const first=url.pathname.split('/').filter(Boolean)[0];
      return first?`${url.origin}/${first}/`:url.origin+'/';
    }catch{}
  }
  return `local:${project.root}`;
}

function syncParent():string|undefined{
  const parent=projectParent(store.get().project);
  if(parent!==activeParent){activeParent=parent;activeMode='auto';}
  return parent;
}

export function getPreviewColorScheme():PreviewColorScheme{
  syncParent();return activeMode;
}

export function setPreviewColorScheme(mode:PreviewColorScheme):void{
  const parent=syncParent();if(!parent)return;
  activeMode=mode;
  window.dispatchEvent(new CustomEvent(PREVIEW_THEME_EVENT,{detail:{mode,parent}}));
}

export function mountPreviewTheme(root:HTMLElement):()=>void{
  const chrome=root.querySelector<HTMLElement>('[data-preview-chrome]');if(!chrome)return()=>{};
  const control=document.createElement('label');control.className='previewThemeControl';control.dataset.previewThemeControl='';
  control.innerHTML='<span>Theme</span><select data-preview-theme aria-label="Preview theme"><option value="auto">Auto</option><option value="light">Light override</option><option value="dark">Dark override</option></select>';
  const select=control.querySelector<HTMLSelectElement>('[data-preview-theme]');if(!select)return()=>{};
  control.title='Auto preserves the website default. Overrides last only while this parent site/project remains loaded.';
  const ensureMounted=():void=>{if(!control.isConnected)chrome.insertBefore(control,chrome.firstChild);};
  const render=():void=>{ensureMounted();const project=store.get().project,mode=getPreviewColorScheme();select.disabled=!project;if(select.value!==mode)select.value=mode;control.dataset.mode=mode;};
  const change=():void=>{setPreviewColorScheme(select.value as PreviewColorScheme);render();};
  const observer=new MutationObserver(()=>{if(!control.isConnected)render();});observer.observe(chrome,{childList:true});
  const unsubscribe=store.subscribe(render);select.addEventListener('change',change);window.addEventListener(PREVIEW_THEME_EVENT,render);render();
  return()=>{observer.disconnect();unsubscribe();select.removeEventListener('change',change);window.removeEventListener(PREVIEW_THEME_EVENT,render);control.remove();};
}
