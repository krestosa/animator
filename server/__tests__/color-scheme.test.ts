import { describe, expect, it } from 'vitest';
import { parsePreviewColorScheme, previewColorSchemeBootstrap, rewriteColorSchemeCss, stripPreviewColorScheme } from '../color-scheme.js';

describe('preview color scheme emulation',()=>{
  it('persists only supported modes and strips the internal query before proxying',()=>{
    expect(parsePreviewColorScheme('dark')).toBe('dark');
    expect(parsePreviewColorScheme('light')).toBe('light');
    expect(parsePreviewColorScheme('system')).toBe('system');
    expect(parsePreviewColorScheme('invalid')).toBe('system');
    expect(stripPreviewColorScheme('/carta-sc/?x=1&__animator_color_scheme=dark')).toEqual({path:'/carta-sc/?x=1',mode:'dark'});
  });

  it('forces CSS prefers-color-scheme media queries without changing system mode',()=>{
    const css='@media (prefers-color-scheme: dark){.x{color:white}} @media (prefers-color-scheme: light){.x{color:black}}';
    expect(rewriteColorSchemeCss(css,'system')).toBe(css);
    const dark=rewriteColorSchemeCss(css,'dark');
    expect(dark).toContain('@media (min-width: 0px)');
    expect(dark).toContain('@media (max-width: 0px)');
    const light=rewriteColorSchemeCss(css,'light');
    expect(light.indexOf('(max-width: 0px)')).toBeLessThan(light.indexOf('(min-width: 0px)'));
  });

  it('injects matchMedia emulation before page scripts for forced modes',()=>{
    const source=previewColorSchemeBootstrap('dark');
    expect(source).toContain("window.matchMedia");
    expect(source).toContain("document.documentElement.style.colorScheme=mode");
    expect(source).toContain('dark');
  });
});
