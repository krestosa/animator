import {cloneMotionKeyframes,type MotionKeyframe,type MotionPropertyTrack,type MotionTiming,type MotionTrack,type MotionTrigger} from '../core/motion';

export type MotionCommand=
  |{kind:'change-timing';trackId:string;before:MotionTiming;after:MotionTiming}
  |{kind:'replace-keyframes';trackId:string;before:MotionKeyframe[];after:MotionKeyframe[]}
  |{kind:'replace-properties';trackId:string;before:MotionPropertyTrack[];after:MotionPropertyTrack[]}
  |{kind:'change-trigger';trackId:string;before:MotionTrigger;after:MotionTrigger}
  |{kind:'rename-track';trackId:string;before:string|undefined;after:string|undefined}
  |{kind:'compound';trackId:string;commands:MotionCommand[]};
export type HistoryEntry=MotionCommand;
export type HistoryState={history:HistoryEntry[];future:HistoryEntry[]};

export const emptyHistory=():HistoryState=>({history:[],future:[]});
export function commandForTrackChange(before:MotionTrack,after:MotionTrack):MotionCommand|undefined{
  const commands:MotionCommand[]=[];
  if(!sameTiming(before.timing,after.timing))commands.push({kind:'change-timing',trackId:before.id,before:{...before.timing},after:{...after.timing}});
  if(JSON.stringify(before.keyframes)!==JSON.stringify(after.keyframes))commands.push({kind:'replace-keyframes',trackId:before.id,before:cloneMotionKeyframes(before.keyframes),after:cloneMotionKeyframes(after.keyframes)});
  if(JSON.stringify(before.properties)!==JSON.stringify(after.properties))commands.push({kind:'replace-properties',trackId:before.id,before:cloneProperties(before.properties),after:cloneProperties(after.properties)});
  if(JSON.stringify(before.trigger)!==JSON.stringify(after.trigger))commands.push({kind:'change-trigger',trackId:before.id,before:cloneTrigger(before.trigger),after:cloneTrigger(after.trigger)});
  if(before.name!==after.name)commands.push({kind:'rename-track',trackId:before.id,before:before.name,after:after.name});
  if(!commands.length)return undefined;return commands.length===1?commands[0]:{kind:'compound',trackId:before.id,commands};
}
export function applyMotionCommand(track:MotionTrack,command:MotionCommand,direction:'forward'|'reverse'):MotionTrack{
  if(track.id!==command.trackId)return track;
  if(command.kind==='compound')return command.commands.reduce((next,child)=>applyMotionCommand(next,child,direction),track);
  switch(command.kind){
    case 'change-timing':{const value=direction==='forward'?command.after:command.before;return{...track,timing:{...value}};}
    case 'replace-keyframes':{const value=direction==='forward'?command.after:command.before;return{...track,keyframes:cloneMotionKeyframes(value)};}
    case 'replace-properties':{const value=direction==='forward'?command.after:command.before;return{...track,properties:cloneProperties(value)};}
    case 'change-trigger':{const value=direction==='forward'?command.after:command.before;return{...track,trigger:cloneTrigger(value)};}
    case 'rename-track':{const value=direction==='forward'?command.after:command.before;return value===undefined?omitName(track):{...track,name:value};}
  }
}
export const recordHistory=(state:HistoryState,entry:HistoryEntry):HistoryState=>({history:[...state.history,entry].slice(-500),future:[]});
export const undoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.history.at(-1);return entry?{entry,state:{history:state.history.slice(0,-1),future:[...state.future,entry]}}:{state};};
export const redoHistory=(state:HistoryState):{entry?:HistoryEntry;state:HistoryState}=>{const entry=state.future.at(-1);return entry?{entry,state:{history:[...state.history,entry],future:state.future.slice(0,-1)}}:{state};};
function sameTiming(a:MotionTiming,b:MotionTiming):boolean{return a.start===b.start&&a.duration===b.duration&&a.delay===b.delay&&a.iterations===b.iterations&&a.direction===b.direction&&a.easing===b.easing&&a.fill===b.fill;}
function cloneProperties(properties:MotionPropertyTrack[]):MotionPropertyTrack[]{return properties.map(property=>({...property,...(property.values?{values:[...property.values]}:{})}));}
function cloneTrigger(trigger:MotionTrigger):MotionTrigger{return{...trigger,...(trigger.range?{range:{...trigger.range}}:{})};}
function omitName(track:MotionTrack):MotionTrack{const{name:_,...rest}=track;return rest;}
