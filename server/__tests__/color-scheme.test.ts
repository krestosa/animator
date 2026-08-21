import { describe, expect, it } from 'vitest';
import { parsePreviewColorScheme, previewColorSchemeBootstrap, rewriteColorSchemeCss, stripPreviewColorScheme } from '../color-scheme.js';

describe('preview color scheme emulation',()=>{
  it('uses auto by default and strips the internal query before proxying',()=>{
    expect(parsePreviewColorScheme('dark')).toBe('dark');
    expect(parsePreviewColorScheme('light')).toBe('light');
    expect(parsePreviewColorScheme('auto')).toBe('auto');
    expect(parsePreviewColorScheme('system')).toBe('auto');
    expect(parsePreviewColorScheme('invalid')).toBe('auto');
    expect(stripPreviewColorScheme('/carta-sc/?x=1&__animator_color_scheme=dark')).toEqual({path:'/carta-sc/?x=1',mode:'dark'});
  });

  it('leaves site CSS untouched in auto and rewrites only explicit overrides',()=>{
    const css='@media (prefers-color-scheme: dark){.x{color:white}} @media (prefers-color-scheme: light){.x{color:black}}';
    expect(rewriteColorSchemeCss(css,'auto')).toBe(css);
    expect(rewriteColorSchemeCss(css,'system')).toBe(css);
    const dark=rewriteColorSchemeCss(css,'dark');
    expect(dark).toContain('@media (min-width: 0px)');
    expect(dark).toContain('@media (max-width: 0px)');
    const light=rewriteColorSchemeCss(css,'light');
    expect(light.indexOf('(max-width: 0px)')).toBeLessThan(light.indexOf('(min-width: 0px)'));
  });

  it('injects matchMedia emulation only for explicit overrides',()=>{
    expect(previewColorSchemeBootstrap('auto')).toBe('');
    const source=previewColorSchemeBootstrap('dark');
    expect(source).toContain('window.matchMedia');
    expect(source).toContain('document.documentElement.style.colorScheme=mode');
    expect(source).toContain('dark');
  });
});
