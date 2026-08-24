import { Router } from 'express';
import { installBrowserRuntimes, listBrowserRuntimes } from '../browser/runtime-manager.js';
import { BrowserControlService } from '../services/browser-control-service.js';

const browserSessionApi=()=>import('../browser-session.js');

export function createBrowserRouter(control:BrowserControlService):Router{
  const router=Router();
  router.get('/browser-runtimes',async(_req,res)=>{try{return res.json({runtimes:await listBrowserRuntimes()});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/browser-runtimes/install',async(req,res)=>{try{return res.json({runtimes:await installBrowserRuntimes(req.body?.engines)});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/browser-sessions/open',async(req,res)=>{try{return res.json(await control.open(req.body as Record<string,unknown>));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/browser-sessions/:id/snapshot',async(req,res)=>{try{const {browserSnapshot}=await browserSessionApi();res.setHeader('cache-control','no-store');return res.type('html').send(browserSnapshot(req.params.id));}catch(error){return res.status(404).send(error instanceof Error?error.message:String(error));}});
  router.get('/browser-sessions/:id/screenshot',async(req,res)=>{try{const {getBrowserSession}=await browserSessionApi(),session=getBrowserSession(req.params.id);if(!session||session.browserClosed)return res.status(409).send('Browser viewport is not available');const png=await session.page.screenshot({type:'png',fullPage:false,animations:'allow',caret:'hide',scale:'css'});res.setHeader('cache-control','no-store');return res.type('png').send(png);}catch(error){return res.status(500).send(error instanceof Error?error.message:String(error));}});
  router.get('/browser-sessions/:id/events',async(req,res)=>{try{const {drainBrowserEvents}=await browserSessionApi();return res.json(drainBrowserEvents(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/browser-sessions/:id/resources',async(req,res)=>{try{const {listBrowserResources}=await browserSessionApi();res.setHeader('cache-control','no-store');return res.json({resources:listBrowserResources(req.params.id)});}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/browser-sessions/:id/motion',async(req,res)=>{try{const {scanBrowserMotion}=await import('../browser-motion.js');res.setHeader('cache-control','no-store');return res.json(await scanBrowserMotion(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/browser-sessions/:id/state',async(req,res)=>{try{const {browserState}=await browserSessionApi();return res.json(await browserState(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/browser-sessions/:id/command',async(req,res)=>{try{const {sendBrowserCommand}=await browserSessionApi();await sendBrowserCommand(req.params.id,req.body as Record<string,unknown>);return res.json({ok:true});}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.delete('/browser-sessions/:id',async(req,res)=>{await control.closeSession(req.params.id);return res.status(204).end();});
  return router;
}
