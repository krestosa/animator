import { connectPreview, sendCommand } from '../preview/bridge';
import { store, type AnimatorState } from '../state/store';
import { presets } from '../presets/presets';
import { deleteCustomPreset, loadCustomPresets, saveCustomPreset, type CustomPreset } from '../presets/custom';
import { generateCss, generateOverrideFiles, generateTs, generateUnifiedDiff } from '../exporters/generate';
import { timelineDuration } from '../utils/timeline';
import {
  addKeyframe, bezierPath, buildTransform, deleteKeyframe, duplicateKeyframe,
  filterAnimations, normalizedKeyframes, overview, parseBezier, parseTransform,
  performanceIssues, type MotionFilter, type TransformParts, updateKeyframe
} from '../editor/motion';
import type { DetectedAnimation, ProjectDescriptor, ProjectFile, StaticAnalysis } from '../types/domain';

type Tab = 'motion' | 'source' | 'export';
type Viewport = { width: number; height: number };
type SourceState = { path: string; text: string };
type UiState = {
  pathInput: string;
  viewport: Viewport;
  source?: SourceState;
  tab: Tab;
  playbackRate: number;
  query: string;
  filter: MotionFilter;
  reducedMotion: boolean;
  customPresets: CustomPreset[];
  applyDiff: string;
};
type Signatures = {
  project: string; elements: string; motionList: string; right: string;
  timeline: string; events: string; duration: string; preview: string; diagnostic: string;
};
type FrameGetter = () => HTMLIFrameElement | null;
type KeyframeDrag = {
  animationId: string;
  index: number;
  frames: Array<Record<string, string | number | null>>;
  marker: HTMLElement;
};

const rates = [0.1, 0.25, 0.5, 1, 2, 4];
let keyframeDrag: KeyframeDrag | undefined;

export function mountApp(root: HTMLElement): () => void {
  const ui: UiState = {
    pathInput: localStorage.getItem('animator.last-project') ?? '',
    viewport: { width: 1100, height: 700 },
    tab: 'motion', playbackRate: 1, query: '', filter: 'all', reducedMotion: false,
    customPresets: loadCustomPresets(), applyDiff: ''
  };
  const sig: Signatures = { project: '', elements: '', motionList: '', right: '', timeline: '', events: '', duration: '', preview: '', diagnostic: '' };
  let iframe: HTMLIFrameElement | null = null;
  let bridgeCleanup: (() => void) | undefined;
  let previewKey = '';
  let disposed = false;
  let raf = 0;

  root.innerHTML = shell();
  const getFrame: FrameGetter = () => iframe;

  const render = (): void => {
    raf = 0;
    if (disposed) return;
    const state = store.get();
    updateToolbar(root, state, ui);
    updateProject(root, state, sig);
    updateMotionList(root, state, ui, sig);
    updateElements(root, state, sig);
    updateRight(root, state, ui, sig);
    updateTimeline(root, state, ui, sig);
    updateDiagnostic(root, state, sig);

    const key = state.project ? `${state.project.id}:${state.project.selectedEntry}` : '';
    const signature = `${key}:${ui.viewport.width}x${ui.viewport.height}:${state.analysis?.reducedMotion ?? false}`;
    if (signature === sig.preview) return;
    sig.preview = signature;

    const device = root.querySelector<HTMLElement>('[data-device]');
    const chrome = root.querySelector<HTMLElement>('[data-preview-chrome]');
    if (device) {
      const scale = Math.min(1, 900 / ui.viewport.width, 620 / ui.viewport.height);
      device.style.width = `${ui.viewport.width}px`;
      device.style.height = `${ui.viewport.height}px`;
      device.style.transform = `scale(${scale})`;
    }
    if (chrome) chrome.innerHTML = previewChrome(state.project, state.analysis, ui.reducedMotion);
    if (key === previewKey) return;

    bridgeCleanup?.();
    iframe?.remove();
    iframe = null;
    previewKey = key;
    if (device && state.project) {
      iframe = document.createElement('iframe');
      iframe.dataset.previewFrame = '';
      iframe.title = 'Project preview';
      iframe.src = previewUrl(state.project);
      device.appendChild(iframe);
      bridgeCleanup = connectPreview(iframe);
    }
  };

  const requestRender = (): void => {
    if (!disposed && !raf) raf = requestAnimationFrame(render);
  };

  const click = (event: MouseEvent) => onClick(event, root, ui, getFrame, requestRender);
  const change = (event: Event) => onChange(event, root, ui, getFrame, requestRender);
  const input = (event: Event) => onInput(event, root, ui, getFrame, requestRender);
  const down = (event: PointerEvent) => onPointerDown(event, getFrame);
  const move = (event: PointerEvent) => onPointerMove(event, root, getFrame);
  const up = (event: PointerEvent) => onPointerUp(event, getFrame());

  root.addEventListener('click', click);
  root.addEventListener('change', change);
  root.addEventListener('input', input);
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  const unsubscribe = store.subscribe(requestRender);
  render();

  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    bridgeCleanup?.();
    unsubscribe();
    root.removeEventListener('click', click);
    root.removeEventListener('change', change);
    root.removeEventListener('input', input);
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', up);
    root.replaceChildren();
  };
}

function shell(): string {
  return `<div class="app">
    <header class="toolbar"><b>Animator</b><button data-action="pick-folder">Open folder…</button><input class="path" data-path-input placeholder="Or enter local project path"><button data-action="open-project">Open path</button><span class="sep"></span><button data-action="picker">Pick element</button><button data-action="record">Record</button><span class="sep"></span><button data-action="previous-event">◀|</button><button data-action="restart">↺</button><button data-action="play">▶</button><button data-action="pause">Ⅱ</button><button data-action="next-event">|▶</button><select data-playback-rate>${rates.map(rate => `<option value="${rate}">${rate}x</option>`).join('')}</select><label class="toolbarToggle"><input type="checkbox" data-reduced-motion> Reduced</label><button data-action="clear-overrides">Clear overrides</button><button data-action="undo">Undo</button><button data-action="redo">Redo</button><span class="grow"></span><select data-viewport><option value="390">Mobile</option><option value="768">Tablet</option><option value="1100" selected>Desktop</option></select><span data-viewport-label>1100×700</span></header>
    <main class="workspace"><aside class="leftPanel"><section data-project-region></section><section data-motion-region></section><section class="elementList" data-elements-region></section></aside><section class="previewArea"><div class="previewChrome" data-preview-chrome><span>No preview</span></div><div class="stage"><div class="device" data-device></div></div></section><aside class="rightPanel"><nav>${(['motion', 'source', 'export'] as const).map(tab => `<button data-tab="${tab}" class="${tab === 'motion' ? 'active' : ''}">${capitalize(tab)}</button>`).join('')}</nav><div data-right-region></div></aside></main>
    <section class="timeline"><div class="timelineTop"><b>Timeline</b><span data-playhead-label>0 ms</span><input data-zoom type="range" min="0.5" max="4" step="0.25" value="1"><span class="muted">drag playhead/keyframes</span></div><div class="timelineScroll"><div class="timelineCanvas" data-timeline data-duration="1000" data-px-per-ms="0.1"><div class="ruler" data-ruler></div><div class="tracks" data-tracks></div><div class="eventTrack" data-event-track></div><div class="playhead" data-playhead></div></div></div></section><div class="diagnostics" data-diagnostic hidden></div>
  </div>`;
}

function updateToolbar(root: HTMLElement, state: AnimatorState, ui: UiState): void {
  const picker = root.querySelector<HTMLButtonElement>('[data-action="picker"]');
  const record = root.querySelector<HTMLButtonElement>('[data-action="record"]');
  const path = root.querySelector<HTMLInputElement>('[data-path-input]');
  const rate = root.querySelector<HTMLSelectElement>('[data-playback-rate]');
  const viewport = root.querySelector<HTMLSelectElement>('[data-viewport]');
  const label = root.querySelector<HTMLElement>('[data-viewport-label]');
  const reduced = root.querySelector<HTMLInputElement>('[data-reduced-motion]');
  picker?.classList.toggle('active', state.picker);
  if (record) { record.classList.toggle('active', state.recording); record.textContent = state.recording ? 'Recording' : 'Record'; }
  if (path && document.activeElement !== path) path.value = ui.pathInput;
  if (rate) rate.value = String(ui.playbackRate);
  if (viewport) viewport.value = String(ui.viewport.width);
  if (label) label.textContent = `${ui.viewport.width}×${ui.viewport.height}`;
  if (reduced) reduced.checked = ui.reducedMotion;
}

function updateProject(root: HTMLElement, state: AnimatorState, sig: Signatures): void {
  const signature = state.project ? `${state.project.id}:${state.project.root}:${state.project.tree.length}` : 'none';
  if (signature === sig.project) return;
  sig.project = signature;
  const region = root.querySelector<HTMLElement>('[data-project-region]');
  if (region) region.innerHTML = `<h3>Project</h3>${state.project ? `<div class="projectRoot" title="${attr(state.project.root)}">${html(state.project.root)}</div>${renderTree(state.project.tree)}` : '<p class="muted">Open a local project folder.</p>'}`;
}

function updateMotionList(root: HTMLElement, state: AnimatorState, ui: UiState, sig: Signatures): void {
  const visible = filterAnimations(state.animations, ui.query, ui.filter);
  const counts = overview(state.animations);
  const signature = `${ui.query}|${ui.filter}|${state.selectedAnimationId ?? ''}|${state.animations.map(animation => `${animation.id}:${animation.runtimeState}:${animation.confidence}`).join(',')}`;
  if (signature === sig.motionList) return;
  sig.motionList = signature;
  const region = root.querySelector<HTMLElement>('[data-motion-region]');
  if (!region) return;
  region.innerHTML = `<h3>Motion <small>${counts.total}</small></h3><div class="overview"><button data-filter="css">CSS <b>${counts.cssAnimations}</b></button><button data-filter="transition">Transitions <b>${counts.cssTransitions}</b></button><button data-filter="waapi">WAAPI <b>${counts.waapi}</b></button><button data-filter="all">Other <b>${counts.javascript + counts.unknown}</b></button></div><input class="search" data-motion-search value="${attr(ui.query)}" placeholder="Search animations, source, property"><select data-motion-filter>${(['all', 'running', 'css', 'transition', 'waapi', 'exact', 'inferred'] as MotionFilter[]).map(filter => `<option value="${filter}"${ui.filter === filter ? ' selected' : ''}>${filter}</option>`).join('')}</select><div class="motionRows">${visible.slice(0, 160).map(animation => `<button class="motionRow${state.selectedAnimationId === animation.id ? ' selected' : ''}" data-animation-id="${attr(animation.id)}"><span>${html(animation.name ?? animation.type)}</span><small>${html(animation.type)} · ${html(animation.confidence)}</small></button>`).join('') || '<p class="muted">No matching motion.</p>'}</div>`;
}

function updateElements(root: HTMLElement, state: AnimatorState, sig: Signatures): void {
  const signature = `${state.selectedElementId ?? ''}|${state.elements.map(element => `${element.id}:${element.alive ? 1 : 0}`).join(',')}`;
  if (signature === sig.elements) return;
  sig.elements = signature;
  const region = root.querySelector<HTMLElement>('[data-elements-region]');
  if (region) region.innerHTML = `<h3>Elements <small>${state.elements.length}</small></h3>${state.elements.slice(0, 300).map(element => `<button class="row${state.selectedElementId === element.id ? ' selected' : ''}" data-element-id="${attr(element.id)}"><code>${html(element.tag)}</code>${element.domId ? `#${html(element.domId)}` : ''}${element.classes[0] ? `.${html(element.classes[0])}` : ''}</button>`).join('')}`;
}

function updateRight(root: HTMLElement, state: AnimatorState, ui: UiState, sig: Signatures): void {
  root.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === ui.tab));
  const selected = selectAnimation(state);
  const signature = `${ui.tab}|${state.selectedElementId ?? ''}|${selected ? `${selected.id}:${selected.duration ?? ''}:${selected.delay ?? ''}:${selected.easing ?? ''}:${JSON.stringify(selected.keyframes ?? [])}` : ''}|${ui.source?.path ?? ''}:${ui.source?.text.length ?? 0}|${ui.customPresets.length}|${ui.applyDiff.length}`;
  if (signature === sig.right) return;
  sig.right = signature;
  const region = root.querySelector<HTMLElement>('[data-right-region]');
  if (region) region.innerHTML = ui.tab === 'motion' ? motionPanel(selected, !!state.selectedElementId, ui.customPresets, state.animations) : ui.tab === 'source' ? sourcePanel(ui.source, selected) : exportPanel(selected, ui.applyDiff);
}

function updateTimeline(root: HTMLElement, state: AnimatorState, ui: UiState, sig: Signatures): void {
  const duration = timelineDuration(state.animations, state.events);
  const pxPerMs = Math.max(0.05, state.zoom / 10);
  const canvas = root.querySelector<HTMLElement>('[data-timeline]');
  const ruler = root.querySelector<HTMLElement>('[data-ruler]');
  const tracks = root.querySelector<HTMLElement>('[data-tracks]');
  const events = root.querySelector<HTMLElement>('[data-event-track]');
  const playhead = root.querySelector<HTMLElement>('[data-playhead]');
  const label = root.querySelector<HTMLElement>('[data-playhead-label]');
  if (!canvas || !ruler || !tracks || !events || !playhead) return;

  const durationSignature = `${Math.ceil(duration)}:${state.zoom}`;
  if (durationSignature !== sig.duration) {
    sig.duration = durationSignature;
    canvas.dataset.duration = String(duration);
    canvas.dataset.pxPerMs = String(pxPerMs);
    canvas.style.width = `${Math.max(100, duration * pxPerMs + 100)}px`;
    const step = rulerStep(pxPerMs);
    const marks: string[] = [];
    for (let time = 0; time <= duration + step; time += step) marks.push(`<span style="left:${time * pxPerMs}px">${Math.round(time)}ms</span>`);
    ruler.innerHTML = marks.join('');
  }

  const visible = filterAnimations(state.animations, ui.query, ui.filter);
  const timelineSignature = `${state.selectedAnimationId ?? ''}|${state.zoom}|${visible.map(animation => `${animation.id}:${animation.startTime}:${animation.duration ?? 100}:${JSON.stringify(animation.keyframes?.map(frame => frame.offset) ?? [])}`).join(',')}`;
  if (timelineSignature !== sig.timeline && !keyframeDrag) {
    sig.timeline = timelineSignature;
    tracks.innerHTML = visible.slice(0, 160).map(animation => {
      const left = Math.max(0, animation.startTime * pxPerMs);
      const width = Math.max(4, (animation.duration ?? 100) * pxPerMs);
      const markers = state.selectedAnimationId === animation.id ? normalizedKeyframes(animation).map((frame, index) => `<i class="keyframeMarker" data-kf-marker data-kf-index="${index}" style="left:${clamp01(Number(frame.offset ?? 0)) * width}px"></i>`).join('') : '';
      return `<button class="track${state.selectedAnimationId === animation.id ? ' selected' : ''}" data-animation-id="${attr(animation.id)}"><span class="trackLabel">${html(animation.name ?? animation.type)}</span><span class="clip" style="left:${left}px;width:${width}px">${markers}</span></button>`;
    }).join('');
  }

  const eventSignature = `${state.zoom}|${state.events.map(event => `${event.id}:${event.at}`).join(',')}`;
  if (eventSignature !== sig.events) {
    sig.events = eventSignature;
    events.innerHTML = state.events.slice(-300).map(event => `<i title="${attr(event.label)}" style="left:${Math.max(0, event.at * pxPerMs)}px"></i>`).join('');
  }
  playhead.style.left = `${Math.max(0, state.playhead * pxPerMs)}px`;
  if (label) label.textContent = `${Math.round(state.playhead)} ms`;
}

function updateDiagnostic(root: HTMLElement, state: AnimatorState, sig: Signatures): void {
  const message = state.diagnostics.at(-1) ?? '';
  if (message === sig.diagnostic) return;
  sig.diagnostic = message;
  const region = root.querySelector<HTMLElement>('[data-diagnostic]');
  if (region) { region.hidden = !message; region.textContent = message; }
}

function previewChrome(project: ProjectDescriptor | undefined, analysis: StaticAnalysis | undefined, reduced: boolean): string {
  const pages = project ? `<select data-entry>${project.entries.map(entry => `<option value="${attr(entry)}"${entry === project.selectedEntry ? ' selected' : ''}>${html(entry)}</option>`).join('')}</select>` : '<span>No preview</span>';
  return `${pages}<span>${reduced ? 'Reduced motion emulated' : analysis?.reducedMotion ? 'Project has reduced-motion CSS' : 'Normal motion'}</span>`;
}
function previewUrl(project: ProjectDescriptor): string { return `/preview/${encodeURIComponent(project.id)}/${project.selectedEntry.split('/').map(encodeURIComponent).join('/')}`; }
function renderTree(nodes: ProjectFile[]): string { return `<div class="tree">${nodes.map(node => node.type === 'directory' ? `<details><summary>${html(node.name)}</summary>${node.children ? renderTree(node.children) : ''}</details>` : `<button data-file="${attr(node.path)}">${html(node.name)}</button>`).join('')}</div>`; }

function motionPanel(selected: DetectedAnimation | undefined, hasElement: boolean, custom: CustomPreset[], all: DetectedAnimation[]): string {
  const issues = selected ? performanceIssues([selected]) : [];
  const frames = selected ? normalizedKeyframes(selected) : [];
  const bezier = selected ? parseBezier(selected.easing ?? '') : undefined;
  const last = frames.at(-1);
  const transform = parseTransform(typeof last?.transform === 'string' ? last.transform : undefined);
  const details = selected ? `<div class="badges"><span>${html(selected.type)}</span><span>${html(selected.confidence)}</span><span>${html(selected.runtimeState)}</span></div><div class="controlGrid"><label>Duration<input data-duration-range type="range" min="1" max="10000" step="1" value="${selected.duration ?? 400}"><input data-duration-number type="number" value="${selected.duration ?? 400}"><em>ms</em></label><label>Delay<input data-delay type="number" value="${selected.delay ?? 0}"><em>ms</em></label><label>Easing<input data-easing-text value="${attr(selected.easing ?? 'ease')}"></label><label>Iterations<input data-iterations type="number" min="1" step="1" value="${selected.iterations ?? 1}"></label></div>${easingEditor(bezier)}<h4>Keyframes <button class="tiny" data-action="add-keyframe">+</button><button class="tiny" data-action="add-property">property</button></h4><div class="keyframeEditor">${frames.map((frame, index) => keyframeCard(frame, index, frames.length)).join('')}</div><h4>Transform · last keyframe</h4>${transformEditor(transform)}${issues.length ? `<h4>Performance</h4>${issues.map(issue => `<div class="perf ${issue.severity}">${html(issue.message)}</div>`).join('')}` : ''}` : '';
  const allPresets = [...presets, ...custom];
  return `<div class="inspector"><h3>${html(selected?.name ?? selected?.type ?? 'No animation selected')}</h3>${details}<h4>Create / presets</h4><div class="actions"><button data-action="create-animation" ${hasElement ? '' : 'disabled'}>Create animation</button><select data-preset ${hasElement ? '' : 'disabled'}><option value="">Apply preset…</option>${allPresets.map(preset => `<option value="${attr(preset.id)}">${html(preset.label)}</option>`).join('')}</select></div>${selected ? '<div class="actions"><button data-action="save-preset">Save as preset</button></div>' : ''}${custom.length ? `<div class="customPresets">${custom.map(preset => `<span>${html(preset.label)}<button data-delete-preset="${attr(preset.id)}">×</button></span>`).join('')}</div>` : ''}${hasElement ? '' : '<p class="muted">Pick an element first.</p>'}<h4>Scene diagnostics</h4><p class="muted">${all.length} detected animations. CSS/WAAPI scrub frame by frame; arbitrary JS/rAF is observation-only.</p></div>`;
}
function easingEditor(bezier: [number, number, number, number] | undefined): string { const points = bezier ?? [0.25, 0.1, 0.25, 1]; return `<div class="easingEditor"><svg viewBox="0 0 160 160"><path d="M10 150 L150 10" class="guide"></path><path d="${bezierPath(points)}" class="curve"></path></svg><div>${points.map((value, index) => `<label>P${Math.floor(index / 2) + 1}${index % 2 === 0 ? 'x' : 'y'}<input data-bezier-index="${index}" type="number" step="0.01" value="${value}"></label>`).join('')}</div></div>`; }
function keyframeCard(frame: Record<string, string | number | null>, index: number, count: number): string { const keys = Object.keys(frame).filter(key => !['computedOffset', 'composite', 'offset'].includes(key)); return `<div class="keyframeCard"><header><b>${index + 1}</b><label>offset <input data-kf-index="${index}" data-kf-key="offset" type="number" min="0" max="1" step="0.01" value="${Number(frame.offset ?? index / Math.max(1, count - 1))}"></label><button class="tiny" data-duplicate-kf="${index}">duplicate</button><button class="tiny" data-delete-kf="${index}" ${count <= 2 ? 'disabled' : ''}>delete</button></header>${keys.map(key => `<label><code>${html(key)}</code><input data-kf-index="${index}" data-kf-key="${attr(key)}" value="${attr(String(frame[key] ?? ''))}"></label>`).join('')}</div>`; }
function transformEditor(transform: TransformParts): string { return `<div class="transformGrid">${(['translateX', 'translateY', 'scaleX', 'scaleY', 'rotate', 'skewX', 'skewY'] as const).map(key => `<label>${key}<input data-transform-key="${key}" type="number" step="${key.startsWith('scale') ? '.01' : '1'}" value="${transform[key]}"></label>`).join('')}</div>`; }
function sourcePanel(source: SourceState | undefined, selected: DetectedAnimation | undefined): string { const open = selected?.source ? `<button data-file="${attr(selected.source.file)}">Open ${html(selected.source.file)}:${selected.source.line ?? '?'}</button>` : ''; return `<div class="sourceView">${open}<h3>${html(source?.path ?? 'Source')}</h3><pre>${html(source?.text ?? selected?.source?.snippet ?? 'Select a file or source-correlated animation.')}</pre></div>`; }
function exportPanel(selected: DetectedAnimation | undefined, applyDiff: string): string { const generated = selected ? { css: generateCss(selected), ts: generateTs(selected), diff: generateUnifiedDiff(selected) } : { css: '', ts: '', diff: '' }; const safe = !!selected?.source?.file.endsWith('.css') && !!selected.source.selector && (selected.confidence === 'exact' || selected.confidence === 'source-correlated'); return `<div class="exportView"><h3>Generated change</h3><div class="actions"><button data-copy="css">Copy CSS</button><button data-copy="ts">Copy TS</button><button data-copy="diff">Copy diff</button><button data-action="write-overrides">Write override files</button>${safe ? '<button data-action="preview-apply">Preview apply</button><button data-action="apply-source">Apply to CSS</button>' : ''}</div>${safe ? '<p class="muted">Direct apply creates a .animator-backup.</p>' : ''}<h4>Proposed diff</h4><pre data-generated="diff">${html(applyDiff || generated.diff || 'Select an animation.')}</pre><h4>CSS</h4><pre data-generated="css">${html(generated.css || 'Select an animation.')}</pre><h4>TypeScript</h4><pre data-generated="ts">${html(generated.ts || 'Select an animation.')}</pre></div>`; }

function onClick(event: MouseEvent, root: HTMLElement, ui: UiState, getFrame: FrameGetter, render: () => void): void {
  const target = (event.target as Element | null)?.closest<HTMLElement>('button,[data-tab]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'pick-folder') { void pickFolder(ui); return; }
  if (action === 'open-project') { void openProject(ui); return; }
  if (action === 'picker') { const enabled = !store.get().picker; store.set({ picker: enabled }); sendCommand(getFrame(), { type: 'SET_PICKER', enabled }); return; }
  if (action === 'record') { const enabled = !store.get().recording; store.set({ recording: enabled }); sendCommand(getFrame(), { type: 'SET_RECORDING', enabled }); return; }
  if (action === 'undo') { store.undo(); syncSelectedToPreview(getFrame()); return; }
  if (action === 'redo') { store.redo(); syncSelectedToPreview(getFrame()); return; }
  if (action === 'clear-overrides') { sendCommand(getFrame(), { type: 'CLEAR_OVERRIDES' }); return; }
  if (action === 'previous-event') { jump(-1, getFrame()); return; }
  if (action === 'next-event') { jump(1, getFrame()); return; }
  if (action === 'restart') { store.set({ playhead: 0 }); sendCommand(getFrame(), { type: 'RESTART_ALL' }); return; }
  if (action === 'play') { sendCommand(getFrame(), { type: 'PLAY_ALL' }); return; }
  if (action === 'pause') { sendCommand(getFrame(), { type: 'PAUSE_ALL' }); return; }
  if (action === 'write-overrides') { void writeOverrides(); return; }

  const selected = selectAnimation(store.get());
  if (action === 'create-animation') { const elementId = store.get().selectedElementId; if (elementId) sendCommand(getFrame(), { type: 'CREATE_ANIMATION', elementId, keyframes: [{ offset: 0, opacity: 0, transform: 'translateY(24px)' }, { offset: 1, opacity: 1, transform: 'translateY(0px)' }], duration: 400, easing: 'ease-out', fill: 'both' }); return; }
  if (action === 'add-keyframe' && selected) { commitEdit(getFrame(), { keyframes: addKeyframe(normalizedKeyframes(selected)) }); return; }
  if (action === 'add-property' && selected) { const name = prompt('CSS property to animate')?.trim(); if (name) commitEdit(getFrame(), { keyframes: normalizedKeyframes(selected).map(frame => ({ ...frame, [name]: frame[name] ?? '' })) }); return; }
  if (action === 'save-preset' && selected) { const label = prompt('Preset name', selected.name ?? 'Custom motion'); if (label) { ui.customPresets = saveCustomPreset(label, selected); store.touch(); } return; }
  if (action === 'preview-apply') { void previewApply(ui); return; }
  if (action === 'apply-source') { void applySource(ui); return; }
  if (target.dataset.deletePreset) { ui.customPresets = deleteCustomPreset(target.dataset.deletePreset); store.touch(); return; }
  if (target.dataset.duplicateKf && selected) { commitEdit(getFrame(), { keyframes: duplicateKeyframe(normalizedKeyframes(selected), Number(target.dataset.duplicateKf)) }); return; }
  if (target.dataset.deleteKf && selected) { commitEdit(getFrame(), { keyframes: deleteKeyframe(normalizedKeyframes(selected), Number(target.dataset.deleteKf)) }); return; }
  if (target.dataset.filter) { ui.filter = target.dataset.filter as MotionFilter; render(); return; }
  if (target.dataset.tab) { ui.tab = target.dataset.tab as Tab; render(); return; }
  if (target.dataset.file) { void openFile(target.dataset.file, ui); return; }
  if (target.dataset.elementId) { store.set({ selectedElementId: target.dataset.elementId }); return; }
  if (target.dataset.animationId) { store.set({ selectedAnimationId: target.dataset.animationId }); return; }
  if (target.dataset.copy) { const element = root.querySelector<HTMLElement>(`[data-generated="${target.dataset.copy}"]`); if (element) void navigator.clipboard.writeText(element.textContent ?? ''); }
}

function onChange(event: Event, root: HTMLElement, ui: UiState, getFrame: FrameGetter, render: () => void): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.matches('[data-playback-rate]')) { ui.playbackRate = Number(target.value); sendCommand(getFrame(), { type: 'SET_ALL_PLAYBACK_RATE', rate: ui.playbackRate }); return; }
  if (target instanceof HTMLInputElement && target.matches('[data-reduced-motion]')) { ui.reducedMotion = target.checked; sendCommand(getFrame(), { type: 'SET_REDUCED_MOTION', enabled: ui.reducedMotion }); render(); return; }
  if (target.matches('[data-viewport]')) { const width = Number(target.value); ui.viewport = width === 390 ? { width: 390, height: 844 } : width === 768 ? { width: 768, height: 1024 } : { width: 1100, height: 700 }; render(); return; }
  if (target.matches('[data-entry]')) { const project = store.get().project; if (project) store.set({ project: { ...project, selectedEntry: target.value }, animations: [], events: [], elements: [], playhead: 0 }); return; }
  if (target.matches('[data-motion-filter]')) { ui.filter = target.value as MotionFilter; render(); return; }
  if (target instanceof HTMLInputElement && target.matches('[data-duration-range],[data-duration-number]')) { commitEdit(getFrame(), { duration: Number(target.value) }); return; }
  if (target instanceof HTMLInputElement && target.matches('[data-delay]')) { commitEdit(getFrame(), { delay: Number(target.value) }); return; }
  if (target instanceof HTMLInputElement && target.matches('[data-easing-text]')) { commitEdit(getFrame(), { easing: target.value }); return; }
  if (target instanceof HTMLInputElement && target.matches('[data-iterations]')) { commitEdit(getFrame(), { iterations: Number(target.value) }); return; }
  if (target instanceof HTMLSelectElement && target.matches('[data-preset]')) { const elementId = store.get().selectedElementId; const preset = [...presets, ...ui.customPresets].find(item => item.id === target.value); if (elementId && preset) sendCommand(getFrame(), { type: 'CREATE_ANIMATION', elementId, keyframes: preset.keyframes, duration: preset.duration, easing: preset.easing, fill: 'both' }); target.value = ''; return; }
  if (target instanceof HTMLInputElement && target.matches('[data-zoom]')) { store.set({ zoom: Number(target.value) }); return; }
  if (target instanceof HTMLInputElement && target.dataset.kfIndex !== undefined && target.dataset.kfKey) { editKeyframe(target, getFrame()); return; }
  if (target instanceof HTMLInputElement && target.dataset.transformKey) { editTransform(target, getFrame()); return; }
  if (target instanceof HTMLInputElement && target.dataset.bezierIndex !== undefined) editBezier(root, getFrame());
}

function onInput(event: Event, root: HTMLElement, ui: UiState, getFrame: FrameGetter, render: () => void): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches('[data-path-input]')) { ui.pathInput = target.value; return; }
  if (target.matches('[data-motion-search]')) { ui.query = target.value; render(); return; }
  if (target.matches('[data-duration-range]')) { const number = root.querySelector<HTMLInputElement>('[data-duration-number]'); if (number) number.value = target.value; previewEdit(getFrame(), { duration: Number(target.value) }); }
}

function editKeyframe(target: HTMLInputElement, frame: HTMLIFrameElement | null): void {
  const selected = selectAnimation(store.get());
  if (!selected) return;
  const key = target.dataset.kfKey!;
  const value: string | number = key === 'offset' ? Number(target.value) : target.value;
  commitEdit(frame, { keyframes: updateKeyframe(normalizedKeyframes(selected), Number(target.dataset.kfIndex), key, value) });
}

function editTransform(target: HTMLInputElement, frame: HTMLIFrameElement | null): void {
  const selected = selectAnimation(store.get());
  if (!selected) return;
  const frames = normalizedKeyframes(selected);
  const last = frames.at(-1);
  if (!last) return;
  const transform = parseTransform(typeof last.transform === 'string' ? last.transform : undefined);
  const key = target.dataset.transformKey as keyof TransformParts;
  transform[key] = Number(target.value);
  frames[frames.length - 1] = { ...last, transform: buildTransform(transform) };
  commitEdit(frame, { keyframes: frames });
}

function editBezier(root: HTMLElement, frame: HTMLIFrameElement | null): void {
  const inputs = [...root.querySelectorAll<HTMLInputElement>('[data-bezier-index]')];
  if (inputs.length !== 4) return;
  const points = inputs.map(input => Number(input.value));
  if (points.some(value => !Number.isFinite(value))) return;
  commitEdit(frame, { easing: `cubic-bezier(${points.join(',')})` });
}

function onPointerDown(event: PointerEvent, getFrame: FrameGetter): void {
  const marker = (event.target as Element | null)?.closest<HTMLElement>('[data-kf-marker]');
  if (marker) {
    const selected = selectAnimation(store.get());
    if (!selected || marker.dataset.kfIndex === undefined) return;
    marker.setPointerCapture(event.pointerId);
    keyframeDrag = { animationId: selected.id, index: Number(marker.dataset.kfIndex), frames: normalizedKeyframes(selected), marker };
    event.stopPropagation();
    return;
  }
  const canvas = (event.target as Element | null)?.closest<HTMLElement>('[data-timeline]');
  if (canvas) { canvas.setPointerCapture(event.pointerId); scrub(event, canvas, getFrame()); }
}

function onPointerMove(event: PointerEvent, root: HTMLElement, getFrame: FrameGetter): void {
  if (keyframeDrag) {
    const selected = store.get().animations.find(animation => animation.id === keyframeDrag?.animationId);
    const canvas = root.querySelector<HTMLElement>('[data-timeline]');
    if (!selected || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pxPerMs = Number(canvas.dataset.pxPerMs ?? 0.1);
    const globalTime = (event.clientX - rect.left) / pxPerMs;
    const offset = clamp01((globalTime - selected.startTime) / Math.max(1, selected.duration ?? 1));
    keyframeDrag.frames = updateKeyframe(keyframeDrag.frames, keyframeDrag.index, 'offset', offset);
    keyframeDrag.marker.style.left = `${offset * Math.max(4, (selected.duration ?? 100) * pxPerMs)}px`;
    previewEdit(getFrame(), { keyframes: keyframeDrag.frames });
    return;
  }
  const canvas = (event.target as Element | null)?.closest<HTMLElement>('[data-timeline]');
  if (canvas && canvas.hasPointerCapture(event.pointerId)) scrub(event, canvas, getFrame());
}

function onPointerUp(_event: PointerEvent, frame: HTMLIFrameElement | null): void {
  if (!keyframeDrag) return;
  const drag = keyframeDrag;
  keyframeDrag = undefined;
  store.updateAnimation(drag.animationId, { keyframes: drag.frames });
  previewEdit(frame, { keyframes: drag.frames });
}

function scrub(event: PointerEvent, canvas: HTMLElement, frame: HTMLIFrameElement | null): void {
  const rect = canvas.getBoundingClientRect();
  const pxPerMs = Number(canvas.dataset.pxPerMs ?? 0.1);
  const duration = Number(canvas.dataset.duration ?? 0);
  setPlayhead(Math.max(0, Math.min(duration, (event.clientX - rect.left) / pxPerMs)), frame);
}
function setPlayhead(time: number, frame: HTMLIFrameElement | null): void { store.set({ playhead: time }); sendCommand(frame, { type: 'SCRUB_TIMELINE', time }); }
function jump(direction: -1 | 1, frame: HTMLIFrameElement | null): void { const state = store.get(); const events = [...state.events].sort((a, b) => a.at - b.at); const match = direction > 0 ? events.find(event => event.at > state.playhead + 0.5) : [...events].reverse().find(event => event.at < state.playhead - 0.5); if (match) setPlayhead(match.at, frame); }
function previewEdit(frame: HTMLIFrameElement | null, patch: Partial<DetectedAnimation>): void { const current = selectAnimation(store.get()); if (!current) return; sendCommand(frame, { type: 'APPLY_OVERRIDE', animationId: current.id, duration: patch.duration ?? current.duration, delay: patch.delay ?? current.delay, easing: patch.easing ?? current.easing, keyframes: patch.keyframes ?? current.keyframes }); }
function commitEdit(frame: HTMLIFrameElement | null, patch: Partial<DetectedAnimation>): void { const current = selectAnimation(store.get()); if (!current) return; store.updateAnimation(current.id, patch); previewEdit(frame, patch); }
function syncSelectedToPreview(frame: HTMLIFrameElement | null): void { const current = selectAnimation(store.get()); if (current) previewEdit(frame, { duration: current.duration, delay: current.delay, easing: current.easing, keyframes: current.keyframes }); }

async function pickFolder(ui: UiState): Promise<void> { try { const response = await fetch('/api/projects/pick-folder', { method: 'POST' }); if (response.status === 204) return; const body = await response.json() as ProjectDescriptor & { error?: string }; if (!response.ok) return diagnostic(body.error ?? 'Folder selection failed'); ui.pathInput = body.root; localStorage.setItem('animator.last-project', body.root); await activateProject(body); } catch (error) { diagnostic(String(error)); } }
async function openProject(ui: UiState): Promise<void> { if (!ui.pathInput.trim()) return diagnostic('Enter a local project path or choose Open folder…'); try { const response = await fetch('/api/projects/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ui.pathInput }) }); const body = await response.json() as ProjectDescriptor & { error?: string }; if (!response.ok) return diagnostic(body.error ?? 'Open failed'); localStorage.setItem('animator.last-project', body.root); await activateProject(body); } catch (error) { diagnostic(String(error)); } }
async function activateProject(project: ProjectDescriptor): Promise<void> { store.set({ project, analysis: undefined, animations: [], events: [], elements: [], selectedElementId: undefined, selectedAnimationId: undefined, playhead: 0 }); const response = await fetch(`/api/projects/${project.id}/analysis`); if (!response.ok) return diagnostic('Static analysis failed'); const analysis = await response.json() as StaticAnalysis; store.set({ analysis }); for (const animation of analysis.animations as DetectedAnimation[]) store.addAnimation(animation); }
async function openFile(file: string, ui: UiState): Promise<void> { const project = store.get().project; if (!project) return; try { const response = await fetch(`/api/projects/${project.id}/source?path=${encodeURIComponent(file)}`); ui.source = { path: file, text: await response.text() }; ui.tab = 'source'; store.touch(); } catch (error) { diagnostic(String(error)); } }
async function writeOverrides(): Promise<void> { const state = store.get(); if (!state.project) return; try { const output = generateOverrideFiles(state.animations.filter(animation => animation.confidence !== 'unknown')); const response = await fetch(`/api/projects/${state.project.id}/export-overrides`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(output) }); const body = await response.json() as { cssPath?: string; error?: string }; diagnostic(response.ok ? `Overrides written: ${body.cssPath ?? '.animator'}` : body.error ?? 'Export failed'); } catch (error) { diagnostic(String(error)); } }
async function previewApply(ui: UiState): Promise<void> { const state = store.get(); const selected = selectAnimation(state); if (!state.project || !selected?.source?.file || !selected.source.selector) return; const response = await fetch(`/api/projects/${state.project.id}/preview-css-apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: selected.source.file, selector: selected.source.selector, duration: selected.duration, delay: selected.delay, easing: selected.easing }) }); const body = await response.json() as { before?: string; after?: string; file?: string; error?: string }; if (!response.ok) return diagnostic(body.error ?? 'Could not preview apply'); ui.applyDiff = simpleDiff(body.before ?? '', body.after ?? '', body.file ?? selected.source.file); ui.tab = 'export'; store.touch(); }
async function applySource(ui: UiState): Promise<void> { const state = store.get(); const selected = selectAnimation(state); if (!state.project || !selected?.source?.file || !selected.source.selector) return; await previewApply(ui); if (!confirm(`Apply timing changes to ${selected.source.file}? A backup will be created.`)) return; const response = await fetch(`/api/projects/${state.project.id}/apply-css`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: selected.source.file, selector: selected.source.selector, duration: selected.duration, delay: selected.delay, easing: selected.easing }) }); const body = await response.json() as { file?: string; backup?: string; error?: string }; diagnostic(response.ok ? `Applied to ${body.file}; backup: ${body.backup}` : body.error ?? 'Apply failed'); }
function simpleDiff(before: string, after: string, file: string): string { const previous = before.split('\n'); const next = after.split('\n'); const out = [`--- ${file}`, `+++ ${file}`]; const max = Math.max(previous.length, next.length); for (let index = 0; index < max; index++) { if (previous[index] === next[index]) continue; if (previous[index] !== undefined) out.push(`-${previous[index]}`); if (next[index] !== undefined) out.push(`+${next[index]}`); } return out.join('\n'); }
function selectAnimation(state: AnimatorState): DetectedAnimation | undefined { return state.animations.find(animation => animation.id === state.selectedAnimationId) ?? state.animations.find(animation => animation.elementId === state.selectedElementId); }
function rulerStep(pxPerMs: number): number { return [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(value => value >= 90 / pxPerMs) ?? 10000; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function diagnostic(message: string): void { store.set({ diagnostics: [...store.get().diagnostics, message] }); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function html(value: string): string { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char); }
function attr(value: string): string { return html(value); }
