import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCssAnimationEdit, previewCssAnimationEdit } from '../export';
import type { LoadedProject } from '../project';

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});});

describe('safe css apply',()=>{
  it('previews and applies only the target selector with a backup',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'animator-export-'));dirs.push(root);
    fs.writeFileSync(path.join(root,'styles.css'),'.card { animation-duration: 300ms; color: red; }\n.other { color: blue; }');
    const project:LoadedProject={id:'test',root,entries:['index.html'],selectedEntry:'index.html',tree:[]};
    const preview=previewCssAnimationEdit(project,{file:'styles.css',selector:'.card',duration:520,easing:'ease-out'});
    expect(preview.after).toContain('animation-duration: 520ms');
    expect(preview.after).toContain('animation-timing-function: ease-out');
    expect(preview.after).toContain('.other { color: blue; }');
    const result=applyCssAnimationEdit(project,{file:'styles.css',selector:'.card',duration:520});
    expect(fs.existsSync(path.join(root,result.backup))).toBe(true);
    expect(fs.readFileSync(path.join(root,'styles.css'),'utf8')).toContain('520ms');
  });
});
