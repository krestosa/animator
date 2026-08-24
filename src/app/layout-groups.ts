type MoveEntry={node:HTMLElement;parent:Node;next:ChildNode|null};

export function mountLayoutGroups(root:HTMLElement):()=>void{
  const moved:MoveEntry[]=[];
  const created:HTMLElement[]=[];

  const remember=(node:HTMLElement):void=>{
    if(moved.some(entry=>entry.node===node))return;
    moved.push({node,parent:node.parentNode!,next:node.nextSibling});
  };
  const move=(node:Element|null|undefined,parent:HTMLElement):HTMLElement|undefined=>{
    if(!(node instanceof HTMLElement))return undefined;
    remember(node);parent.append(node);return node;
  };
  const make=(className:string,parent:HTMLElement,before?:Node|null):HTMLElement=>{
    const element=document.createElement('div');element.className=className;
    parent.insertBefore(element,before&&before.parentNode===parent?before:null);created.push(element);return element;
  };
  const wrapExisting=(className:string,parent:HTMLElement,nodes:Array<Element|null|undefined>):HTMLElement|null=>{
    const items=nodes.filter((node):node is HTMLElement=>node instanceof HTMLElement&&node.parentElement===parent);
    if(!items.length)return null;const wrapper=make(className,parent,items[0]);for(const item of items)move(item,wrapper);return wrapper;
  };

  const toolbar=root.querySelector<HTMLElement>('.toolbar');
  const workspace=root.querySelector<HTMLElement>('.workspace');
  const preview=root.querySelector<HTMLElement>('.previewArea');
  const timelineTop=root.querySelector<HTMLElement>('.timelineTop');

  if(toolbar){
    toolbar.classList.add('studioCommandBar');
    const commandLeft=make('studioCommandLeft',toolbar,toolbar.firstChild);
    move(toolbar.querySelector('[data-action="pick-folder"]'),commandLeft);
    const label=document.createElement('span');label.className='studioCommandLabel';label.textContent='PROJECT';commandLeft.prepend(label);created.push(label);

    const commandRight=make('studioCommandRight',toolbar,toolbar.querySelector('.grow'));
    const more=toolbar.querySelector<HTMLElement>('.toolbarMore');
    const loader=toolbar.querySelector<HTMLElement>('.webLoader');
    const instrumentation=toolbar.querySelector<HTMLElement>('.blinkInstrumentationToggle');
    if(instrumentation)move(instrumentation,commandRight);
    if(loader&&loader.parentElement===toolbar)move(loader,commandRight);
    if(more&&more.parentElement===toolbar)move(more,commandRight);
  }

  if(workspace&&preview){
    workspace.classList.add('studioWorkspace');
    const rail=make('studioToolRail',workspace,preview);
    move(root.querySelector('[data-action="picker"]'),rail);
    move(root.querySelector('[data-action="record"]'),rail);
    move(root.querySelector('[data-record-state]'),rail);
    move(root.querySelector('.primaryIcon[data-open-create-motion]'),rail);
    move(root.querySelector('[data-timeline-toggle]'),rail);

    const railDivider=document.createElement('span');railDivider.className='studioToolRailDivider';rail.insertBefore(railDivider,rail.querySelector('[data-timeline-toggle]'));created.push(railDivider);

    const footer=make('studioViewerFooter',preview,null);
    const transport=make('studioViewerTransport',footer,null);
    move(root.querySelector('[data-action="previous-event"]'),transport);
    move(root.querySelector('[data-action="restart"]'),transport);
    move(root.querySelector('[data-action="play"]'),transport);
    move(root.querySelector('[data-action="pause"]'),transport);
    move(root.querySelector('[data-action="next-event"]'),transport);
    move(root.querySelector('[data-playback-rate]'),transport);

    const view=make('studioViewerView',footer,null);
    move(root.querySelector('[data-viewport]'),view);
    move(root.querySelector('[data-viewport-label]'),view);
  }

  if(timelineTop){
    timelineTop.classList.add('studioTimelineHeader');
    const identity=wrapExisting('studioTimelineIdentity',timelineTop,[
      timelineTop.querySelector(':scope > b'),
      timelineTop.querySelector(':scope > [data-playhead-label]'),
      timelineTop.querySelector(':scope > .muted')
    ]);
    identity?.classList.add('studioTimelineSection');

    const tools=timelineTop.querySelector<HTMLElement>('.timelineProTools');
    if(tools){const wrapper=make('studioTimelineTools',timelineTop,tools);move(tools,wrapper);wrapper.classList.add('studioTimelineSection');}

    const controls=timelineTop.querySelector<HTMLElement>('.previewEditorControls');
    if(controls){
      controls.classList.add('studioTimelineControls');
      const playback=wrapExisting('studioTimelinePlayback',controls,[
        controls.querySelector('[data-preview-live]'),
        controls.querySelector('.previewFrameCluster')
      ]);
      const capture=wrapExisting('studioTimelineCapture',controls,[
        controls.querySelector('[data-preview-recalculate]'),
        controls.querySelector('.previewAutoCapture'),
        controls.querySelector('[data-preview-recapture]'),
        controls.querySelector('[data-preview-capture-status]')
      ]);
      playback?.classList.add('studioTimelineControlGroup');capture?.classList.add('studioTimelineControlGroup');
    }
  }

  return()=>{
    toolbar?.classList.remove('studioCommandBar');workspace?.classList.remove('studioWorkspace');timelineTop?.classList.remove('studioTimelineHeader');timelineTop?.querySelector('.previewEditorControls')?.classList.remove('studioTimelineControls');
    for(const entry of [...moved].reverse()){
      const {node,parent,next}=entry;if(!parent.isConnected&&parent!==root)continue;
      parent.insertBefore(node,next&&next.parentNode===parent?next:null);
    }
    for(const element of [...created].reverse())if(element.isConnected)element.remove();
  };
}
