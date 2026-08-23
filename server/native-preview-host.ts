import fs from 'node:fs';
import http, { type ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { LoadedProject } from './project.js';
import { resolveInside } from './project.js';

type NativePreviewSession={origin:string;server?:http.Server|undefined;process?:ChildProcess|undefined};
const sessions=new Map<string,NativePreviewSession>();

export async function ensureNativePreviewOrigin(project:LoadedProject):Promise<string>{
  const existing=sessions.get(project.id);if(existing)return existing.origin;
  const dev=await startKnownDevServer(project.root);
  if(dev){const session={origin:`http://127.0.0.1:${dev.port}`,process:dev.process};sessions.set(project.id,session);return session.origin;}
  const server=createStaticServer(project),port=await listenRandom(server),session={origin:`http://127.0.0.1:${port}`,server};sessions.set(project.id,session);server.once('close',()=>sessions.delete(project.id));return session.origin;
}

export function closeNativePreviewOrigin(projectId:string):void{
  const session=sessions.get(projectId);if(!session)return;
  session.server?.close();if(session.process)stopChild(session.process);sessions.delete(projectId);
}

export function closeAllNativePreviewOrigins():void{for(const id of [...sessions.keys()])closeNativePreviewOrigin(id);}

function createStaticServer(project:LoadedProject):http.Server{
  return http.createServer((req,res)=>{
    const requestUrl=new URL(req.url??'/','http://native.local');let requested=decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');if(!requested)requested=project.selectedEntry;
    let target:string;try{target=resolveInside(project.root,requested);}catch{return sendText(res,403,'Preview path escapes project root');}
    try{
      if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
      if(!fs.existsSync(target)){const acceptsHtml=String(req.headers.accept??'').includes('text/html');if(!acceptsHtml)return sendText(res,404,'Preview resource not found');target=resolveInside(project.root,project.selectedEntry);}
      if(fs.statSync(target).isDirectory())return sendText(res,404,'Preview resource not found');
      res.statusCode=200;res.setHeader('content-type',mime(target));res.setHeader('cache-control','no-store');fs.createReadStream(target).pipe(res);
    }catch(error){return sendText(res,404,error instanceof Error?error.message:'Preview resource not found');}
  });
}

async function startKnownDevServer(root:string):Promise<{port:number;process:ChildProcess}|undefined>{
  const packagePath=path.join(root,'package.json');if(!fs.existsSync(packagePath)||!fs.existsSync(path.join(root,'node_modules')))return undefined;
  let pkg:{scripts?:Record<string,string>|undefined;dependencies?:Record<string,string>|undefined;devDependencies?:Record<string,string>|undefined};try{pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as typeof pkg;}catch{return undefined;}
  const script=pkg.scripts?.dev??'',deps={...pkg.dependencies,...pkg.devDependencies},supported=/\b(vite|next|astro|parcel|react-scripts)\b/.test(script)||['vite','next','astro','parcel','react-scripts'].some(name=>name in deps);if(!script||!supported)return undefined;
  const port=await reservePort();let child:ChildProcess;
  if(process.platform==='win32'){
    const cmd=process.env.ComSpec??process.env.COMSPEC??'C:\\Windows\\System32\\cmd.exe',extra=/\bnext\b/.test(script)?` -- --hostname 127.0.0.1 --port ${port}`:/\b(vite|astro|parcel)\b/.test(script)?` -- --host 127.0.0.1 --port ${port}`:'';
    child=spawn(cmd,['/d','/s','/c',`npm run dev${extra}`],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BROWSER:'none'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  }else{
    const args=['run','dev'];if(/\bnext\b/.test(script))args.push('--','--hostname','127.0.0.1','--port',String(port));else if(/\b(vite|astro|parcel)\b/.test(script))args.push('--','--host','127.0.0.1','--port',String(port));
    child=spawn('npm',args,{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),BROWSER:'none'},stdio:['ignore','pipe','pipe']});
  }
  child.stdout?.resume();child.stderr?.resume();let exited=false;child.once('exit',()=>{exited=true;});const ready=await waitForHttp(port,12000,()=>exited);if(!ready){stopChild(child);return undefined;}return{port,process:child};
}

function stopChild(child:ChildProcess):void{if(child.killed)return;if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.unref();return;}child.kill();}
function waitForHttp(port:number,timeoutMs:number,stopped:()=>boolean):Promise<boolean>{return new Promise(async resolve=>{const deadline=Date.now()+timeoutMs;while(Date.now()<deadline&&!stopped()){const ok=await new Promise<boolean>(done=>{const req=http.get({hostname:'127.0.0.1',port,path:'/'},res=>{res.resume();done((res.statusCode??500)<500);});req.setTimeout(500,()=>{req.destroy();done(false);});req.on('error',()=>done(false));});if(ok)return resolve(true);await new Promise(done=>setTimeout(done,150));}resolve(false);});}
function listenRandom(server:http.Server):Promise<number>{return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string')return reject(new Error('Native preview server did not expose a TCP port'));resolve(address.port);});});}
function reservePort():Promise<number>{return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);const address=server.address();if(!address||typeof address==='string'){server.close();return reject(new Error('Unable to reserve native preview port'));}const port=address.port;server.close(error=>error?reject(error):resolve(port));});});}
function sendText(res:ServerResponse,status:number,text:string):void{const body=Buffer.from(text);res.statusCode=status;res.setHeader('content-type','text/plain; charset=utf-8');res.setHeader('content-length',String(body.length));res.end(body);}
function mime(file:string):string{const ext=path.extname(file).toLowerCase();return({'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp4':'video/mp4','.webm':'video/webm','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'} as Record<string,string>)[ext]??'application/octet-stream';}
