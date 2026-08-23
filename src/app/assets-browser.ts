import {store} from '../state/store';

type AssetCategory='media'|'typography'|'lottie'|'source'|'styles'|'data'|'documents'|'other';
type AssetPreview='image'|'video'|'audio'|'font'|'lottie'|'text'|'none';
type AssetRecord={id:string;path:string;name:string;extension:string;category:AssetCategory;kind:string;preview:AssetPreview;size:number;url:string;origin:'project'|'runtime'};
type LocalAsset=Omit<AssetRecord,'id'|'url'|'origin'>;
type RuntimeResource={url:string;initiatorType:string;resourceType?:string;transferSize:number;decodedBodySize:number;mimeType?:string;statusCode?:number;method?:string;fromCache?:boolean;timestamp?:number};

const categoryOrder:AssetCategory[]=['media','typography','lottie','source','styles','data','documents','other'];
const categoryLabels:Record<AssetCategory,string>={media:'Media',typography:'Typography',lottie:'Lottie',source:'Source',styles:'Styles',data:'Data',documents:'Documents',other:'Other'};
const imageExt=new Set(['png','jpg','jpeg','webp','gif','avif','bmp','ico','svg']);
const videoExt=new Set(['mp4','webm','mov','m4v','ogv','avi','mkv']);
const audioExt=new Set(['mp3','wav','ogg','oga','m4a','aac','flac','opus']);
const fontExt=new Set(['woff','woff2','ttf','otf','eot']);
const sourceExt=new Set(['html','htm','js','mjs','cjs','jsx','ts','tsx','vue','svelte','astro','php','py','rb','rs','go','java','kt','swift','wasm']);
const styleExt=new Set(['css','scss','sass','less','styl','pcss']);
const dataExt=new Set(['json','json5','yaml','yml','xml','csv','tsv','toml','ini','map','webmanifest']);
const documentExt=new Set(['md','mdx','txt','pdf']);

export function mountAssetsBrowser(root:HTMLElement):()=>void{
  const left=root.querySelector<HTMLElement>('.leftPanel');if(!left)return()=>{};
  const section=document.createElement('section');section.className='assetsBrowser';section.dataset.assetsRegion='';section.innerHTML='<header class="assetsHeader"><h3>Assets <small data-assets-count>0</small></h3><button type="button" class="tiny" data-assets-refresh title="Refresh assets" aria-label="Refresh assets">↻</button></header><input class="assetsSearch" data-assets-search type="search" placeholder="Search assets" aria-label="Search assets"><div class="assetsFilters" data-assets-filters></div><div class="assetsGrid" data-assets-grid></div><div class="assetPreview" data-asset-preview hidden></div>';
  left.append(section);
  const search=section.querySelector<HTMLInputElement>('[data-assets-search]')!,filters=section.querySelector<HTMLElement>('[data-assets-filters]')!,grid=section.querySelector<HTMLElement>('[data-assets-grid]')!,preview=section.querySelector<HTMLElement>('[data-asset-preview]')!,count=section.querySelector<HTMLElement>('[data-assets-count]')!;
  let assets:AssetRecord[]=[],active:'all'|AssetCategory='all',selectedId='',generation=0,lastProjectId='',cachedLocalProjectId='',cachedLocalAssets:AssetRecord[]=[],syncing=false;

  const render=():void=>{
    const query=search.value.trim().toLowerCase(),visible=assets.filter(asset=>(active==='all'||asset.category===active)&&(!query||`${asset.name} ${asset.path} ${asset.kind}`.toLowerCase().includes(query)));
    count.textContent=String(assets.length);
    const totals=new Map<AssetCategory,number>();for(const asset of assets)totals.set(asset.category,(totals.get(asset.category)??0)+1);
    filters.innerHTML=[filterButton('all','All',assets.length,active==='all'),...categoryOrder.filter(category=>totals.has(category)).map(category=>filterButton(category,categoryLabels[category],totals.get(category)??0,active===category))].join('');
    grid.innerHTML=visible.length?visible.map(asset=>assetCard(asset,asset.id===selectedId)).join(''):'<div class="assetsEmpty">No assets in this view</div>';
    if(selectedId&&!assets.some(asset=>asset.id===selectedId)){selectedId='';preview.hidden=true;preview.replaceChildren();}
  };

  const load=async(options:{forceLocal?:boolean;quiet?:boolean}={}):Promise<void>=>{
    if(syncing&&options.quiet)return;
    const project=store.get().project,request=++generation;if(!project){assets=[];selectedId='';lastProjectId='';cachedLocalProjectId='';cachedLocalAssets=[];render();return;}
    syncing=true;if(!options.quiet)grid.innerHTML='<div class="assetsEmpty">Scanning assets…</div>';
    try{
      if(project.kind!=='remote'&&!project.browserSessionId){
        if(options.forceLocal||cachedLocalProjectId!==project.id){
          const nextLocal:AssetRecord[]=[];
          try{const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/assets`,{cache:'no-store'}),body=await response.json() as{assets?:LocalAsset[]};if(response.ok&&body.assets)for(const asset of body.assets)nextLocal.push({...asset,id:`project:${asset.path}`,url:`/api/projects/${encodeURIComponent(project.id)}/asset?path=${encodeURIComponent(asset.path)}`,origin:'project'});}catch{}
          cachedLocalProjectId=project.id;cachedLocalAssets=nextLocal;
        }
      }else if(cachedLocalProjectId!==project.id){cachedLocalProjectId='';cachedLocalAssets=[];}

      const collected:AssetRecord[]=[...cachedLocalAssets],localPaths=new Set(cachedLocalAssets.map(item=>normalizePath(item.path)));
      let resources:RuntimeResource[]=[];
      try{
        if(project.browserSessionId){
          const response=await fetch(`/api/browser-sessions/${encodeURIComponent(project.browserSessionId)}/resources`,{cache:'no-store'}),body=await response.json() as{resources?:RuntimeResource[]};
          if(response.ok&&body.resources)resources=body.resources;
        }else resources=await window.animatorDesktop?.blink.resources()??[];
      }catch{}
      for(const resource of resources){const runtime=runtimeAsset(resource);if(!runtime)continue;let pathname='';try{pathname=normalizePath(decodeURIComponent(new URL(runtime.url).pathname));}catch{}if(localPaths.has(pathname))continue;if(!collected.some(item=>item.url===runtime.url))collected.push(runtime);}
      if(request!==generation)return;
      assets=collected.sort((a,b)=>categoryOrder.indexOf(a.category)-categoryOrder.indexOf(b.category)||a.name.localeCompare(b.name));render();
    }finally{syncing=false;}
  };

  const showPreview=async(asset:AssetRecord):Promise<void>=>{
    selectedId=asset.id;render();preview.hidden=false;preview.innerHTML=previewShell(asset);
    const body=preview.querySelector<HTMLElement>('[data-asset-preview-body]');if(!body)return;
    if(asset.preview==='image')body.innerHTML=`<img src="${attr(asset.url)}" alt="${attr(asset.name)}">`;
    else if(asset.preview==='video')body.innerHTML=`<video src="${attr(asset.url)}" controls preload="metadata"></video>`;
    else if(asset.preview==='audio')body.innerHTML=`<audio src="${attr(asset.url)}" controls preload="metadata"></audio>`;
    else if(asset.preview==='font'){const family=`asset-font-${hash(asset.id)}`,style=document.createElement('style');style.dataset.assetFontStyle='';style.textContent=`@font-face{font-family:${family};src:url("${cssUrl(asset.url)}")}`;preview.append(style);body.innerHTML=`<div class="assetFontSample" style="font-family:${family}">Aa Bb Cc<br><strong>0123456789</strong><small>The quick brown fox jumps over the lazy dog.</small></div>`;}
    else if(asset.preview==='lottie'&&asset.extension==='.json'){
      try{const response=await fetch(asset.url,{cache:'no-store'}),json=await response.json() as{v?:string;fr?:number;ip?:number;op?:number;w?:number;h?:number;layers?:unknown[]};const duration=json.fr&&json.op!==undefined&&json.ip!==undefined?Math.max(0,(json.op-json.ip)/json.fr):0;body.innerHTML=`<div class="lottieInfo"><b>Lottie ${html(json.v??'')}</b><span>${json.w??'?'} × ${json.h??'?'}</span><span>${json.fr??'?'} fps · ${duration?duration.toFixed(2)+' s':'duration n/a'}</span><span>${json.layers?.length??0} layers</span></div>`;}catch{body.innerHTML='<div class="assetsEmpty">Lottie metadata unavailable</div>';}
    }else if(asset.preview==='text'&&asset.origin==='project'){
      try{const response=await fetch(asset.url,{cache:'no-store'}),text=await response.text();body.innerHTML=`<pre>${html(text.slice(0,5000))}${text.length>5000?'\n…':''}</pre>`;}catch{body.innerHTML='<div class="assetsEmpty">Preview unavailable</div>';}
    }else body.innerHTML=`<div class="assetFileGlyph">${html((asset.extension||'file').replace('.','').toUpperCase())}</div>`;
  };

  const click=(event:MouseEvent):void=>{
    const filter=(event.target as Element|null)?.closest<HTMLButtonElement>('[data-assets-filter]');if(filter){active=(filter.dataset.assetsFilter??'all') as typeof active;render();return;}
    if((event.target as Element|null)?.closest('[data-assets-refresh]')){void load({forceLocal:true});return;}
    const card=(event.target as Element|null)?.closest<HTMLElement>('[data-asset-id]');if(card){const asset=assets.find(item=>item.id===card.dataset.assetId);if(asset)void showPreview(asset);}
  };
  const input=():void=>render();
  const visibilityObserver=new MutationObserver(()=>{if(!section.hidden)void load({quiet:true});});visibilityObserver.observe(section,{attributes:true,attributeFilter:['hidden']});
  const syncTimer=setInterval(()=>{const project=store.get().project;if(!section.hidden&&project&&(project.browserSessionId||window.animatorDesktop?.blink))void load({quiet:true});},750);
  section.addEventListener('click',click);search.addEventListener('input',input);
  const unsubscribe=store.subscribe(()=>{const id=store.get().project?.id??'';if(id!==lastProjectId){lastProjectId=id;cachedLocalProjectId='';cachedLocalAssets=[];void load();}});lastProjectId=store.get().project?.id??'';void load();
  return()=>{generation++;clearInterval(syncTimer);visibilityObserver.disconnect();unsubscribe();section.removeEventListener('click',click);search.removeEventListener('input',input);section.remove();};
}

function runtimeAsset(resource:RuntimeResource):AssetRecord|undefined{
  let parsed:URL;try{parsed=new URL(resource.url);}catch{return undefined;}if(!['http:','https:','ws:','wss:'].includes(parsed.protocol))return undefined;
  const rawName=decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1)??parsed.hostname),name=rawName||parsed.hostname,extension=(name.match(/\.([a-z0-9]+)$/i)?.[1]??'').toLowerCase(),description=classifyRuntime(extension,resource);
  return{id:`runtime:${resource.url}`,path:resource.url,name,extension:extension?`.${extension}`:'',category:description.category,kind:description.kind,preview:description.preview,size:resource.decodedBodySize||resource.transferSize||0,url:resource.url,origin:'runtime'};
}
function classifyRuntime(ext:string,resource:RuntimeResource):{category:AssetCategory;kind:string;preview:AssetPreview}{
  const type=String(resource.resourceType||resource.initiatorType||'other').toLowerCase(),mime=String(resource.mimeType||'').toLowerCase(),url=resource.url.toLowerCase();
  if(ext==='lottie')return{category:'lottie',kind:'DotLottie',preview:'lottie'};
  if(ext==='json'&&/lottie|animation/.test(url))return{category:'lottie',kind:'Lottie JSON',preview:'lottie'};
  if(imageExt.has(ext)||type==='image'||mime.startsWith('image/'))return{category:'media',kind:ext==='svg'||mime==='image/svg+xml'?'Vector image':'Image',preview:'image'};
  if(videoExt.has(ext)||mime.startsWith('video/'))return{category:'media',kind:'Video',preview:'video'};
  if(audioExt.has(ext)||mime.startsWith('audio/'))return{category:'media',kind:'Audio',preview:'audio'};
  if(type==='media')return{category:'media',kind:'Media',preview:'none'};
  if(fontExt.has(ext)||type==='font'||mime.startsWith('font/')||/font|woff|opentype|truetype/.test(mime))return{category:'typography',kind:'Font',preview:'font'};
  if(styleExt.has(ext)||type==='stylesheet'||mime==='text/css')return{category:'styles',kind:'Stylesheet',preview:'text'};
  if(ext==='wasm'||mime==='application/wasm')return{category:'source',kind:'WebAssembly',preview:'none'};
  if(sourceExt.has(ext)||type==='script'||/javascript|ecmascript/.test(mime))return{category:'source',kind:'Source',preview:'text'};
  if(type==='websocket')return{category:'data',kind:'WebSocket',preview:'none'};
  if(type==='xhr')return{category:'data',kind:'XHR',preview:'text'};
  if(type==='fetch')return{category:'data',kind:'Fetch',preview:'text'};
  if(type==='eventsource')return{category:'data',kind:'EventSource',preview:'text'};
  if(type==='manifest'||ext==='webmanifest')return{category:'data',kind:'Manifest',preview:'text'};
  if(type==='ping'||type==='cspreport')return{category:'data',kind:'Request',preview:'none'};
  if(dataExt.has(ext)||/json|xml|yaml|csv|event-stream/.test(mime))return{category:'data',kind:'Data',preview:'text'};
  if(documentExt.has(ext)||type==='mainframe'||type==='subframe'||type==='document'||mime==='text/html'||mime==='application/pdf')return{category:'documents',kind:type==='subframe'?'Frame':'Document',preview:'none'};
  return{category:'other',kind:resource.resourceType||resource.initiatorType||'Resource',preview:'none'};
}
function filterButton(value:string,label:string,total:number,active:boolean):string{return`<button type="button" data-assets-filter="${attr(value)}" class="${active?'active':''}">${html(label)} <small>${total}</small></button>`;}
function assetCard(asset:AssetRecord,selected:boolean):string{return`<button type="button" class="assetCard ${selected?'selected':''}" data-asset-id="${attr(asset.id)}"><span class="assetThumb">${thumb(asset)}</span><span class="assetCardText"><b>${html(asset.name)}</b><small>${html(categoryLabels[asset.category])} · ${html(asset.kind)}${asset.size?` · ${formatBytes(asset.size)}`:''}</small><em>${html(asset.origin==='runtime'?host(asset.url):asset.path)}</em></span></button>`;}
function thumb(asset:AssetRecord):string{if(asset.preview==='image')return`<img src="${attr(asset.url)}" alt="">`;const labels:Record<AssetCategory,string>={media:'MEDIA',typography:'Aa',lottie:'LOT',source:'</>',styles:'CSS',data:'{}',documents:'DOC',other:'FILE'};return`<i data-category="${asset.category}">${labels[asset.category]}</i>`;}
function previewShell(asset:AssetRecord):string{return`<header><div><b>${html(asset.name)}</b><small>${html(categoryLabels[asset.category])} · ${html(asset.kind)}${asset.size?` · ${formatBytes(asset.size)}`:''}</small></div></header><div class="assetPreviewBody" data-asset-preview-body></div><code>${html(asset.path)}</code>`;}
function formatBytes(value:number):string{if(value<1024)return`${value} B`;if(value<1024*1024)return`${(value/1024).toFixed(value<10240?1:0)} KB`;return`${(value/1024/1024).toFixed(1)} MB`;}
function host(value:string):string{try{return new URL(value).hostname;}catch{return value;}}
function normalizePath(value:string):string{return value.replace(/^\/+/, '').replace(/\\/g,'/');}
function hash(value:string):string{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
function html(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]??char);}
function attr(value:string):string{return html(value);}
function cssUrl(value:string):string{return value.replace(/["\\\n\r]/g,char=>`\\${char}`);}
