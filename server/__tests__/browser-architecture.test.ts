import fs from 'node:fs';
import path from 'node:path';
import { describe,expect,it } from 'vitest';

const root=process.cwd();
const read=(relative:string)=>fs.readFileSync(path.join(root,relative),'utf8');

describe('browser architecture',()=>{
  it('keeps browser-session as orchestration instead of infrastructure',()=>{
    const source=read('server/browser-session.ts');
    expect(source).not.toMatch(/node:fs|node:path|node:child_process|BrowserContextOptions|BrowserType/);
    expect(source).toContain("./browser/browser-manager.js");
    expect(source).toContain("./browser/runtime-manager.js");
    expect(source).toContain("./browser/session-registry.js");
    expect(source).toContain("./browser/recording-controller.js");
    expect(source).toContain("./browser/snapshot-service.js");
  });

  it('keeps extracted browser responsibilities independently addressable',()=>{
    for(const file of ['types.ts','browser-manager.ts','runtime-manager.ts','session-registry.ts','recording-controller.ts','snapshot-service.ts'])expect(fs.existsSync(path.join(root,'server/browser',file)),file).toBe(true);
  });
});
