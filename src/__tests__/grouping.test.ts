import { describe, expect, it } from 'vitest';
import { animationGroupKey, groupAnimations } from '../editor/grouping';
import type { DetectedAnimation } from '../types/domain';

const base=(patch:Partial<DetectedAnimation>):DetectedAnimation=>({
  id:'a',elementId:'el-1',type:'css-animation',name:'fade-up',startTime:0,duration:400,easing:'ease-out',properties:[{name:'opacity'},{name:'transform'}],confidence:'runtime-observed',runtimeState:'running',...patch
});

describe('animation grouping',()=>{
  it('groups the same named CSS animation across elements and source/runtime observations',()=>{
    const items=[
      base({id:'runtime-1',elementId:'el-1'}),
      base({id:'runtime-2',elementId:'el-2',startTime:120}),
      base({id:'static',elementId:'static:.card',confidence:'exact',runtimeState:'idle',source:{file:'styles.css',line:10,selector:'.card'}})
    ];
    const groups=groupAnimations(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.instances).toHaveLength(3);
  });

  it('does not merge different named CSS animations',()=>{
    expect(animationGroupKey(base({name:'fade-up'}))).not.toBe(animationGroupKey(base({name:'fade-down'})));
  });

  it('groups equivalent WAAPI keyframes even when targets differ',()=>{
    const keyframes=[{offset:0,opacity:'0',transform:'scale(.9)'},{offset:1,opacity:'1',transform:'scale(1)'}];
    const a=base({id:'w1',type:'web-animation',name:undefined,keyframes,elementId:'el-1'});
    const b=base({id:'w2',type:'web-animation',name:undefined,keyframes,elementId:'el-2'});
    expect(groupAnimations([a,b])).toHaveLength(1);
  });
});
