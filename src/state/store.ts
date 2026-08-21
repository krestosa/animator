import type { DetectedAnimation, ProjectDescriptor, RuntimeElement, StaticAnalysis, TimelineEvent } from '../types/domain';

type HistoryEntry = { id: string; duration: number | undefined; easing: string | undefined };
export type AnimatorState = {
  project: ProjectDescriptor | undefined;
  analysis: StaticAnalysis | undefined;
  elements: RuntimeElement[];
  animations: DetectedAnimation[];
  events: TimelineEvent[];
  selectedElementId: string | undefined;
  selectedAnimationId: string | undefined;
  picker: boolean;
  recording: boolean;
  playhead: number;
  zoom: number;
  diagnostics: string[];
  history: HistoryEntry[];
  future: HistoryEntry[];
};

let state: AnimatorState = {
  project: undefined,
  analysis: undefined,
  elements: [],
  animations: [],
  events: [],
  selectedElementId: undefined,
  selectedAnimationId: undefined,
  picker: false,
  recording: true,
  playhead: 0,
  zoom: 1,
  diagnostics: [],
  history: [],
  future: []
};

const listeners = new Set<() => void>();
const emit = (): void => { for (const listener of listeners) listener(); };

export const store = {
  get: (): AnimatorState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  touch(): void { emit(); },
  set(patch: Partial<AnimatorState>): void {
    state = { ...state, ...patch };
    emit();
  },
  updateAnimation(id: string, patch: Partial<DetectedAnimation>, record = true): void {
    const current = state.animations.find(animation => animation.id === id);
    if (!current) return;
    const history = record ? [...state.history, { id, duration: current.duration, easing: current.easing }] : state.history;
    state = {
      ...state,
      history,
      future: record ? [] : state.future,
      animations: state.animations.map(animation => animation.id === id ? { ...animation, ...patch } : animation)
    };
    emit();
  },
  addAnimation(animation: DetectedAnimation): void {
    const normalized = correlateSource(animation, state.analysis);
    const index = state.animations.findIndex(item => item.id === normalized.id);
    state = {
      ...state,
      selectedAnimationId: state.selectedAnimationId ?? normalized.id,
      animations: index >= 0
        ? state.animations.map(item => item.id === normalized.id ? correlateSource({ ...item, ...normalized }, state.analysis) : item)
        : [...state.animations, normalized]
    };
    emit();
  },
  addEvent(event: TimelineEvent): void {
    state = { ...state, events: [...state.events, event].slice(-1000) };
    emit();
  },
  upsertElements(elements: RuntimeElement[]): void {
    const map = new Map(state.elements.map(element => [element.id, element]));
    for (const element of elements) map.set(element.id, element);
    state = { ...state, elements: [...map.values()] };
    emit();
  },
  undo(): void {
    const command = state.history.at(-1);
    if (!command) return;
    const current = state.animations.find(animation => animation.id === command.id);
    if (!current) return;
    state = {
      ...state,
      history: state.history.slice(0, -1),
      future: [...state.future, { id: command.id, duration: current.duration, easing: current.easing }],
      animations: state.animations.map(animation => animation.id === command.id ? { ...animation, duration: command.duration, easing: command.easing } : animation)
    };
    emit();
  },
  redo(): void {
    const command = state.future.at(-1);
    if (!command) return;
    const current = state.animations.find(animation => animation.id === command.id);
    if (!current) return;
    state = {
      ...state,
      future: state.future.slice(0, -1),
      history: [...state.history, { id: command.id, duration: current.duration, easing: current.easing }],
      animations: state.animations.map(animation => animation.id === command.id ? { ...animation, duration: command.duration, easing: command.easing } : animation)
    };
    emit();
  }
};

function correlateSource(animation: DetectedAnimation, analysis: StaticAnalysis | undefined): DetectedAnimation {
  if (animation.source || !analysis) return animation;
  const match = analysis.animations.find(candidate => {
    if (animation.name && candidate.name === animation.name) return true;
    return candidate.type === animation.type && candidate.properties.some(property => animation.properties.some(runtimeProperty => runtimeProperty.name === property.name));
  });
  if (!match?.source) return animation;
  return { ...animation, source: match.source, confidence: animation.confidence === 'runtime-observed' ? 'source-correlated' : animation.confidence };
}
