import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCssAnimationEdit, previewCssAnimationEdit, writeOverrides } from '../export.js';
import type { LoadedProject } from '../project.js';

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

function projectAt(root:string):LoadedProject{return{id:'test',root,entries:['index.html'],selectedEntry:'index.html',tree:[]};}
function mtime(file:string):number{return fs.statSync(file).mtimeMs;}

describe('safe css apply',()=>{
  it('previews and applies only the target selector with a backup',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-export-'));dirs.push(root);
    fs.writeFileSync(path.join(root,'styles.css'),'.card { animation-duration: 300ms; color: red; }\n.other { color: blue; }');
    const project=projectAt(root);
    const preview=previewCssAnimationEdit(project,{file:'styles.css',selector:'.card',duration:520,easing:'ease-out'});
    expect(preview.after).toContain('animation-duration: 520ms');
    expect(preview.after).toContain('animation-timing-function: ease-out');
    expect(preview.after).toContain('.other { color: blue; }');
    const result=applyCssAnimationEdit(project,{file:'styles.css',selector:'.card',duration:520});
    expect(result.changed).toBe(true);
    expect(fs.existsSync(path.join(root,result.backup))).toBe(true);
    expect(fs.readFileSync(path.join(root,'styles.css'),'utf8')).toContain('520ms');
  });

  it('does not rewrite a source file when the requested edit is already present',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-export-idempotent-'));dirs.push(root);
    const file=path.join(root,'styles.css');
    fs.writeFileSync(file,'.card { animation-duration: 520ms; color: red; }');
    const before=mtime(file);
    await new Promise(resolve=>setTimeout(resolve,30));
    const result=applyCssAnimationEdit(projectAt(root),{file:'styles.css',selector:'.card',duration:520});
    expect(result.changed).toBe(false);
    expect(mtime(file)).toBe(before);
    expect(fs.existsSync(`${file}.animator-backup`)).toBe(false);
  });
});

describe('disk-write minimization',()=>{
  it('writes override files only when their contents actually change',async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-overrides-'));dirs.push(root);
    const project=projectAt(root);
    const first=writeOverrides(project,'.card{opacity:.5}','export const value=1;');
    expect(first.changed).toBe(true);
    const cssTime=mtime(first.cssPath),tsTime=mtime(first.tsPath);
    await new Promise(resolve=>setTimeout(resolve,30));
    const same=writeOverrides(project,'.card{opacity:.5}','export const value=1;');
    expect(same).toMatchObject({changed:false,cssChanged:false,tsChanged:false});
    expect(mtime(first.cssPath)).toBe(cssTime);
    expect(mtime(first.tsPath)).toBe(tsTime);
    await new Promise(resolve=>setTimeout(resolve,30));
    const changed=writeOverrides(project,'.card{opacity:.75}','export const value=1;');
    expect(changed).toMatchObject({changed:true,cssChanged:true,tsChanged:false});
    expect(mtime(first.cssPath)).toBeGreaterThan(cssTime);
    expect(mtime(first.tsPath)).toBe(tsTime);
  });
});
