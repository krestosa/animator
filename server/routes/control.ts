import { Router } from 'express';
import { installBrowserRuntimes } from '../browser/runtime-manager.js';
import { BrowserControlService } from '../services/browser-control-service.js';

export function createControlRouter(control:BrowserControlService):Router{
  const router=Router();
  router.get('/status',async(_req,res)=>{try{return res.json(await control.status());}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/open',async(req,res)=>{try{const session=await control.open(req.body as Record<string,unknown>);return res.json({ok:true,revision:control.revision,session,project:control.project(session)});}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/record',async(req,res)=>{try{const state=await control.record(req.body?.sessionId,req.body?.enabled!==false,'control');return res.json({ok:true,revision:control.revision,state});}catch(error){return res.status(409).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/stop',async(req,res)=>{try{const state=await control.stop(req.body?.sessionId,req.body?.hard===true);return res.json({ok:true,revision:control.revision,state});}catch(error){return res.status(409).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/start',async(req,res)=>{try{const state=await control.start(req.body?.sessionId);return res.json({ok:true,revision:control.revision,state});}catch(error){return res.status(409).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/close',async(req,res)=>{try{const state=await control.closeWindow(req.body?.sessionId);return res.json({ok:true,revision:control.revision,state});}catch(error){return res.status(409).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/browsers/install',async(req,res)=>{try{return res.json({ok:true,runtimes:await installBrowserRuntimes(req.body?.engines)});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  return router;
}
