import { beforeEach,describe,expect,it } from 'vitest';
import { store } from '../state/store';
import type { DetectedAnimation, ProjectDescriptor } from '../types/domain';

const motion=(id:string,elementId:string,name='fade'):DetectedAnimation=>({id,elementId,type:'web-animation',name,startTime:100,duration:300,properties:[{name:'opacity'}],confidence:'runtime-observed',runtimeState:'running'});
const project=(id:string,selectedEntry='/index.html'):ProjectDescriptor=>({id,root:`/${id}`,entries:[selectedEntry],selectedEntry,tree:[]});

beforeEach(()=>store.set({project:undefined,analysis:undefined,elements:[],animations:[],events:[],selectedElementId:undefined,selectedAnimationId:undefined,picker:false,recording:true,playhead:0,zoom:1,diagnostics:[],history:[],future:[]}));

describe('motion selection invariants',()=>{
  it('does not hijack an existing selection when new motion is detected',()=>{
    store.addAnimation(motion('first','el-a'));
    store.set({selectedAnimationId:'first',selectedElementId:'el-a'});
    store.addAnimation(motion('late','el-a','scroll-fade'));
    expect(store.get().selectedAnimationId).toBe('first');
    expect(store.get().selectedElementId).toBe('el-a');
  });

  it('selects a deliberately created animation even while passive discovery does not',()=>{
    store.addAnimation(motion('first','el-a'));
    store.addAnimation(motion('created','el-a','Created animation'));
    expect(store.get().selectedAnimationId).toBe('created');
  });

  it('clears undo and redo history when the project context changes',()=>{
    store.set({project:project('one')});
    store.addAnimation(motion('shared','el-a'));
    store.updateAnimation('shared',{duration:600});
    store.undo();
    expect(store.get().future).toHaveLength(1);
    store.set({project:project('two'),animations:[motion('shared','el-b')]});
    expect(store.get().history).toHaveLength(0);
    expect(store.get().future).toHaveLength(0);
    store.redo();
    expect(store.get().animations[0]?.duration).toBe(300);
  });

  it('clears edit history when switching entries inside the same project',()=>{
    store.set({project:project('one','/index.html')});
    store.addAnimation(motion('shared','el-a'));
    store.updateAnimation('shared',{duration:600});
    expect(store.get().history).toHaveLength(1);
    store.set({project:{...project('one','/index.html'),selectedEntry:'/details.html'}});
    expect(store.get().history).toHaveLength(0);
  });
});