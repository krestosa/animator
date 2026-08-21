import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import ts from 'typescript';
import type { LoadedProject } from './project.js';
import { resolveInside } from './project.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';
import { clockWorkerSource } from './clock-worker.js';
import { previewColorSchemeBootstrap, resolvePreviewColorScheme, rewriteColorSchemeCss, rewriteInlineColorSchemeStyles, stripPreviewColorScheme, type PreviewColorScheme } from './color-scheme.js';

interface PreviewSession {
  origin:string;
  server:http.Server;
  upstream?:{port:number;process:ChildProcess}|undefined;
}

const sessions=new Map<string,PreviewSession>();
const runtimePaths=new Map<string,string>([
  ['/__animator/runtime.js',runtimeSource],
  ['/__animator/seek-runtime.js',seekRuntimeSource],
  ['/__animator/mutation-runtime.js',mutationRuntimeSource],
  ['/__animator/aux-runtime.js',auxiliaryRuntimeSource],
  ['/__animator/clock-worker.js',clockWorkerSource]
]);
const runtimeInjection='<script src="/__animator/runtime.js"></script><script src="/__animator/seek-runtime.js"></script><script src="/__animator/mutation-runtime.js"></script><script src="/__animator/aux-runtime.js"></script>';

export async function ensurePreviewOrigin(project:LoadedProject):Promise<string>{
  const existing=sessions.get(project.id);if(existing)return existing.origin;
  const upstream=await startKnownDevServer(project.root);
  const server=upstream?createProxyServer(upstream.port):createStaticServer(project);
  const port=await listenRandom(server);
  const session:PreviewSession={origin:`http://127.0.0.1:${port}`,server,upstream};
  sessions.set(project.id,session);
  server.once('close',()=>{sessions.delete(project.id);if(upstream)stopChild(upstream.process);});
  return session.origin;
}

export function closePreviewOrigin(projectId:string):void{
  const session=sessions.get(projectId);if(!session)return;
  session.server.close();
  if(session.upstream)stopChild(session.upstream.process);
  sessions.delete(projectId);
}

function createStaticServer(project:LoadedProject):http.Server{
  let colorScheme:PreviewColorScheme='auto';
  return http.createServer((req,res)=>{
    if(serveRuntime(req,res))return;
    const stripped=stripPreviewColorScheme(req.url??'/'),documentRequest=isDocumentRequest(req),requestScheme=resolvePreviewColorScheme(stripped.mode,stringHeader(req.headers.referer),documentRequest,colorScheme);
    if(documentRequest)colorScheme=requestScheme;
    const requestUrl=new URL(stripped.path,'http://preview.local');
    let requested=decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
    if(!requested)requested=project.selectedEntry;
    let target:string;
    try{target=resolveInside(project.root,requested);}catch{return sendText(res,403,'Preview path escapes project root');}
    try{
      if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
      if(!fs.existsSync(target)){
        const acceptsHtml=String(req.headers.accept??'').includes('text/html');
        if(!acceptsHtml)return sendText(res,404,'Preview resource not found');
        target=resolveInside(project.root,project.selectedEntry);
      }
      if(/\.html?$/i.test(target))return sendHtml(res,injectHtml(fs.readFileSync(target,'utf8'),requestScheme));
      if(/\.css$/i.test(target))return send(res,200,'text/css; charset=utf-8',Buffer.from(rewriteColorSchemeCss(fs.readFileSync(target,'utf8'),requestScheme)));
      if(/\.[cm]?tsx?$/i.test(target)){
        const source=fs.readFileSync(target,'utf8');
        const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,sourceMap:true},fileName:target});
        return send(res,200,'application/javascript; charset=utf-8',Buffer.from(output.outputText));
      }
      const body=fs.readFileSync(target);return send(res,200,mime(target),body);
    }catch(error){return sendText(res,404,error instanceof Error?error.message:'Preview resource not found');}
  });
}

function createProxyServer(upstreamPort:number):http.Server{
  let colorScheme:PreviewColorScheme='auto';
  const server=http.createServer((req,res)=>{
    if(serveRuntime(req,res))return;
    const stripped=stripPreviewColorScheme(req.url??'/'),documentRequest=isDocumentRequest(req),requestScheme=resolvePreviewColorScheme(stripped.mode,stringHeader(req.headers.referer),documentRequest,colorScheme);
    if(documentRequest)colorScheme=requestScheme;
    const headers={...req.headers,host:`127.0.0.1:${upstreamPort}`,'accept-encoding':'identity'};
    if(requestScheme==='light'||requestScheme==='dark')headers['sec-ch-prefers-color-scheme']=requestScheme;else delete headers['sec-ch-prefers-color-scheme'];
    const proxy=http.request({hostname:'127.0.0.1',port:upstreamPort,path:stripped.path,method:req.method,headers},upstream=>{
      const responseHeaders={...upstream.headers};
      delete responseHeaders['content-security-policy'];delete responseHeaders['content-security-policy-report-only'];delete responseHeaders['x-frame-options'];delete responseHeaders['content-length'];
      const contentType=String(upstream.headers['content-type']??'');
      const shouldTransform=contentType.includes('text/html')||contentType.includes('text/css');
      if(!shouldTransform){res.writeHead(upstream.statusCode??200,responseHeaders);upstream.pipe(res);return;}
      const chunks:Buffer[]=[];upstream.on('data',(chunk:Buffer|string)=>chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
      upstream.on('end',()=>{
        const source=Buffer.concat(chunks).toString('utf8');
        const text=contentType.includes('text/html')?injectHtml(source,requestScheme):rewriteColorSchemeCss(source,requestScheme);
        const body=Buffer.from(text);res.writeHead(upstream.statusCode??200,{...responseHeaders,'content-type':contentType.includes('text/html')?'text/html; charset=utf-8':'text/css; charset=utf-8','content-length':String(body.length)});res.end(body);
      });
    });
    proxy.on('error',error=>sendText(res,502,`Project dev server unavailable: ${error.message}`));req.pipe(proxy);
  });
  server.on('upgrade',(req,socket,head)=>{
    const stripped=stripPreviewColorScheme(req.url??'/');
    const upstream=net.connect(upstreamPort,'127.0.0.1',()=>{
      const headers=Object.entries({...req.headers,host:`127.0.0.1:${upstreamPort}`}).map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):value??''}`).join('\r\n');
      upstream.write(`${req.method??'GET'} ${stripped.path} HTTP/${req.httpVersion}\r\n${headers}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());
  });
  return server;
}

function serveRuntime(req:IncomingMessage,res:ServerResponse):boolean{
  const pathname=new URL(req.url??'/', 'http://preview.local').pathname;const source=runtimePaths.get(pathname);if(source===undefined)return false;
  send(res,200,'application/javascript; charset=utf-8',Buffer.from(source));return true;
}

function injectHtml(html:string,mode:PreviewColorScheme):string{
  if(html.includes('/__animator/seek-runtime.js'))return html;
  const source=rewriteInlineColorSchemeStyles(html,mode),injection=previewColorSchemeBootstrap(mode)+runtimeInjection;
  const head=/<head(?:\s[^>]*)?>/i.exec(source);if(head&&head.index!==undefined){const at=head.index+head[0].length;return source.slice(0,at)+injection+source.slice(at);}
  return injection+source;
}

function isDocumentRequest(req:IncomingMessage):boolean{return String(req.headers['sec-fetch-dest']??'')==='document'||String(req.headers.accept??'').includes('text/html');}
function stringHeader(value:string|string[]|undefined):string|undefined{return Array.isArray(value)?value[0]:value;}

async function startKnownDevServer(root:string):Promise<{port:number;process:ChildProcess}|undefined>{
  const packagePath=path.join(root,'package.json');if(!fs.existsSync(packagePath)||!fs.existsSync(path.join(root,'node_modules')))return undefined;
  let pkg:{scripts?:Record<string,string>|undefined;dependencies?:Record<string,string>|undefined;devDependencies?:Record<string,string>|undefined};
  try{pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as typeof pkg;}catch{return undefined;}
  const scriptName=pkg.scripts?.dev?'dev':undefined;if(!scriptName)return undefined;
  const script=pkg.scripts?.[scriptName]??'';const deps={...pkg.dependencies,...pkg.devDependencies};
  const supported=/\b(vite|next|astro|parcel|react-scripts)\b/.test(script)||['vite','next','astro','parcel','react-scripts'].some(name=>name in deps);
  if(!supported)return undefined;
  const port=await reservePort();const npm=process.platform==='win32'?'npm.cmd':'npm';const args=['run',scriptName];
  if(/\bnext\b/.test(script))args.push('--','--hostname','127.0.0.1','--port',String(port));
  else if(/\b(vite|astro|parcel)\b/.test(script))args.push('--','--host','127.0.0.1','--port',String(port));
  const child=spawn(npm,args,{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BROWSER:'none'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout?.resume();child.stderr?.resume();
  let exited=false;child.once('exit',()=>{exited=true;});
  const ready=await waitForHttp(port,12000,()=>exited);if(!ready){stopChild(child);return undefined;}
  return {port,process:child};
}

function stopChild(child:ChildProcess):void{
  if(child.killed)return;
  if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.unref();return;}
  child.kill();
}
async function waitForHttp(port:number,timeoutMs:number,stopped:()=>boolean):Promise<boolean>{
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline&&!stopped()){
    const ok=await new Promise<boolean>(resolve=>{
      const req=http.get({hostname:'127.0.0.1',port,path:'/'},res=>{res.resume();resolve((res.statusCode??500)<500);});
      req.setTimeout(500,()=>{req.destroy();resolve(false);});
      req.on('error',()=>resolve(false));
    });
    if(ok)return true;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  return false;
}

function listenRandom(server:http.Server):Promise<number>{return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('Preview server did not expose a TCP port'));resolve(address.port);});});}
function reservePort():Promise<number>{return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();if(!address||typeof address==='string'){server.close();return reject(new Error('Unable to reserve preview port'));}const port=address.port;server.close(error=>error?reject(error):resolve(port));});});}
function sendHtml(res:ServerResponse,html:string):void{send(res,200,'text/html; charset=utf-8',Buffer.from(html));}
function sendText(res:ServerResponse,status:number,text:string):void{send(res,status,'text/plain; charset=utf-8',Buffer.from(text));}
function send(res:ServerResponse,status:number,contentType:string,body:Buffer):void{res.statusCode=status;res.setHeader('content-type',contentType);res.setHeader('content-length',String(body.length));res.setHeader('cache-control','no-store');res.end(body);}
function mime(file:string):string{const ext=path.extname(file).toLowerCase();return ({'.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp4':'video/mp4','.webm':'video/webm','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'} as Record<string,string>)[ext]??'application/octet-stream';}
