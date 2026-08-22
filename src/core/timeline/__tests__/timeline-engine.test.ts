import { describe,expect,it } from 'vitest';
import type { MotionTrack } from '../../motion';
import { TimelineEngine,fitTimelineZoom,layoutMotionTrack,snapTimelineTime,timelineTrackDuration,timelineTrackStart,timelineVisibleIndexRange,timelineVisibleRange } from '../timeline-engine';

const track=(id:string,start:number,duration:number,delay=0,iterations=1):MotionTrack=>({id,target:{elementId:`el-${id}`},timing:{start,duration,delay,iterations},properties:[],keyframes:[],trigger:{kind:'unknown'},source:{kind:'waapi',confidence:'runtime-observed'},runtimeState:'running'});

describe('TimelineEngine',()=>{
  it('owns timing, scale and stable duration calculations',()=>{
    const engine=new TimelineEngine(),tracks=[track('a',100,300,50,2),track('b',900,250)];
    const first=engine.measure({tracks,zoom:2,playhead:400});
    expect(timelineTrackStart(tracks[0]!)).toBe(150);
    expect(timelineTrackDuration(tracks[0]!)).toBe(600);
    expect(first.duration).toBe(1250);
    expect(first.pxPerMs).toBe(.2);
    expect(first.playheadPx).toBe(80);
    const second=engine.measure({tracks:[track('a',100,100)],zoom:2,playhead:100});
    expect(second.duration).toBe(1250);
  });

  it('isolates a track without carrying the global stable duration',()=>{
    const engine=new TimelineEngine(),tracks=[track('a',400,240,60,2),track('b',5000,1000)];
    const metrics=engine.measure({tracks,zoom:1,playhead:600,isolatedTrackId:'a'});
    expect(metrics.origin).toBe(460);
    expect(metrics.duration).toBe(480);
    expect(metrics.playheadPx).toBeCloseTo(14);
  });

  it('lays out tracks and computes visible time/index windows',()=>{
    const engine=new TimelineEngine(),item=track('a',1000,500,100),metrics=engine.measure({tracks:[item],zoom:2,playhead:0});
    expect(layoutMotionTrack(item,metrics)).toMatchObject({start:1100,duration:500,left:220,width:100});
    expect(timelineVisibleRange(100,500,180,metrics,0)).toEqual({start:0,end:1750});
    expect(timelineVisibleIndexRange(300,300,30,100,2)).toEqual({start:8,end:22});
  });

  it('centralizes fit zoom and snapping',()=>{
    expect(fitTimelineZoom(1000,1000,200)).toBeCloseTo(7.76);
    const metrics={origin:0,duration:1000,pxPerMs:1,rulerStep:100};
    expect(snapTimelineTime(34,metrics,{frame:true,thresholdPx:8})).toBeCloseTo(1000/30);
    expect(snapTimelineTime(151,metrics,{frame:false,ruler:true,thresholdPx:60})).toBe(200);
  });
});
