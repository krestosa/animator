import fs from 'node:fs';
import path from 'node:path';
import type {LoadedProject,TreeNode} from './project.js';
import {resolveInside} from './project.js';

export type AssetCategory='media'|'typography'|'lottie'|'source'|'styles'|'data'|'documents'|'other';
export type AssetPreview='image'|'video'|'audio'|'font'|'lottie'|'text'|'none';
export interface ProjectAsset{path:string;name:string;extension:string;category:AssetCategory;kind:string;preview:AssetPreview;size:number;}

const mediaImage=new Set(['.png','.jpg','.jpeg','.webp','.gif','.avif','.bmp','.ico','.svg']);
const mediaVideo=new Set(['.mp4','.webm','.mov','.m4v','.ogv','.avi','.mkv']);
const mediaAudio=new Set(['.mp3','.wav','.ogg','.oga','.m4a','.aac','.flac','.opus']);
const fonts=new Set(['.woff','.woff2','.ttf','.otf','.eot']);
const source=new Set(['.html','.htm','.js','.mjs','.cjs','.jsx','.ts','.tsx','.vue','.svelte','.astro','.php','.py','.rb','.rs','.go','.java','.kt','.swift']);
const styles=new Set(['.css','.scss','.sass','.less','.styl','.pcss']);
const data=new Set(['.json','.json5','.yaml','.yml','.xml','.csv','.tsv','.toml','.ini']);
const documents=new Set(['.md','.mdx','.txt','.pdf']);

export function scanProjectAssets(project:LoadedProject):ProjectAsset[]{
  const files=flatten(project.tree),assets:ProjectAsset[]=[];
  for(const node of files){
    let file:string,stat:fs.Stats;try{file=resolveInside(project.root,node.path);stat=fs.statSync(file);if(!stat.isFile())continue;}catch{continue;}
    assets.push(describe(file,node.path,node.name,stat.size));
  }
  return assets.sort((a,b)=>categoryOrder(a.category)-categoryOrder(b.category)||a.path.localeCompare(b.path));
}

export function resolveProjectAsset(project:LoadedProject,requested:string):string{
  const file=resolveInside(project.root,requested),stat=fs.statSync(file);if(!stat.isFile())throw new Error('Asset is not a file');return file;
}

function flatten(nodes:TreeNode[]):TreeNode[]{const out:TreeNode[]=[];for(const node of nodes){if(node.type==='file')out.push(node);else if(node.children)out.push(...flatten(node.children));}return out;}
function describe(file:string,relative:string,name:string,size:number):ProjectAsset{
  const extension=path.extname(name).toLowerCase();
  if(extension==='.lottie'||(extension==='.json'&&looksLikeLottie(file,size)))return{path:relative,name,extension,category:'lottie',kind:extension==='.lottie'?'DotLottie':'Lottie JSON',preview:'lottie',size};
  if(mediaImage.has(extension))return{path:relative,name,extension,category:'media',kind:extension==='.svg'?'Vector image':'Image',preview:'image',size};
  if(mediaVideo.has(extension))return{path:relative,name,extension,category:'media',kind:'Video',preview:'video',size};
  if(mediaAudio.has(extension))return{path:relative,name,extension,category:'media',kind:'Audio',preview:'audio',size};
  if(fonts.has(extension))return{path:relative,name,extension,category:'typography',kind:'Font',preview:'font',size};
  if(source.has(extension))return{path:relative,name,extension,category:'source',kind:'Source',preview:'text',size};
  if(styles.has(extension))return{path:relative,name,extension,category:'styles',kind:'Stylesheet',preview:'text',size};
  if(data.has(extension))return{path:relative,name,extension,category:'data',kind:'Data',preview:'text',size};
  if(documents.has(extension))return{path:relative,name,extension,category:'documents',kind:'Document',preview:extension==='.pdf'?'none':'text',size};
  return{path:relative,name,extension,category:'other',kind:extension?extension.slice(1).toUpperCase():'File',preview:'none',size};
}
function looksLikeLottie(file:string,size:number):boolean{
  if(size<=0||size>2*1024*1024)return false;
  try{const value=JSON.parse(fs.readFileSync(file,'utf8')) as Record<string,unknown>;return typeof value.v==='string'&&typeof value.fr==='number'&&typeof value.ip==='number'&&typeof value.op==='number'&&Array.isArray(value.layers);}catch{return false;}
}
function categoryOrder(value:AssetCategory):number{return['media','typography','lottie','source','styles','data','documents','other'].indexOf(value);}
