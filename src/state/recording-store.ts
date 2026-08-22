import type { TimelineEvent } from '../types/domain';

export const MAX_RECORDED_EVENTS=10000;
export type RecordingState={events:TimelineEvent[];recording:boolean};
export const emptyRecordingState=():RecordingState=>({events:[],recording:true});
export const appendRecordedEvents=(current:TimelineEvent[],incoming:TimelineEvent[]):TimelineEvent[]=>incoming.length?[...current,...incoming].slice(-MAX_RECORDED_EVENTS):current;
