// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { signal } from '../../signals.js';

describe('signal', () => {
  it('should return the initial value when read', () => {
    const [count] = signal(0);
    expect(count()).toBe(0);
  });

  it('should return updated value after set', () => {
    const [count, setCount] = signal(0);
    setCount(5);
    expect(count()).toBe(5);
  });

  it('should handle various types', () => {
    const [str, setStr] = signal('hello');
    expect(str()).toBe('hello');
    setStr('world');
    expect(str()).toBe('world');

    const [obj, setObj] = signal({ x: 1 });
    expect(obj()).toEqual({ x: 1 });
    setObj({ x: 2 });
    expect(obj()).toEqual({ x: 2 });

    const [arr, setArr] = signal([1, 2, 3]);
    expect(arr()).toEqual([1, 2, 3]);
    setArr([4, 5]);
    expect(arr()).toEqual([4, 5]);
  });

  it('should allow null and undefined as values', () => {
    const [val, setVal] = signal<string | null>('hello');
    setVal(null);
    expect(val()).toBe(null);

    const [val2, setVal2] = signal<number | undefined>(42);
    setVal2(undefined);
    expect(val2()).toBe(undefined);
  });
});
