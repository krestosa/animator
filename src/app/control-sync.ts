import { store } from '../state/store';
import type { BrowserEngine, BrowserProfile, ProjectDescriptor, StaticAnalysis } from '../types/domain';

const emptyAnalysis:StaticAnalysis={animations:[],transitions:[],candidates:[],reducedMotion:false};
type ControlSession={id:string;url:string;title:string;width:number;height:number;engine:BrowserEngine;profile:BrowserProfile;recording:boolean;closed:boolean;snapshotReady:boolean;snapshotStatus:string};
type ControlStatus={revision:number;activeSessionId:string|null;activeSession:ControlSession|null};

export function mountControlSync():()=>void{
  let disposed=false,timer=0,lastRevision=-1,busy=false;
  const poll=async():Promise<void>=>{
    if(disposed||busy)return;busy=true;
    try{
      const response=await fetch('/api/control/status',{cache:'no-store'});if(!response.ok)return;const status=await response.json() as ControlStatus;if(!Number.isFinite(status.revision))return;
      const changed=status.revision!==lastRevision;lastRevision=status.revision;const active=status.activeSession;if(!active)return;
      const current=store.get().project;
      if(current?.browserSessionId===active.id){if(store.get().recording!==active.recording)store.set({recording:active.recording});return;}
      if(!changed&&current)return;
      const project:ProjectDescriptor={id:active.id,root:active.url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:active.url,kind:'remote',browserSessionId:active.id,browserEngine:active.engine,browserProfile:active.profile};
      store.set({project,recording:active.recording,analysis:emptyAnalysis,animations:[],events:[],elements:[],selectedElementId:undefined,selectedAnimationId:undefined,playhead:0,diagnostics:[...store.get().diagnostics,`info: Control API loaded ${active.engine}/${active.profile} ${active.url}`].slice(-100)});
    }catch{}finally{busy=false;if(!disposed)timer=window.setTimeout(()=>void poll(),150);}
  };
  void poll();return()=>{disposed=true;if(timer)clearTimeout(timer);};
}
