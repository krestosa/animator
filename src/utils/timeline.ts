import type { MotionTrack } from '../core/motion';
import { timelineTimingDuration,timelineTimingStart } from '../core/timeline';
import type { TimelineEvent } from '../types/domain';
export function timelineDuration(tracks:MotionTrack[], events:TimelineEvent[]): number {
  let end=1000;
  for(const track of tracks)end=Math.max(end,timelineTimingStart(track.timing.start,track.timing.delay)+timelineTimingDuration(track.timing.duration,track.timing.iterations));
  for(const event of events)end=Math.max(end,event.at);
  return end;
}
export function timeToPercent(time:number, duration:number): number { return Math.max(0, Math.min(100, duration ? time / duration * 100 : 0)); }
