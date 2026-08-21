import { groupAnimations } from '../editor/grouping';
import { sendCommand } from '../preview/bridge';
import { store } from '../state/store';

const icons:Record<string,string>={
  folder:'<svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v10H3z"/></svg>',
  path:'<svg viewBox="0 0 24 24"><path d="M5 12h14M15 8l4 4-4 4"/></svg>',
  pick:'<svg viewBox="0 0 24 24"><path d="M5 3l13 7-6 2-2 6z"/></svg>',
  record:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>',
  prev:'<svg viewBox="0 0 24 24"><path d="M7 5v14M18 6l-8 6 8 6z"/></svg>',
  restart:'<svg viewBox="0 0 24 24"><path d="M5 7v5h5M6 11a7 7 0 1 1 1 6"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  next:'<svg viewBox="0 0 24 24"><path d="M17 5v14M6 6l8 6-8 6z"/></svg>',
  clear:'<svg viewBox="0 0 24 24"><path d="M4 15l8-8 7 7-5 5H9zM14 19h6"/></svg>',
  undo:'<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5M5 12h8a6 6 0 0 1 6 6"/></svg>',
  redo:'<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5M19 12h-8a6 6 0 0 0-6 6"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
};

export function mountUiPolish(root:HTMLElement):()=>void {
  const toolbar=root.querySelector<HTMLElement>('.toolbar');
  if(!toolbar)return()=>{};
  const more=buildToolbar(root,toolbar);
  const status=document.createElement('span');status.className='previewMode';status.textContent='LIVE';
  root.querySelector<HTMLElement>('[data-preview-chrome]')?.append(status);
  let raf=0;
  const schedule=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;applyGrouping(root);ensurePreviewStatus(root,status);});};
  const unsubscribe=store.subscribe(schedule);
  const observer=new MutationObserver(schedule);observer.observe(root,{subtree:true,childList:true});
  const capture=(event:Event)=>{
    const target=(event.target as Element|null)?.closest<HTMLElement>('button,[data-timeline]');
    if(!target)return;
    const frame=root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
    const action=target.dataset.action;
    if(action==='play'){
      status.textContent='PLAY';status.dataset.mode='play';
      sendCommand(frame,{type:'SCRUB_TIMELINE',time:store.get().playhead});
      queueMicrotask(()=>sendCommand(frame,{type:'PLAY_ALL'}));
    }else if(action==='pause'){
      status.textContent='PAUSED';status.dataset.mode='paused';
    }else if(action==='restart'){
      status.textContent='PLAY';status.dataset.mode='play';
    }else if(target.matches('[data-timeline]')){
      status.textContent='SEEK';status.dataset.mode='seek';
    }
  };
  root.addEventListener('pointerdown',capture,true);
  root.addEventListener('click',capture,true);
  schedule();
  return()=>{unsubscribe();observer.disconnect();if(raf)cancelAnimationFrame(raf);root.removeEventListener('pointerdown',capture,true);root.removeEventListener('click',capture,true);more.remove();status.remove();};
}

function buildToolbar(root:HTMLElement,toolbar:HTMLElement):HTMLDetailsElement {
  setIcon(toolbar,'[data-action="pick-folder"]','folder','Open folder');
  setIcon(toolbar,'[data-action="open-project"]','path','Open entered path');
  setIcon(toolbar,'[data-action="picker"]','pick','Pick element');
  setIcon(toolbar,'[data-action="record"]','record','Record interactions');
  setIcon(toolbar,'[data-action="previous-event"]','prev','Previous event');
  setIcon(toolbar,'[data-action="restart"]','restart','Restart timeline');
  setIcon(toolbar,'[data-action="play"]','play','Play timeline');
  setIcon(toolbar,'[data-action="pause"]','pause','Pause timeline');
  setIcon(toolbar,'[data-action="next-event"]','next','Next event');
  setIcon(toolbar,'[data-action="clear-overrides"]','clear','Clear temporary overrides');
  setIcon(toolbar,'[data-action="undo"]','undo','Undo');
  setIcon(toolbar,'[data-action="redo"]','redo','Redo');
  const extras=toolbar.querySelector<HTMLElement>('.extraControls');
  const newMotion=document.createElement('button');newMotion.dataset.openCreateMotion='';newMotion.className='iconButton primaryIcon';newMotion.title='Create animation';newMotion.setAttribute('aria-label','Create animation');newMotion.innerHTML=icons.plus;
  const details=document.createElement('details');details.className='toolbarMore';details.innerHTML=`<summary title="More tools" aria-label="More tools">${icons.more}</summary><div class="toolbarMenu"><b>Project & editor</b></div>`;
  const menu=details.querySelector<HTMLElement>('.toolbarMenu')!;
  const path=toolbar.querySelector<HTMLElement>('[data-path-input]');
  const openPath=toolbar.querySelector<HTMLElement>('[data-action="open-project"]');
  const reduced=toolbar.querySelector<HTMLElement>('.toolbarToggle:has([data-reduced-motion])');
  const clear=toolbar.querySelector<HTMLElement>('[data-action="clear-overrides"]');
  const undo=toolbar.querySelector<HTMLElement>('[data-action="undo"]');
  const redo=toolbar.querySelector<HTMLElement>('[data-action="redo"]');
  const row=document.createElement('div');row.className='menuPathRow';if(path)row.append(path);if(openPath)row.append(openPath);menu.append(row);
  if(reduced)menu.append(reduced);
  const editRow=document.createElement('div');editRow.className='menuActionRow';if(clear)editRow.append(clear);if(undo)editRow.append(undo);if(redo)editRow.append(redo);menu.append(editRow);
  if(extras){menu.append(extras);extras.querySelector<HTMLElement>('[data-open-create-motion]')?.classList.add('menuDuplicate');}
  const grow=toolbar.querySelector('.grow');toolbar.insertBefore(newMotion,grow);toolbar.insertBefore(details,grow);
  return details;
}

function setIcon(root:HTMLElement,selector:string,icon:string,label:string):void {
  const button=root.querySelector<HTMLButtonElement>(selector);if(!button)return;button.classList.add('iconButton');button.title=label;button.setAttribute('aria-label',label);button.innerHTML=icons[icon]??'';
}

function applyGrouping(root:HTMLElement):void {
  const state=store.get();const groups=groupAnimations(state.animations,state.selectedAnimationId);const byId=new Map<string,(typeof groups)[number]>();for(const group of groups)for(const animation of group.instances)byId.set(animation.id,group);
  const motionRows=[...root.querySelectorAll<HTMLButtonElement>('.motionRows [data-animation-id]')];
  for(const row of motionRows){row.hidden=false;row.querySelector('.groupCount')?.remove();}
  for(const group of groups){
    const rows=motionRows.filter(row=>group.instances.some(item=>item.id===row.dataset.animationId));if(rows.length<2)continue;
    const representative=rows.find(row=>row.dataset.animationId===group.representative.id)??rows[0];if(!representative)continue;
    for(const row of rows)if(row!==representative)row.hidden=true;
    representative.classList.toggle('selected',group.instances.some(item=>item.id===state.selectedAnimationId));
    const count=document.createElement('b');count.className='groupCount';count.textContent=`×${group.instances.length}`;representative.append(count);
  }

  const tracks=[...root.querySelectorAll<HTMLButtonElement>('[data-tracks] [data-animation-id]')];
  for(const track of tracks){track.hidden=false;track.querySelectorAll('.groupInstanceClip,.groupCount').forEach(item=>item.remove());}
  for(const group of groups){
    const groupTracks=tracks.filter(track=>group.instances.some(item=>item.id===track.dataset.animationId));if(groupTracks.length<2)continue;
    const representative=groupTracks.find(track=>track.dataset.animationId===group.representative.id)??groupTracks[0];if(!representative)continue;
    const label=representative.querySelector<HTMLElement>('.trackLabel');if(label){const count=document.createElement('b');count.className='groupCount';count.textContent=`×${group.instances.length}`;label.append(count);}
    representative.classList.toggle('selected',group.instances.some(item=>item.id===state.selectedAnimationId));
    const seen=new Set<string>();
    const representativeClip=representative.querySelector<HTMLElement>('.clip');if(representativeClip)seen.add(`${representativeClip.style.left}|${representativeClip.style.width}`);
    for(const track of groupTracks){if(track===representative)continue;track.hidden=true;const clip=track.querySelector<HTMLElement>('.clip');if(!clip)continue;const signature=`${clip.style.left}|${clip.style.width}`;if(seen.has(signature))continue;seen.add(signature);const clone=clip.cloneNode(true) as HTMLElement;clone.classList.add('groupInstanceClip');clone.querySelectorAll('.keyframeMarker').forEach(marker=>marker.remove());representative.append(clone);}
  }
  const visibleGroups=new Set(motionRows.filter(row=>!row.hidden).map(row=>byId.get(row.dataset.animationId??'')?.key).filter(Boolean));
  const heading=root.querySelector<HTMLElement>('[data-motion-region] h3 small');if(heading)heading.textContent=String(visibleGroups.size||groups.length);
}

function ensurePreviewStatus(root:HTMLElement,status:HTMLElement):void {
  const chrome=root.querySelector<HTMLElement>('[data-preview-chrome]');if(chrome&&!status.isConnected)chrome.append(status);
}
