import { connectPreview, sendCommand } from '../preview/bridge';
import { store, type AnimatorState } from '../state/store';
import { presets } from '../presets/presets';
import { generateCss, generateOverrideFiles, generateTs, generateUnifiedDiff } from '../exporters/generate';
import { timelineDuration, timeToPercent } from '../utils/timeline';
import type { DetectedAnimation, ProjectDescriptor, ProjectFile, StaticAnalysis } from '../types/domain';

const fixtureDefault = '__fixture__';
type Tab = 'motion' | 'source' | 'export';
type Viewport = { width: number; height: number };
type SourceState = { path: string; text: string };
type UiState = { pathInput: string; viewport: Viewport; source?: SourceState; tab: Tab };

export function mountApp(root: HTMLElement): () => void {
  const ui: UiState = { pathInput: fixtureDefault, viewport: { width: 1100, height: 700 }, tab: 'motion' };
  let iframe: HTMLIFrameElement | null = null;
  let bridgeCleanup: (() => void) | undefined;
  let previewKey = '';
  let disposed = false;
  let frameRequest = 0;

  const renderNow = (): void => {
    frameRequest = 0;
    if (disposed) return;
    const state = store.get();
    const nextKey = state.project ? `${state.project.id}:${state.project.selectedEntry}` : '';
    const preserved = iframe && previewKey === nextKey ? iframe : null;
    preserved?.remove();
    root.innerHTML = buildShell(state, ui, nextKey);
    const placeholder = root.querySelector<HTMLIFrameElement>('[data-preview-frame]');

    if (preserved && placeholder) {
      placeholder.replaceWith(preserved);
      iframe = preserved;
    } else {
      if (previewKey !== nextKey) bridgeCleanup?.();
      iframe = placeholder;
      previewKey = nextKey;
      bridgeCleanup = iframe && nextKey ? connectPreview(iframe) : undefined;
    }
    bindEvents(root, state, ui, () => iframe, requestRender);
  };

  const requestRender = (): void => {
    if (disposed || frameRequest) return;
    frameRequest = requestAnimationFrame(renderNow);
  };

  const unsubscribe = store.subscribe(requestRender);
  renderNow();

  return () => {
    disposed = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    bridgeCleanup?.();
    unsubscribe();
    root.replaceChildren();
  };
}

function buildShell(state: AnimatorState, ui: UiState, previewKey: string): string {
  const selected = selectAnimation(state);
  const duration = timelineDuration(state.animations, state.events);
  const diagnostic = state.diagnostics.at(-1);
  return `<div class="app">
    ${renderToolbar(state, ui)}
    <main class="workspace">
      <aside class="leftPanel">
        <section><h3>Project</h3>${state.project ? renderTree(state.project.tree) : '<p class="muted">Open a local project. The included fixture path is prefilled.</p>'}</section>
        <section class="elementList"><h3>Elements <small>${state.elements.length}</small></h3>${state.elements.slice(0, 300).map(el => `<button class="row${state.selectedElementId === el.id ? ' selected' : ''}" data-element-id="${attr(el.id)}"><code>${html(el.tag)}</code>${el.domId ? `#${html(el.domId)}` : ''}${el.classes[0] ? `.${html(el.classes[0])}` : ''}</button>`).join('')}</section>
      </aside>
      ${renderPreview(state.project, state.analysis, ui.viewport, previewKey)}
      <aside class="rightPanel"><nav>${(['motion', 'source', 'export'] as const).map(tab => `<button data-tab="${tab}" class="${ui.tab === tab ? 'active' : ''}">${capitalize(tab)}</button>`).join('')}</nav>${ui.tab === 'motion' ? renderMotion(selected, !!state.selectedElementId) : ui.tab === 'source' ? renderSource(ui.source, selected) : renderExport(selected)}</aside>
    </main>
    ${renderTimeline(state, duration)}
    ${diagnostic ? `<div class="diagnostics">${html(diagnostic)}</div>` : ''}
  </div>`;
}

function renderToolbar(state: AnimatorState, ui: UiState): string {
  return `<header class="toolbar"><b>Animator</b><input class="path" data-path-input value="${attr(ui.pathInput)}" placeholder="Local project path"><button data-action="open-project">Open project</button><span class="sep"></span><button data-action="picker" class="${state.picker ? 'active' : ''}">Pick element</button><button data-action="record">${state.recording ? 'Recording' : 'Record'}</button><span class="sep"></span><button data-action="restart">↺</button><button data-action="play">▶</button><button data-action="pause">Ⅱ</button><button data-action="undo">Undo</button><button data-action="redo">Redo</button><span class="grow"></span><select data-viewport><option value="390"${ui.viewport.width === 390 ? ' selected' : ''}>Mobile</option><option value="768"${ui.viewport.width === 768 ? ' selected' : ''}>Tablet</option><option value="1100"${ui.viewport.width === 1100 ? ' selected' : ''}>Desktop</option></select><span>${ui.viewport.width}×${ui.viewport.height}</span></header>`;
}

function renderPreview(project: ProjectDescriptor | undefined, analysis: StaticAnalysis | undefined, viewport: Viewport, key: string): string {
  const pages = project ? `<select data-entry>${project.entries.map(entry => `<option value="${attr(entry)}"${entry === project.selectedEntry ? ' selected' : ''}>${html(entry)}</option>`).join('')}</select>` : '<span>No preview</span>';
  const scale = Math.min(1, 900 / viewport.width, 620 / viewport.height);
  const src = project ? `/preview/${encodeURIComponent(project.id)}/${project.selectedEntry.split('/').map(encodeURIComponent).join('/')}` : '';
  const frame = project ? `<iframe data-preview-frame data-preview-key="${attr(key)}" src="${attr(src)}" title="Project preview"></iframe>` : '';
  return `<section class="previewArea"><div class="previewChrome">${pages}<span>${analysis?.reducedMotion ? 'Reduced motion CSS detected' : 'Normal motion'}</span></div><div class="stage"><div class="device" style="width:${viewport.width}px;height:${viewport.height}px;transform:scale(${scale})">${frame}</div></div></section>`;
}

function renderTree(nodes: ProjectFile[]): string {
  return `<div class="tree">${nodes.map(node => node.type === 'directory' ? `<details><summary>${html(node.name)}</summary>${node.children ? renderTree(node.children) : ''}</details>` : `<button data-file="${attr(node.path)}">${html(node.name)}</button>`).join('')}</div>`;
}

function renderMotion(selected: DetectedAnimation | undefined, hasElement: boolean): string {
  const details = selected ? `<div class="badges"><span>${html(selected.type)}</span><span>${html(selected.confidence)}</span></div><label>Duration <input data-duration-range type="range" min="50" max="5000" step="10" value="${selected.duration ?? 400}"><input data-duration-number type="number" value="${selected.duration ?? 400}"> ms</label><label>Delay <input data-delay type="number" value="${selected.delay ?? 0}"> ms</label><label>Easing <select data-easing>${['linear','ease','ease-in','ease-out','ease-in-out','cubic-bezier(.2,.8,.2,1)','steps(4,end)'].map(value => `<option value="${attr(value)}"${value === (selected.easing ?? 'ease') ? ' selected' : ''}>${html(value)}</option>`).join('')}</select></label><h4>Properties</h4>${selected.properties.length ? selected.properties.map(property => `<div class="prop"><code>${html(property.name)}</code><span>${html(property.values?.join(' → ') ?? `${property.from ?? '?'} → ${property.to ?? '?'}`)}</span></div>`).join('') : '<p class="muted">No normalized property values available.</p>'}` : '';
  return `<div class="inspector"><h3>${html(selected?.name ?? selected?.type ?? 'No animation selected')}</h3>${details}<h4>Create / presets</h4><select data-preset ${hasElement ? '' : 'disabled'}><option value="" selected disabled>Apply editable preset…</option>${presets.map(preset => `<option value="${attr(preset.id)}">${html(preset.label)}</option>`).join('')}</select>${hasElement ? '' : '<p class="muted">Pick an element first.</p>'}</div>`;
}

function renderSource(source: SourceState | undefined, selected: DetectedAnimation | undefined): string {
  const open = selected?.source ? `<button data-file="${attr(selected.source.file)}">Open ${html(selected.source.file)}:${selected.source.line ?? '?'}</button>` : '';
  return `<div class="sourceView">${open}<h3>${html(source?.path ?? 'Source')}</h3><pre>${html(source?.text ?? selected?.source?.snippet ?? 'Select a file or a source-correlated animation.')}</pre></div>`;
}

function renderExport(selected: DetectedAnimation | undefined): string {
  const generated = selected ? { css: generateCss(selected), ts: generateTs(selected), diff: generateUnifiedDiff(selected) } : { css: '', ts: '', diff: '' };
  return `<div class="exportView"><h3>Generated change</h3><div class="actions"><button data-copy="css">Copy CSS</button><button data-copy="ts">Copy TS</button><button data-copy="diff">Copy diff</button><button data-action="write-overrides">Write override files</button></div><h4>Proposed diff</h4><pre data-generated="diff">${html(generated.diff || 'Select an animation.')}</pre><h4>CSS</h4><pre data-generated="css">${html(generated.css || 'Select an animation.')}</pre><h4>TypeScript</h4><pre data-generated="ts">${html(generated.ts || 'Select an animation.')}</pre></div>`;
}

function renderTimeline(state: AnimatorState, duration: number): string {
  const width = Math.max(100, duration * state.zoom / 10);
  const ruler = Array.from({ length: 11 }, (_, i) => `<span style="left:${i * 10}%">${Math.round(duration * i / 10)}ms</span>`).join('');
  const tracks = state.animations.slice(0, 80).map(animation => `<button class="track${state.selectedAnimationId === animation.id ? ' selected' : ''}" data-animation-id="${attr(animation.id)}"><span class="trackLabel">${html(animation.name ?? animation.type)}</span><span class="clip" style="left:${timeToPercent(animation.startTime, duration)}%;width:${Math.max(.8, timeToPercent(animation.duration ?? 100, duration))}%"></span></button>`).join('');
  const events = state.events.slice(-200).map(event => `<i title="${attr(event.label)}" style="left:${timeToPercent(event.at, duration)}%"></i>`).join('');
  return `<section class="timeline"><div class="timelineTop"><b>Timeline</b><span>${Math.round(state.playhead)} ms</span><input data-zoom type="range" min="0.5" max="4" step="0.25" value="${state.zoom}"></div><div class="timelineScroll"><div class="timelineCanvas" data-timeline data-duration="${duration}" style="width:${width}px"><div class="ruler">${ruler}</div><div class="tracks">${tracks}<div class="eventTrack">${events}</div></div><div class="playhead" style="left:${timeToPercent(state.playhead, duration)}%"></div></div></div></section>`;
}

function bindEvents(root: HTMLElement, snapshot: AnimatorState, ui: UiState, getIframe: () => HTMLIFrameElement | null, render: () => void): void {
  root.querySelector<HTMLInputElement>('[data-path-input]')?.addEventListener('input', event => { ui.pathInput = (event.currentTarget as HTMLInputElement).value; });
  root.querySelector('[data-action="open-project"]')?.addEventListener('click', () => void openProject(ui));
  root.querySelector('[data-action="picker"]')?.addEventListener('click', () => { const enabled = !store.get().picker; store.set({ picker: enabled }); sendCommand(getIframe(), { type: 'SET_PICKER', enabled }); });
  root.querySelector('[data-action="record"]')?.addEventListener('click', () => { const enabled = !store.get().recording; store.set({ recording: enabled }); sendCommand(getIframe(), { type: 'SET_RECORDING', enabled }); });
  root.querySelector('[data-action="undo"]')?.addEventListener('click', store.undo);
  root.querySelector('[data-action="redo"]')?.addEventListener('click', store.redo);

  const selected = selectAnimation(snapshot);
  root.querySelector('[data-action="restart"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'RESTART_ANIMATION', id: selected.id }));
  root.querySelector('[data-action="play"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'PLAY_ANIMATION', id: selected.id }));
  root.querySelector('[data-action="pause"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'PAUSE_ANIMATION', id: selected.id }));

  root.querySelector<HTMLSelectElement>('[data-viewport]')?.addEventListener('change', event => { const width = Number((event.currentTarget as HTMLSelectElement).value); ui.viewport = width === 390 ? { width: 390, height: 844 } : width === 768 ? { width: 768, height: 1024 } : { width: 1100, height: 700 }; render(); });
  root.querySelector<HTMLSelectElement>('[data-entry]')?.addEventListener('change', event => { const project = store.get().project; if (project) store.set({ project: { ...project, selectedEntry: (event.currentTarget as HTMLSelectElement).value } }); });
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { ui.tab = button.dataset.tab as Tab; render(); }));
  root.querySelectorAll<HTMLElement>('[data-file]').forEach(button => button.addEventListener('click', () => void openFile(button.dataset.file ?? '', ui)));
  root.querySelectorAll<HTMLElement>('[data-element-id]').forEach(button => button.addEventListener('click', () => store.set({ selectedElementId: button.dataset.elementId })));
  root.querySelectorAll<HTMLElement>('[data-animation-id]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); store.set({ selectedAnimationId: button.dataset.animationId }); }));

  const durationRange = root.querySelector<HTMLInputElement>('[data-duration-range]');
  const durationNumber = root.querySelector<HTMLInputElement>('[data-duration-number]');
  durationRange?.addEventListener('input', event => { const value = Number((event.currentTarget as HTMLInputElement).value); if (durationNumber) durationNumber.value = String(value); previewEdit(getIframe(), { duration: value }); });
  durationRange?.addEventListener('change', event => commitEdit(getIframe(), { duration: Number((event.currentTarget as HTMLInputElement).value) }));
  durationNumber?.addEventListener('change', event => commitEdit(getIframe(), { duration: Number((event.currentTarget as HTMLInputElement).value) }));
  root.querySelector<HTMLInputElement>('[data-delay]')?.addEventListener('change', event => commitEdit(getIframe(), { delay: Number((event.currentTarget as HTMLInputElement).value) }));
  root.querySelector<HTMLSelectElement>('[data-easing]')?.addEventListener('change', event => commitEdit(getIframe(), { easing: (event.currentTarget as HTMLSelectElement).value }));
  root.querySelector<HTMLSelectElement>('[data-preset]')?.addEventListener('change', event => { const elementId = store.get().selectedElementId; const preset = presets.find(item => item.id === (event.currentTarget as HTMLSelectElement).value); if (elementId && preset) sendCommand(getIframe(), { type: 'CREATE_ANIMATION', elementId, keyframes: preset.keyframes, duration: preset.duration, easing: preset.easing }); });

  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => button.addEventListener('click', async () => { const target = root.querySelector<HTMLElement>(`[data-generated="${button.dataset.copy ?? ''}"]`); if (target) await navigator.clipboard.writeText(target.textContent ?? ''); }));
  root.querySelector('[data-action="write-overrides"]')?.addEventListener('click', () => void writeOverrides());
  root.querySelector<HTMLInputElement>('[data-zoom]')?.addEventListener('change', event => store.set({ zoom: Number((event.currentTarget as HTMLInputElement).value) }));

  const timeline = root.querySelector<HTMLElement>('[data-timeline]');
  if (timeline) {
    const scrub = (event: PointerEvent): void => { const rect = timeline.getBoundingClientRect(); const duration = Number(timeline.dataset.duration ?? 0); const time = Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)); store.set({ playhead: time }); const current = selectAnimation(store.get()); if (current) sendCommand(getIframe(), { type: 'SET_ANIMATION_TIME', id: current.id, time: Math.max(0, time - current.startTime) }); };
    timeline.addEventListener('pointerdown', event => { timeline.setPointerCapture(event.pointerId); scrub(event); });
    timeline.addEventListener('pointermove', event => { if (timeline.hasPointerCapture(event.pointerId)) scrub(event); });
  }
}

function previewEdit(frame: HTMLIFrameElement | null, patch: Partial<DetectedAnimation>): void {
  const current = selectAnimation(store.get());
  if (!current) return;
  sendCommand(frame, { type: 'APPLY_OVERRIDE', animationId: current.id, duration: patch.duration ?? current.duration, easing: patch.easing ?? current.easing, keyframes: patch.keyframes ?? current.keyframes });
}

function commitEdit(frame: HTMLIFrameElement | null, patch: Partial<DetectedAnimation>): void {
  const current = selectAnimation(store.get());
  if (!current) return;
  store.updateAnimation(current.id, patch);
  previewEdit(frame, patch);
}

async function openProject(ui: UiState): Promise<void> {
  try {
    const response = await fetch('/api/projects/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ui.pathInput }) });
    const body = await response.json() as ProjectDescriptor & { error?: string };
    if (!response.ok) return diagnostic(body.error ?? 'Open failed');
    store.set({ project: body, analysis: undefined, animations: [], events: [], elements: [], selectedElementId: undefined, selectedAnimationId: undefined });
    const analysisResponse = await fetch(`/api/projects/${body.id}/analysis`);
    if (!analysisResponse.ok) return diagnostic('Static analysis failed');
    const analysis = await analysisResponse.json() as StaticAnalysis;
    store.set({ analysis });
    for (const animation of analysis.animations as DetectedAnimation[]) store.addAnimation(animation);
  } catch (error) { diagnostic(String(error)); }
}

async function openFile(file: string, ui: UiState): Promise<void> {
  const project = store.get().project;
  if (!project) return;
  try { const response = await fetch(`/api/projects/${project.id}/source?path=${encodeURIComponent(file)}`); ui.source = { path: file, text: await response.text() }; ui.tab = 'source'; store.touch(); } catch (error) { diagnostic(String(error)); }
}

async function writeOverrides(): Promise<void> {
  const state = store.get();
  if (!state.project) return;
  try { const output = generateOverrideFiles(state.animations.filter(animation => animation.confidence !== 'unknown')); const response = await fetch(`/api/projects/${state.project.id}/export-overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(output) }); const body = await response.json() as { cssPath?: string; error?: string }; diagnostic(response.ok ? `Overrides written: ${body.cssPath ?? '.animator'}` : body.error ?? 'Export failed'); } catch (error) { diagnostic(String(error)); }
}

function selectAnimation(state: AnimatorState): DetectedAnimation | undefined { return state.animations.find(animation => animation.id === state.selectedAnimationId) ?? state.animations.find(animation => animation.elementId === state.selectedElementId); }
function diagnostic(message: string): void { store.set({ diagnostics: [...store.get().diagnostics, message] }); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function html(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
function attr(value: string): string { return html(value); }
