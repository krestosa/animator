type BrowserSessionApi=typeof import('../browser-session.js');
let browserApiPromise:Promise<BrowserSessionApi>|undefined;
const browserApi=():Promise<BrowserSessionApi>=>browserApiPromise??=import('../browser-session.js');

export class BrowserControlService {
  private activeBrowserSessionId='';
  private controlRevision=0;

  get revision():number{return this.controlRevision;}

  async status(){
    if(!this.activeBrowserSessionId&&!browserApiPromise)return{revision:this.controlRevision,activeSessionId:null,activeSession:null,sessions:[]};
    const {listBrowserSessionStates}=await browserApi(),sessions=listBrowserSessionStates();
    const active=sessions.find(session=>session.id===this.activeBrowserSessionId)??null;
    if(this.activeBrowserSessionId&&!active)this.activeBrowserSessionId='';
    return{revision:this.controlRevision,activeSessionId:this.activeBrowserSessionId||null,activeSession:active,sessions};
  }

  async open(body:Record<string,unknown>){
    const {openBrowserSession}=await browserApi();
    const profile=body.profile==='mobile'?'mobile':'desktop';
    const session=await openBrowserSession(String(body.url||''),{
      width:Number(body.width)||(profile==='mobile'?390:1100),
      height:Number(body.height)||(profile==='mobile'?844:700),
      engine:body.engine,
      profile
    });
    this.bump(session.id);
    return session;
  }

  project(session:{id:string;url:string;engine:string;profile:string}){
    return{id:session.id,root:session.url,entries:['/'],selectedEntry:'/',tree:[],sourceUrl:session.url,kind:'remote' as const,browserSessionId:session.id,browserEngine:session.engine,browserProfile:session.profile};
  }

  async record(sessionValue:unknown,enabled:boolean,reason='control'){
    const api=await browserApi(),id=await this.resolve(sessionValue,api);if(!id)throw new Error('No active browser session');
    await api.sendBrowserCommand(id,{type:'SET_RECORDING',enabled,requestId:this.requestId(),reason});
    this.bump(id);
    return api.browserState(id);
  }

  async stop(sessionValue:unknown,hard:boolean){
    const api=await browserApi(),id=await this.resolve(sessionValue,api);if(!id)throw new Error('No active browser session');
    if(hard)await api.hardStopBrowserSession(id,'control-hard-stop');
    else await api.sendBrowserCommand(id,{type:'SET_RECORDING',enabled:false,requestId:this.requestId(),reason:'control-stop'});
    this.bump(id);
    return api.browserState(id);
  }

  async start(sessionValue:unknown){return this.record(sessionValue,true,'control-start');}

  async closeWindow(sessionValue:unknown){
    const api=await browserApi(),id=await this.resolve(sessionValue,api);if(!id)throw new Error('No active browser session');
    await api.closeBrowserWindow(id,'control-close');
    this.bump(id);
    return api.browserState(id);
  }

  async closeSession(id:string):Promise<void>{
    const {closeBrowserSession}=await browserApi();
    await closeBrowserSession(id);
    if(this.activeBrowserSessionId===id)this.bump('');
  }

  private async resolve(value:unknown,api?:BrowserSessionApi):Promise<string>{
    const requested=String(value||'').trim();if(requested)return requested;
    if(this.activeBrowserSessionId)return this.activeBrowserSessionId;
    const runtime=api??await browserApi(),sessions=runtime.listBrowserSessionStates();
    return sessions.find(session=>session.recording)?.id??sessions.at(-1)?.id??'';
  }

  private bump(sessionId?:string):number{if(sessionId!==undefined)this.activeBrowserSessionId=sessionId;return++this.controlRevision;}
  private requestId():string{return`control-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
}
