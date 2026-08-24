import { Router, type Request } from 'express';
import { FolderSelectionCancelled, ProjectService } from '../services/project-service.js';

export function createProjectRouter(projects:ProjectService):Router{
  const router=Router();
  router.post('/open',async(req,res)=>{try{const project=await projects.openLocal(String(req.body?.path||''));if(isElectron(req))return res.json(project);return res.json(await projects.ensurePreview(project.id)??project);}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/open-url',async(req,res)=>{try{return res.json(await projects.openRemote(String(req.body?.url||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/pick-folder',async(req,res)=>{try{const project=await projects.pickFolder();if(isElectron(req))return res.json(project);return res.json(await projects.ensurePreview(project.id)??project);}catch(error){if(error instanceof FolderSelectionCancelled)return res.status(204).end();return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/:id/ensure-preview',async(req,res)=>{try{const project=await projects.ensurePreview(req.params.id);return project?res.json(project):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/native-preview',async(req,res)=>{try{const url=await projects.nativePreview(req.params.id,String(req.query.entry||''));return url?res.json({url}):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/analysis',async(req,res)=>{try{const analysis=await projects.analysis(req.params.id);return analysis?res.json(analysis):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/assets',(req,res)=>{try{const assets=projects.assets(req.params.id);return assets?res.json({assets}):res.status(404).json({error:'Project not loaded'});}catch(error){return res.status(500).json({error:error instanceof Error?error.message:String(error)});}});
  router.get('/:id/asset',(req,res)=>{try{const file=projects.assetPath(req.params.id,String(req.query.path||''));if(!file)return res.status(404).end();res.setHeader('cache-control','no-store');return res.sendFile(file);}catch(error){return res.status(400).send(error instanceof Error?error.message:String(error));}});
  router.get('/:id/source',(req,res)=>{try{const source=projects.source(req.params.id,String(req.query.path||''));return source===undefined?res.status(404).end():res.type('text/plain').send(source);}catch(error){return res.status(400).send(String(error));}});
  return router;
}

function isElectron(req:Request):boolean{return /\bElectron\/\d/i.test(req.get('user-agent')??'');}
