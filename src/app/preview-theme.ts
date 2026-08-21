import { store } from '../state/store';

export type PreviewColorScheme='auto'|'light'|'dark';
export const PREVIEW_THEME_EVENT='animator:preview-theme-change';
const STORAGE_PREFIX='animator.previewColorScheme:';

function currentProjectId():string|undefined{return store.get().project?.id;}
function storageKey(projectId:string):string{return `${STORAGE_PREFIX}${projectId}`;}

export function getPreviewColorScheme(projectId:string|undefined=currentProjectId()):PreviewColorScheme{
  if(!projectId)return 'auto';
  try{const value=localStorage.getItem(storageKey(projectId));return value==='light'||value==='dark'?value:'auto';}catch{return 'auto';}
}

export function setPreviewColorScheme(mode:PreviewColorScheme,projectId:string|undefined=currentProjectId()):void{
  if(!projectId)return;
  try{if(mode==='auto')localStorage.removeItem(storageKey(projectId));else localStorage.setItem(storageKey(projectId),mode);}catch{}
  window.dispatchEvent(new CustomEvent(PREVIEW_THEME_EVENT,{detail:{mode,projectId}}));
}

export function mountPreviewTheme(root:HTMLElement):()=>void{
  const chrome=root.querySelector<HTMLElement>('[data-preview-chrome]');if(!chrome)return()=>{};
  const control=document.createElement('label');control.className='previewThemeControl';control.dataset.previewThemeControl='';
  control.innerHTML='<span>Theme</span><select data-preview-theme aria-label="Preview theme"><option value="auto">Auto</option><option value="light">Light override</option><option value="dark">Dark override</option></select>';
  const select=control.querySelector<HTMLSelectElement>('[data-preview-theme]');if(!select)return()=>{};
  control.title='Auto preserves the website default. Light and Dark override prefers-color-scheme only for this project.';
  const ensureMounted=():void=>{if(!control.isConnected)chrome.insertBefore(control,chrome.firstChild);};
  const render=():void=>{ensureMounted();const projectId=currentProjectId(),mode=getPreviewColorScheme(projectId);select.disabled=!projectId;if(select.value!==mode)select.value=mode;control.dataset.mode=mode;};
  const change=():void=>{setPreviewColorScheme(select.value as PreviewColorScheme);render();};
  const observer=new MutationObserver(()=>{if(!control.isConnected)render();});observer.observe(chrome,{childList:true});
  const unsubscribe=store.subscribe(render);select.addEventListener('change',change);window.addEventListener(PREVIEW_THEME_EVENT,render);render();
  return()=>{observer.disconnect();unsubscribe();select.removeEventListener('change',change);window.removeEventListener(PREVIEW_THEME_EVENT,render);control.remove();};
}
