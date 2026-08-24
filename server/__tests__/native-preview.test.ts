import fs from 'node:fs';
import path from 'node:path';
import { afterEach,describe,expect,it } from 'vitest';
import { closeAllNativePreviewOrigins,ensureNativePreviewOrigin } from '../native-preview-host.js';
import { loadProject } from '../project.js';

afterEach(()=>closeAllNativePreviewOrigins());

describe('native Blink preview host',()=>{
  it('serves the local document unchanged',async()=>{
    const project=loadProject('__fixture__'),origin=await ensureNativePreviewOrigin(project),entry=project.selectedEntry;
    const response=await fetch(`${origin}/${entry.split('/').map(encodeURIComponent).join('/')}`),actual=await response.text(),expected=fs.readFileSync(path.resolve('fixture',entry),'utf8');
    expect(response.ok).toBe(true);expect(actual).toBe(expected);expect(actual).not.toContain('__animator');
  });
});
