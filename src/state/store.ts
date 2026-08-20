import type { DetectedAnimation, ProjectDescriptor, RuntimeElement, StaticAnalysis, TimelineEvent } from '../types/domain';

type HistoryEntry = { id: string; duration?: number; easing?: string };
export type AnimatorState = {
  project?: ProjectDescriptor;
  analysis?: StaticAnalysis;
  elements: RuntimeElement[];
  animations: DetectedAnimation[];
  events: TimelineEvent[];
  selectedElementId?: string;
  selectedAnimationId?: string;
  picker: boolean;
  recording: boolean;
  playhead: number;
  zoom: number;
  diagnostics: string[];
  history: HistoryEntry[];
  future: HistoryEntry[];
};

let state: AnimatorState = {
  elements: [],
  animations: [],
  events: [],
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
    const index = state.animations.findIndex(item => item.id === animation.id);
    state = {
      ...state,
      animations: index >= 0
        ? state.animations.map(item => item.id === animation.id ? correlateSource({ ...item, ...animation }, state.analysis) : item)
        : [...state.animations, correlateSource(animation, state.analysis)]
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

function correlateSource(animation: DetectedAnimation, analysis?: StaticAnalysis): DetectedAnimation {
  if (animation.source || !analysis) return animation;
  const match = analysis.animations.find(candidate => {
    if (animation.name && candidate.name === animation.name) return true;
    return candidate.type === animation.type && candidate.properties.some(property => animation.properties.some(runtimeProperty => runtimeProperty.name === property.name));
  });
  return match?.source ? { ...animation, source: match.source, confidence: animation.confidence === 'runtime-observed' ? 'source-correlated' : animation.confidence } : animation;
}
