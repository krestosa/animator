export type PreviewColorScheme='system'|'light'|'dark';
export const PREVIEW_THEME_EVENT='animator:preview-theme-change';
const STORAGE_KEY='animator.previewColorScheme';
const MODES:PreviewColorScheme[]=['system','light','dark'];
const LABELS:Record<PreviewColorScheme,{icon:string;label:string}>={system:{icon:'◐',label:'System'},light:{icon:'☀',label:'Light'},dark:{icon:'☾',label:'Dark'}};

export function getPreviewColorScheme():PreviewColorScheme{
  try{const value=localStorage.getItem(STORAGE_KEY);return value==='light'||value==='dark'||value==='system'?value:'system';}catch{return 'system';}
}

export function setPreviewColorScheme(mode:PreviewColorScheme):void{
  try{localStorage.setItem(STORAGE_KEY,mode);}catch{}
  window.dispatchEvent(new CustomEvent<PreviewColorScheme>(PREVIEW_THEME_EVENT,{detail:mode}));
}

export function mountPreviewTheme(root:HTMLElement):()=>void{
  const chrome=root.querySelector<HTMLElement>('[data-preview-chrome]');if(!chrome)return()=>{};
  const button=document.createElement('button');button.type='button';button.className='previewThemeButton';button.dataset.previewTheme='';
  const ensureMounted=():void=>{if(!button.isConnected)chrome.insertBefore(button,chrome.firstChild);};
  const render=():void=>{ensureMounted();const mode=getPreviewColorScheme(),meta=LABELS[mode];if(button.dataset.mode!==mode)button.dataset.mode=mode;const markup=`<span aria-hidden="true">${meta.icon}</span><b>${meta.label}</b>`;if(button.innerHTML!==markup)button.innerHTML=markup;const title=`Preview color scheme: ${meta.label}. Click to switch.`;if(button.title!==title)button.title=title;if(button.getAttribute('aria-label')!==title)button.setAttribute('aria-label',title);};
  const click=():void=>{const current=getPreviewColorScheme(),index=MODES.indexOf(current),next=MODES[(index+1)%MODES.length]??'system';setPreviewColorScheme(next);render();};
  const changed=():void=>render();
  const observer=new MutationObserver(()=>{if(!button.isConnected){ensureMounted();render();}});observer.observe(chrome,{childList:true});
  button.addEventListener('click',click);window.addEventListener(PREVIEW_THEME_EVENT,changed);render();
  return()=>{observer.disconnect();button.removeEventListener('click',click);window.removeEventListener(PREVIEW_THEME_EVENT,changed);button.remove();};
}
