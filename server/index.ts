import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import ts from 'typescript';
import { analyzeProject } from './analysis.js';
import { getProject, loadProject, resolveInside, setProjectPreviewOrigin, type LoadedProject } from './project.js';
import { runtimeSource } from './runtime.js';
import { auxiliaryRuntimeSource } from './aux-runtime.js';
import { seekRuntimeSource } from './seek-runtime.js';
import { mutationRuntimeSource } from './mutation-runtime.js';
import { recordResumeRuntimeSource } from './record-resume-runtime.js';
import { browserSnapshotRuntimeSource } from './browser-snapshot-runtime.js';
import { clockWorkerSource } from './clock-worker.js';
import { ensurePreviewOrigin } from './preview-host.js';
import { openRemotePreview } from './remote-preview.js';
import { browserSnapshot, browserState, closeAllBrowserSessions, closeBrowserSession, drainBrowserEvents, installBrowserRuntimes, listBrowserRuntimes, openBrowserSession, sendBrowserCommand } from './browser-session.js';
import { scanBrowserMotion } from './browser-motion.js';
import { applyCssAnimationEdit, previewCssAnimationEdit, writeOverrides, type CssAnimationEdit } from './export.js';
import { FolderSelectionCancelled, pickProjectFolder } from './folder-dialog.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();app.use(express.json({limit:'2mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.post('/api/projects/open',async(req,res)=>{try{const project=loadProject(String(req.body?.path||''));return res.json(await preparePreview(project));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/projects/open-url',async(req,res)=>{try{return res.json(await openRemotePreview(String(req.body?.url||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/browser-runtimes',async(_req,res)=>{try{return res.json({runtimes:await listBrowserRuntimes()});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/browser-runtimes/install',async(req,res)=>{try{return res.json({runtimes:await installBrowserRuntimes(req.body?.engines)});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/browser-sessions/open',async(req,res)=>{try{return res.json(await openBrowserSession(String(req.body?.url||''),{width:Number(req.body?.width)||1100,height:Number(req.body?.height)||700,engine:req.body?.engine,profile:req.body?.profile}));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/browser-sessions/:id/snapshot',(req,res)=>{try{res.setHeader('cache-control','no-store');return res.type('html').send(browserSnapshot(req.params.id));}catch(error){return res.status(404).send(error instanceof Error?error.message:String(error));}});
app.get('/api/browser-sessions/:id/events',(req,res)=>{try{return res.json(drainBrowserEvents(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/browser-sessions/:id/motion',async(req,res)=>{try{res.setHeader('cache-control','no-store');return res.json(await scanBrowserMotion(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/browser-sessions/:id/state',async(req,res)=>{try{return res.json(await browserState(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/browser-sessions/:id/command',async(req,res)=>{try{await sendBrowserCommand(req.params.id,req.body as Record<string,unknown>);return res.json({ok:true});}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
app.delete('/api/browser-sessions/:id',async(req,res)=>{await closeBrowserSession(req.params.id);return res.status(204).end();});
app.post('/api/projects/pick-folder',async(_req,res)=>{try{const selected=await pickProjectFolder();const project=loadProject(selected);return res.json(await preparePreview(project));}catch(error){if(error instanceof FolderSelectionCancelled)return res.status(204).end();return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/projects/:id/ensure-preview',async(req,res)=>{const project=getProject(req.params.id);if(!project)return res.status(404).json({error:'Project not loaded'});try{return res.json(await preparePreview(project));}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/projects/:id/analysis',(req,res)=>{const p=getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not loaded'});try{return res.json(analyzeProject(p));}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/api/projects/:id/source',(req,res)=>{const p=getProject(req.params.id);if(!p)return res.status(404).end();try{const file=resolveInside(p.root,String(req.query.path||''));return res.type('text/plain').send(fs.readFileSync(file,'utf8'));}catch(error){return res.status(400).send(String(error));}});
app.post('/api/projects/:id/export-overrides',(req,res)=>{const p=getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not loaded'});try{return res.json(writeOverrides(p,String(req.body?.css||''),String(req.body?.ts||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/projects/:id/preview-css-apply',(req,res)=>{const p=getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not loaded'});try{return res.json(previewCssAnimationEdit(p,req.body as CssAnimationEdit));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.post('/api/projects/:id/apply-css',(req,res)=>{const p=getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not loaded'});try{return res.json(applyCssAnimationEdit(p,req.body as CssAnimationEdit));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
app.get('/__animator/runtime.js',(_req,res)=>res.type('application/javascript').send(runtimeSource));
app.get('/__animator/aux-runtime.js',(_req,res)=>res.type('application/javascript').send(auxiliaryRuntimeSource));
app.get('/__animator/seek-runtime.js',(_req,res)=>res.type('application/javascript').send(seekRuntimeSource));
app.get('/__animator/mutation-runtime.js',(_req,res)=>res.type('application/javascript').send(mutationRuntimeSource));
app.get('/__animator/record-resume-runtime.js',(_req,res)=>res.type('application/javascript').send(recordResumeRuntimeSource));
app.get('/__animator/browser-snapshot-runtime.js',(_req,res)=>res.type('application/javascript').send(browserSnapshotRuntimeSource));
app.get('/__animator/clock-worker.js',(_req,res)=>res.type('application/javascript').send(clockWorkerSource));

app.get('/preview/:id/*path',(req,res,next)=>{if(req.params.id.startsWith('browser-'))return res.type('html').send('<!doctype html><html><body></body></html>');return serveLegacyPreview(req.params.id,String(req.params.path||''),res,next);});
app.get('/preview/:id',(req,res,next)=>{if(req.params.id.startsWith('browser-'))return res.type('html').send('<!doctype html><html><body></body></html>');const p=getProject(req.params.id);if(!p)return res.status(404).send('Project not loaded');return serveLegacyPreview(req.params.id,p.selectedEntry,res,next);});
function previewProjectFromReferer(referer:string|undefined):string|undefined{if(!referer)return undefined;try{const match=new URL(referer).pathname.match(/^\/preview\/([^/]+)(?:\/|$)/);return match?.[1]?decodeURIComponent(match[1]):undefined;}catch{return undefined;}}
app.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD')return next();if(req.path.startsWith('/api/')||req.path.startsWith('/preview/')||req.path.startsWith('/__animator/'))return next();const projectId=previewProjectFromReferer(req.get('referer'));if(!projectId||!getProject(projectId))return next();return serveLegacyPreview(projectId,decodeURIComponent(req.path).replace(/^\/+/,''),res,next);});
function serveLegacyPreview(id:string,requested:string,res:express.Response,next:express.NextFunction){const p=getProject(id);if(!p)return res.status(404).send('Project not loaded');try{const target=resolveInside(p.root,requested||p.selectedEntry);if(fs.statSync(target).isDirectory())return next();if(/\.html?$/i.test(target)){let html=fs.readFileSync(target,'utf8');const baseDir=path.posix.dirname('/preview/'+id+'/'+(requested||p.selectedEntry));const base=`<base href="${baseDir.endsWith('/')?baseDir:baseDir+'/'}">`;const inject=`${base}<script src="/__animator/runtime.js"></script><script src="/__animator/seek-runtime.js"></script><script src="/__animator/mutation-runtime.js"></script><script src="/__animator/aux-runtime.js"></script>`;html=html.includes('<head>')?html.replace('<head>',`<head>${inject}`):inject+html;return res.type('html').send(html);}if(/\.[cm]?tsx?$/i.test(target)){const source=fs.readFileSync(target,'utf8');const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,sourceMap:true},fileName:target});return res.type('application/javascript').send(output.outputText);}return res.sendFile(target);}catch{return res.status(404).send('Preview resource not found');}}
async function preparePreview(project:LoadedProject):Promise<LoadedProject>{const origin=await ensurePreviewOrigin(project);return setProjectPreviewOrigin(project.id,origin)??project;}

const production=process.env.NODE_ENV==='production'||process.argv.includes('--production');if(production)app.use(express.static(path.resolve(__dirname,'../../dist')));else{const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}const port=Number(process.env.PORT||5173);const httpServer=app.listen(port,()=>console.log(`Animator: http://localhost:${port}`));
const shutdown=async():Promise<void>=>{await closeAllBrowserSessions();httpServer.close(()=>process.exit(0));};
process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());