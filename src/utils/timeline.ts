import type { DetectedAnimation, TimelineEvent } from '../types/domain';
export function timelineDuration(animations:DetectedAnimation[], events:TimelineEvent[]): number {
  const a = animations.map(x => x.startTime + (x.delay ?? 0) + (x.duration ?? 0));
  const e = events.map(x=>x.at);
  return Math.max(1000, ...a, ...e);
}
export function timeToPercent(time:number, duration:number): number { return Math.max(0, Math.min(100, duration ? time / duration * 100 : 0)); }
