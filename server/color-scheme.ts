export type PreviewColorScheme='auto'|'system'|'light'|'dark';
export const PREVIEW_COLOR_SCHEME_PARAM='__animator_color_scheme';

export function parsePreviewColorScheme(value:string|null|undefined,fallback:PreviewColorScheme='auto'):PreviewColorScheme{
  if(value==='light'||value==='dark'||value==='auto')return value;
  if(value==='system')return 'auto';
  return fallback;
}

export function stripPreviewColorScheme(url:string):{path:string;mode:PreviewColorScheme|undefined}{
  const parsed=new URL(url||'/','http://preview.local');
  const raw=parsed.searchParams.get(PREVIEW_COLOR_SCHEME_PARAM);
  const mode=raw===null?undefined:parsePreviewColorScheme(raw);
  parsed.searchParams.delete(PREVIEW_COLOR_SCHEME_PARAM);
  return{path:parsed.pathname+(parsed.search?parsed.search:'')+(parsed.hash?parsed.hash:''),mode};
}

export function previewColorSchemeFromUrl(url:string|null|undefined):PreviewColorScheme|undefined{
  if(!url)return undefined;
  try{const raw=new URL(url,'http://preview.local').searchParams.get(PREVIEW_COLOR_SCHEME_PARAM);return raw===null?undefined:parsePreviewColorScheme(raw);}catch{return undefined;}
}

export function resolvePreviewColorScheme(explicit:PreviewColorScheme|undefined,referer:string|null|undefined,isDocument:boolean,current:PreviewColorScheme):PreviewColorScheme{
  if(explicit!==undefined)return explicit;
  const inherited=previewColorSchemeFromUrl(referer);
  if(inherited!==undefined)return inherited;
  return isDocument?'auto':current;
}

export function rewriteColorSchemeCss(css:string,mode:PreviewColorScheme):string{
  if(mode==='auto'||mode==='system')return css;
  return css.replace(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi,(_match,value:string)=>value.toLowerCase()===mode?'(min-width: 0px)':'(max-width: 0px)');
}

export function rewriteInlineColorSchemeStyles(html:string,mode:PreviewColorScheme):string{
  if(mode==='auto'||mode==='system')return html;
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,(_all,open:string,css:string,close:string)=>open+rewriteColorSchemeCss(css,mode)+close);
}

export function previewColorSchemeBootstrap(mode:PreviewColorScheme):string{
  if(mode==='auto'||mode==='system')return '';
  const serialized=JSON.stringify(mode);
  return `<script data-animator-internal>/* animator preview theme override */(()=>{const mode=${serialized},opposite=mode==='dark'?'light':'dark';window.__ANIMATOR_PREVIEW_COLOR_SCHEME_OVERRIDE__=mode;const mediaRe=/\\(\\s*prefers-color-scheme\\s*:\\s*(dark|light)\\s*\\)/gi,rewriteMedia=query=>String(query).replace(mediaRe,(_m,value)=>String(value).toLowerCase()===mode?'(min-width: 0px)':'(max-width: 0px)'),nativeMatch=window.matchMedia.bind(window);window.matchMedia=query=>{const original=String(query),mql=nativeMatch(rewriteMedia(original));return new Proxy(mql,{get(target,property){if(property==='media')return original;const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;}});};const themeKey=key=>/(theme|color[._:-]*scheme|appearance|dark[._:-]*mode|light[._:-]*mode)/i.test(String(key)),boolish=/^(true|false|1|0|yes|no|on|off)$/i,coerce=(key,value)=>{if(!themeKey(key))return value;if(value==null)return /(theme|scheme|appearance)/i.test(String(key))?mode:value;const raw=String(value),trim=raw.trim(),low=trim.toLowerCase();if(/^(dark|light|system|auto|default)$/.test(low))return mode;if(boolish.test(trim)){const on=/^(true|1|yes|on)$/i.test(trim),wantsDark=/dark/i.test(String(key)),wantsLight=/light/i.test(String(key));if(wantsDark||wantsLight){const desired=wantsDark?mode==='dark':mode==='light',truth=/^(true|false)$/i.test(trim)?String(desired):/^(1|0)$/.test(trim)?(desired?'1':'0'):/^(yes|no)$/i.test(trim)?(desired?'yes':'no'):(desired?'on':'off');return truth;}}if((trim[0]==='{'||trim[0]==='[')&&trim.length<20000){try{const parsed=JSON.parse(trim),walk=(node,parentKey)=>{if(!node||typeof node!=='object')return node;if(Array.isArray(node)){for(let i=0;i<node.length;i++)node[i]=walk(node[i],parentKey);return node;}for(const k of Object.keys(node)){const v=node[k];if(themeKey(k)&&typeof v==='string'&&/^(dark|light|system|auto|default)$/i.test(v))node[k]=mode;else node[k]=walk(v,k);}return node;};return JSON.stringify(walk(parsed,String(key)));}catch{}}return raw;};try{const proto=Storage.prototype,get=proto.getItem,set=proto.setItem,remove=proto.removeItem,shadow=new WeakMap(),bucket=storage=>{let map=shadow.get(storage);if(!map){map=new Map();shadow.set(storage,map);}return map;};proto.getItem=function(key){const k=String(key),map=bucket(this),base=map.has(k)?map.get(k):get.call(this,k);return coerce(k,base??null);};proto.setItem=function(key,value){const k=String(key);if(themeKey(k)){bucket(this).set(k,String(value));return;}return set.call(this,k,String(value));};proto.removeItem=function(key){const k=String(key);if(themeKey(k)){bucket(this).set(k,null);return;}return remove.call(this,k);};}catch{}try{const proto=Document.prototype,desc=Object.getOwnPropertyDescriptor(proto,'cookie');if(desc&&desc.get&&desc.set){const nativeGet=desc.get,nativeSet=desc.set;Object.defineProperty(document,'cookie',{configurable:true,get(){return String(nativeGet.call(document)||'').split(/;\\s*/).map(part=>{const at=part.indexOf('=');if(at<0)return part;const key=part.slice(0,at),value=part.slice(at+1),next=coerce(key,value);return key+'='+(next??'');}).join('; ');},set(value){const text=String(value),pair=text.split(';',1)[0]||'',at=pair.indexOf('='),key=at<0?pair:pair.slice(0,at);if(themeKey(key))return;nativeSet.call(document,text);}});}}catch{}const themeAttr=name=>/(theme|color[._:-]*scheme|appearance)/i.test(String(name)),rewriteToken=value=>{const text=String(value),trim=text.trim();if(/^(dark|light|system|auto)$/i.test(trim))return mode;return text.replace(new RegExp('(^|[-_:])'+opposite+'(?=$|[-_:])','ig'),(_m,prefix)=>prefix+mode);},nativeSetAttribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){const n=String(name),v=themeAttr(n)?rewriteToken(value):value;return nativeSetAttribute.call(this,n,String(v));};const forceRoot=el=>{if(!(el instanceof HTMLElement))return;for(const attr of Array.from(el.attributes)){if(themeAttr(attr.name)){const next=rewriteToken(attr.value);if(next!==attr.value)nativeSetAttribute.call(el,attr.name,next);}}const tokens=Array.from(el.classList),next=tokens.map(token=>rewriteToken(token));if(next.some((token,index)=>token!==tokens[index]))el.className=next.join(' ');el.style.setProperty('color-scheme',mode,'important');};forceRoot(document.documentElement);let bodyObserver=null,applying=false;const attachBody=()=>{if(bodyObserver||!document.body)return;forceRoot(document.body);bodyObserver=new MutationObserver(()=>{if(applying)return;applying=true;forceRoot(document.body);applying=false;});bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class','style','data-theme','data-color-scheme','data-appearance']});};const rootObserver=new MutationObserver(()=>{if(applying)return;applying=true;forceRoot(document.documentElement);attachBody();applying=false;});rootObserver.observe(document.documentElement,{attributes:true,childList:true,attributeFilter:['class','style','data-theme','data-color-scheme','data-appearance','data-sc-theme','data-sc-theme-resolved']});attachBody();try{const proto=CSSStyleSheet.prototype,insert=proto.insertRule,replaceSync=proto.replaceSync,replace=proto.replace;proto.insertRule=function(rule,index){return insert.call(this,rewriteMedia(rule),index);};if(replaceSync)proto.replaceSync=function(text){return replaceSync.call(this,rewriteMedia(text));};if(replace)proto.replace=function(text){return replace.call(this,rewriteMedia(text));};}catch{}const seenStyles=new WeakSet(),fixStyle=node=>{if(!(node instanceof HTMLStyleElement)||seenStyles.has(node))return;seenStyles.add(node);const text=node.textContent||'',next=rewriteMedia(text);if(next!==text)node.textContent=next;};if(document.head){document.head.querySelectorAll('style').forEach(fixStyle);new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node instanceof HTMLStyleElement)fixStyle(node);else if(node instanceof Element)node.querySelectorAll('style').forEach(fixStyle);}}).observe(document.head,{childList:true,subtree:true});}document.documentElement.style.setProperty('color-scheme',mode,'important');})();</script>`;
}
