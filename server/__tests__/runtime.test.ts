import { describe, expect, it } from 'vitest';
import { auxiliaryRuntimeSource } from '../aux-runtime.js';
import { clockWorkerSource } from '../clock-worker.js';
import { mutationRuntimeSource } from '../mutation-runtime.js';
import { runtimeSource } from '../runtime.js';
import { seekRuntimeSource } from '../seek-runtime.js';

describe('preview runtime',()=>{
  it('parses every injected runtime source as JavaScript',()=>{
    expect(()=>new Function(runtimeSource)).not.toThrow();
    expect(()=>new Function(seekRuntimeSource)).not.toThrow();
    expect(()=>new Function(mutationRuntimeSource)).not.toThrow();
    expect(()=>new Function(auxiliaryRuntimeSource)).not.toThrow();
    expect(()=>new Function(clockWorkerSource)).not.toThrow();
  });

  it('keeps the discovery runtime passive while the timeline owns playback',()=>{
    expect(runtimeSource).toContain('MutationObserver');
    expect(runtimeSource).toContain('externalControl');
    expect(runtimeSource).toContain("message.source!=='animator-timeline'");
    expect(runtimeSource).not.toContain('replayAttributes');
    expect(runtimeSource).not.toContain('replayNodes');
    expect(runtimeSource).not.toContain('masterTime');
  });

  it('captures short live animations as elements enter or move through the viewport',()=>{
    expect(runtimeSource).toContain('IntersectionObserver');
    expect(runtimeSource).toContain("startBurst('scroll'");
    expect(runtimeSource).toContain("startBurst('viewport-entry'");
    expect(runtimeSource).toContain('RECALCULATE_VIEWPORT');
    expect(runtimeSource).toContain('SET_AUTO_VIEWPORT_CAPTURE');
    expect(runtimeSource).toContain("post('CAPTURE_REPORT'");
    expect(runtimeSource).toContain('reportedAnimations=new Map()');
  });

  it('uses a worker-backed dedicated timeline with exact frame stepping',()=>{
    expect(seekRuntimeSource).toContain("IN='animator-timeline'");
    expect(seekRuntimeSource).toContain("post('TIMELINE_STATE'");
    expect(seekRuntimeSource).toContain('registry=new Set()');
    expect(seekRuntimeSource).toContain('ensureMirror');
    expect(seekRuntimeSource).toContain('new KeyframeEffect');
    expect(seekRuntimeSource).toContain('SCRUB_TIMELINE');
    expect(seekRuntimeSource).toContain('STEP_FRAME');
    expect(seekRuntimeSource).toContain('SEEK_FRAME');
    expect(seekRuntimeSource).toContain('RECALCULATE_VIEWPORT');
    expect(seekRuntimeSource).toContain("new Worker('/__animator/clock-worker.js'");
    expect(seekRuntimeSource).not.toContain('getComputedStyle(target)');
    expect(seekRuntimeSource).not.toContain('replayAttributes(time)');
  });

  it('replays and recalculates only animated inline style properties for javascript motion',()=>{
    expect(mutationRuntimeSource).toContain("type:'runtime-style'");
    expect(mutationRuntimeSource).toContain('MutationObserver');
    expect(mutationRuntimeSource).toContain('style.setProperty');
    expect(mutationRuntimeSource).toContain('style.removeProperty');
    expect(mutationRuntimeSource).toContain('frameIndexAt');
    expect(mutationRuntimeSource).toContain('recalculateViewport');
    expect(mutationRuntimeSource).toContain('stats');
    expect(mutationRuntimeSource).toContain('HIGHLIGHT_ANIMATION');
  });

  it('keeps the playback clock independent from the preview main thread',()=>{
    expect(clockWorkerSource).toContain("postMessage({type:'tick'");
    expect(clockWorkerSource).toContain('setInterval');
  });
});
