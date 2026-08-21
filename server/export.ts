import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import type { LoadedProject } from './project.js';
import { resolveInside } from './project.js';

export function writeOverrides(project:LoadedProject, css:string, ts:string){
  const dir=path.join(project.root,'.animator'); fs.mkdirSync(dir,{recursive:true});
  const cssPath=path.join(dir,'animator-overrides.css'); const tsPath=path.join(dir,'animator-overrides.ts');
  fs.writeFileSync(cssPath,css); fs.writeFileSync(tsPath,ts); return {cssPath,tsPath};
}

export interface CssAnimationEdit { file:string; selector:string; duration?:number; delay?:number; easing?:string; }
export function previewCssAnimationEdit(project:LoadedProject,edit:CssAnimationEdit):{before:string;after:string;file:string}{
  if(!/\.css$/i.test(edit.file)) throw new Error('Safe apply currently supports CSS files only');
  const file=resolveInside(project.root,edit.file); const before=fs.readFileSync(file,'utf8'); const root=postcss.parse(before,{from:file});
  let matched=false;
  root.walkRules(rule=>{if(rule.selector!==edit.selector)return;matched=true;
    if(edit.duration!=null)setDeclaration(rule,'animation-duration',`${Math.max(0,edit.duration)}ms`);
    if(edit.delay!=null)setDeclaration(rule,'animation-delay',`${edit.delay}ms`);
    if(edit.easing)setDeclaration(rule,'animation-timing-function',edit.easing);
  });
  if(!matched) throw new Error(`Selector not found in ${edit.file}: ${edit.selector}`);
  return {before,after:root.toString(),file:edit.file};
}
export function applyCssAnimationEdit(project:LoadedProject,edit:CssAnimationEdit):{file:string;backup:string}{
  const preview=previewCssAnimationEdit(project,edit); const file=resolveInside(project.root,preview.file); const backup=`${file}.animator-backup`;
  if(!fs.existsSync(backup)) fs.copyFileSync(file,backup);
  fs.writeFileSync(file,preview.after,'utf8'); return {file:preview.file,backup:path.relative(project.root,backup).split(path.sep).join('/')};
}
function setDeclaration(rule:postcss.Rule,prop:string,value:string):void{const existing=rule.nodes.find(node=>node.type==='decl'&&node.prop===prop);if(existing?.type==='decl')existing.value=value;else rule.append({prop,value});}
