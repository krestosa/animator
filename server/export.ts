import fs from 'node:fs';
import path from 'node:path';
import type { LoadedProject } from './project.js';
export function writeOverrides(project:LoadedProject, css:string, ts:string){
  const dir=path.join(project.root,'.animator'); fs.mkdirSync(dir,{recursive:true});
  const cssPath=path.join(dir,'animator-overrides.css'); const tsPath=path.join(dir,'animator-overrides.ts');
  fs.writeFileSync(cssPath,css); fs.writeFileSync(tsPath,ts); return {cssPath,tsPath};
}
