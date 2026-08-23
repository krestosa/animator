const icons={
  project:'<svg viewBox="0 0 24 24"><path d="M4 5h6l2 2h8v12H4z"/></svg>',
  motion:'<svg viewBox="0 0 24 24"><path d="M3 12h3l2-6 4 12 3-9 2 6h4"/></svg>',
  elements:'<svg viewBox="0 0 24 24"><path d="M12 3l8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4"/></svg>',
  assets:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M6 17l4-4 3 3 2-2 3 3"/></svg>',
  dom:'<svg viewBox="0 0 24 24"><path d="M8 4H4v16h4M16 4h4v16h-4M10 8l4 4-4 4"/></svg>',
  events:'<svg viewBox="0 0 24 24"><path d="M5 4v16M5 8h6l2 3h6M5 16h5l2-3h7"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="5"/><path d="M14 14l6 6"/></svg>',
  panel:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16"/></svg>'
} as const;

type PanelKind=keyof typeof icons;
type PanelRecord={section:HTMLElement;button:HTMLButtonElement;id:string};

export function mountLeftPanelTabs(root:HTMLElement):()=>void{
  const panel=root.querySelector<HTMLElement>('.leftPanel');if(!panel)return()=>{};
  const rail=document.createElement('nav');rail.className='leftPanelTabRail';rail.setAttribute('aria-label','Workspace panels');
  const content=document.createElement('div');content.className='leftPanelTabContent';
  const records=new Map<HTMLElement,PanelRecord>();let active:HTMLElement|undefined,serial=0,mutating=false;
  panel.prepend(rail,content);

  const activate=(section:HTMLElement):void=>{
    active=section;
    for(const record of records.values()){
      const selected=record.section===section;
      record.section.hidden=!selected;record.section.classList.toggle('panelTabActive',selected);record.button.classList.toggle('active',selected);record.button.setAttribute('aria-selected',String(selected));record.button.tabIndex=selected?0:-1;
    }
  };
  const register=(section:HTMLElement):void=>{
    if(records.has(section)||section===rail||section===content)return;
    const id=`left-panel-${++serial}`,label=panelLabel(section),kind=panelKind(section,label),button=document.createElement('button');button.type='button';button.className='leftPanelTab';button.dataset.leftPanelTab=id;button.title=label;button.setAttribute('aria-label',label);button.setAttribute('role','tab');button.innerHTML=icons[kind];
    section.dataset.leftPanelId=id;section.setAttribute('role','tabpanel');section.setAttribute('aria-label',label);records.set(section,{section,button,id});rail.append(button);content.append(section);if(!active)activate(section);else section.hidden=true;
  };
  const collect=():void=>{mutating=true;for(const child of [...panel.children])if(child instanceof HTMLElement&&child!==rail&&child!==content)register(child);for(const child of [...content.children])if(child instanceof HTMLElement)register(child);mutating=false;};
  const click=(event:MouseEvent):void=>{const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-left-panel-tab]');if(!button)return;const record=[...records.values()].find(item=>item.id===button.dataset.leftPanelTab);if(record)activate(record.section);};
  const keydown=(event:KeyboardEvent):void=>{const button=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-left-panel-tab]');if(!button||!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...rail.querySelectorAll<HTMLButtonElement>('[data-left-panel-tab]')];if(!buttons.length)return;let index=buttons.indexOf(button);if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else index=(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;const next=buttons[index];next?.focus();next?.click();};
  const observer=new MutationObserver(()=>{if(!mutating)collect();});observer.observe(panel,{childList:true});observer.observe(content,{childList:true});rail.addEventListener('click',click);rail.addEventListener('keydown',keydown);collect();
  return()=>{observer.disconnect();rail.removeEventListener('click',click);rail.removeEventListener('keydown',keydown);for(const record of records.values()){record.section.hidden=false;record.section.classList.remove('panelTabActive');record.section.removeAttribute('role');record.section.removeAttribute('aria-label');delete record.section.dataset.leftPanelId;panel.append(record.section);}rail.remove();content.remove();records.clear();};
}

function panelLabel(section:HTMLElement):string{
  if(section.matches('[data-project-region]')||section.querySelector('[data-project-region]'))return'Project';
  if(section.matches('[data-motion-region]')||section.querySelector('[data-motion-region]'))return'Animations';
  if(section.matches('[data-assets-region]')||section.querySelector('[data-assets-region]'))return'Assets';
  if(section.classList.contains('elementList')||section.querySelector('[data-elements-region]'))return'Elements';
  if(section.classList.contains('domLoadTree')||section.querySelector('.domLoadTree'))return'DOM';
  if(section.classList.contains('eventGraph')||section.querySelector('.eventGraph'))return'Events';
  if(section.classList.contains('globalSearch')||section.querySelector('.globalSearch'))return'Search';
  return section.querySelector('h3')?.textContent?.trim().replace(/\s+\d+$/,'')||'Panel';
}
function panelKind(section:HTMLElement,label:string):PanelKind{const value=`${section.className} ${label}`.toLowerCase();if(/asset|media|resource/.test(value))return'assets';if(/project|file|tree/.test(value))return'project';if(/motion|animation/.test(value))return'motion';if(/element|layer/.test(value))return'elements';if(/dom|node/.test(value))return'dom';if(/event|lifecycle/.test(value))return'events';if(/search|find/.test(value))return'search';return'panel';}
