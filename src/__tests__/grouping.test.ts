import { describe, expect, it } from 'vitest';
import type { MotionTrack } from '../core/motion';
import { animationGroupKey, groupAnimations } from '../editor/grouping';

const base=(patch:Partial<MotionTrack>):MotionTrack=>({
  id:'a',target:{elementId:'el-1'},timing:{start:0,duration:400,easing:'ease-out'},properties:[{name:'opacity'},{name:'transform'}],keyframes:[],trigger:{kind:'unknown'},source:{kind:'css-animation',confidence:'runtime-observed'},runtimeState:'running',name:'fade-up',...patch
});

describe('animation grouping',()=>{
  it('groups the same named CSS animation across elements and source/runtime observations',()=>{
    const items=[
      base({id:'runtime-1',target:{elementId:'el-1'}}),
      base({id:'runtime-2',target:{elementId:'el-2'},timing:{start:120,duration:400,easing:'ease-out'}}),
      base({id:'static',target:{elementId:'static:.card'},source:{kind:'css-animation',confidence:'exact',reference:{file:'styles.css',line:10,selector:'.card'}},runtimeState:'idle'})
    ];
    const groups=groupAnimations(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.instances).toHaveLength(3);
  });

  it('does not merge different named CSS animations',()=>{
    expect(animationGroupKey(base({name:'fade-up'}))).not.toBe(animationGroupKey(base({name:'fade-down'})));
  });

  it('groups equivalent WAAPI keyframes even when targets differ',()=>{
    const keyframes=[{offset:0,values:{opacity:'0',transform:'scale(.9)'}},{offset:1,values:{opacity:'1',transform:'scale(1)'}}];
    const a=base({id:'w1',name:undefined,target:{elementId:'el-1'},source:{kind:'waapi',confidence:'runtime-observed'},keyframes});
    const b=base({id:'w2',name:undefined,target:{elementId:'el-2'},source:{kind:'waapi',confidence:'runtime-observed'},keyframes});
    expect(groupAnimations([a,b])).toHaveLength(1);
  });
});
