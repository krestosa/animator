import type { MotionTrack } from '../motion';

export const TIMELINE_MIN_ZOOM=.25;
export const TIMELINE_MAX_ZOOM=24;
export const TIMELINE_FRAME_MS=1000/60;
export const TIMELINE_MIN_PX_PER_MS=.05;
export const TIMELINE_DEFAULT_DURATION=1000;

export type TimelineEventLike={at:number};
export type TimelineMetrics={
  origin:number;
  duration:number;
  measuredDuration:number;
  zoom:number;
  pxPerMs:number;
  canvasWidth:number;
  rulerStep:number;
  gridMajorPx:number;
  gridMinorPx:number;
  playheadPx:number;
};
export type TimelineTrackLayout={start:number;end:number;duration:number;left:number;width:number};
export type TimelineVisibleRange={start:number;end:number};
export type TimelineIndexRange={start:number;end:number};
export type TimelineSnapOptions={frame?:boolean;ruler?:boolean;candidates?:readonly number[];thresholdPx?:number;fps?:number};
export type TimelineMeasureInput={
  tracks:readonly MotionTrack[];
  events?:readonly TimelineEventLike[];
  zoom:number;
  playhead:number;
  origin?:number;
  isolatedTrackId?:string;
  minDuration?:number;
  minCanvasWidth?:number;
  canvasPaddingPx?:number;
};

export class TimelineEngine{
  private stableDuration=TIMELINE_DEFAULT_DURATION;
  private origin=0;

  reset():void{this.stableDuration=TIMELINE_DEFAULT_DURATION;this.origin=0;}

  measure(input:TimelineMeasureInput):TimelineMetrics{
    const minDuration=Math.max(1,input.minDuration??TIMELINE_DEFAULT_DURATION),isolated=input.isolatedTrackId?input.tracks.find(track=>track.id===input.isolatedTrackId):undefined;
    const origin=isolated?timelineTrackStart(isolated):Math.max(0,input.origin??this.origin);
    this.origin=origin;
    const measuredDuration=isolated?Math.max(100,timelineTrackDuration(isolated)):timelineDurationFromTracks(input.tracks,input.events,origin,minDuration);
    const duration=isolated?measuredDuration:(this.stableDuration=Math.max(this.stableDuration,roundTimelineDuration(measuredDuration)));
    const zoom=clampTimelineZoom(input.zoom),pxPerMs=Math.max(TIMELINE_MIN_PX_PER_MS,zoom/10);
    const rulerStep=timelineRulerStep(pxPerMs),gridMajorPx=Math.max(40,rulerStep*pxPerMs),gridMinorPx=Math.max(8,gridMajorPx/5);
    const canvasWidth=Math.max(input.minCanvasWidth??720,Math.ceil(duration*pxPerMs+(input.canvasPaddingPx??180)));
    return{origin,duration,measuredDuration,zoom,pxPerMs,canvasWidth,rulerStep,gridMajorPx,gridMinorPx,playheadPx:timelineTimeToPx(input.playhead,origin,pxPerMs)};
  }
}

export function clampTimelineZoom(value:number):number{return Math.max(TIMELINE_MIN_ZOOM,Math.min(TIMELINE_MAX_ZOOM,Number.isFinite(value)?value:1));}
export function stepTimelineZoom(zoom:number,direction:1|-1):number{return clampTimelineZoom((zoom||1)*(direction>0?1.25:.8));}
export function fitTimelineZoom(duration:number,viewportWidth:number,labelWidth=0,padding=24):number{const available=Math.max(180,viewportWidth-labelWidth-padding),pxPerMs=available/Math.max(1,duration);return clampTimelineZoom(pxPerMs*10);}
export function frameTimelineZoom(pixelsPerFrame=24,fps=60):number{return clampTimelineZoom((pixelsPerFrame/(1000/Math.max(1,fps)))*10);}
export function timelineTimingStart(start:number,delay:number|undefined):number{return Math.max(0,(Number.isFinite(start)?start:0)+Math.max(0,Number(delay)||0));}
export function timelineTimingDuration(duration:number|undefined,iterations:number|undefined):number{const count=Number.isFinite(iterations)&&Number(iterations)>0?Number(iterations):1;return Math.max(1,(duration??100)*count);}
export function timelineTrackStart(track:MotionTrack):number{return timelineTimingStart(track.timing.start,track.timing.delay);}
export function timelineTrackDuration(track:MotionTrack):number{return timelineTimingDuration(track.timing.duration,track.timing.iterations);}
export function timelineTrackEnd(track:MotionTrack):number{return timelineTrackStart(track)+timelineTrackDuration(track);}
export function timelineDurationFromTracks(tracks:readonly MotionTrack[],events:readonly TimelineEventLike[]|undefined,origin=0,minDuration=TIMELINE_DEFAULT_DURATION):number{
  let end=Math.max(1,minDuration);
  for(const track of tracks)end=Math.max(end,timelineTrackEnd(track)-origin);
  if(events)for(const event of events)end=Math.max(end,event.at-origin);
  return Math.max(minDuration,end);
}
export function roundTimelineDuration(duration:number,quantum=250):number{return Math.max(TIMELINE_DEFAULT_DURATION,Math.ceil(Math.max(0,duration)/Math.max(1,quantum))*Math.max(1,quantum));}
export function timelineRulerStep(pxPerMs:number):number{const scale=Math.max(.0001,pxPerMs);return[10,20,50,100,200,500,1000,2000,5000,10000].find(value=>value>=90/scale)??10000;}
export function timelineRulerMarks(duration:number,pxPerMs:number):number[]{const step=timelineRulerStep(pxPerMs),marks:number[]=[];for(let time=0;time<=duration+step;time+=step)marks.push(time);return marks;}
export function timelineTimeToPx(time:number,origin:number,pxPerMs:number):number{return Math.max(0,(time-origin)*Math.max(.0001,pxPerMs));}
export function timelinePxToTime(px:number,origin:number,pxPerMs:number):number{return origin+Math.max(0,px)/Math.max(.0001,pxPerMs);}
export function layoutMotionTrack(track:MotionTrack,metrics:Pick<TimelineMetrics,'origin'|'pxPerMs'>,minimumWidth=5):TimelineTrackLayout{
  const start=timelineTrackStart(track),duration=timelineTrackDuration(track),end=start+duration,left=timelineTimeToPx(start,metrics.origin,metrics.pxPerMs),width=Math.max(minimumWidth,duration*metrics.pxPerMs);
  return{start,end,duration,left,width};
}
export function timelineVisibleRange(scrollLeft:number,viewportWidth:number,labelWidth:number,metrics:Pick<TimelineMetrics,'origin'|'duration'|'pxPerMs'>,overscanPx=120):TimelineVisibleRange{
  const contentLeft=Math.max(0,scrollLeft-labelWidth-overscanPx),contentRight=Math.max(0,scrollLeft+viewportWidth-labelWidth+overscanPx),start=timelinePxToTime(contentLeft,metrics.origin,metrics.pxPerMs),end=timelinePxToTime(contentRight,metrics.origin,metrics.pxPerMs);
  return{start:Math.max(metrics.origin,start),end:Math.min(metrics.origin+metrics.duration,end)};
}
export function timelineVisibleIndexRange(scrollTop:number,viewportHeight:number,rowHeight:number,total:number,overscanRows=4):TimelineIndexRange{
  const height=Math.max(1,rowHeight),start=Math.max(0,Math.floor(scrollTop/height)-overscanRows),end=Math.min(Math.max(0,total),Math.ceil((scrollTop+viewportHeight)/height)+overscanRows);return{start,end};
}
export function timelineTimeFromPointer(clientX:number,rectLeft:number,metrics:Pick<TimelineMetrics,'origin'|'duration'|'pxPerMs'>&Partial<Pick<TimelineMetrics,'rulerStep'>>,snap?:TimelineSnapOptions):number{
  const local=Math.max(0,Math.min(metrics.duration,(clientX-rectLeft)/Math.max(.0001,metrics.pxPerMs))),raw=metrics.origin+local;if(!snap)return raw;return snapTimelineTime(raw,{...metrics,rulerStep:metrics.rulerStep??timelineRulerStep(metrics.pxPerMs)},snap);
}
export function snapTimelineTime(time:number,metrics:Pick<TimelineMetrics,'origin'|'duration'|'pxPerMs'|'rulerStep'>,options:TimelineSnapOptions={}):number{
  const min=metrics.origin,max=metrics.origin+metrics.duration,raw=Math.max(min,Math.min(max,time)),candidates:number[]=[];
  if(options.frame!==false){const frame=1000/Math.max(1,options.fps??60);candidates.push(metrics.origin+Math.round((raw-metrics.origin)/frame)*frame);}
  if(options.ruler){const step=Math.max(.0001,metrics.rulerStep);candidates.push(metrics.origin+Math.round((raw-metrics.origin)/step)*step);}
  if(options.candidates)for(const candidate of options.candidates)if(candidate>=min&&candidate<=max)candidates.push(candidate);
  if(!candidates.length)return raw;
  let best=raw,distance=Infinity;for(const candidate of candidates){const next=Math.abs(candidate-raw);if(next<distance){distance=next;best=candidate;}}
  const thresholdMs=(options.thresholdPx??8)/Math.max(.0001,metrics.pxPerMs);return distance<=thresholdMs?Math.max(min,Math.min(max,best)):raw;
}
