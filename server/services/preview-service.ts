import fs from 'node:fs';
import path from 'node:path';
import type { Express, NextFunction, Response } from 'express';
import ts from 'typescript';
import { getProject, resolveInside } from '../project.js';

export function registerPreviewRoutes(app:Express):void{
  app.get('/preview/:id/*path',(req,res,next)=>{
    if(req.params.id.startsWith('browser-'))return res.type('html').send('<!doctype html><html><body></body></html>');
    return serveLegacyPreview(req.params.id,String(req.params.path||''),res,next);
  });
  app.get('/preview/:id',(req,res,next)=>{
    if(req.params.id.startsWith('browser-'))return res.type('html').send('<!doctype html><html><body></body></html>');
    const project=getProject(req.params.id);if(!project)return res.status(404).send('Project not loaded');
    return serveLegacyPreview(req.params.id,project.selectedEntry,res,next);
  });
  app.use((req,res,next)=>{
    if(req.method!=='GET'&&req.method!=='HEAD')return next();
    if(req.path.startsWith('/api/')||req.path.startsWith('/preview/')||req.path.startsWith('/__animator/'))return next();
    const projectId=previewProjectFromReferer(req.get('referer'));
    if(!projectId||!getProject(projectId))return next();
    return serveLegacyPreview(projectId,decodeURIComponent(req.path).replace(/^\/+/,''),res,next);
  });
}

function previewProjectFromReferer(referer:string|undefined):string|undefined{
  if(!referer)return undefined;
  try{const match=new URL(referer).pathname.match(/^\/preview\/([^/]+)(?:\/|$)/);return match?.[1]?decodeURIComponent(match[1]):undefined;}catch{return undefined;}
}

function serveLegacyPreview(id:string,requested:string,res:Response,next:NextFunction){
  const project=getProject(id);if(!project)return res.status(404).send('Project not loaded');
  try{
    const target=resolveInside(project.root,requested||project.selectedEntry);
    if(fs.statSync(target).isDirectory())return next();
    if(/\.html?$/i.test(target)){
      let html=fs.readFileSync(target,'utf8');
      const baseDir=path.posix.dirname('/preview/'+id+'/'+(requested||project.selectedEntry));
      const base=`<base href="${baseDir.endsWith('/')?baseDir:baseDir+'/'}">`;
      const inject=`${base}<script src="/__animator/runtime.js"></script><script src="/__animator/seek-runtime.js"></script><script src="/__animator/mutation-runtime.js"></script><script src="/__animator/aux-runtime.js"></script>`;
      html=html.includes('<head>')?html.replace('<head>',`<head>${inject}`):inject+html;
      return res.type('html').send(html);
    }
    if(/\.[cm]?tsx?$/i.test(target)){
      const source=fs.readFileSync(target,'utf8');
      const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,sourceMap:true},fileName:target});
      return res.type('application/javascript').send(output.outputText);
    }
    return res.sendFile(target);
  }catch{return res.status(404).send('Preview resource not found');}
}
