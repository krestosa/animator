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

export function rewriteColorSchemeCss(css:string,mode:PreviewColorScheme):string{
  if(mode==='auto'||mode==='system')return css;
  return css.replace(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi,(_match,value:string)=>value.toLowerCase()===mode?'(min-width: 0px)':'(max-width: 0px)');
}

export function previewColorSchemeBootstrap(mode:PreviewColorScheme):string{
  if(mode==='auto'||mode==='system')return '';
  const serialized=JSON.stringify(mode);
  return `<script data-animator-internal>/* animator preview color scheme override */(()=>{const mode=${serialized};window.__ANIMATOR_PREVIEW_COLOR_SCHEME_OVERRIDE__=mode;const native=window.matchMedia.bind(window);const rewrite=query=>String(query).replace(/\\(\\s*prefers-color-scheme\\s*:\\s*(dark|light)\\s*\\)/gi,(_match,value)=>String(value).toLowerCase()===mode?'(min-width: 0px)':'(max-width: 0px)');window.matchMedia=query=>{const original=String(query),mql=native(rewrite(original));return new Proxy(mql,{get(target,property){if(property==='media')return original;const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;}});};document.documentElement.style.colorScheme=mode;})();</script>`;
}
