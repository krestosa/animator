type RestoreEntry={wrapper:HTMLElement;parent:Node};

export function mountLayoutGroups(root:HTMLElement):()=>void{
  const restored:RestoreEntry[]=[];
  const wrap=(className:string,nodes:Array<Element|null|undefined>,before?:Node|null):HTMLElement|null=>{
    const items=nodes.filter((node):node is HTMLElement=>node instanceof HTMLElement&&node.parentElement!==null);
    if(!items.length)return null;
    const parent=items[0]?.parentElement;if(!parent||items.some(item=>item.parentElement!==parent))return null;
    const wrapper=document.createElement('span');wrapper.className=className;
    parent.insertBefore(wrapper,before&&before.parentNode===parent?before:items[0]??null);
    for(const item of items)wrapper.append(item);
    restored.push({wrapper,parent});
    return wrapper;
  };

  const toolbar=root.querySelector<HTMLElement>('.toolbar');
  if(toolbar){
    const grow=toolbar.querySelector<HTMLElement>('.grow');
    wrap('toolbarCluster toolbarProject',[
      toolbar.querySelector('[data-action="pick-folder"]'),
      toolbar.querySelector('.webLoader')
    ]);
    wrap('toolbarCluster toolbarCapture',[
      toolbar.querySelector('[data-action="picker"]'),
      toolbar.querySelector('[data-action="record"]'),
      toolbar.querySelector('[data-record-state]')
    ]);
    wrap('toolbarCluster toolbarTransport',[
      toolbar.querySelector('[data-action="previous-event"]'),
      toolbar.querySelector('[data-action="restart"]'),
      toolbar.querySelector('[data-action="play"]'),
      toolbar.querySelector('[data-action="pause"]'),
      toolbar.querySelector('[data-action="next-event"]'),
      toolbar.querySelector('[data-playback-rate]')
    ]);
    wrap('toolbarCluster toolbarCreate',[
      toolbar.querySelector('.primaryIcon[data-open-create-motion]'),
      toolbar.querySelector('.toolbarMore')
    ],grow);
    wrap('toolbarCluster toolbarView',[
      toolbar.querySelector('[data-timeline-toggle]'),
      toolbar.querySelector('[data-viewport]'),
      toolbar.querySelector('[data-viewport-label]')
    ]);
    toolbar.classList.add('isGrouped');
  }

  const timelineTop=root.querySelector<HTMLElement>('.timelineTop');
  if(timelineTop){
    wrap('timelineIdentity',[
      timelineTop.querySelector(':scope > b'),
      timelineTop.querySelector(':scope > [data-playhead-label]')
    ]);
    const controls=timelineTop.querySelector<HTMLElement>('.previewEditorControls');
    if(controls){
      wrap('timelinePlaybackControls',[
        controls.querySelector('[data-preview-live]'),
        controls.querySelector('.previewFrameCluster')
      ]);
      wrap('timelineCaptureControls',[
        controls.querySelector('[data-preview-recalculate]'),
        controls.querySelector('.previewAutoCapture'),
        controls.querySelector('[data-preview-recapture]'),
        controls.querySelector('[data-preview-capture-status]')
      ]);
      controls.classList.add('isGrouped');
    }
    timelineTop.classList.add('isGrouped');
  }

  return()=>{
    toolbar?.classList.remove('isGrouped');
    timelineTop?.classList.remove('isGrouped');
    timelineTop?.querySelector('.previewEditorControls')?.classList.remove('isGrouped');
    for(const {wrapper,parent} of restored.reverse()){
      if(!wrapper.isConnected)continue;
      while(wrapper.firstChild)parent.insertBefore(wrapper.firstChild,wrapper);
      wrapper.remove();
    }
  };
}
