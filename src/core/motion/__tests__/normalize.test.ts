import {describe,expect,it} from 'vitest';
import {createMotionProperty,motionValueInterpolable,motionValueKind} from '../properties';

describe('motion property semantics',()=>{
  it('classifies canonical motion value kinds',()=>{expect(motionValueKind('opacity')).toBe('number');expect(motionValueKind('width')).toBe('length');expect(motionValueKind('rotate')).toBe('angle');expect(motionValueKind('background-color')).toBe('color');expect(motionValueKind('transform')).toBe('transform');expect(motionValueKind('display')).toBe('discrete');});
  it('marks discrete values as non-interpolable',()=>{expect(motionValueInterpolable('discrete')).toBe(false);expect(motionValueInterpolable('transform')).toBe(true);expect(motionValueInterpolable('unknown')).toBeUndefined();});
  it('copies value arrays instead of sharing mutable input',()=>{const values=['0','1'],property=createMotionProperty('opacity',{values});values[0]='9';expect(property).toMatchObject({name:'opacity',values:['0','1'],valueKind:'number',interpolable:true});});
});
