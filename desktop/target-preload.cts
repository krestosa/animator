import { ipcRenderer } from 'electron';

let handMode=false,spaceDown=false,panning=false,pointerId=-1,lastX=0,lastY=0;
const editable=(target:EventTarget|null):boolean=>target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const emit=(value:Record<string,unknown>):void=>ipcRenderer.send('animator:blink:page-message',{source:'animator-preview',...value});
const startPan=(event:PointerEvent):void=>{
  if(!(event.button===1||event.button===0&&(handMode||spaceDown)))return;
  event.preventDefault();event.stopImmediatePropagation();panning=true;pointerId=event.pointerId;lastX=event.clientX;lastY=event.clientY;try{(event.target as Element|null)?.setPointerCapture?.(event.pointerId);}catch{}
};
const movePan=(event:PointerEvent):void=>{
  if(!panning||event.pointerId!==pointerId)return;event.preventDefault();event.stopImmediatePropagation();const dx=event.clientX-lastX,dy=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;if(Math.abs(dx)>.01||Math.abs(dy)>.01)emit({type:'CANVAS_PAN',dx,dy});
};
const endPan=(event?:PointerEvent):void=>{if(event&&event.pointerId!==pointerId)return;panning=false;pointerId=-1;};

window.addEventListener('message',event=>{
  const value=event.data as {source?:unknown;type?:unknown}|undefined;
  if(!value||value.source!=='animator-preview'||typeof value.type!=='string')return;
  ipcRenderer.send('animator:blink:page-message',value);
});
window.addEventListener('keydown',event=>{if(event.code==='Space'&&!editable(event.target)){spaceDown=true;event.preventDefault();}},true);
window.addEventListener('keyup',event=>{if(event.code==='Space'){spaceDown=false;if(!handMode)endPan();}},true);
window.addEventListener('blur',()=>{spaceDown=false;endPan();});
window.addEventListener('pointerdown',startPan,true);
window.addEventListener('pointermove',movePan,true);
window.addEventListener('pointerup',event=>endPan(event),true);
window.addEventListener('pointercancel',event=>endPan(event),true);
window.addEventListener('wheel',event=>{
  if(event.ctrlKey||event.metaKey){event.preventDefault();event.stopImmediatePropagation();emit({type:'CANVAS_ZOOM',deltaY:event.deltaY,clientX:event.clientX,clientY:event.clientY});return;}
  if(handMode||spaceDown){event.preventDefault();event.stopImmediatePropagation();emit({type:'CANVAS_PAN',dx:-event.deltaX,dy:-event.deltaY});}
},{capture:true,passive:false});

ipcRenderer.on('animator:blink:command',(_event,command)=>{
  const value=command as {source?:unknown;type?:unknown;handMode?:unknown}|undefined;
  if(value?.source==='animator-shell'&&value.type==='SET_CANVAS_NAVIGATION'){handMode=Boolean(value.handMode);if(!handMode&&!spaceDown)endPan();return;}
  window.postMessage(command,'*');
});
