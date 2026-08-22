import type { TimelineEvent } from '../types/domain';

export const RECORDING_CHUNK_SIZE=512;
export const MAX_RECORDED_EVENTS=250000;
export const COMPATIBILITY_EVENT_WINDOW=10000;

type RecordingChunk={events:TimelineEvent[];start:number;end:number};
export type RecordingQuery={start?:number;end?:number;kind?:string;elementId?:string;limit?:number};
export type RecordingStats={count:number;chunks:number;kinds:number;elements:number;earliest?:number;latest?:number;version:number};

export class RecordingDataset{
  private chunks:RecordingChunk[]=[];
  private kindIndex=new Map<string,TimelineEvent[]>();
  private elementIndex=new Map<string,TimelineEvent[]>();
  private countValue=0;
  private versionValue=0;
  private compatibilityVersion=-1;
  private compatibilityCache:TimelineEvent[]=[];

  constructor(events:TimelineEvent[]=[]){if(events.length)this.append(events);}

  get count():number{return this.countValue;}
  get version():number{return this.versionValue;}

  append(incoming:TimelineEvent[]):boolean{
    if(!incoming.length)return false;
    for(const event of incoming)this.appendOne(event);
    this.trim();
    this.versionValue++;
    return true;
  }

  replace(events:TimelineEvent[]):void{
    this.chunks=[];this.kindIndex.clear();this.elementIndex.clear();this.countValue=0;
    if(events.length)for(const event of events)this.appendOne(event);
    this.trim();this.versionValue++;this.compatibilityVersion=-1;
  }

  clear():void{if(!this.countValue)return;this.replace([]);}

  snapshot(limit=COMPATIBILITY_EVENT_WINDOW):TimelineEvent[]{
    const bounded=Math.max(0,Math.floor(limit));
    if(bounded===COMPATIBILITY_EVENT_WINDOW&&this.compatibilityVersion===this.versionValue)return this.compatibilityCache;
    if(!bounded)return [];
    const out:TimelineEvent[]=[];
    for(let index=this.chunks.length-1;index>=0&&out.length<bounded;index--){const chunk=this.chunks[index];if(!chunk)continue;const remaining=bounded-out.length;out.unshift(...chunk.events.slice(Math.max(0,chunk.events.length-remaining)));}
    if(bounded===COMPATIBILITY_EVENT_WINDOW){this.compatibilityCache=out;this.compatibilityVersion=this.versionValue;}
    return out;
  }

  query(query:RecordingQuery={}):TimelineEvent[]{
    const start=query.start??Number.NEGATIVE_INFINITY,end=query.end??Number.POSITIVE_INFINITY,limit=Math.max(1,query.limit??5000);
    const indexed=query.kind?this.kindIndex.get(query.kind):query.elementId?this.elementIndex.get(query.elementId):undefined;
    if(indexed){const result:TimelineEvent[]=[];for(const event of indexed){if(event.at<start||event.at>end)continue;if(query.elementId&&event.elementId!==query.elementId)continue;if(query.kind&&event.kind!==query.kind)continue;result.push(event);if(result.length>=limit)break;}return result;}
    const result:TimelineEvent[]=[];
    for(const chunk of this.chunks){if(chunk.end<start||chunk.start>end)continue;for(const event of chunk.events){if(event.at<start||event.at>end)continue;if(query.kind&&event.kind!==query.kind)continue;if(query.elementId&&event.elementId!==query.elementId)continue;result.push(event);if(result.length>=limit)return result;}}
    return result;
  }

  stats():RecordingStats{
    const first=this.chunks[0],last=this.chunks.at(-1);
    return {count:this.countValue,chunks:this.chunks.length,kinds:this.kindIndex.size,elements:this.elementIndex.size,...(first?{earliest:first.start}:{}),...(last?{latest:last.end}:{}),version:this.versionValue};
  }

  private appendOne(event:TimelineEvent):void{
    let chunk=this.chunks.at(-1);
    if(!chunk||chunk.events.length>=RECORDING_CHUNK_SIZE){chunk={events:[],start:event.at,end:event.at};this.chunks.push(chunk);}
    chunk.events.push(event);chunk.start=Math.min(chunk.start,event.at);chunk.end=Math.max(chunk.end,event.at);this.countValue++;
    const byKind=this.kindIndex.get(event.kind);if(byKind)byKind.push(event);else this.kindIndex.set(event.kind,[event]);
    if(event.elementId){const byElement=this.elementIndex.get(event.elementId);if(byElement)byElement.push(event);else this.elementIndex.set(event.elementId,[event]);}
  }

  private trim():void{
    if(this.countValue<=MAX_RECORDED_EVENTS)return;
    while(this.countValue>MAX_RECORDED_EVENTS&&this.chunks.length>1){const removed=this.chunks.shift();if(!removed)break;this.countValue-=removed.events.length;}
    this.rebuildIndexes();
  }

  private rebuildIndexes():void{
    this.kindIndex.clear();this.elementIndex.clear();
    for(const chunk of this.chunks)for(const event of chunk.events){const byKind=this.kindIndex.get(event.kind);if(byKind)byKind.push(event);else this.kindIndex.set(event.kind,[event]);if(event.elementId){const byElement=this.elementIndex.get(event.elementId);if(byElement)byElement.push(event);else this.elementIndex.set(event.elementId,[event]);}}
    this.compatibilityVersion=-1;
  }
}

export type RecordingState={recordingDataset:RecordingDataset;recording:boolean};
export const emptyRecordingState=():RecordingState=>({recordingDataset:new RecordingDataset(),recording:true});
export const replaceRecordedEvents=(state:RecordingState,events:TimelineEvent[]):RecordingState=>{const recordingDataset=new RecordingDataset(events);return{...state,recordingDataset};};
