import { timelineTimingDuration,timelineTimingStart } from '../core/timeline';
import type { DetectedAnimation, TimelineEvent } from '../types/domain';
export function timelineDuration(animations:DetectedAnimation[], events:TimelineEvent[]): number {
  let end=1000;
  for(const animation of animations)end=Math.max(end,timelineTimingStart(animation.startTime,animation.delay)+timelineTimingDuration(animation.duration,animation.iterations));
  for(const event of events)end=Math.max(end,event.at);
  return end;
}
export function timeToPercent(time:number, duration:number): number { return Math.max(0, Math.min(100, duration ? time / duration * 100 : 0)); }
