import type { Browser, BrowserContext, Page } from 'playwright';

export type BrowserEngine='chromium'|'firefox'|'webkit';
export type BrowserProfile='desktop'|'mobile';
export type BrowserRuntimeStatus={engine:BrowserEngine;label:string;installed:boolean};
export type BrowserSnapshotStatus='idle'|'capturing'|'ready'|'error';
export type BrowserSessionState={id:string;url:string;title:string;width:number;height:number;engine:BrowserEngine;profile:BrowserProfile;external:boolean;recording:boolean;closed:boolean;snapshotReady:boolean;snapshotStatus:BrowserSnapshotStatus;snapshotVersion:number;checkpointReady:boolean;snapshotError?:string};
export type BrowserResource={url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number};
export type BrowserEvent=Record<string,unknown>;
export type BrowserCommand=Record<string,unknown>;
export type BrowserSession={id:string;browser:Browser;context:BrowserContext;page:Page;events:BrowserEvent[];resources:Map<string,BrowserResource>;width:number;height:number;destroyed:boolean;browserClosed:boolean;headless:boolean;recording:boolean;snapshotHtml?:string;snapshotStatus:BrowserSnapshotStatus;snapshotVersion:number;snapshotError?:string;snapshotGeneration:number;checkpointTimer?:ReturnType<typeof setTimeout>;checkpointBusy:boolean;sticky:Map<string,BrowserCommand>;navigationVersion:number;engine:BrowserEngine;profile:BrowserProfile;url:string;title:string};
export type SnapshotAnimation={id:string;elementId:string;startTime:number;duration:number;delay:number;iterations:number|string;direction:string;easing:string;fill:string;keyframes:Array<Record<string,unknown>>;currentTime:number|null;playbackRate:number};
export type SnapshotVisual={id:string;tag:string;width:number;height:number;dataUrl?:string};
export type SnapshotPayload={html:string;url:string;scrollX:number;scrollY:number;history:unknown[];animations:SnapshotAnimation[];visuals:SnapshotVisual[]};
export type EmergencyCheckpoint=SnapshotPayload&{capturedAt?:number};
