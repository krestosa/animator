import { describe, expect, it } from 'vitest';
import { auxiliaryRuntimeSource } from '../aux-runtime.js';
import { mutationRuntimeSource } from '../mutation-runtime.js';
import { runtimeSource } from '../runtime.js';
import { seekRuntimeSource } from '../seek-runtime.js';

describe('preview runtime',()=>{
  it('parses every injected runtime source as JavaScript',()=>{
    expect(()=>new Function(runtimeSource)).not.toThrow();
    expect(()=>new Function(seekRuntimeSource)).not.toThrow();
    expect(()=>new Function(mutationRuntimeSource)).not.toThrow();
    expect(()=>new Function(auxiliaryRuntimeSource)).not.toThrow();
  });

  it('keeps instrumentation and DOM replay capabilities',()=>{
    expect(runtimeSource).toContain('replayAttributes');
    expect(runtimeSource).toContain('replayNodes');
    expect(runtimeSource).toContain('MutationObserver');
  });

  it('uses one dedicated timeline source with persistent mirrored animations',()=>{
    expect(seekRuntimeSource).toContain("IN='animator-timeline'");
    expect(seekRuntimeSource).toContain("post('TIMELINE_STATE'");
    expect(seekRuntimeSource).toContain('registry=new Set()');
    expect(seekRuntimeSource).toContain('ensureMirror');
    expect(seekRuntimeSource).toContain('new KeyframeEffect');
    expect(seekRuntimeSource).toContain('SCRUB_TIMELINE');
    expect(seekRuntimeSource).toContain('RELEASE_TIMELINE');
    expect(seekRuntimeSource).toContain('suspendedRafs');
    expect(seekRuntimeSource).toContain('HIGHLIGHT_ANIMATION');
    expect(seekRuntimeSource).toContain('applyGroup');
  });

  it('exposes javascript style motion as selectable runtime animation tracks',()=>{
    expect(mutationRuntimeSource).toContain("type:'runtime-style'");
    expect(mutationRuntimeSource).toContain('MutationObserver');
    expect(mutationRuntimeSource).toContain('HIGHLIGHT_ANIMATION');
  });
});
