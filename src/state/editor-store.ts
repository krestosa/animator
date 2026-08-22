import type { ProjectDescriptor,RuntimeElement,StaticAnalysis } from '../types/domain';

export type EditorState={project:ProjectDescriptor|undefined;analysis:StaticAnalysis|undefined;elements:RuntimeElement[];selectedElementId:string|undefined;picker:boolean;playhead:number;zoom:number;diagnostics:string[]};
export const emptyEditorState=():EditorState=>({project:undefined,analysis:undefined,elements:[],selectedElementId:undefined,picker:false,playhead:0,zoom:1,diagnostics:[]});
export const projectContext=(project:ProjectDescriptor|undefined):string=>project?`${project.id}:${project.selectedEntry}`:'';
export const mergeElements=(current:RuntimeElement[],incoming:RuntimeElement[]):RuntimeElement[]=>{const map=new Map(current.map(element=>[element.id,element]));for(const element of incoming)map.set(element.id,element);return[...map.values()];};
