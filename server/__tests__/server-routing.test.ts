import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

describe('server routing architecture',()=>{
  it('keeps index as composition/bootstrap instead of endpoint implementation',()=>{
    const source=read('server/index.ts');
    expect(source).toContain("app.use('/api/projects',createProjectRouter(projects))");
    expect(source).toContain("app.use('/api',createBrowserRouter(browserControl))");
    expect(source).toContain("app.use('/api/control',createControlRouter(browserControl))");
    expect(source).toContain("registerPreviewRoutes(app)");
    expect(source).not.toMatch(/app\.(?:post|delete)\('\/api\//);
    expect(source.split('\n').length).toBeLessThan(60);
  });

  it('preserves the established public API paths',()=>{
    const sources=[
      read('server/routes/projects.ts'),read('server/routes/browser.ts'),read('server/routes/control.ts'),
      read('server/routes/export.ts'),read('server/routes/screenshots.ts'),read('server/routes/runtime.ts')
    ].join('\n');
    for(const route of [
      '/open','/open-url','/pick-folder','/:id/analysis','/:id/source',
      '/browser-runtimes','/browser-runtimes/install','/browser-sessions/open','/browser-sessions/:id/events','/browser-sessions/:id/command',
      '/status','/record','/stop','/start','/close','/browsers/install',
      '/projects/:id/export-overrides','/projects/:id/preview-css-apply','/projects/:id/apply-css','/viewport-screenshot',
      '/runtime.js','/aux-runtime.js','/seek-runtime.js','/mutation-runtime.js','/record-resume-runtime.js','/browser-snapshot-runtime.js','/clock-worker.js'
    ])expect(sources).toContain(`'${route}'`);
  });
});
