import { describe, expect, it } from 'vitest';
import { fromFrames, listNames, lookup, procedural, registerAll, renderAt, resolve } from '../../spinner/engine.js';
import type { SpinnerDefinition } from '../../spinner/types.js';

describe('resolve', () => {
  it('resolves a frame-based spinner', () => {
    const def: SpinnerDefinition = { name: 'test', frames: ['a', 'b', 'c'], interval: 100 };
    const resolved = resolve(def);
    expect(resolved.name).toBe('test');
    expect(resolved.interval).toBe(100);
    expect(resolved.length).toBe(3);
    expect(resolved.frame(0)).toBe('a');
    expect(resolved.frame(1)).toBe('b');
    expect(resolved.frame(2)).toBe('c');
  });

  it('wraps frame index for frame-based spinners', () => {
    const def: SpinnerDefinition = { name: 'wrap', frames: ['x', 'y'], interval: 50 };
    const resolved = resolve(def);
    expect(resolved.frame(0)).toBe('x');
    expect(resolved.frame(1)).toBe('y');
    expect(resolved.frame(2)).toBe('x');
    expect(resolved.frame(3)).toBe('y');
  });

  it('handles negative tick indices gracefully', () => {
    const def: SpinnerDefinition = { name: 'neg', frames: ['a', 'b', 'c'] };
    const resolved = resolve(def);
    // Negative modulo should still return a valid frame
    expect(resolved.frame(-1)).toBe('c');
    expect(resolved.frame(-2)).toBe('b');
  });

  it('resolves a procedural spinner', () => {
    const def: SpinnerDefinition = { name: 'proc', render: (t) => `frame-${t}`, interval: 60 };
    const resolved = resolve(def);
    expect(resolved.name).toBe('proc');
    expect(resolved.interval).toBe(60);
    expect(resolved.length).toBe(Infinity);
    expect(resolved.frame(0)).toBe('frame-0');
    expect(resolved.frame(42)).toBe('frame-42');
  });

  it('defaults interval to 80ms', () => {
    const def: SpinnerDefinition = { name: 'default', frames: ['a'] };
    const resolved = resolve(def);
    expect(resolved.interval).toBe(80);
  });

  it('throws for spinner with no frames and no render', () => {
    const def: SpinnerDefinition = { name: 'empty' };
    expect(() => resolve(def)).toThrow('must have frames or a render function');
  });

  it('throws for spinner with empty frames array', () => {
    const def: SpinnerDefinition = { name: 'empty', frames: [] };
    expect(() => resolve(def)).toThrow('must have frames or a render function');
  });
});

describe('renderAt', () => {
  it('computes the correct frame from elapsed time', () => {
    const def: SpinnerDefinition = { name: 'test', frames: ['a', 'b', 'c', 'd'], interval: 100 };
    const resolved = resolve(def);
    expect(renderAt(resolved, 0)).toBe('a');
    expect(renderAt(resolved, 99)).toBe('a');
    expect(renderAt(resolved, 100)).toBe('b');
    expect(renderAt(resolved, 250)).toBe('c');
    expect(renderAt(resolved, 400)).toBe('a'); // wraps
  });

  it('works with procedural spinners', () => {
    const def: SpinnerDefinition = { name: 'proc', render: (t) => String(t), interval: 50 };
    const resolved = resolve(def);
    expect(renderAt(resolved, 0)).toBe('0');
    expect(renderAt(resolved, 50)).toBe('1');
    expect(renderAt(resolved, 125)).toBe('2');
  });
});

describe('fromFrames', () => {
  it('creates a definition from a frames array', () => {
    const def = fromFrames('custom', ['x', 'y', 'z'], 120);
    expect(def.name).toBe('custom');
    expect(def.frames).toEqual(['x', 'y', 'z']);
    expect(def.interval).toBe(120);
  });

  it('leaves interval undefined when not specified', () => {
    const def = fromFrames('minimal', ['a']);
    expect(def.interval).toBeUndefined();
  });
});

describe('procedural', () => {
  it('creates a procedural definition', () => {
    const render = (t: number) => `f${t}`;
    const def = procedural('gen', render, 50);
    expect(def.name).toBe('gen');
    expect(def.render).toBe(render);
    expect(def.interval).toBe(50);
  });
});

describe('registry', () => {
  it('registers and looks up spinners', () => {
    const testSpinners: Record<string, SpinnerDefinition> = {
      testA: { name: 'testA', frames: ['A1', 'A2'] },
      testB: { name: 'testB', frames: ['B1', 'B2', 'B3'] },
    };
    registerAll(testSpinners);

    expect(lookup('testA')).toBe(testSpinners.testA);
    expect(lookup('testB')).toBe(testSpinners.testB);
    expect(lookup('nonexistent')).toBeUndefined();
  });

  it('lists registered names', () => {
    registerAll({ listTest: { name: 'listTest', frames: ['x'] } });
    const names = listNames();
    expect(names).toContain('listTest');
  });
});
