import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

export type PreviewColorScheme='auto'|'light'|'dark';
export const PREVIEW_THEME_EVENT='animator:preview-theme-change';

let activeMode:PreviewColorScheme='auto';

export function getPreviewColorScheme():PreviewColorScheme{return activeMode;}

export function setPreviewColorScheme(mode:PreviewColorScheme):void{
  if(activeMode===mode)return;
  activeMode=mode;
  window.dispatchEvent(new CustomEvent(PREVIEW_THEME_EVENT,{detail:{mode}}));
}

export function mountPreviewTheme(root:HTMLElement):()=>void{
  const chrome=root.querySelector<HTMLElement>('[data-preview-chrome]');if(!chrome)return()=>{};
  const control=document.createElement('label');control.className='previewThemeControl';control.dataset.previewThemeControl='';
  control.innerHTML='<span>Theme</span><select data-preview-theme aria-label="Preview theme"><option value="auto">Auto</option><option value="light">Light override</option><option value="dark">Dark override</option></select>';
  const select=control.querySelector<HTMLSelectElement>('[data-preview-theme]');if(!select)return()=>{};
  control.title='Theme is shared by every preview opened during this Animator session. Restarting Animator resets it to Auto.';
  let currentFrame:HTMLIFrameElement|null=null,lastBrowserProject='';
  const frame=()=>root.querySelector<HTMLIFrameElement>('[data-browser-snapshot-frame], [data-preview-frame]');
  const ensureMounted=():void=>{if(!control.isConnected)chrome.insertBefore(control,chrome.firstChild);};
  const render=():void=>{ensureMounted();select.disabled=!store.get().project;if(select.value!==activeMode)select.value=activeMode;control.dataset.mode=activeMode;};
  const apply=():void=>sendCommand(frame(),{type:'SET_COLOR_SCHEME',mode:activeMode});
  const onFrameLoad=():void=>apply();
  const bindFrame=():void=>{const next=frame();if(next===currentFrame)return;currentFrame?.removeEventListener('load',onFrameLoad);currentFrame=next;currentFrame?.addEventListener('load',onFrameLoad);if(currentFrame)queueMicrotask(apply);};
  const syncProject=():void=>{const project=store.get().project,browserProject=project?.browserSessionId?project.id:'';if(browserProject&&browserProject!==lastBrowserProject){lastBrowserProject=browserProject;queueMicrotask(apply);}else if(!browserProject)lastBrowserProject='';};
  const change=():void=>setPreviewColorScheme(select.value as PreviewColorScheme);
  const changed=():void=>{render();apply();};
  const chromeObserver=new MutationObserver(()=>{if(!control.isConnected)render();});chromeObserver.observe(chrome,{childList:true});
  const device=root.querySelector<HTMLElement>('[data-device]');const frameObserver=new MutationObserver(bindFrame);if(device)frameObserver.observe(device,{childList:true,subtree:true});
  const unsubscribe=store.subscribe(()=>{render();bindFrame();syncProject();});select.addEventListener('change',change);window.addEventListener(PREVIEW_THEME_EVENT,changed);bindFrame();render();syncProject();
  return()=>{chromeObserver.disconnect();frameObserver.disconnect();unsubscribe();select.removeEventListener('change',change);window.removeEventListener(PREVIEW_THEME_EVENT,changed);currentFrame?.removeEventListener('load',onFrameLoad);control.remove();};
}
