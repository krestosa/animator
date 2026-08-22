import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={animations:[],motionTracks:[],transitions:[],candidates:[],reducedMotion:false};
const CONTROL_OPEN_SYNC_MS=1500;
type ControlSession={id:string;url:string;title:string;width:number;height:number;engine:BrowserEngine;profile:BrowserProfile;external:boolean;recording:boolean;closed:boolean;snapshotReady:boolean;snapshotStatus:string};
type ControlStatus={revision:number;activeSessionId:string|null;activeSession:ControlSession|null};

export function mountControlSync():()=>void{
  let disposed=false,timer=0,lastRevision=-1,busy=false,controlledProjectId='';
  const poll=async():Promise<void>=>{
    if(disposed||busy)return;busy=true;
    try{
      const response=await fetch('/api/control/status',{cache:'no-store'});if(!response.ok)return;const status=await response.json() as ControlStatus;if(!Number.isFinite(status.revision))return;
      const changed=status.revision!==lastRevision;lastRevision=status.revision;const active=status.activeSession,current=store.get().project;
      if(!active){if(controlledProjectId&&current?.browserSessionId===controlledProjectId)store.set({project:undefined,analysis:undefined,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0});controlledProjectId='';return;}
      if(current?.browserSessionId===active.id){controlledProjectId=active.id;return;}
      if(!changed&&current)return;
      controlledProjectId=active.id;const project:ProjectDescriptor={id:active.id,root:active.url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:active.url,kind:'remote',browserSessionId:active.id,browserEngine:active.engine,browserProfile:active.profile,browserWidth:active.width,browserHeight:active.height,browserExternal:active.external};
      store.set({project,recording:active.recording,analysis:emptyAnalysis,motionTracks:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: Control API loaded ${active.engine}/${active.profile} ${active.url}`].slice(-100)});
    }catch{}finally{busy=false;if(!disposed)timer=window.setTimeout(()=>void poll(),CONTROL_OPEN_SYNC_MS);}
  };
  void poll();return()=>{disposed=true;if(timer)clearTimeout(timer);};
}
