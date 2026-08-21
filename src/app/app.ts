import { connectPreview, sendCommand } from '../preview/bridge';
import { store, type AnimatorState } from '../state/store';
import { presets } from '../presets/presets';
import { generateCss, generateOverrideFiles, generateTs, generateUnifiedDiff } from '../exporters/generate';
import { timelineDuration } from '../utils/timeline';
import type { DetectedAnimation, ProjectDescriptor, ProjectFile, StaticAnalysis } from '../types/domain';

type Tab = 'motion' | 'source' | 'export';
type Viewport = { width: number; height: number };
type SourceState = { path: string; text: string };
type UiState = { pathInput: string; viewport: Viewport; source?: SourceState; tab: Tab; playbackRate: number };
type Signatures = { project: string; elements: string; right: string; timeline: string; events: string; duration: string; preview: string; diagnostic: string };

const rates = [0.1, 0.25, 0.5, 1, 2, 4];

export function mountApp(root: HTMLElement): () => void {
  const ui: UiState = { pathInput: '', viewport: { width: 1100, height: 700 }, tab: 'motion', playbackRate: 1 };
  const signatures: Signatures = { project: '', elements: '', right: '', timeline: '', events: '', duration: '', preview: '', diagnostic: '' };
  let iframe: HTMLIFrameElement | null = null;
  let bridgeCleanup: (() => void) | undefined;
  let previewKey = '';
  let disposed = false;
  let frameRequest = 0;

  root.innerHTML = buildStableShell();

  const render = (): void => {
    frameRequest = 0;
    if (disposed) return;
    const state = store.get();
    updateToolbar(root, state, ui);
    updateProject(root, state, signatures);
    updateElements(root, state, signatures);
    updateRightPanel(root, state, ui, signatures);
    updateTimeline(root, state, signatures);
    updateDiagnostic(root, state, signatures);

    const nextPreviewKey = state.project ? `${state.project.id}:${state.project.selectedEntry}` : '';
    const previewSignature = `${nextPreviewKey}:${ui.viewport.width}x${ui.viewport.height}:${state.analysis?.reducedMotion ?? false}`;
    if (signatures.preview !== previewSignature) {
      signatures.preview = previewSignature;
      const device = root.querySelector<HTMLElement>('[data-device]');
      const chrome = root.querySelector<HTMLElement>('[data-preview-chrome]');
      if (device) {
        const scale = Math.min(1, 900 / ui.viewport.width, 620 / ui.viewport.height);
        device.style.width = `${ui.viewport.width}px`;
        device.style.height = `${ui.viewport.height}px`;
        device.style.transform = `scale(${scale})`;
      }
      if (chrome) chrome.innerHTML = renderPreviewChrome(state.project, state.analysis);
      if (nextPreviewKey !== previewKey) {
        bridgeCleanup?.();
        bridgeCleanup = undefined;
        iframe?.remove();
        iframe = null;
        previewKey = nextPreviewKey;
        if (device && state.project) {
          iframe = document.createElement('iframe');
          iframe.dataset.previewFrame = '';
          iframe.title = 'Project preview';
          iframe.src = previewUrl(state.project);
          device.appendChild(iframe);
          bridgeCleanup = connectPreview(iframe);
        }
      }
    }
  };

  const requestRender = (): void => {
    if (disposed || frameRequest) return;
    frameRequest = requestAnimationFrame(render);
  };

  const onClick = (event: MouseEvent): void => handleClick(event, root, ui, () => iframe, requestRender);
  const onChange = (event: Event): void => handleChange(event, root, ui, () => iframe, requestRender);
  const onInput = (event: Event): void => handleInput(event, root, ui, () => iframe);
  const onPointerDown = (event: PointerEvent): void => handleTimelinePointerDown(event, root, () => iframe);
  const onPointerMove = (event: PointerEvent): void => handleTimelinePointerMove(event, root, () => iframe);

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);

  const unsubscribe = store.subscribe(requestRender);
  render();

  return () => {
    disposed = true;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    bridgeCleanup?.();
    unsubscribe();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.replaceChildren();
  };
}

function buildStableShell(): string {
  return `<div class="app">
    <header class="toolbar">
      <b>Animator</b>
      <button data-action="pick-folder" title="Choose a local project folder">Open folder…</button>
      <input class="path" data-path-input placeholder="Or enter local project path">
      <button data-action="open-project">Open path</button><span class="sep"></span>
      <button data-action="picker">Pick element</button><button data-action="record">Record</button><span class="sep"></span>
      <button data-action="previous-event" title="Previous event">◀|</button><button data-action="restart" title="Restart animation">↺</button><button data-action="play" title="Play">▶</button><button data-action="pause" title="Pause">Ⅱ</button><button data-action="next-event" title="Next event">|▶</button>
      <select data-playback-rate title="Playback speed">${rates.map(rate => `<option value="${rate}">${rate}x</option>`).join('')}</select>
      <button data-action="clear-overrides">Clear overrides</button><button data-action="undo">Undo</button><button data-action="redo">Redo</button>
      <span class="grow"></span><select data-viewport><option value="390">Mobile</option><option value="768">Tablet</option><option value="1100" selected>Desktop</option></select><span data-viewport-label>1100×700</span>
    </header>
    <main class="workspace">
      <aside class="leftPanel"><section data-project-region></section><section class="elementList" data-elements-region></section></aside>
      <section class="previewArea"><div class="previewChrome" data-preview-chrome><span>No preview</span></div><div class="stage"><div class="device" data-device></div></div></section>
      <aside class="rightPanel"><nav>${(['motion', 'source', 'export'] as const).map(tab => `<button data-tab="${tab}" class="${tab === 'motion' ? 'active' : ''}">${capitalize(tab)}</button>`).join('')}</nav><div data-right-region></div></aside>
    </main>
    <section class="timeline">
      <div class="timelineTop"><b>Timeline</b><span data-playhead-label>0 ms</span><input data-zoom type="range" min="0.5" max="4" step="0.25" value="1"></div>
      <div class="timelineScroll" data-timeline-scroll><div class="timelineCanvas" data-timeline data-duration="1000" data-px-per-ms="0.1"><div class="ruler" data-ruler></div><div class="tracks" data-tracks></div><div class="eventTrack" data-event-track></div><div class="playhead" data-playhead></div></div></div>
    </section>
    <div class="diagnostics" data-diagnostic hidden></div>
  </div>`;
}

function updateToolbar(root: HTMLElement, state: AnimatorState, ui: UiState): void {
  const picker = root.querySelector<HTMLButtonElement>('[data-action="picker"]');
  const record = root.querySelector<HTMLButtonElement>('[data-action="record"]');
  const path = root.querySelector<HTMLInputElement>('[data-path-input]');
  const rate = root.querySelector<HTMLSelectElement>('[data-playback-rate]');
  const viewport = root.querySelector<HTMLSelectElement>('[data-viewport]');
  const viewportLabel = root.querySelector<HTMLElement>('[data-viewport-label]');
  picker?.classList.toggle('active', state.picker);
  if (record) { record.classList.toggle('active', state.recording); record.textContent = state.recording ? 'Recording' : 'Record'; }
  if (path && document.activeElement !== path && path.value !== ui.pathInput) path.value = ui.pathInput;
  if (rate && rate.value !== String(ui.playbackRate)) rate.value = String(ui.playbackRate);
  if (viewport && viewport.value !== String(ui.viewport.width)) viewport.value = String(ui.viewport.width);
  if (viewportLabel) viewportLabel.textContent = `${ui.viewport.width}×${ui.viewport.height}`;
}

function updateProject(root: HTMLElement, state: AnimatorState, signatures: Signatures): void {
  const signature = state.project ? `${state.project.id}:${state.project.root}:${state.project.tree.length}` : 'none';
  if (signature === signatures.project) return;
  signatures.project = signature;
  const region = root.querySelector<HTMLElement>('[data-project-region]');
  if (region) region.innerHTML = `<h3>Project</h3>${state.project ? renderTree(state.project.tree) : '<p class="muted">Open a local project folder to inspect its files and motion.</p>'}`;
}

function updateElements(root: HTMLElement, state: AnimatorState, signatures: Signatures): void {
  const signature = `${state.selectedElementId ?? ''}|${state.elements.map(element => `${element.id}:${element.alive ? 1 : 0}`).join(',')}`;
  if (signature === signatures.elements) return;
  signatures.elements = signature;
  const region = root.querySelector<HTMLElement>('[data-elements-region]');
  if (!region) return;
  region.innerHTML = `<h3>Elements <small>${state.elements.length}</small></h3>${state.elements.slice(0, 300).map(element => `<button class="row${state.selectedElementId === element.id ? ' selected' : ''}" data-element-id="${attr(element.id)}"><code>${html(element.tag)}</code>${element.domId ? `#${html(element.domId)}` : ''}${element.classes[0] ? `.${html(element.classes[0])}` : ''}</button>`).join('')}`;
}

function updateRightPanel(root: HTMLElement, state: AnimatorState, ui: UiState, signatures: Signatures): void {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === ui.tab));
  const selected = selectAnimation(state);
  const signature = `${ui.tab}|${state.selectedElementId ?? ''}|${selected ? `${selected.id}:${selected.duration ?? ''}:${selected.delay ?? ''}:${selected.easing ?? ''}:${selected.runtimeState}:${selected.properties.map(p => `${p.name}:${p.values?.join('|') ?? ''}`).join(';')}` : ''}|${ui.source?.path ?? ''}:${ui.source?.text.length ?? 0}`;
  if (signature === signatures.right) return;
  signatures.right = signature;
  const region = root.querySelector<HTMLElement>('[data-right-region]');
  if (!region) return;
  region.innerHTML = ui.tab === 'motion' ? renderMotion(selected, !!state.selectedElementId) : ui.tab === 'source' ? renderSource(ui.source, selected) : renderExport(selected);
}

function updateTimeline(root: HTMLElement, state: AnimatorState, signatures: Signatures): void {
  const duration = timelineDuration(state.animations, state.events);
  const pxPerMs = Math.max(0.05, state.zoom / 10);
  const canvas = root.querySelector<HTMLElement>('[data-timeline]');
  const ruler = root.querySelector<HTMLElement>('[data-ruler]');
  const tracks = root.querySelector<HTMLElement>('[data-tracks]');
  const events = root.querySelector<HTMLElement>('[data-event-track]');
  const playhead = root.querySelector<HTMLElement>('[data-playhead]');
  const playheadLabel = root.querySelector<HTMLElement>('[data-playhead-label]');
  const zoom = root.querySelector<HTMLInputElement>('[data-zoom]');
  if (!canvas || !ruler || !tracks || !events || !playhead) return;

  const durationSignature = `${Math.ceil(duration)}:${state.zoom}`;
  if (durationSignature !== signatures.duration) {
    signatures.duration = durationSignature;
    canvas.dataset.duration = String(duration);
    canvas.dataset.pxPerMs = String(pxPerMs);
    canvas.style.width = `${Math.max(100, duration * pxPerMs + 100)}px`;
    const step = chooseRulerStep(pxPerMs);
    const marks: string[] = [];
    for (let time = 0; time <= duration + step; time += step) marks.push(`<span style="left:${time * pxPerMs}px">${Math.round(time)}ms</span>`);
    ruler.innerHTML = marks.join('');
  }

  const timelineSignature = `${state.selectedAnimationId ?? ''}|${state.zoom}|${state.animations.map(animation => `${animation.id}:${animation.startTime}:${animation.duration ?? 100}:${animation.name ?? animation.type}`).join(',')}`;
  if (timelineSignature !== signatures.timeline) {
    signatures.timeline = timelineSignature;
    tracks.innerHTML = state.animations.slice(0, 120).map(animation => {
      const left = Math.max(0, animation.startTime * pxPerMs);
      const width = Math.max(4, (animation.duration ?? 100) * pxPerMs);
      return `<button class="track${state.selectedAnimationId === animation.id ? ' selected' : ''}" data-animation-id="${attr(animation.id)}"><span class="trackLabel">${html(animation.name ?? animation.type)}</span><span class="clip" style="left:${left}px;width:${width}px"></span></button>`;
    }).join('');
  }

  const eventSignature = `${state.zoom}|${state.events.map(event => `${event.id}:${event.at}`).join(',')}`;
  if (eventSignature !== signatures.events) {
    signatures.events = eventSignature;
    events.innerHTML = state.events.slice(-300).map(event => `<i title="${attr(event.label)}" style="left:${Math.max(0, event.at * pxPerMs)}px"></i>`).join('');
  }

  playhead.style.left = `${Math.max(0, state.playhead * pxPerMs)}px`;
  if (playheadLabel) playheadLabel.textContent = `${Math.round(state.playhead)} ms`;
  if (zoom && document.activeElement !== zoom) zoom.value = String(state.zoom);
}

function updateDiagnostic(root: HTMLElement, state: AnimatorState, signatures: Signatures): void {
  const message = state.diagnostics.at(-1) ?? '';
  if (message === signatures.diagnostic) return;
  signatures.diagnostic = message;
  const region = root.querySelector<HTMLElement>('[data-diagnostic]');
  if (!region) return;
  region.hidden = !message;
  region.textContent = message;
}

function renderPreviewChrome(project: ProjectDescriptor | undefined, analysis: StaticAnalysis | undefined): string {
  const pages = project ? `<select data-entry>${project.entries.map(entry => `<option value="${attr(entry)}"${entry === project.selectedEntry ? ' selected' : ''}>${html(entry)}</option>`).join('')}</select>` : '<span>No preview</span>';
  return `${pages}<span>${analysis?.reducedMotion ? 'Reduced motion CSS detected' : 'Normal motion'}</span>`;
}

function previewUrl(project: ProjectDescriptor): string {
  return `/preview/${encodeURIComponent(project.id)}/${project.selectedEntry.split('/').map(encodeURIComponent).join('/')}`;
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

function handleClick(event: MouseEvent, root: HTMLElement, ui: UiState, getIframe: () => HTMLIFrameElement | null, render: () => void): void {
  const target = (event.target as Element | null)?.closest<HTMLElement>('button,[data-tab]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'pick-folder') { void pickFolder(ui); return; }
  if (action === 'open-project') { void openProject(ui); return; }
  if (action === 'picker') { const enabled = !store.get().picker; store.set({ picker: enabled }); sendCommand(getIframe(), { type: 'SET_PICKER', enabled }); return; }
  if (action === 'record') { const enabled = !store.get().recording; store.set({ recording: enabled }); sendCommand(getIframe(), { type: 'SET_RECORDING', enabled }); return; }
  if (action === 'undo') { store.undo(); return; }
  if (action === 'redo') { store.redo(); return; }
  if (action === 'clear-overrides') { sendCommand(getIframe(), { type: 'CLEAR_OVERRIDES' }); return; }
  if (action === 'previous-event') { jumpEvent(-1, getIframe()); return; }
  if (action === 'next-event') { jumpEvent(1, getIframe()); return; }
  const selected = selectAnimation(store.get());
  if (action === 'restart' && selected) { sendCommand(getIframe(), { type: 'RESTART_ANIMATION', id: selected.id }); return; }
  if (action === 'play' && selected) { sendCommand(getIframe(), { type: 'PLAY_ANIMATION', id: selected.id }); return; }
  if (action === 'pause' && selected) { sendCommand(getIframe(), { type: 'PAUSE_ANIMATION', id: selected.id }); return; }
  if (action === 'write-overrides') { void writeOverrides(); return; }
  if (target.dataset.tab) { ui.tab = target.dataset.tab as Tab; render(); return; }
  if (target.dataset.file) { void openFile(target.dataset.file, ui); return; }
  if (target.dataset.elementId) { store.set({ selectedElementId: target.dataset.elementId }); return; }
  if (target.dataset.animationId) { store.set({ selectedAnimationId: target.dataset.animationId }); return; }
  if (target.dataset.copy) {
    const generated = root.querySelector<HTMLElement>(`[data-generated="${target.dataset.copy}"]`);
    if (generated) void navigator.clipboard.writeText(generated.textContent ?? '');
  }
}

function handleChange(event: Event, _root: HTMLElement, ui: UiState, getIframe: () => HTMLIFrameElement | null, render: () => void): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.matches('[data-playback-rate]')) { ui.playbackRate = Number(target.value); const current = selectAnimation(store.get()); if (current) sendCommand(getIframe(), { type: 'SET_PLAYBACK_RATE', id: current.id, rate: ui.playbackRate }); return; }
  if (target.matches('[data-viewport]')) { const width = Number(target.value); ui.viewport = width === 390 ? { width: 390, height: 844 } : width === 768 ? { width: 768, height: 1024 } : { width: 1100, height: 700 }; render(); return; }
  if (target.matches('[data-entry]')) { const project = store.get().project; if (project) store.set({ project: { ...project, selectedEntry: target.value } }); return; }
  if (target.matches('[data-duration-range],[data-duration-number]')) { commitEdit(getIframe(), { duration: Number(target.value) }); return; }
  if (target.matches('[data-delay]')) { commitEdit(getIframe(), { delay: Number(target.value) }); return; }
  if (target.matches('[data-easing]')) { commitEdit(getIframe(), { easing: target.value }); return; }
  if (target.matches('[data-preset]')) { const elementId = store.get().selectedElementId; const preset = presets.find(item => item.id === target.value); if (elementId && preset) sendCommand(getIframe(), { type: 'CREATE_ANIMATION', elementId, keyframes: preset.keyframes, duration: preset.duration, easing: preset.easing }); return; }
  if (target.matches('[data-zoom]')) { store.set({ zoom: Number(target.value) }); }
}

function handleInput(event: Event, root: HTMLElement, ui: UiState, getIframe: () => HTMLIFrameElement | null): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches('[data-path-input]')) { ui.pathInput = target.value; return; }
  if (target.matches('[data-duration-range]')) { const number = root.querySelector<HTMLInputElement>('[data-duration-number]'); if (number) number.value = target.value; previewEdit(getIframe(), { duration: Number(target.value) }); }
}

function handleTimelinePointerDown(event: PointerEvent, root: HTMLElement, getIframe: () => HTMLIFrameElement | null): void {
  const canvas = (event.target as Element | null)?.closest<HTMLElement>('[data-timeline]');
  if (!canvas) return;
  canvas.setPointerCapture(event.pointerId);
  scrubTimeline(event, canvas, getIframe());
}

function handleTimelinePointerMove(event: PointerEvent, _root: HTMLElement, getIframe: () => HTMLIFrameElement | null): void {
  const canvas = (event.target as Element | null)?.closest<HTMLElement>('[data-timeline]');
  if (!canvas || !canvas.hasPointerCapture(event.pointerId)) return;
  scrubTimeline(event, canvas, getIframe());
}

function scrubTimeline(event: PointerEvent, canvas: HTMLElement, frame: HTMLIFrameElement | null): void {
  const rect = canvas.getBoundingClientRect();
  const pxPerMs = Number(canvas.dataset.pxPerMs ?? 0.1);
  const duration = Number(canvas.dataset.duration ?? 0);
  const time = Math.max(0, Math.min(duration, (event.clientX - rect.left) / pxPerMs));
  setPlayhead(time, frame);
}

function chooseRulerStep(pxPerMs: number): number {
  const desiredPixels = 90;
  const raw = desiredPixels / pxPerMs;
  const powers = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  return powers.find(value => value >= raw) ?? 10000;
}

function setPlayhead(time: number, frame: HTMLIFrameElement | null): void {
  store.set({ playhead: time });
  const current = selectAnimation(store.get());
  if (current) sendCommand(frame, { type: 'SET_ANIMATION_TIME', id: current.id, time: Math.max(0, time - current.startTime) });
}

function jumpEvent(direction: -1 | 1, frame: HTMLIFrameElement | null): void {
  const state = store.get();
  const events = [...state.events].sort((a, b) => a.at - b.at);
  const event = direction > 0 ? events.find(item => item.at > state.playhead + 0.5) : [...events].reverse().find(item => item.at < state.playhead - 0.5);
  if (event) setPlayhead(event.at, frame);
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

async function pickFolder(ui: UiState): Promise<void> {
  try {
    const response = await fetch('/api/projects/pick-folder', { method: 'POST' });
    if (response.status === 204) return;
    const body = await response.json() as ProjectDescriptor & { error?: string };
    if (!response.ok) return diagnostic(body.error ?? 'Folder selection failed');
    ui.pathInput = body.root;
    await activateProject(body);
  } catch (error) { diagnostic(String(error)); }
}

async function openProject(ui: UiState): Promise<void> {
  if (!ui.pathInput.trim()) return diagnostic('Enter a local project path or choose Open folder…');
  try {
    const response = await fetch('/api/projects/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ui.pathInput }) });
    const body = await response.json() as ProjectDescriptor & { error?: string };
    if (!response.ok) return diagnostic(body.error ?? 'Open failed');
    await activateProject(body);
  } catch (error) { diagnostic(String(error)); }
}

async function activateProject(project: ProjectDescriptor): Promise<void> {
  store.set({ project, analysis: undefined, animations: [], events: [], elements: [], selectedElementId: undefined, selectedAnimationId: undefined, playhead: 0 });
  const analysisResponse = await fetch(`/api/projects/${project.id}/analysis`);
  if (!analysisResponse.ok) return diagnostic('Static analysis failed');
  const analysis = await analysisResponse.json() as StaticAnalysis;
  store.set({ analysis });
  for (const animation of analysis.animations as DetectedAnimation[]) store.addAnimation(animation);
}

async function openFile(file: string, ui: UiState): Promise<void> {
  const project = store.get().project;
  if (!project) return;
  try {
    const response = await fetch(`/api/projects/${project.id}/source?path=${encodeURIComponent(file)}`);
    ui.source = { path: file, text: await response.text() };
    ui.tab = 'source';
    store.touch();
  } catch (error) { diagnostic(String(error)); }
}

async function writeOverrides(): Promise<void> {
  const state = store.get();
  if (!state.project) return;
  try {
    const output = generateOverrideFiles(state.animations.filter(animation => animation.confidence !== 'unknown'));
    const response = await fetch(`/api/projects/${state.project.id}/export-overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(output) });
    const body = await response.json() as { cssPath?: string; error?: string };
    diagnostic(response.ok ? `Overrides written: ${body.cssPath ?? '.animator'}` : body.error ?? 'Export failed');
  } catch (error) { diagnostic(String(error)); }
}

function selectAnimation(state: AnimatorState): DetectedAnimation | undefined {
  return state.animations.find(animation => animation.id === state.selectedAnimationId) ?? state.animations.find(animation => animation.elementId === state.selectedElementId);
}

function diagnostic(message: string): void { store.set({ diagnostics: [...store.get().diagnostics, message] }); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function html(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
function attr(value: string): string { return html(value); }
