import { Router } from 'express';
import { FolderSelectionCancelled, ProjectService } from '../services/project-service.js';

export function createProjectRouter(projects:ProjectService):Router{
  const router=Router();
  router.post('/open',async(req,res)=>{try{return res.json(await projects.openLocal(String(req.body?.path||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/open-url',async(req,res)=>{try{return res.json(await projects.openRemote(String(req.body?.url||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/pick-folder',async(_req,res)=>{try{return res.json(await projects.pickFolder());}catch(error){if(error instanceof FolderSelectionCancelled)return res.status(204).end();return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/:id/ensure-preview',async(req,res)=>{try{const project=await projects.ensurePreview(req.params.id);return project?res.json(project):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/analysis',(req,res)=>{try{const analysis=projects.analysis(req.params.id);return analysis?res.json(analysis):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/source',(req,res)=>{try{const source=projects.source(req.params.id,String(req.query.path||''));return source===undefined?res.status(404).end():res.type('text/plain').send(source);}catch(error){return res.status(400).send(String(error));}});
  return router;
}
