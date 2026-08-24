import type { WebContents } from 'electron';

export type PageAssetReference={url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number};

type RawReference={url?:unknown;type?:unknown;mime?:unknown};

export async function collectPageAssetReferences(contents:WebContents):Promise<PageAssetReference[]>{
  if(contents.isDestroyed())return[];
  let raw:RawReference[]=[];
  try{raw=await contents.executeJavaScript(assetReferenceScript,true) as RawReference[];}catch{return[];}
  const now=Date.now(),seen=new Set<string>(),result:PageAssetReference[]=[];
  for(const item of raw){
    const url=String(item.url??'').trim(),resourceType=String(item.type??'other').trim()||'other';
    if(!url)continue;const key=`${resourceType}\n${url}`;if(seen.has(key))continue;seen.add(key);
    result.push({url,initiatorType:resourceType,resourceType,transferSize:0,decodedBodySize:0,mimeType:String(item.mime??''),statusCode:0,method:'GET',fromCache:false,timestamp:now});
  }
  return result;
}

const assetReferenceScript=String.raw`(()=>{
  const out=[],seen=new Set();
  const absolute=value=>{try{return new URL(String(value||''),document.baseURI).href}catch{return String(value||'')}};
  const add=(value,type='other',mime='')=>{const url=absolute(value);if(!url)return;const key=type+'\n'+url;if(seen.has(key))return;seen.add(key);out.push({url,type,mime});};
  const addRaw=(url,type,mime='')=>{if(!url)return;const key=type+'\n'+url;if(seen.has(key))return;seen.add(key);out.push({url,type,mime});};
  const urlPattern=/url\(\s*(['"]?)(.*?)\1\s*\)/gi;
  const addCssUrls=(text,type)=>{urlPattern.lastIndex=0;let match;while((match=urlPattern.exec(text||'')))if(match[2]&&!match[2].startsWith('#'))add(match[2],type);};
  try{for(const entry of performance.getEntriesByType('resource'))add(entry.name,entry.initiatorType||'resource');}catch{}
  for(const node of document.querySelectorAll('img'))add(node.currentSrc||node.src,'image');
  for(const node of document.querySelectorAll('script[src]'))add(node.src,'script','text/javascript');
  for(const node of document.querySelectorAll('link[href]')){const rel=(node.rel||'').toLowerCase();add(node.href,rel.includes('stylesheet')?'stylesheet':rel.includes('icon')?'image':rel.includes('preload')?'preload':'link',node.type||'');}
  for(const node of document.querySelectorAll('source[src]'))add(node.src,'media',node.type||'');
  for(const node of document.querySelectorAll('video[src],audio[src]'))add(node.currentSrc||node.src,'media');
  for(const node of document.querySelectorAll('video[poster]'))add(node.poster,'image');
  for(const node of document.querySelectorAll('iframe[src]'))add(node.src,'subFrame','text/html');
  for(const node of document.querySelectorAll('object[data]'))add(node.data,'object',node.type||'');
  for(const node of document.querySelectorAll('embed[src]'))add(node.src,'object',node.type||'');
  for(const node of document.querySelectorAll('input[type="image"][src]'))add(node.src,'image');
  for(const node of document.querySelectorAll('svg image'))add(node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href'),'image','image/svg+xml');
  for(const node of document.querySelectorAll('svg use')){const href=node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href');if(href&&!href.startsWith('#'))add(href,'svg-use','image/svg+xml');}
  [...document.querySelectorAll('svg')].forEach((_,index)=>addRaw('dom://inline-svg/'+index,'inline-svg','image/svg+xml'));
  [...document.querySelectorAll('style')].forEach((node,index)=>{addRaw('dom://inline-style/'+index,'inline-style','text/css');addCssUrls(node.textContent||'','style-asset');});
  for(const node of document.querySelectorAll('[style]'))addCssUrls(node.getAttribute('style')||'','style-asset');
  const walkRules=rules=>{for(const rule of rules||[]){const text=rule.cssText||'',font=/^@font-face/i.test(text);addCssUrls(text,font?'font':'style-asset');try{if(rule.cssRules)walkRules(rule.cssRules)}catch{}}};
  for(const sheet of document.styleSheets){if(sheet.href)add(sheet.href,'stylesheet','text/css');try{walkRules(sheet.cssRules)}catch{}}
  try{let index=0;document.fonts.forEach(font=>{const family=String(font.family||'').replace(/^['"]|['"]$/g,'');addRaw('dom://font/'+encodeURIComponent(family||'font')+'/'+index++,'font-face','font/loaded');});}catch{}
  return out;
})()`;
