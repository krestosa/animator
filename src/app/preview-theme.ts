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
  const button=document.createElement('button');button.type='button';button.className='previewThemeButton';button.dataset.previewTheme='';chrome.insertBefore(button,chrome.firstChild);
  const render=():void=>{const mode=getPreviewColorScheme(),meta=LABELS[mode];button.dataset.mode=mode;button.innerHTML=`<span aria-hidden="true">${meta.icon}</span><b>${meta.label}</b>`;button.title=`Preview color scheme: ${meta.label}. Click to switch.`;button.setAttribute('aria-label',button.title);};
  const click=():void=>{const current=getPreviewColorScheme(),index=MODES.indexOf(current),next=MODES[(index+1)%MODES.length]??'system';setPreviewColorScheme(next);render();};
  const changed=():void=>render();
  button.addEventListener('click',click);window.addEventListener(PREVIEW_THEME_EVENT,changed);render();
  return()=>{button.removeEventListener('click',click);window.removeEventListener(PREVIEW_THEME_EVENT,changed);button.remove();};
}
