import fs from 'node:fs';
import { getProject, loadProject, resolveInside, setProjectPreviewOrigin, type LoadedProject } from '../project.js';
import { ensurePreviewOrigin } from '../preview-host.js';
import { ensureNativePreviewOrigin } from '../native-preview-host.js';
import { openRemotePreview } from '../remote-preview.js';
import { FolderSelectionCancelled, pickProjectFolder } from '../folder-dialog.js';

export { FolderSelectionCancelled };

export class ProjectService {
  get(id:string):LoadedProject|undefined{return getProject(id);}

  async openLocal(projectPath:string):Promise<LoadedProject>{
    return loadProject(projectPath);
  }

  async openRemote(url:string){return openRemotePreview(url);}

  async pickFolder():Promise<LoadedProject>{
    const selected=await pickProjectFolder();
    return loadProject(selected);
  }

  async ensurePreview(id:string):Promise<LoadedProject|undefined>{
    const project=getProject(id);
    return project?this.preparePreview(project):undefined;
  }

  async nativePreview(id:string,entry:string):Promise<string|undefined>{
    const project=getProject(id);if(!project)return undefined;
    const origin=await ensureNativePreviewOrigin(project),requested=(entry||project.selectedEntry).replace(/^\/+/, '');
    return requested?`${origin.replace(/\/$/,'')}/${requested.split('/').map(encodeURIComponent).join('/')}`:`${origin.replace(/\/$/,'')}/`;
  }

  async analysis(id:string){
    const project=getProject(id);
    if(!project)return undefined;
    const {analyzeProject}=await import('../analysis.js');
    return analyzeProject(project);
  }

  source(id:string,filePath:string):string|undefined{
    const project=getProject(id);if(!project)return undefined;
    const file=resolveInside(project.root,filePath);
    return fs.readFileSync(file,'utf8');
  }

  private async preparePreview(project:LoadedProject):Promise<LoadedProject>{
    const origin=await ensurePreviewOrigin(project);
    return setProjectPreviewOrigin(project.id,origin)??project;
  }
}
