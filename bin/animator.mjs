#!/usr/bin/env node

const args=process.argv.slice(2),jsonOutput=takeFlag('--json'),server=normalizeServer(takeOption('--server')??process.env.ANIMATOR_SERVER??process.env.ANIMATOR_URL??'http://127.0.0.1:5173');
const command=(args.shift()??'help').toLowerCase();

try{
  if(command==='help'||command==='--help'||command==='-h'){printHelp();process.exit(0);}
  if(command==='status'||command==='sessions'){output(await request('GET','/api/control/status'));process.exit(0);}
  if(command==='open'){
    const url=args.shift();if(!url)throw new Error('Usage: animator open <url> [--engine chromium|firefox|webkit] [--profile desktop|mobile]');
    const engine=takeOption('--engine')??'chromium',profile=takeFlag('--mobile')?'mobile':takeFlag('--desktop')?'desktop':takeOption('--profile')??'desktop',width=numberOption('--width'),height=numberOption('--height');
    const result=await request('POST','/api/control/open',{url,engine,profile,...(width?{width}:{}),...(height?{height}:{})});output(result);process.exit(0);
  }
  if(command==='stop'||command==='kill'){
    const hard=command==='kill'||takeFlag('--hard'),sessionId=takeOption('--session');output(await request('POST','/api/control/stop',{hard,...(sessionId?{sessionId}:{})}));process.exit(0);
  }
  if(command==='start'){
    const sessionId=takeOption('--session');output(await request('POST','/api/control/start',{...(sessionId?{sessionId}:{})}));process.exit(0);
  }
  if(command==='record'){
    const action=(args.shift()??'').toLowerCase(),sessionId=takeOption('--session');if(action==='stop'){const hard=takeFlag('--hard');output(await request('POST','/api/control/stop',{hard,...(sessionId?{sessionId}:{})}));process.exit(0);}if(action==='start'){output(await request('POST','/api/control/start',{...(sessionId?{sessionId}:{})}));process.exit(0);}throw new Error('Usage: animator record <start|stop> [--session id] [--hard]');
  }
  if(command==='close'){
    const sessionId=takeOption('--session');output(await request('POST','/api/control/close',{...(sessionId?{sessionId}:{})}));process.exit(0);
  }
  if(command==='browsers'){
    const action=(args.shift()??'list').toLowerCase();if(action==='list'){output(await request('GET','/api/browser-runtimes'));process.exit(0);}if(action==='install'){const engines=args.filter(value=>!value.startsWith('--'));output(await request('POST','/api/control/browsers/install',{engines:engines.length?engines:['chromium','firefox','webkit']}));process.exit(0);}throw new Error('Usage: animator browsers <list|install> [chromium firefox webkit]');
  }
  throw new Error(`Unknown command: ${command}`);
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exit(1);}

function takeFlag(name){const index=args.indexOf(name);if(index<0)return false;args.splice(index,1);return true;}
function takeOption(name){const index=args.indexOf(name);if(index<0)return undefined;const value=args[index+1];if(value==null||value.startsWith('--'))throw new Error(`Missing value for ${name}`);args.splice(index,2);return value;}
function numberOption(name){const raw=takeOption(name);if(raw==null)return undefined;const value=Number(raw);if(!Number.isFinite(value)||value<=0)throw new Error(`Invalid ${name}: ${raw}`);return Math.round(value);}
function normalizeServer(value){return String(value).replace(/\/+$/,'');}
async function request(method,path,body){
  let response;try{response=await fetch(server+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch(error){throw new Error(`Animator server is not reachable at ${server}: ${error instanceof Error?error.message:String(error)}`);}
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}if(!response.ok)throw new Error(data.error??data.message??`Animator API returned ${response.status}`);return data;
}
function output(value){if(jsonOutput){console.log(JSON.stringify(value,null,2));return;}if(value?.project){const project=value.project;console.log(`Opened ${project.sourceUrl??project.root}`);console.log(`Session: ${project.browserSessionId}`);console.log(`Engine: ${project.browserEngine} / ${project.browserProfile}`);return;}if(value?.state){const state=value.state;console.log(`${state.recording?'REC':'STOP'} ${state.id}`);console.log(`${state.engine}/${state.profile} ${state.url}`);console.log(`Snapshot: ${state.snapshotStatus}${state.closed?' · browser closed':''}`);return;}if(Array.isArray(value?.sessions)){console.log(`Active: ${value.activeSessionId??'none'}`);for(const session of value.sessions)console.log(`${session.id}  ${session.recording?'REC':'STOP'}  ${session.engine}/${session.profile}  ${session.closed?'closed':'open'}  ${session.snapshotStatus}  ${session.url}`);return;}if(Array.isArray(value?.runtimes)){for(const runtime of value.runtimes)console.log(`${runtime.label}: ${runtime.installed?'installed':'not installed'}`);return;}console.log(JSON.stringify(value,null,2));}
function printHelp(){console.log(`Animator control CLI

Usage:
  animator status
  animator open <url> [--engine chromium|firefox|webkit] [--profile desktop|mobile]
  animator start [--session id]
  animator stop [--session id] [--hard]
  animator kill [--session id]
  animator record <start|stop> [--session id] [--hard]
  animator close [--session id]
  animator browsers list
  animator browsers install [chromium firefox webkit]

Options:
  --server <url>   Animator server (default http://127.0.0.1:5173)
  --json           Print machine-readable JSON

Examples:
  animator open https://deushima.com.ar --engine chromium --profile desktop
  animator stop
  animator stop --hard
  animator browsers install firefox webkit`);}
