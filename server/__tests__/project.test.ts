import { describe,expect,it } from 'vitest';
import path from 'node:path';
import { resolveInside } from '../project.js';
describe('resolveInside',()=>{it('allows descendants',()=>expect(resolveInside('/tmp/root','a/b.css')).toBe(path.resolve('/tmp/root/a/b.css')));it('blocks traversal',()=>expect(()=>resolveInside('/tmp/root','../secret')).toThrow(/escapes/));});
