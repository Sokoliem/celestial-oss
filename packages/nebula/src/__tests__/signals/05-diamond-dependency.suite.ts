// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { batch, computed, effect, signal } from '../../signals.js';

describe('diamond dependency', () => {
  it('should only run effect once when A changes (A->B, A->C, B&C->D)', () => {
    const [a, setA] = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => a() * 3);

    const results: number[] = [];
    const fn = vi.fn(() => {
      results.push(b() + c());
    });
    const dispose = effect(fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results).toEqual([5]); // 2 + 3

    setA(2);

    // D (the effect) should run exactly once, not twice
    expect(fn).toHaveBeenCalledTimes(2);
    expect(results).toEqual([5, 10]); // 4 + 6

    dispose();
  });

  it('should handle diamond with batch', () => {
    const [a, setA] = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => a() * 3);
    const results: number[] = [];
    const runCount = vi.fn(() => {
      results.push(b() + c());
    });

    const dispose = effect(runCount);
    expect(runCount).toHaveBeenCalledTimes(1);

    batch(() => {
      setA(5);
    });

    expect(runCount).toHaveBeenCalledTimes(2);
    expect(results).toEqual([5, 25]); // 5 then 10 + 15

    dispose();
  });
});
