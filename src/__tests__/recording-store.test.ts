import { describe,expect,it } from 'vitest';
import { COMPATIBILITY_EVENT_WINDOW,RecordingDataset,RECORDING_CHUNK_SIZE } from '../state/recording-store';
import type { TimelineEvent } from '../types/domain';

const event=(index:number,kind=index%2?'pointer':'scroll',elementId=index%3?'el-a':'el-b'):TimelineEvent=>({id:`e-${index}`,at:index*10,kind,elementId,label:`event ${index}`});

describe('RecordingDataset',()=>{
  it('stores large recordings in chunks while exposing only a bounded compatibility window',()=>{
    const dataset=new RecordingDataset();
    dataset.append(Array.from({length:25000},(_,index)=>event(index)));
    expect(dataset.count).toBe(25000);
    expect(dataset.stats().chunks).toBeGreaterThanOrEqual(Math.ceil(25000/RECORDING_CHUNK_SIZE));
    const view=dataset.snapshot();
    expect(view).toHaveLength(COMPATIBILITY_EVENT_WINDOW);
    expect(view[0]?.id).toBe('e-15000');
    expect(view.at(-1)?.id).toBe('e-24999');
    expect(dataset.snapshot()).toBe(view);
  });

  it('queries indexed event kinds and elements without materializing the whole recording',()=>{
    const dataset=new RecordingDataset(Array.from({length:5000},(_,index)=>event(index)));
    const pointer=dataset.query({kind:'pointer',start:10000,end:11000});
    expect(pointer.length).toBeGreaterThan(0);
    expect(pointer.every(item=>item.kind==='pointer'&&item.at>=10000&&item.at<=11000)).toBe(true);
    const element=dataset.query({elementId:'el-b',start:20000,end:20500});
    expect(element.every(item=>item.elementId==='el-b'&&item.at>=20000&&item.at<=20500)).toBe(true);
  });

  it('invalidates cached compatibility views only when data changes',()=>{
    const dataset=new RecordingDataset([event(1)]);
    const first=dataset.snapshot();
    expect(dataset.snapshot()).toBe(first);
    dataset.append([]);
    expect(dataset.snapshot()).toBe(first);
    dataset.append([event(2)]);
    expect(dataset.snapshot()).not.toBe(first);
    expect(dataset.snapshot().map(item=>item.id)).toEqual(['e-1','e-2']);
  });
});
