import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { closeAllBrowserSessions } from './browser-session.js';
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
const app=express();
const projects=new ProjectService();
const browserControl=new BrowserControlService();

app.use(express.json({limit:'2mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.use('/api/projects',createProjectRouter(projects));
app.use('/api',createBrowserRouter(browserControl));
app.use('/api/control',createControlRouter(browserControl));
app.use('/api',createExportRouter(projects));
app.use('/api',createScreenshotRouter());
app.use('/__animator',createRuntimeRouter());
registerPreviewRoutes(app);

const production=process.env.NODE_ENV==='production'||process.argv.includes('--production');
if(production)app.use(express.static(path.resolve(__dirname,'../../dist')));
else{
  const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
}

const port=Number(process.env.PORT||5173);
const httpServer=app.listen(port,()=>console.log(`Animator: http://localhost:${port}`));
const shutdown=async():Promise<void>=>{await closeAllBrowserSessions();httpServer.close(()=>process.exit(0));};
process.once('SIGINT',()=>void shutdown());
process.once('SIGTERM',()=>void shutdown());
