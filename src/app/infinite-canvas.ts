import { store } from '../state/store';

type CameraState={x:number;y:number;zoom:number};
type CanvasMessage={source?:unknown;type?:unknown;dx?:unknown;dy?:unknown;deltaY?:unknown;clientX?:unknown;clientY?:unknown};
type GridRenderer={render:(camera:CameraState)=>void;resize:()=>void;destroy:()=>void;kind:'webgpu'|'canvas2d'};

const minZoom=.12,maxZoom=6;

export function mountInfiniteCanvas(root:HTMLElement):()=>void{
  const stage=root.querySelector<HTMLElement>('.stage'),device=root.querySelector<HTMLElement>('[data-device]');
  if(!stage||!device)return()=>{};

  const originalParent=device.parentElement,originalNext=device.nextSibling;
  const grid=document.createElement('canvas');grid.className='workspaceGpuCanvas';grid.setAttribute('aria-hidden','true');
  const layer=document.createElement('div');layer.className='workspaceCameraLayer';layer.dataset.workspaceCamera='';
  originalParent?.insertBefore(layer,device);layer.append(device);stage.prepend(grid);

  const controls=document.createElement('div');controls.className='workspaceCameraControls';controls.innerHTML=`<button type="button" data-canvas-hand aria-pressed="false" title="Hand tool · H"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.7 7V3.3a1 1 0 0 1 2 0V6h.5V2.7a1 1 0 1 1 2 0V6h.5V3.5a1 1 0 1 1 2 0v4.1l.5-.8a1 1 0 0 1 1.8.9l-2.2 4.1A4 4 0 0 1 9.3 14H8a4 4 0 0 1-3.3-1.8L2.2 8.5a1.05 1.05 0 0 1 1.7-1.2L5.2 9h.5V7Z"/></svg></button><span class="workspaceCameraDivider"></span><button type="button" data-canvas-zoom-out title="Zoom out">−</button><button type="button" data-canvas-zoom-label title="Reset zoom">100%</button><button type="button" data-canvas-zoom-in title="Zoom in">+</button><button type="button" data-canvas-fit title="Fit to view">Fit</button>`;
  stage.append(controls);
  const handButton=controls.querySelector<HTMLButtonElement>('[data-canvas-hand]')!,zoomLabel=controls.querySelector<HTMLButtonElement>('[data-canvas-zoom-label]')!;

  const cameras=new Map<string,CameraState>();
  let projectKey=contextKey(),camera:CameraState={x:0,y:0,zoom:1},handMode=false,spaceDown=false,dragging=false,dragPointer=-1,lastX=0,lastY=0,applyRaf=0,disposed=false,renderer:GridRenderer|null=null;

  const saveCamera=():void=>{if(projectKey)cameras.set(projectKey,{...camera});};
  const requestApply=():void=>{if(!disposed&&!applyRaf)applyRaf=requestAnimationFrame(applyCamera);};
  const applyCamera=():void=>{
    applyRaf=0;if(disposed)return;
    layer.style.setProperty('--workspace-pan-x',`${camera.x.toFixed(2)}px`);
    layer.style.setProperty('--workspace-pan-y',`${camera.y.toFixed(2)}px`);
    layer.style.setProperty('--workspace-camera-zoom',camera.zoom.toFixed(5));
    zoomLabel.textContent=`${Math.round(camera.zoom*100)}%`;
    stage.dataset.canvasZoom=camera.zoom.toFixed(4);stage.dataset.canvasRenderer=renderer?.kind??'pending';
    renderer?.render(camera);
    stage.dispatchEvent(new CustomEvent('animator:workspace-camera-change',{bubbles:true}));
  };
  const setCamera=(next:Partial<CameraState>):void=>{camera={x:Number.isFinite(next.x)?Number(next.x):camera.x,y:Number.isFinite(next.y)?Number(next.y):camera.y,zoom:clamp(Number.isFinite(next.zoom)?Number(next.zoom):camera.zoom,minZoom,maxZoom)};saveCamera();requestApply();};
  const pan=(dx:number,dy:number):void=>{if(!Number.isFinite(dx)||!Number.isFinite(dy))return;setCamera({x:camera.x+dx,y:camera.y+dy});};
  const zoomAt=(nextZoom:number,clientX:number,clientY:number):void=>{
    const rect=stage.getBoundingClientRect(),zoom=clamp(nextZoom,minZoom,maxZoom),px=clientX-rect.left-rect.width/2,py=clientY-rect.top-rect.height/2;
    const worldX=(px-camera.x)/camera.zoom,worldY=(py-camera.y)/camera.zoom;
    setCamera({zoom,x:px-worldX*zoom,y:py-worldY*zoom});
  };
  const zoomCenter=(factor:number):void=>{const rect=stage.getBoundingClientRect();zoomAt(camera.zoom*factor,rect.left+rect.width/2,rect.top+rect.height/2);};
  const fit=():void=>{
    camera={x:0,y:0,zoom:1};requestApply();
    requestAnimationFrame(()=>{
      if(disposed)return;const sr=stage.getBoundingClientRect(),dr=device.getBoundingClientRect();if(sr.width<2||sr.height<2||dr.width<2||dr.height<2)return;
      const widthAtOne=dr.width/Math.max(.001,camera.zoom),heightAtOne=dr.height/Math.max(.001,camera.zoom),availableWidth=Math.max(80,sr.width-72),availableHeight=Math.max(80,sr.height-72);
      camera={x:0,y:0,zoom:clamp(Math.min(1.35,availableWidth/widthAtOne,availableHeight/heightAtOne),minZoom,maxZoom)};saveCamera();requestApply();
    });
  };
  const resetZoom=():void=>{const rect=stage.getBoundingClientRect();zoomAt(1,rect.left+rect.width/2,rect.top+rect.height/2);};
  const setHandMode=(enabled:boolean):void=>{handMode=enabled;handButton.classList.toggle('active',enabled);handButton.setAttribute('aria-pressed',String(enabled));stage.classList.toggle('workspaceHandMode',enabled);window.animatorDesktop?.blink.command({source:'animator-shell',type:'SET_CANVAS_NAVIGATION',handMode:enabled});if(!enabled&&!spaceDown)endDrag();};

  const editable=(target:EventTarget|null):boolean=>target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const canStartPan=(event:PointerEvent):boolean=>event.button===1||event.button===0&&(handMode||spaceDown);
  const pointerDown=(event:PointerEvent):void=>{
    if(!stage.contains(event.target as Node)||!canStartPan(event))return;
    event.preventDefault();event.stopImmediatePropagation();dragging=true;dragPointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;stage.classList.add('workspacePanning');try{stage.setPointerCapture(event.pointerId);}catch{}
  };
  const pointerMove=(event:PointerEvent):void=>{if(!dragging||event.pointerId!==dragPointer)return;event.preventDefault();event.stopImmediatePropagation();const dx=event.clientX-lastX,dy=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;if(Math.abs(dx)>.01||Math.abs(dy)>.01)pan(dx,dy);};
  function endDrag():void{if(!dragging)return;try{if(dragPointer>=0&&stage!.hasPointerCapture(dragPointer))stage!.releasePointerCapture(dragPointer);}catch{}dragging=false;dragPointer=-1;stage!.classList.remove('workspacePanning');}
  const pointerEnd=(event:PointerEvent):void=>{if(dragging&&event.pointerId===dragPointer){event.preventDefault();endDrag();}};
  const wheel=(event:WheelEvent):void=>{
    if(!stage.contains(event.target as Node))return;
    if(event.ctrlKey||event.metaKey){event.preventDefault();event.stopImmediatePropagation();zoomAt(camera.zoom*Math.exp(-event.deltaY*.0022),event.clientX,event.clientY);return;}
    const background=event.target===stage||event.target===grid||event.target===layer;
    if(handMode||spaceDown||background){event.preventDefault();event.stopImmediatePropagation();pan(-event.deltaX,-event.deltaY);}
  };
  const keyDown=(event:KeyboardEvent):void=>{
    if(editable(event.target))return;
    if(event.code==='Space'){spaceDown=true;stage.classList.add('workspaceSpacePan');event.preventDefault();return;}
    if(event.key.toLowerCase()==='h'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();setHandMode(!handMode);return;}
    if(event.key==='0'||event.shiftKey&&event.key==='1'){event.preventDefault();fit();}
  };
  const keyUp=(event:KeyboardEvent):void=>{if(event.code==='Space'){spaceDown=false;stage.classList.remove('workspaceSpacePan');if(!handMode)endDrag();}};
  const blur=():void=>{spaceDown=false;stage.classList.remove('workspaceSpacePan');endDrag();};
  const click=(event:MouseEvent):void=>{
    const target=event.target as Element|null;
    if(target?.closest('[data-canvas-hand]'))setHandMode(!handMode);
    else if(target?.closest('[data-canvas-zoom-out]'))zoomCenter(1/1.15);
    else if(target?.closest('[data-canvas-zoom-in]'))zoomCenter(1.15);
    else if(target?.closest('[data-canvas-zoom-label]'))resetZoom();
    else if(target?.closest('[data-canvas-fit]'))fit();
  };
  const nativeMessage=(value:unknown):void=>{
    const message=value as CanvasMessage|undefined;if(!message||message.source!=='animator-preview'||typeof message.type!=='string')return;
    if(message.type==='CANVAS_PAN'){pan(Number(message.dx)||0,Number(message.dy)||0);return;}
    if(message.type==='CANVAS_ZOOM'){
      const rect=device.getBoundingClientRect(),clientX=rect.left+(Number(message.clientX)||0),clientY=rect.top+(Number(message.clientY)||0),deltaY=Number(message.deltaY)||0;
      zoomAt(camera.zoom*Math.exp(-deltaY*.0022),clientX,clientY);
    }
  };
  const syncProject=():void=>{
    const next=contextKey();if(next===projectKey)return;saveCamera();projectKey=next;camera=next&&cameras.get(next)?{...cameras.get(next)!}:{x:0,y:0,zoom:1};requestApply();if(next&&!cameras.has(next))window.setTimeout(fit,60);
  };
  const resize=new ResizeObserver(()=>{renderer?.resize();requestApply();});resize.observe(stage);
  const unsubscribe=store.subscribe(syncProject);
  const api=window.animatorDesktop?.blink;api?.onMessage(nativeMessage);
  stage.addEventListener('pointerdown',pointerDown,true);stage.addEventListener('pointermove',pointerMove,true);stage.addEventListener('pointerup',pointerEnd,true);stage.addEventListener('pointercancel',pointerEnd,true);stage.addEventListener('wheel',wheel,{capture:true,passive:false});controls.addEventListener('click',click);window.addEventListener('keydown',keyDown,true);window.addEventListener('keyup',keyUp,true);window.addEventListener('blur',blur);

  void createGridRenderer(grid).then(value=>{if(disposed){value.destroy();return;}renderer=value;renderer.resize();requestApply();}).catch(()=>{});
  requestApply();window.setTimeout(()=>{if(contextKey())fit();},80);

  return()=>{
    disposed=true;if(applyRaf)cancelAnimationFrame(applyRaf);saveCamera();unsubscribe();resize.disconnect();api?.offMessage(nativeMessage);stage.removeEventListener('pointerdown',pointerDown,true);stage.removeEventListener('pointermove',pointerMove,true);stage.removeEventListener('pointerup',pointerEnd,true);stage.removeEventListener('pointercancel',pointerEnd,true);stage.removeEventListener('wheel',wheel,true);controls.removeEventListener('click',click);window.removeEventListener('keydown',keyDown,true);window.removeEventListener('keyup',keyUp,true);window.removeEventListener('blur',blur);renderer?.destroy();controls.remove();grid.remove();layer.replaceWith(device);if(originalParent&&device.parentElement!==originalParent)originalParent.insertBefore(device,originalNext);stage.classList.remove('workspaceHandMode','workspaceSpacePan','workspacePanning');
  };

  function contextKey():string{const project=store.get().project;return project?`${project.id}:${project.selectedEntry}`:'';}
}

async function createGridRenderer(canvas:HTMLCanvasElement):Promise<GridRenderer>{
  const nav=navigator as Navigator&{gpu?:{requestAdapter:()=>Promise<any>;getPreferredCanvasFormat:()=>string}};
  if(nav.gpu){try{return await createWebGpuRenderer(canvas,nav.gpu);}catch{}}
  return createCanvas2dRenderer(canvas);
}

async function createWebGpuRenderer(canvas:HTMLCanvasElement,gpu:{requestAdapter:()=>Promise<any>;getPreferredCanvasFormat:()=>string}):Promise<GridRenderer>{
  const adapter=await gpu.requestAdapter();if(!adapter)throw new Error('WebGPU adapter unavailable');const device=await adapter.requestDevice(),context=canvas.getContext('webgpu') as any;if(!context)throw new Error('WebGPU canvas unavailable');
  const format=gpu.getPreferredCanvasFormat(),uniform=device.createBuffer({size:32,usage:0x40|0x08}),shader=device.createShaderModule({code:`struct Uniforms{size:vec2f,pan:vec2f,zoom:f32,dpr:f32,pad:vec2f};@group(0)@binding(0)var<uniform>u:Uniforms;@vertex fn vs(@builtin(vertex_index)i:u32)->@builtin(position)vec4f{var p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(p[i],0.,1.);}@fragment fn fs(@builtin(position)p:vec4f)->@location(0)vec4f{let css=p.xy/u.dpr;let local=(css-u.size*.5-u.pan)/max(u.zoom,.001);let cell=fract(local/16.)-.5;let dist=length(cell)*16.*u.zoom;let minor=1.-smoothstep(.65,1.55,dist);let majorCell=fract(local/80.)-.5;let majorDist=length(majorCell)*80.*u.zoom;let major=1.-smoothstep(.8,1.9,majorDist);let a=min(.22,minor*.07+major*.13);return vec4f(.055+a*.34,.061+a*.38,.071+a*.44,1.);}`}),pipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'vs'},fragment:{module:shader,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}}),bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
  let width=0,height=0,dpr=1,destroyed=false;
  const resize=()=>{if(destroyed)return;const rect=canvas.getBoundingClientRect();dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(w===width&&h===height)return;width=w;height=h;canvas.width=w;canvas.height=h;context.configure({device,format,alphaMode:'opaque'});};
  const render=(camera:CameraState)=>{if(destroyed)return;resize();const rect=canvas.getBoundingClientRect(),data=new Float32Array([rect.width,rect.height,camera.x,camera.y,camera.zoom,dpr,0,0]);device.queue.writeBuffer(uniform,0,data);const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:.055,g:.061,b:.071,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);};
  return{kind:'webgpu',render,resize,destroy:()=>{destroyed=true;try{uniform.destroy();}catch{}try{device.destroy();}catch{}}};
}

function createCanvas2dRenderer(canvas:HTMLCanvasElement):GridRenderer{
  const context=canvas.getContext('2d')!;let destroyed=false,dpr=1;
  const resize=()=>{if(destroyed)return;const rect=canvas.getBoundingClientRect();dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}};
  const render=(camera:CameraState)=>{if(destroyed)return;resize();const rect=canvas.getBoundingClientRect();context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,rect.width,rect.height);context.fillStyle='#0e1012';context.fillRect(0,0,rect.width,rect.height);const spacing=Math.max(5,16*camera.zoom),originX=rect.width/2+camera.x,originY=rect.height/2+camera.y;context.fillStyle='rgba(137,151,166,.15)';for(let x=((originX%spacing)+spacing)%spacing;x<rect.width;x+=spacing)for(let y=((originY%spacing)+spacing)%spacing;y<rect.height;y+=spacing)context.fillRect(Math.round(x),Math.round(y),1,1);};
  return{kind:'canvas2d',render,resize,destroy:()=>{destroyed=true;}};
}

function clamp(value:number,min:number,max:number):number{return Math.min(max,Math.max(min,value));}
