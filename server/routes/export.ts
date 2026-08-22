import { Router } from 'express';
import { applyCssAnimationEdit, previewCssAnimationEdit, writeOverrides, type CssAnimationEdit } from '../export.js';
import { ProjectService } from '../services/project-service.js';

export function createExportRouter(projects:ProjectService):Router{
  const router=Router();
  router.post('/projects/:id/export-overrides',(req,res)=>{const project=projects.get(req.params.id);if(!project)return res.status(404).json({error:'Project not loaded'});try{return res.json(writeOverrides(project,String(req.body?.css||''),String(req.body?.ts||'')));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/projects/:id/preview-css-apply',(req,res)=>{const project=projects.get(req.params.id);if(!project)return res.status(404).json({error:'Project not loaded'});try{return res.json(previewCssAnimationEdit(project,req.body as CssAnimationEdit));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  router.post('/projects/:id/apply-css',(req,res)=>{const project=projects.get(req.params.id);if(!project)return res.status(404).json({error:'Project not loaded'});try{return res.json(applyCssAnimationEdit(project,req.body as CssAnimationEdit));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:String(error)});}});
  return router;
}
