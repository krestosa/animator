import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root=process.cwd();
const productionRoots=['server','src','bin'];
const ignoredSegments=new Set(['__tests__','node_modules','dist','server-dist']);
const diskMutation=/\b(?:fs\.)?(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|copyFileSync|copyFile|renameSync|rename|truncateSync|truncate|unlinkSync|unlink|rmSync|rm)\s*\(/g;
const browserPersistence=/\b(?:localStorage|sessionStorage)\.setItem\s*\(|\bindexedDB\.open\s*\(/g;
const allowedDiskFiles=new Set(['server/export.ts']);
const allowedBrowserPersistenceFiles=new Set(['src/presets/custom.ts']);

describe('disk write policy',()=>{
  it('keeps filesystem mutation behind explicit export/apply code',()=>{
    const violations:string[]=[];
    for(const file of productionFiles()){
      const relative=slash(path.relative(root,file)),source=fs.readFileSync(file,'utf8');
      if(allowedDiskFiles.has(relative))continue;
      for(const match of source.matchAll(diskMutation))violations.push(`${relative}:${lineOf(source,match.index??0)} ${match[0].trim()}`);
    }
    expect(violations,'Unexpected production filesystem writers. Background capture, timeline playback and analysis must remain memory/read-only.').toEqual([]);
  });

  it('keeps browser persistence limited to explicit custom-preset actions',()=>{
    const violations:string[]=[];
    for(const file of productionFiles()){
      const relative=slash(path.relative(root,file)),source=fs.readFileSync(file,'utf8');
      if(allowedBrowserPersistenceFiles.has(relative))continue;
      for(const match of source.matchAll(browserPersistence))violations.push(`${relative}:${lineOf(source,match.index??0)} ${match[0].trim()}`);
    }
    expect(violations,'Unexpected browser persistence writer. High-frequency state must stay in memory.').toEqual([]);
  });
});

function productionFiles():string[]{const out:string[]=[];for(const directory of productionRoots){const absolute=path.join(root,directory);if(fs.existsSync(absolute))walk(absolute,out);}return out.filter(file=>/\.(?:ts|js|mjs)$/.test(file));}
function walk(directory:string,out:string[]):void{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){if(ignoredSegments.has(entry.name))continue;const target=path.join(directory,entry.name);if(entry.isDirectory())walk(target,out);else if(entry.isFile())out.push(target);}}
function lineOf(source:string,index:number):number{return source.slice(0,index).split('\n').length;}
function slash(value:string):string{return value.split(path.sep).join('/');}
