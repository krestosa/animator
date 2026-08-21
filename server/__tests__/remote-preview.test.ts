import { describe, expect, it } from 'vitest';
import { mapRemoteRedirect } from '../remote-preview.js';

describe('remote preview redirect mapping',()=>{
  it('preserves a project-site trailing slash so relative assets resolve under the project path',()=>{
    const target=new URL('https://krestosa.github.io/sushilibre');
    const redirect=mapRemoteRedirect('/sushilibre/',target,'http://127.0.0.1:43123');
    expect(redirect.remote.href).toBe('https://krestosa.github.io/sushilibre/');
    expect(redirect.local).toBe('http://127.0.0.1:43123/sushilibre/');
    expect(new URL('./dist/',redirect.local).pathname).toBe('/sushilibre/dist/');
    expect(new URL('_css_dev/styles.css',redirect.local).pathname).toBe('/sushilibre/_css_dev/styles.css');
  });

  it('preserves search and hash while proxying redirects',()=>{
    const redirect=mapRemoteRedirect('/carta-sc/?branch=ux#motion',new URL('https://krestosa.github.io/carta-sc'),'http://127.0.0.1:43123');
    expect(redirect.local).toBe('http://127.0.0.1:43123/carta-sc/?branch=ux#motion');
  });
});
