import { createHash } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';
import { clockWorkerSource } from './clock-worker.js';
import { previewColorSchemeBootstrap, rewriteColorSchemeCss, stripPreviewColorScheme, type PreviewColorScheme } from './color-scheme.js';

export interface RemoteProjectDescriptor {
  id:string;
  root:string;
  entries:string[];
  selectedEntry:string;
  tree:[];
  previewOrigin:string;
  previewUrl:string;
  sourceUrl:string;
  kind:'remote';
}

type RemoteSession={server:http.Server;origin:string;source:URL;remoteOrigin:string};
const sessions=new Map<string,RemoteSession>();
const runtimePaths=new Map<string,string>([
  ['/__animator/runtime.js',runtimeSource],
  ['/__animator/seek-runtime.js',seekRuntimeSource],
  ['/__animator/mutation-runtime.js',mutationRuntimeSource],
  ['/__animator/aux-runtime.js',auxiliaryRuntimeSource],
  ['/__animator/clock-worker.js',clockWorkerSource]
]);
const runtimeInjection='<script src="/__animator/runtime.js"></script><script src="/__animator/seek-runtime.js"></script><script src="/__animator/mutation-runtime.js"></script><script src="/__animator/aux-runtime.js"></script>';
const blockedResponseHeaders=new Set(['content-security-policy','content-security-policy-report-only','x-frame-options','content-length','content-encoding','transfer-encoding','set-cookie']);

export async function openRemotePreview(input:string):Promise<RemoteProjectDescriptor>{
  const source=parseRemoteUrl(input);const id='remote-'+createHash('sha1').update(source.href).digest('hex').slice(0,16);
  let session=sessions.get(id);
  if(!session){
    const holder={origin:''};
    const mutable={remoteOrigin:source.origin};
    const server=createRemoteServer(source,mutable,()=>holder.origin);
    const port=await listenRandom(server);holder.origin=`http://127.0.0.1:${port}`;
    session={server,origin:holder.origin,source,remoteOrigin:mutable.remoteOrigin};sessions.set(id,session);
    server.once('close',()=>sessions.delete(id));
  }
  const path=source.pathname+(source.search||'');
  return{id,root:source.href,entries:[path||'/'],selectedEntry:path||'/',tree:[],previewOrigin:session.origin,previewUrl:session.origin+(path.startsWith('/')?path:'/'+path),sourceUrl:source.href,kind:'remote'};
}

function parseRemoteUrl(input:string):URL{
  const raw=input.trim();if(!raw)throw new Error('Enter a web URL');
  const value=/^https?:\/\//i.test(raw)?raw:'https://'+raw;const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Only http and https URLs are supported');
  if(url.username||url.password)throw new Error('URLs with embedded credentials are not supported');
  return url;
}

export function mapRemoteRedirect(location:string,target:URL,localOrigin:string):{remote:URL;local:string}{
  const remote=new URL(location,target);return{remote,local:localOrigin+remote.pathname+remote.search+remote.hash};
}

function createRemoteServer(source:URL,mutable:{remoteOrigin:string},localOrigin:()=>string):http.Server{
  let colorScheme:PreviewColorScheme='auto';
  return http.createServer(async(req,res)=>{
    if(serveRuntime(req,res))return;
    try{
      const stripped=stripPreviewColorScheme(req.url??'/');if(stripped.mode)colorScheme=stripped.mode;
      const local=new URL(stripped.path,'http://preview.local');
      const target=new URL(local.pathname+local.search,mutable.remoteOrigin+'/');
      const headers=new Headers();
      for(const [name,value] of Object.entries(req.headers)){
        if(value==null||['host','content-length','accept-encoding','origin','referer'].includes(name.toLowerCase()))continue;
        headers.set(name,Array.isArray(value)?value.join(', '):value);
      }
      headers.set('accept-encoding','identity');headers.set('origin',mutable.remoteOrigin);headers.set('referer',target.href);
      const rawBody=req.method==='GET'||req.method==='HEAD'?undefined:await readBody(req);
      const body=rawBody?rawBody.buffer.slice(rawBody.byteOffset,rawBody.byteOffset+rawBody.byteLength) as ArrayBuffer:undefined;
      const upstream=await fetch(target,{method:req.method??'GET',headers,body,redirect:'manual'}),responseHeaders=proxyHeaders(upstream.headers),location=upstream.headers.get('location');
      if(location&&upstream.status>=300&&upstream.status<400){const redirect=mapRemoteRedirect(location,target,localOrigin());mutable.remoteOrigin=redirect.remote.origin;responseHeaders.location=appendTheme(redirect.local,colorScheme);res.writeHead(upstream.status,responseHeaders);res.end();return;}
      const finalUrl=new URL(upstream.url||target.href);if(upstream.headers.get('content-type')?.includes('text/html'))mutable.remoteOrigin=finalUrl.origin;
      const type=String(upstream.headers.get('content-type')??'application/octet-stream'),textual=/text\/html|text\/css|javascript|ecmascript|application\/json|image\/svg\+xml/.test(type);
      if(!textual){const buffer=Buffer.from(await upstream.arrayBuffer());res.writeHead(upstream.status,responseHeaders);res.end(buffer);return;}
      let text=await upstream.text();const localBase=localOrigin();
      if(type.includes('text/html')){text=rewriteSameOrigin(text,finalUrl.origin,localBase).replace(/\s+integrity=(['"])[\s\S]*?\1/gi,'');text=injectHtml(text,colorScheme);}
      else if(type.includes('text/css'))text=rewriteColorSchemeCss(rewriteSameOrigin(text,finalUrl.origin,localBase),colorScheme);
      else if(type.includes('javascript')||type.includes('ecmascript')||type.includes('json')||type.includes('svg'))text=rewriteSameOrigin(text,finalUrl.origin,localBase);
      const output=Buffer.from(text);responseHeaders['content-length']=String(output.length);res.writeHead(upstream.status,responseHeaders);res.end(output);
    }catch(error){sendText(res,502,error instanceof Error?`Remote preview failed: ${error.message}`:'Remote preview failed');}
  });
}

function proxyHeaders(headers:Headers):Record<string,string>{const output:Record<string,string>={};headers.forEach((value,name)=>{if(!blockedResponseHeaders.has(name.toLowerCase())&&name.toLowerCase()!=='location')output[name]=value;});output['cache-control']='no-store';output['access-control-allow-origin']='*';return output;}
function rewriteSameOrigin(text:string,remoteOrigin:string,localOrigin:string):string{const escaped=remoteOrigin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),protocolRelative='//'+new URL(remoteOrigin).host;return text.replace(new RegExp(escaped,'g'),localOrigin).split(protocolRelative).join(localOrigin);}
function injectHtml(html:string,mode:PreviewColorScheme):string{if(html.includes('/__animator/seek-runtime.js'))return html;const injection=previewColorSchemeBootstrap(mode)+runtimeInjection;const head=/<head(?:\s[^>]*)?>/i.exec(html);if(head&&head.index!==undefined){const at=head.index+head[0].length;return html.slice(0,at)+injection+html.slice(at);}return injection+html;}
function appendTheme(input:string,mode:PreviewColorScheme):string{const url=new URL(input);if(mode==='auto'||mode==='system')url.searchParams.delete('__animator_color_scheme');else url.searchParams.set('__animator_color_scheme',mode);return url.toString();}
function serveRuntime(req:IncomingMessage,res:ServerResponse):boolean{const pathname=new URL(req.url??'/', 'http://preview.local').pathname,source=runtimePaths.get(pathname);if(source===undefined)return false;res.statusCode=200;res.setHeader('content-type','application/javascript; charset=utf-8');res.setHeader('cache-control','no-store');res.end(source);return true;}
function readBody(req:IncomingMessage):Promise<Buffer>{return new Promise((resolve,reject)=>{const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});}
function listenRandom(server:http.Server):Promise<number>{return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('Remote preview server did not expose a TCP port'));resolve(address.port);});});}
function sendText(res:ServerResponse,status:number,text:string):void{const body=Buffer.from(text);res.statusCode=status;res.setHeader('content-type','text/plain; charset=utf-8');res.setHeader('content-length',String(body.length));res.end(body);}
