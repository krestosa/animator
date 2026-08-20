import { connectPreview, sendCommand } from '../preview/bridge';
import { store } from '../state/store';
import { presets } from '../presets/presets';
import { generateCss, generateOverrideFiles, generateTs, generateUnifiedDiff } from '../exporters/generate';
import { timelineDuration, timeToPercent } from '../utils/timeline';
import type { DetectedAnimation, ProjectDescriptor, ProjectFile, StaticAnalysis } from '../types/domain';

const fixtureDefault = '__fixture__';

type Tab = 'motion' | 'source' | 'export';
type Viewport = { width: number; height: number };
type SourceViewState = { path: string; text: string };

type LocalUiState = {
  pathInput: string;
  viewport: Viewport;
  source?: SourceViewState;
  tab: Tab;
};

export function mountApp(root: HTMLElement): () => void {
  const ui: LocalUiState = {
    pathInput: fixtureDefault,
    viewport: { width: 1100, height: 700 },
    tab: 'motion'
  };
  let iframe: HTMLIFrameElement | null = null;
  let bridgeCleanup: (() => void) | undefined;
  let renderedProjectId: string | undefined;
  let disposed = false;

  const render = (): void => {
    if (disposed) return;
    const state = store.get();
    root.innerHTML = buildShell(state, ui);

    const nextIframe = root.querySelector<HTMLIFrameElement>('[data-preview-frame]');
    if (nextIframe) {
      iframe = nextIframe;
      const projectId = state.project?.id;
      if (projectId && projectId !== renderedProjectId) {
        bridgeCleanup?.();
        renderedProjectId = projectId;
        bridgeCleanup = connectPreview(nextIframe);
      }
    }

    bindEvents(root, state, ui, () => iframe, render);
  };

  const unsubscribe = store.subscribe(render);
  render();

  return () => {
    disposed = true;
    bridgeCleanup?.();
    unsubscribe();
    root.replaceChildren();
  };
}

function buildShell(state: ReturnType<typeof store.get>, ui: LocalUiState): string {
  const selected = selectAnimation(state.animations, state.selectedAnimationId, state.selectedElementId);
  const duration = timelineDuration(state.animations, state.events);
  const project = state.project;
  const diagnostics = state.diagnostics.at(-1);

  return `
    <div class="app">
      ${renderToolbar(state, ui)}
      <main class="workspace">
        <aside class="leftPanel">
          <section><h3>Project</h3>${project ? renderTree(project.tree) : '<p class="muted">Open a local project. The included fixture path is prefilled.</p>'}</section>
          <section class="elementList"><h3>Elements <small>${state.elements.length}</small></h3>${state.elements.slice(0, 300).map(el => `<button class="row${state.selectedElementId === el.id ? ' selected' : ''}" data-element-id="${escapeAttr(el.id)}"><code>${escapeHtml(el.tag)}</code>${el.domId ? `#${escapeHtml(el.domId)}` : ''}${el.classes[0] ? `.${escapeHtml(el.classes[0])}` : ''}</button>`).join('')}</section>
        </aside>
        ${renderPreview(project, state.analysis, ui.viewport)}
        <aside class="rightPanel">
          <nav>
            <button data-tab="motion" class="${ui.tab === 'motion' ? 'active' : ''}">Motion</button>
            <button data-tab="source" class="${ui.tab === 'source' ? 'active' : ''}">Source</button>
            <button data-tab="export" class="${ui.tab === 'export' ? 'active' : ''}">Export</button>
          </nav>
          ${ui.tab === 'motion' ? renderMotionInspector(selected, !!state.selectedElementId) : ui.tab === 'source' ? renderSource(ui.source, selected) : renderExport(selected)}
        </aside>
      </main>
      ${renderTimeline(state.animations, state.events, duration, state.playhead, state.zoom)}
      ${diagnostics ? `<div class="diagnostics">${escapeHtml(diagnostics)}</div>` : ''}
    </div>`;
}

function renderToolbar(state: ReturnType<typeof store.get>, ui: LocalUiState): string {
  return `<header class="toolbar">
    <b>Animator</b>
    <input class="path" data-path-input value="${escapeAttr(ui.pathInput)}" placeholder="Local project path">
    <button data-action="open-project">Open project</button>
    <span class="sep"></span>
    <button data-action="picker" class="${state.picker ? 'active' : ''}">Pick element</button>
    <button data-action="record">${state.recording ? 'Recording' : 'Record'}</button>
    <span class="sep"></span>
    <button data-action="restart">↺</button>
    <button data-action="play">▶</button>
    <button data-action="pause">Ⅱ</button>
    <button data-action="undo">Undo</button>
    <button data-action="redo">Redo</button>
    <span class="grow"></span>
    <select data-viewport>
      <option value="390"${ui.viewport.width === 390 ? ' selected' : ''}>Mobile</option>
      <option value="768"${ui.viewport.width === 768 ? ' selected' : ''}>Tablet</option>
      <option value="1100"${ui.viewport.width === 1100 ? ' selected' : ''}>Desktop</option>
    </select>
    <span>${ui.viewport.width}×${ui.viewport.height}</span>
  </header>`;
}

function renderPreview(project: ProjectDescriptor | undefined, analysis: StaticAnalysis | undefined, viewport: Viewport): string {
  const pages = project ? `<select data-entry>${project.entries.map(entry => `<option value="${escapeAttr(entry)}"${entry === project.selectedEntry ? ' selected' : ''}>${escapeHtml(entry)}</option>`).join('')}</select>` : '<span>No preview</span>';
  const scale = Math.min(1, 900 / viewport.width, 620 / viewport.height);
  const frame = project ? `<iframe data-preview-frame src="/preview/${encodeURIComponent(project.id)}/${project.selectedEntry.split('/').map(encodeURIComponent).join('/')}" title="Project preview"></iframe>` : '';
  return `<section class="previewArea"><div class="previewChrome">${pages}<span>${analysis?.reducedMotion ? 'Reduced motion CSS detected' : 'Normal motion'}</span></div><div class="stage"><div class="device" style="width:${viewport.width}px;height:${viewport.height}px;transform:scale(${scale})">${frame}</div></div></section>`;
}

function renderTree(nodes: ProjectFile[]): string {
  return `<div class="tree">${nodes.map(node => node.type === 'directory'
    ? `<details><summary>${escapeHtml(node.name)}</summary>${node.children ? renderTree(node.children) : ''}</details>`
    : `<button data-file="${escapeAttr(node.path)}">${escapeHtml(node.name)}</button>`).join('')}</div>`;
}

function renderMotionInspector(selected: DetectedAnimation | undefined, hasElement: boolean): string {
  const details = selected ? `<>
    <div class="badges"><span>${escapeHtml(selected.type)}</span><span>${escapeHtml(selected.confidence)}</span></div>
    <label>Duration <input data-animation-field="duration" type="range" min="50" max="5000" step="10" value="${selected.duration ?? 400}"><input data-animation-field="duration-number" type="number" value="${selected.duration ?? 400}"> ms</label>
    <label>Delay <input data-animation-field="delay" type="number" value="${selected.delay ?? 0}"> ms</label>
    <label>Easing <select data-animation-field="easing">${['linear','ease','ease-in','ease-out','ease-in-out','cubic-bezier(.2,.8,.2,1)','steps(4,end)'].map(value => `<option${value === (selected.easing ?? 'ease') ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
    <h4>Properties</h4>
    ${selected.properties.length ? selected.properties.map(property => `<div class="prop"><code>${escapeHtml(property.name)}</code><span>${escapeHtml(property.values?.join(' → ') ?? `${property.from ?? '?'} → ${property.to ?? '?'}`)}</span></div>`).join('') : '<p class="muted">No normalized property values available.</p>'}
  </>` : '';
  return `<div class="inspector"><h3>${escapeHtml(selected?.name ?? selected?.type ?? 'No animation selected')}</h3>${details}<h4>Create / presets</h4><select data-preset ${hasElement ? '' : 'disabled'}><option value="" selected disabled>Apply editable preset…</option>${presets.map(preset => `<option value="${escapeAttr(preset.id)}">${escapeHtml(preset.label)}</option>`).join('')}</select>${hasElement ? '' : '<p class="muted">Pick an element first.</p>'}</div>`;
}

function renderSource(source: SourceViewState | undefined, selected: DetectedAnimation | undefined): string {
  const button = selected?.source ? `<button data-file="${escapeAttr(selected.source.file)}">Open ${escapeHtml(selected.source.file)}:${selected.source.line ?? '?'}</button>` : '';
  return `<div class="sourceView">${button}<h3>${escapeHtml(source?.path ?? 'Source')}</h3><pre>${escapeHtml(source?.text ?? selected?.source?.snippet ?? 'Select a file or a source-correlated animation.')}</pre></div>`;
}

function renderExport(selected: DetectedAnimation | undefined): string {
  const generated = selected ? { css: generateCss(selected), ts: generateTs(selected), diff: generateUnifiedDiff(selected) } : { css: '', ts: '', diff: '' };
  return `<div class="exportView"><h3>Generated change</h3><div class="actions"><button data-copy="css">Copy CSS</button><button data-copy="ts">Copy TS</button><button data-copy="diff">Copy diff</button><button data-action="write-overrides">Write override files</button></div><h4>Proposed diff</h4><pre data-generated="diff">${escapeHtml(generated.diff || 'Select an animation.')}</pre><h4>CSS</h4><pre data-generated="css">${escapeHtml(generated.css || 'Select an animation.')}</pre><h4>TypeScript</h4><pre data-generated="ts">${escapeHtml(generated.ts || 'Select an animation.')}</pre></div>`;
}

function renderTimeline(animations: DetectedAnimation[], events: ReturnType<typeof store.get>['events'], duration: number, playhead: number, zoom: number): string {
  const width = Math.max(100, duration * zoom / 10);
  const tracks = animations.slice(0, 80).map(animation => `<button class="track" data-animation-id="${escapeAttr(animation.id)}"><span class="trackLabel">${escapeHtml(animation.name ?? animation.type)}</span><span class="clip" style="left:${timeToPercent(animation.startTime, duration)}%;width:${Math.max(.8, timeToPercent(animation.duration ?? 100, duration))}%"></span></button>`).join('');
  const markers = events.slice(-200).map(event => `<i title="${escapeAttr(event.label)}" style="left:${timeToPercent(event.at, duration)}%"></i>`).join('');
  const ruler = Array.from({ length: 11 }, (_, index) => `<span style="left:${index * 10}%">${Math.round(duration * index / 10)}ms</span>`).join('');
  return `<section class="timeline"><div class="timelineTop"><b>Timeline</b><span>${Math.round(playhead)} ms</span><input data-zoom type="range" min="0.5" max="4" step="0.25" value="${zoom}"></div><div class="timelineScroll"><div class="timelineCanvas" data-timeline data-duration="${duration}" style="width:${width}px"><div class="ruler">${ruler}</div><div class="tracks">${tracks}<div class="eventTrack">${markers}</div></div><div class="playhead" style="left:${timeToPercent(playhead, duration)}%"></div></div></div></section>`;
}

function bindEvents(root: HTMLElement, state: ReturnType<typeof store.get>, ui: LocalUiState, getIframe: () => HTMLIFrameElement | null, render: () => void): void {
  root.querySelector<HTMLInputElement>('[data-path-input]')?.addEventListener('input', event => { ui.pathInput = (event.currentTarget as HTMLInputElement).value; });
  root.querySelector('[data-action="open-project"]')?.addEventListener('click', () => void openProject(ui));
  root.querySelector('[data-action="picker"]')?.addEventListener('click', () => { const next = !store.get().picker; store.set({ picker: next }); sendCommand(getIframe(), { type: 'SET_PICKER', enabled: next }); });
  root.querySelector('[data-action="record"]')?.addEventListener('click', () => { const next = !store.get().recording; store.set({ recording: next }); sendCommand(getIframe(), { type: 'SET_RECORDING', enabled: next }); });
  root.querySelector('[data-action="undo"]')?.addEventListener('click', store.undo);
  root.querySelector('[data-action="redo"]')?.addEventListener('click', store.redo);

  const selected = selectAnimation(state.animations, state.selectedAnimationId, state.selectedElementId);
  root.querySelector('[data-action="restart"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'RESTART_ANIMATION', id: selected.id }));
  root.querySelector('[data-action="play"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'PLAY_ANIMATION', id: selected.id }));
  root.querySelector('[data-action="pause"]')?.addEventListener('click', () => selected && sendCommand(getIframe(), { type: 'PAUSE_ANIMATION', id: selected.id }));

  root.querySelector<HTMLSelectElement>('[data-viewport]')?.addEventListener('change', event => { const width = Number((event.currentTarget as HTMLSelectElement).value); ui.viewport = width === 390 ? { width: 390, height: 844 } : width === 768 ? { width: 768, height: 1024 } : { width: 1100, height: 700 }; render(); });
  root.querySelector<HTMLSelectElement>('[data-entry]')?.addEventListener('change', event => { const project = store.get().project; if (!project) return; store.set({ project: { ...project, selectedEntry: (event.currentTarget as HTMLSelectElement).value } }); });
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.addEventListener('click', () => { ui.tab = button.dataset.tab as Tab; render(); }));
  root.querySelectorAll<HTMLElement>('[data-file]').forEach(button => button.addEventListener('click', () => void openFile(button.dataset.file ?? '', ui)));
  root.querySelectorAll<HTMLElement>('[data-element-id]').forEach(button => button.addEventListener('click', () => store.set({ selectedElementId: button.dataset.elementId })));
  root.querySelectorAll<HTMLElement>('[data-animation-id]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); store.set({ selectedAnimationId: button.dataset.animationId }); }));

  const edit = (patch: Partial<DetectedAnimation>): void => {
    const current = selectAnimation(store.get().animations, store.get().selectedAnimationId, store.get().selectedElementId);
    if (!current) return;
    store.updateAnimation(current.id, patch);
    sendCommand(getIframe(), { type: 'APPLY_OVERRIDE', animationId: current.id, duration: patch.duration ?? current.duration, easing: patch.easing ?? current.easing, keyframes: patch.keyframes ?? current.keyframes });
  };
  root.querySelector<HTMLInputElement>('[data-animation-field="duration"]')?.addEventListener('input', event => edit({ duration: Number((event.currentTarget as HTMLInputElement).value) }));
  root.querySelector<HTMLInputElement>('[data-animation-field="duration-number"]')?.addEventListener('change', event => edit({ duration: Number((event.currentTarget as HTMLInputElement).value) }));
  root.querySelector<HTMLInputElement>('[data-animation-field="delay"]')?.addEventListener('change', event => edit({ delay: Number((event.currentTarget as HTMLInputElement).value) }));
  root.querySelector<HTMLSelectElement>('[data-animation-field="easing"]')?.addEventListener('change', event => edit({ easing: (event.currentTarget as HTMLSelectElement).value }));
  root.querySelector<HTMLSelectElement>('[data-preset]')?.addEventListener('change', event => { const selectedElementId = store.get().selectedElementId; const preset = presets.find(item => item.id === (event.currentTarget as HTMLSelectElement).value); if (selectedElementId && preset) sendCommand(getIframe(), { type: 'CREATE_ANIMATION', elementId: selectedElementId, keyframes: preset.keyframes, duration: preset.duration, easing: preset.easing }); });

  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => button.addEventListener('click', async () => { const key = button.dataset.copy as 'css' | 'ts' | 'diff'; const pre = root.querySelector<HTMLElement>(`[data-generated="${key}"]`); if (pre) await navigator.clipboard.writeText(pre.textContent ?? ''); }));
  root.querySelector('[data-action="write-overrides"]')?.addEventListener('click', () => void writeOverrides());
  root.querySelector<HTMLInputElement>('[data-zoom]')?.addEventListener('input', event => store.set({ zoom: Number((event.currentTarget as HTMLInputElement).value) }));

  const timeline = root.querySelector<HTMLElement>('[data-timeline]');
  if (timeline) {
    const scrub = (event: PointerEvent): void => {
      const current = selectAnimation(store.get().animations, store.get().selectedAnimationId, store.get().selectedElementId);
      const rect = timeline.getBoundingClientRect();
      const duration = Number(timeline.dataset.duration ?? 0);
      const value = Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
      store.set({ playhead: value });
      if (current) sendCommand(getIframe(), { type: 'SET_ANIMATION_TIME', id: current.id, time: Math.max(0, value - current.startTime) });
    };
    timeline.addEventListener('pointerdown', event => { timeline.setPointerCapture(event.pointerId); scrub(event); });
    timeline.addEventListener('pointermove', event => { if (timeline.hasPointerCapture(event.pointerId)) scrub(event); });
  }
}

async function openProject(ui: LocalUiState): Promise<void> {
  try {
    const response = await fetch('/api/projects/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ui.pathInput }) });
    const body = await response.json() as ProjectDescriptor & { error?: string };
    if (!response.ok) { addDiagnostic(body.error ?? 'Open failed'); return; }
    store.set({ project: body, animations: [], events: [], elements: [], selectedElementId: undefined, selectedAnimationId: undefined, analysis: undefined });
    const analysisResponse = await fetch(`/api/projects/${body.id}/analysis`);
    if (analysisResponse.ok) {
      const analysis = await analysisResponse.json() as StaticAnalysis;
      store.set({ analysis });
      for (const animation of analysis.animations as DetectedAnimation[]) store.addAnimation(animation);
    }
  } catch (error) { addDiagnostic(String(error)); }
}

async function openFile(file: string, ui: LocalUiState): Promise<void> {
  const project = store.get().project;
  if (!project) return;
  try {
    const response = await fetch(`/api/projects/${project.id}/source?path=${encodeURIComponent(file)}`);
    ui.source = { path: file, text: await response.text() };
    ui.tab = 'source';
    store.touch();
  } catch (error) { addDiagnostic(String(error)); }
}

async function writeOverrides(): Promise<void> {
  const state = store.get();
  if (!state.project) return;
  try {
    const output = generateOverrideFiles(state.animations.filter(animation => animation.confidence !== 'unknown'));
    const response = await fetch(`/api/projects/${state.project.id}/export-overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(output) });
    const body = await response.json() as { cssPath?: string; error?: string };
    addDiagnostic(response.ok ? `Overrides written: ${body.cssPath ?? '.animator'}` : body.error ?? 'Export failed');
  } catch (error) { addDiagnostic(String(error)); }
}

function selectAnimation(animations: DetectedAnimation[], selectedAnimationId?: string, selectedElementId?: string): DetectedAnimation | undefined {
  return animations.find(animation => animation.id === selectedAnimationId) ?? animations.find(animation => animation.elementId === selectedElementId);
}

function addDiagnostic(message: string): void {
  store.set({ diagnostics: [...store.get().diagnostics, message] });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function escapeAttr(value: string): string { return escapeHtml(value); }
