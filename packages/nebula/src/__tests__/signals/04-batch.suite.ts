// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { batch, computed, effect, signal } from '../../signals.js';

describe('batch', () => {
  it('should defer effect re-runs until batch completes', () => {
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const values: number[] = [];

    const dispose = effect(() => {
      values.push(a() + b());
    });

    expect(values).toEqual([3]);

    batch(() => {
      setA(10);
      setB(20);
    });

    // Effect should have run only once with the final values
    expect(values).toEqual([3, 30]);

    dispose();
  });

  it('should still work with computeds during batch', () => {
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const sum = computed(() => a() + b());
    const values: number[] = [];

    const dispose = effect(() => {
      values.push(sum());
    });

    expect(values).toEqual([3]);

    batch(() => {
      setA(10);
      setB(20);
    });

    expect(values).toEqual([3, 30]);

    dispose();
  });

  it('should allow nested batches', () => {
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const [c, setC] = signal(3);
    const values: number[] = [];

    const dispose = effect(() => {
      values.push(a() + b() + c());
    });

    expect(values).toEqual([6]);

    batch(() => {
      setA(10);
      batch(() => {
        setB(20);
        setC(30);
      });
      // Inner batch should NOT flush since outer batch is still active
    });

    expect(values).toEqual([6, 60]);

    dispose();
  });

  it('should return the value from the batch function', () => {
    const [count, setCount] = signal(0);
    batch(() => {
      setCount(42);
    });
    expect(count()).toBe(42);
  });
});
