import type { BrowserCommand, BrowserSession } from './types.js';
import { buildBrowserSnapshot, clearEmergencyCheckpoint, promoteEmergencyCheckpoint } from './snapshot-service.js';

export type RecordingHooks={postToPage:(session:BrowserSession,message:Record<string,unknown>)=>Promise<void>;pushEvent:(session:BrowserSession,event:Record<string,unknown>)=>void;pushDiagnostic:(session:BrowserSession,level:'info'|'warn'|'error',message:string)=>void;requestEmergencyCheckpoint:(session:BrowserSession)=>Promise<void>};

export function setBrowserRecording(session:BrowserSession,message:BrowserCommand,hooks:RecordingHooks):void{
  const enabled=message.enabled===true,requestId=typeof message.requestId==='string'?message.requestId:undefined,reason=typeof message.reason==='string'?message.reason:'command';
  if(enabled&&session.browserClosed)throw new Error('Browser window is closed; open a new browser session to record again');
  session.snapshotGeneration++;clearCheckpoint(session);session.recording=enabled;session.snapshotError=undefined;
  if(enabled){session.snapshotHtml=undefined;clearEmergencyCheckpoint(session.id);session.snapshotStatus='idle';pushRecordingState(session,true,requestId,reason,hooks);void applyRecordingToPage(session,true,hooks,message.requestedAt).catch(error=>hooks.pushDiagnostic(session,'warn',`REC runtime apply failed: ${errorMessage(error)}`));void hooks.requestEmergencyCheckpoint(session);scheduleCheckpoint(session,hooks,350);return;}
  session.snapshotStatus=session.snapshotHtml?'ready':'capturing';pushRecordingState(session,false,requestId,reason,hooks);const generation=session.snapshotGeneration;void finalizeStop(session,generation,hooks);
}

export function markStoppedImmediately(session:BrowserSession,reason:string,hooks:RecordingHooks):void{if(!session.recording)return;session.recording=false;pushRecordingState(session,false,undefined,reason,hooks);}
export function scheduleCheckpoint(session:BrowserSession,hooks:RecordingHooks,delay=5000):void{clearCheckpoint(session);if(session.destroyed||session.browserClosed||!session.recording)return;const generation=session.snapshotGeneration;session.checkpointTimer=setTimeout(()=>{session.checkpointTimer=undefined;void captureCheckpoint(session,generation,hooks);},delay);}
export function clearCheckpoint(session:BrowserSession):void{if(session.checkpointTimer)clearTimeout(session.checkpointTimer);session.checkpointTimer=undefined;}

async function finalizeStop(session:BrowserSession,generation:number,hooks:RecordingHooks):Promise<void>{
  const previous=session.snapshotHtml;
  try{const html=await buildBrowserSnapshot(session,generation,64);if(!html||!captureCurrent(session,generation)||session.recording)return;session.snapshotHtml=html;session.snapshotStatus='ready';session.snapshotVersion++;session.snapshotError=undefined;}
  catch(error){if(!captureCurrent(session,generation)||session.recording)return;if(previous){session.snapshotHtml=previous;session.snapshotStatus='ready';session.snapshotError=undefined;}else if(promoteEmergencyCheckpoint(session)){session.snapshotStatus='ready';session.snapshotError=undefined;}else{session.snapshotStatus='error';session.snapshotError=errorMessage(error);}hooks.pushDiagnostic(session,'warn',`Capture finalization failed: ${errorMessage(error)}`);}
  finally{if(captureCurrent(session,generation)&&!session.recording&&!session.browserClosed)void applyRecordingToPage(session,false,hooks).catch(error=>hooks.pushDiagnostic(session,'warn',`STOP runtime freeze failed: ${errorMessage(error)}`));}
}
async function applyRecordingToPage(session:BrowserSession,enabled:boolean,hooks:RecordingHooks,requestedAt?:unknown):Promise<void>{if(session.browserClosed||session.destroyed)return;if(enabled)await hooks.postToPage(session,{source:'animator-timeline',type:'RELEASE_TIMELINE'});await hooks.postToPage(session,{source:'animator-editor',type:'SET_RECORDING',enabled,requestedAt:Number(requestedAt)||Date.now()});}
async function captureCheckpoint(session:BrowserSession,generation:number,hooks:RecordingHooks):Promise<void>{if(session.checkpointBusy||!captureCurrent(session,generation)||!session.recording)return;session.checkpointBusy=true;try{const html=await buildBrowserSnapshot(session,generation,16);if(html&&captureCurrent(session,generation)&&session.recording){session.snapshotHtml=html;session.snapshotVersion++;}}catch{}finally{session.checkpointBusy=false;if(captureCurrent(session,generation)&&session.recording)scheduleCheckpoint(session,hooks,5000);}}
function pushRecordingState(session:BrowserSession,enabled:boolean,requestId:string|undefined,reason:string,hooks:RecordingHooks):void{hooks.pushEvent(session,{source:'animator-preview',type:'RECORDING_STATE',enabled,...(requestId?{requestId}:{}),reason});}
function captureCurrent(session:BrowserSession,generation:number):boolean{return !session.destroyed&&!session.browserClosed&&session.snapshotGeneration===generation;}
function errorMessage(error:unknown):string{return error instanceof Error?error.message:String(error);}
