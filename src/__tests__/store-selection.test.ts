import { beforeEach,describe,expect,it } from 'vitest';
import { store } from '../state/store';
import type { MotionTrack } from '../types/motion';
import type { ProjectDescriptor } from '../types/domain';

const track=(id:string,elementId:string,name='fade'):MotionTrack=>({id,name,target:{elementId},timing:{start:100,duration:300},properties:[{name:'opacity'}],keyframes:[],trigger:{kind:'unknown'},source:{kind:'waapi',confidence:'runtime-observed'},runtimeState:'running'});
const project=(id:string,selectedEntry='/index.html'):ProjectDescriptor=>({id,root:`/${id}`,entries:[selectedEntry],selectedEntry,tree:[]});

beforeEach(()=>store.set({project:undefined,analysis:undefined,elements:[],motionTracks:[],events:[],selectedElementId:undefined,selectedAnimationId:undefined,picker:false,recording:true,playhead:0,zoom:1,diagnostics:[],history:[],future:[]}));

describe('motion selection invariants',()=>{
  it('does not hijack an existing selection when new motion is detected',()=>{
    store.addMotionTrack(track('first','el-a'));
    store.set({selectedAnimationId:'first',selectedElementId:'el-a'});
    store.addMotionTrack(track('late','el-a','scroll-fade'));
    expect(store.get().selectedAnimationId).toBe('first');
    expect(store.get().selectedElementId).toBe('el-a');
  });

  it('selects a deliberately created animation even while passive discovery does not',()=>{
    store.addMotionTrack(track('first','el-a'));
    store.addMotionTrack(track('created','el-a','Created animation'));
    expect(store.get().selectedAnimationId).toBe('created');
  });

  it('clears undo and redo history when the project context changes',()=>{
    store.set({project:project('one')});
    store.addMotionTrack(track('shared','el-a'));
    store.updateMotionTrack('shared',{timing:{duration:600}});
    store.undo();
    expect(store.get().future).toHaveLength(1);
    store.set({project:project('two'),motionTracks:[track('shared','el-b')]});
    expect(store.get().history).toHaveLength(0);
    expect(store.get().future).toHaveLength(0);
    store.redo();
    expect(store.get().motionTracks[0]?.timing.duration).toBe(300);
  });

  it('clears edit history when switching entries inside the same project',()=>{
    store.set({project:project('one','/index.html')});
    store.addMotionTrack(track('shared','el-a'));
    store.updateMotionTrack('shared',{timing:{duration:600}});
    expect(store.get().history).toHaveLength(1);
    store.set({project:{...project('one','/index.html'),selectedEntry:'/details.html'}});
    expect(store.get().history).toHaveLength(0);
  });

  it('clears stale element and motion selection when the project context changes',()=>{
    store.set({project:project('one','/index.html')});
    store.addMotionTrack(track('shared','el-a'));
    store.set({selectedAnimationId:'shared',selectedElementId:'el-a'});
    store.set({project:{...project('one','/index.html'),selectedEntry:'/details.html'},motionTracks:[],elements:[]});
    expect(store.get().selectedAnimationId).toBeUndefined();
    expect(store.get().selectedElementId).toBeUndefined();
  });

  it('does not record no-op edits or discard a valid redo',()=>{
    store.addMotionTrack(track('shared','el-a'));
    store.updateMotionTrack('shared',{timing:{duration:600}});
    store.undo();
    expect(store.get().future).toHaveLength(1);
    store.updateMotionTrack('shared',{timing:{duration:300}});
    expect(store.get().history).toHaveLength(0);
    expect(store.get().future).toHaveLength(1);
    store.redo();
    expect(store.get().motionTracks[0]?.timing.duration).toBe(600);
  });
});