import type {MotionPropertyTrack,MotionValueKind} from './motion-model.js';

export function motionValueKind(name:string):MotionValueKind{
  const key=name.toLowerCase();
  if(key==='transform')return'transform';
  if(key==='filter'||key==='backdrop-filter')return'filter';
  if(key.startsWith('--'))return'custom-property';
  if(key.includes('color')||key==='fill'||key==='stroke')return'color';
  if(key==='d'||key==='offset-path'||key==='clip-path')return'path';
  if(key.includes('rotate')||key.includes('skew'))return'angle';
  if(['width','height','top','right','bottom','left','margin','padding','gap','translate','translatex','translatey','perspective','border-radius','font-size','letter-spacing'].some(token=>key===token||key.startsWith(`${token}-`)))return'length';
  if(['opacity','scale','scalex','scaley','z-index','flex-grow','flex-shrink','order'].includes(key))return'number';
  if(['display','visibility','position','overflow','pointer-events','font-family'].includes(key))return'discrete';
  return'unknown';
}

export function motionValueInterpolable(kind:MotionValueKind):boolean|undefined{
  if(kind==='discrete')return false;
  if(kind==='number'||kind==='length'||kind==='angle'||kind==='color'||kind==='transform'||kind==='filter'||kind==='path'||kind==='custom-property')return true;
  return undefined;
}

export function createMotionProperty(name:string,input:{from?:string;to?:string;values?:string[]}={}):MotionPropertyTrack{
  const valueKind=motionValueKind(name),interpolable=motionValueInterpolable(valueKind);
  return{name,...(input.from!==undefined?{from:input.from}:{}),...(input.to!==undefined?{to:input.to}:{}),...(input.values!==undefined?{values:[...input.values]}:{}),valueKind,...(interpolable!==undefined?{interpolable}:{})};
}
