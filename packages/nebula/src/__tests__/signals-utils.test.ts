import { describe, expect, it } from 'vitest';
import { derived, history, previous, signal } from '../signals.js';

describe('signal utilities', () => {
  it('derived maps a source signal through a projection', () => {
    const [count, setCount] = signal(2);
    const doubled = derived(count, (value) => value * 2);

    expect(doubled()).toBe(4);
    setCount(5);
    expect(doubled()).toBe(10);
  });

  it('previous tracks the last observed value', () => {
    const [count, setCount] = signal(1);
    const prev = previous(count);

    expect(prev()).toBeUndefined();
    setCount(2);
    expect(prev()).toBe(1);
    setCount(3);
    expect(prev()).toBe(2);
  });

  it('previous reflects the actual prior change even after multiple writes before a read', () => {
    const [count, setCount] = signal(1);
    const prev = previous(count);

    expect(prev()).toBeUndefined();
    setCount(2);
    setCount(3);
    expect(prev()).toBe(2);
  });

  it('history keeps most recent values first and trims to max length', () => {
    const [count, setCount] = signal(1);
    const values = history(count, 3);

    expect(values()).toEqual([1]);
    setCount(2);
    expect(values()).toEqual([2, 1]);
    setCount(3);
    expect(values()).toEqual([3, 2, 1]);
    setCount(4);
    expect(values()).toEqual([4, 3, 2]);
  });

  it('history captures intermediate changes even if it is read later', () => {
    const [count, setCount] = signal(1);
    const values = history(count, 3);

    expect(values()).toEqual([1]);
    setCount(2);
    setCount(3);
    expect(values()).toEqual([3, 2, 1]);
  });
});
