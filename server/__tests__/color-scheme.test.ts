import { describe, expect, it } from 'vitest';
import { parsePreviewColorScheme, previewColorSchemeBootstrap, previewColorSchemeFromUrl, resolvePreviewColorScheme, rewriteColorSchemeCss, rewriteInlineColorSchemeStyles, stripPreviewColorScheme } from '../color-scheme.js';

describe('preview color scheme emulation',()=>{
  it('uses auto by default and strips the internal query before proxying',()=>{
    expect(parsePreviewColorScheme('dark')).toBe('dark');
    expect(parsePreviewColorScheme('light')).toBe('light');
    expect(parsePreviewColorScheme('auto')).toBe('auto');
    expect(parsePreviewColorScheme('system')).toBe('auto');
    expect(parsePreviewColorScheme('invalid')).toBe('auto');
    expect(stripPreviewColorScheme('/carta-sc/?x=1&__animator_color_scheme=dark')).toEqual({path:'/carta-sc/?x=1',mode:'dark'});
  });

  it('resets a document without an override to auto while assets inherit the active document mode',()=>{
    expect(resolvePreviewColorScheme('light',undefined,true,'dark')).toBe('light');
    expect(resolvePreviewColorScheme(undefined,'http://preview.local/page?__animator_color_scheme=dark',true,'light')).toBe('dark');
    expect(resolvePreviewColorScheme(undefined,undefined,true,'dark')).toBe('auto');
    expect(resolvePreviewColorScheme(undefined,undefined,false,'dark')).toBe('dark');
    expect(previewColorSchemeFromUrl('http://x/?__animator_color_scheme=light')).toBe('light');
    expect(previewColorSchemeFromUrl('http://x/')).toBeUndefined();
  });

  it('leaves site CSS untouched in auto and rewrites external and inline CSS only for explicit overrides',()=>{
    const css='@media (prefers-color-scheme: dark){.x{color:white}} @media (prefers-color-scheme: light){.x{color:black}}';
    expect(rewriteColorSchemeCss(css,'auto')).toBe(css);
    expect(rewriteColorSchemeCss(css,'system')).toBe(css);
    const dark=rewriteColorSchemeCss(css,'dark');
    expect(dark).toContain('@media (min-width: 0px)');
    expect(dark).toContain('@media (max-width: 0px)');
    const inline=rewriteInlineColorSchemeStyles(`<style>${css}</style><script>const x='prefers-color-scheme: dark'</script>`,'light');
    expect(inline).toContain('<style>@media (max-width: 0px)');
    expect(inline).toContain("const x='prefers-color-scheme: dark'");
  });

  it('injects a parseable pre-script override that covers media, storage, DOM markers and dynamic CSS',()=>{
    expect(previewColorSchemeBootstrap('auto')).toBe('');
    const source=previewColorSchemeBootstrap('light');
    expect(source).toContain('window.matchMedia');
    expect(source).toContain('Storage.prototype');
    expect(source).toContain('sc-theme');
    expect(source).toContain('CSSStyleSheet.prototype');
    expect(source).toContain("color-scheme',mode,'important'");
    const script=source.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'');
    expect(()=>new Function(script)).not.toThrow();
  });
});
