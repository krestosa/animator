import { describe, expect, it } from 'vitest';
import { auxiliaryRuntimeSource } from '../aux-runtime.js';
import { runtimeSource } from '../runtime.js';
import { seekRuntimeSource } from '../seek-runtime.js';

describe('preview runtime',()=>{
  it('parses the injected runtime sources as JavaScript',()=>{
    expect(()=>new Function(runtimeSource)).not.toThrow();
    expect(()=>new Function(seekRuntimeSource)).not.toThrow();
    expect(()=>new Function(auxiliaryRuntimeSource)).not.toThrow();
  });

  it('contains deterministic master timeline and replay controls',()=>{
    expect(runtimeSource).toContain("post('TIMELINE_STATE'");
    expect(runtimeSource).toContain('SCRUB_TIMELINE');
    expect(runtimeSource).toContain('applyMasterTime');
    expect(runtimeSource).toContain('replayAttributes');
    expect(runtimeSource).toContain('replayNodes');
    expect(runtimeSource).toContain('suspendedRafs');
  });

  it('keeps a second direct animation seeker as a browser playback fallback',()=>{
    expect(seekRuntimeSource).toContain('SCRUB_TIMELINE');
    expect(seekRuntimeSource).toContain('seekAll');
    expect(seekRuntimeSource).toContain('currentTime');
    expect(seekRuntimeSource).toContain('applyGroup');
  });
});
