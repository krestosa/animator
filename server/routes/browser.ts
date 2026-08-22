import { Router } from 'express';
import { browserSnapshot, browserState, drainBrowserEvents, getBrowserSession, installBrowserRuntimes, listBrowserRuntimes, sendBrowserCommand } from '../browser-session.js';
import { scanBrowserMotion } from '../browser-motion.js';
import { BrowserControlService } from '../services/browser-control-service.js';

export function createBrowserRouter(control:BrowserControlService):Router{
  const router=Router();
  router.get('/runtimes',async(_req,res)=>{try{return res.json({runtimes:await listBrowserRuntimes()});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/runtimes/install',async(req,res)=>{try{return res.json({runtimes:await installBrowserRuntimes(req.body?.engines)});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/sessions/open',async(req,res)=>{try{return res.json(await control.open(req.body as Record<string,unknown>));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/sessions/:id/snapshot',(req,res)=>{try{res.setHeader('cache-control','no-store');return res.type('html').send(browserSnapshot(req.params.id));}catch(error){return res.status(404).send(error instanceof Error?error.message:String(error));}});
  router.get('/sessions/:id/screenshot',async(req,res)=>{try{const session=getBrowserSession(req.params.id);if(!session||session.browserClosed)return res.status(409).send('Browser viewport is not available');const png=await session.page.screenshot({type:'png',fullPage:false,animations:'allow',caret:'hide',scale:'css'});res.setHeader('cache-control','no-store');return res.type('png').send(png);}catch(error){return res.status(500).send(error instanceof Error?error.message:String(error));}});
  router.get('/sessions/:id/events',(req,res)=>{try{return res.json(drainBrowserEvents(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/sessions/:id/motion',async(req,res)=>{try{res.setHeader('cache-control','no-store');return res.json(await scanBrowserMotion(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/sessions/:id/state',async(req,res)=>{try{return res.json(await browserState(req.params.id));}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/sessions/:id/command',async(req,res)=>{try{await sendBrowserCommand(req.params.id,req.body as Record<string,unknown>);return res.json({ok:true});}catch(error){return res.status(404).json({error:error instanceof Error?error.message:String(error)});}});
  router.delete('/sessions/:id',async(req,res)=>{await control.closeSession(req.params.id);return res.status(204).end();});
  return router;
}
