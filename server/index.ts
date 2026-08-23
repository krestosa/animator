import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import { createBrowserRouter } from './routes/browser.js';
import { createControlRouter } from './routes/control.js';
import { createExportRouter } from './routes/export.js';
import { createProjectRouter } from './routes/projects.js';
import { createRuntimeRouter } from './routes/runtime.js';
import { createScreenshotRouter } from './routes/screenshots.js';
import { BrowserControlService } from './services/browser-control-service.js';
import { ProjectService } from './services/project-service.js';
import { registerPreviewRoutes } from './services/preview-service.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));

export type AnimatorServerHandle={host:string;port:number;origin:string;close:()=>Promise<void>};
export type AnimatorServerOptions={host?:string;port?:number;production?:boolean};

export async function startAnimatorServer(options:AnimatorServerOptions={}):Promise<AnimatorServerHandle>{
  const expressApp=express();
  const projects=new ProjectService();
  const browserControl=new BrowserControlService();

  expressApp.use(express.json({limit:'2mb'}));
  expressApp.get('/api/health',(_req,res)=>res.json({ok:true}));
  expressApp.use('/api/projects',createProjectRouter(projects));
  expressApp.use('/api',createBrowserRouter(browserControl));
  expressApp.use('/api/control',createControlRouter(browserControl));
  expressApp.use('/api',createExportRouter(projects));
  expressApp.use('/api',createScreenshotRouter());
  expressApp.use('/__animator',createRuntimeRouter());
  registerPreviewRoutes(expressApp);

  const production=options.production??(process.env.NODE_ENV==='production'||process.argv.includes('--production'));
  let vite:ViteDevServer|undefined;
  if(production)expressApp.use(express.static(path.resolve(__dirname,'../../dist')));
  else{
    const {createServer:createViteServer}=await import('vite');
    vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});
    expressApp.use(vite.middlewares);
  }

  const host=options.host??process.env.HOST??'127.0.0.1';
  const requestedPort=options.port??Number(process.env.PORT||5173);
  const httpServer=await new Promise<ReturnType<typeof expressApp.listen>>((resolve,reject)=>{
    const server=expressApp.listen(requestedPort,host,()=>resolve(server));
    server.once('error',reject);
  });
  const address=httpServer.address();
  const port=typeof address==='object'&&address?address.port:requestedPort;
  const origin=`http://${host}:${port}`;
  let closed=false;
  const close=async():Promise<void>=>{
    if(closed)return;
    closed=true;
    const {closeAllBrowserSessions}=await import('./browser-session.js');
    await closeAllBrowserSessions();
    if(vite)await vite.close();
    await new Promise<void>(resolve=>httpServer.close(()=>resolve()));
  };
  return{host,port,origin,close};
}

const directEntry=process.argv[1]?path.resolve(process.argv[1]):'';
if(directEntry===fileURLToPath(import.meta.url)){
  const server=await startAnimatorServer();
  console.log(`Animator: ${server.origin}`);
  const shutdown=async():Promise<void>=>{await server.close();process.exit(0);};
  process.once('SIGINT',()=>void shutdown());
  process.once('SIGTERM',()=>void shutdown());
}
