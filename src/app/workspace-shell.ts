import {store} from '../state/store';
import type {ProjectDescriptor} from '../types/domain';

const timelineIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h7M4 17h12"/><circle cx="17" cy="12" r="2"/></svg>';
const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
type ResourceTab={id:string;url:string;name:string};
type ResourceTabEvent=CustomEvent<{id:string;url:string;name:string}>;

export function mountWorkspaceShell(root:HTMLElement):()=>void{
  const app=root.querySelector<HTMLElement>('.app'),toolbar=root.querySelector<HTMLElement>('.toolbar'),timeline=root.querySelector<HTMLElement>('.timeline');
  if(!app||!toolbar||!timeline)return()=>{};
  const desktop=Boolean(window.animatorDesktop)||/\bElectron\//.test(navigator.userAgent);app.classList.toggle('desktopWorkspace',desktop);
  const tabs=document.createElement('div');tabs.className='workspaceTabs';tabs.innerHTML='<div class="workspaceBrand"><span class="workspaceMark" aria-hidden="true"></span><strong>Animator</strong></div><div class="workspaceTabList" role="tablist" aria-label="Workspace tabs"></div><div class="workspaceTabMeta"></div>';app.insertBefore(tabs,toolbar);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='iconButton timelineToggle';toggle.dataset.timelineToggle='';toggle.innerHTML=timelineIcon;toggle.setAttribute('aria-controls','animation-timeline');toolbar.insertBefore(toggle,toolbar.querySelector('.grow'));
  timeline.id='animation-timeline';const timelineTop=timeline.querySelector<HTMLElement>('.timelineTop'),close=document.createElement('button');close.type='button';close.className='timelineClose';close.dataset.timelineClose='';close.title='Hide timeline';close.setAttribute('aria-label','Hide timeline');close.innerHTML=closeIcon;timelineTop?.append(close);

  let open=!desktop,previousProject=store.get().project,activeResourceId='';const resourceTabs=new Map<string,ResourceTab>();
  const applyOpen=():void=>{app.classList.toggle('timeline-open',open);toggle.classList.toggle('active',open);toggle.setAttribute('aria-pressed',String(open));toggle.title=open?'Hide timeline':'Show timeline';toggle.setAttribute('aria-label',toggle.title);timeline.setAttribute('aria-hidden',String(!open));};
  const renderTabs=():void=>{
    const list=tabs.querySelector<HTMLElement>('.workspaceTabList'),meta=tabs.querySelector<HTMLElement>('.workspaceTabMeta');if(!list||!meta)return;const project=store.get().project;list.replaceChildren();
    if(project){for(const entry of project.entries.length?project.entries:['/']){const button=document.createElement('button');button.type='button';button.className='workspaceTab';button.dataset.workspaceEntry=entry;button.setAttribute('role','tab');const selected=!activeResourceId&&entry===project.selectedEntry;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.title=entry;button.innerHTML=`<span>${escapeHtml(entryLabel(entry,project))}</span>${selected?'<i aria-hidden="true"></i>':''}`;list.append(button);}}
    for(const tab of resourceTabs.values()){const button=document.createElement('button');button.type='button';button.className='workspaceTab workspaceResourceTab';button.dataset.resourceTab=tab.id;button.setAttribute('role','tab');const selected=activeResourceId===tab.id;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.title=tab.url;button.innerHTML=`<span>${escapeHtml(tab.name)}</span><span class="workspaceTabClose" data-resource-tab-close="${escapeHtml(tab.id)}" title="Close tab" aria-label="Close tab">×</span>`;list.append(button);}
    if(!project&&!resourceTabs.size){const empty=document.createElement('div');empty.className='workspaceTab workspaceTabEmpty';empty.textContent='No project open';list.append(empty);}meta.textContent=activeResourceId?(resourceTabs.get(activeResourceId)?.url??''):project?(project.kind==='remote'?hostLabel(project.sourceUrl??project.root):projectLabel(project.root)):'';
  };
  const selectEntry=(entry:string):void=>{const project=store.get().project;if(!project)return;activeResourceId='';void window.animatorDesktop?.blink.closeResource();if(entry!==project.selectedEntry)store.set({project:{...project,selectedEntry:entry},motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0});renderTabs();};
  const activateResource=async(id:string):Promise<void>=>{const tab=resourceTabs.get(id);if(!tab)return;activeResourceId=id;renderTabs();await window.animatorDesktop?.blink.openResource(tab.url);};
  const closeResourceTab=(id:string):void=>{const wasActive=id===activeResourceId;resourceTabs.delete(id);if(wasActive){activeResourceId='';void window.animatorDesktop?.blink.closeResource();}renderTabs();};
  const openResourceTab=(event:Event):void=>{const detail=(event as ResourceTabEvent).detail;if(!detail?.url)return;resourceTabs.set(detail.id,{id:detail.id,url:detail.url,name:detail.name});void activateResource(detail.id);};
  const click=(event:MouseEvent):void=>{const target=event.target as Element|null,closeId=target?.closest<HTMLElement>('[data-resource-tab-close]')?.dataset.resourceTabClose;if(closeId){event.stopPropagation();closeResourceTab(closeId);return;}const resourceId=target?.closest<HTMLElement>('[data-resource-tab]')?.dataset.resourceTab;if(resourceId){void activateResource(resourceId);return;}const entry=target?.closest<HTMLElement>('[data-workspace-entry]')?.dataset.workspaceEntry;if(entry!==undefined){selectEntry(entry);return;}if(target?.closest('[data-timeline-toggle]')){open=!open;applyOpen();return;}if(target?.closest('[data-timeline-close]')){open=false;applyOpen();}};
  const keydown=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&open&&desktop){open=false;applyOpen();}};
  const unsubscribe=store.subscribe(()=>{const project=store.get().project;if(project!==previousProject){if(project?.id!==previousProject?.id){resourceTabs.clear();activeResourceId='';void window.animatorDesktop?.blink.closeResource();}previousProject=project;renderTabs();}});
  root.addEventListener('click',click,true);window.addEventListener('keydown',keydown);window.addEventListener('animator:resource-tab-open',openResourceTab);renderTabs();applyOpen();
  return()=>{unsubscribe();root.removeEventListener('click',click,true);window.removeEventListener('keydown',keydown);window.removeEventListener('animator:resource-tab-open',openResourceTab);void window.animatorDesktop?.blink.closeResource();tabs.remove();toggle.remove();close.remove();app.classList.remove('desktopWorkspace','timeline-open');timeline.removeAttribute('aria-hidden');timeline.removeAttribute('id');};
}

function entryLabel(entry:string,project:ProjectDescriptor):string{const clean=entry.replace(/\\/g,'/').replace(/\/$/,'');const name=clean.split('/').filter(Boolean).at(-1);if(name)return name;return project.kind==='remote'?hostLabel(project.sourceUrl??project.root):projectLabel(project.root);}
function projectLabel(value:string):string{return value.replace(/\\/g,'/').replace(/\/$/,'').split('/').filter(Boolean).at(-1)??'Project';}
function hostLabel(value:string):string{try{return new URL(value).hostname||'Preview';}catch{return'Preview';}}
function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
