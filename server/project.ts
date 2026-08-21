import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface TreeNode { path:string; name:string; type:'file'|'directory'; children?:TreeNode[]; }
export interface LoadedProject { id:string; root:string; entries:string[]; selectedEntry:string; tree:TreeNode[]; previewOrigin?:string|undefined; }
const ignored = new Set(['node_modules','.git','dist','build','coverage','.cache','server-dist']);
const projects = new Map<string,LoadedProject>();

export function validateRoot(input:string):string {
  const resolved=path.resolve(input);
  const stat=fs.statSync(resolved);
  if(!stat.isDirectory()) throw new Error('Project path must be a directory');
  return resolved;
}
function walk(root:string, dir=root):TreeNode[] {
  return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!ignored.has(e.name)).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)).map(e=>{
    const full=path.join(dir,e.name); const rel=path.relative(root,full).split(path.sep).join('/');
    return e.isDirectory()?{path:rel,name:e.name,type:'directory',children:walk(root,full)}:{path:rel,name:e.name,type:'file'};
  });
}
function collectEntries(root:string):string[] {
  const out:string[]=[];
  const scan=(dir:string)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory())scan(full);else if(/\.html?$/i.test(e.name))out.push(path.relative(root,full).split(path.sep).join('/'));}};
  scan(root); return out.sort((a,b)=>(a==='index.html'?-1:0)-(b==='index.html'?-1:0)||a.localeCompare(b));
}
function supportsFrameworkEntrypoint(root:string):boolean{
  const packagePath=path.join(root,'package.json');if(!fs.existsSync(packagePath))return false;
  try{const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8')) as {scripts?:Record<string,string>|undefined};const dev=pkg.scripts?.dev??'';return /\b(vite|next|astro|parcel|react-scripts)\b/.test(dev);}catch{return false;}
}
export function loadProject(input:string):LoadedProject {
  const root=validateRoot(input === '__fixture__' ? path.resolve('fixture') : input); const discovered=collectEntries(root);const entries=discovered.length?discovered:supportsFrameworkEntrypoint(root)?['']:[]; if(!entries.length)throw new Error('Project entrypoint not found: no HTML file or supported dev server detected');
  const id=crypto.createHash('sha1').update(root).digest('hex').slice(0,12); const project={id,root,entries,selectedEntry:entries[0]!,tree:walk(root)}; projects.set(id,project); return project;
}
export function getProject(id:string):LoadedProject|undefined{return projects.get(id);}
export function setProjectPreviewOrigin(id:string,previewOrigin:string):LoadedProject|undefined{const project=projects.get(id);if(!project)return undefined;project.previewOrigin=previewOrigin;return project;}
export function resolveInside(root:string, requested:string):string {
  const clean=decodeURIComponent(requested).replace(/^\/+/, ''); const resolved=path.resolve(root,clean); const relative=path.relative(root,resolved);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Path escapes selected project root'); return resolved;
}
export function listRecent():Array<{root:string}> { return [...projects.values()].map(p=>({root:p.root})); }
