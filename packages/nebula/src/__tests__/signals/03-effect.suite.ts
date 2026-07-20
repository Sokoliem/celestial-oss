// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { computed, effect, signal } from '../../signals.js';

describe('effect', () => {
  it('should run immediately on creation', () => {
    const fn = vi.fn();
    const dispose = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('should re-run when a tracked signal changes', () => {
    const [count, setCount] = signal(0);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(count());
    });

    expect(values).toEqual([0]);

    setCount(1);
    expect(values).toEqual([0, 1]);

    setCount(2);
    expect(values).toEqual([0, 1, 2]);

    dispose();
  });

  it('should track dependencies from computeds', () => {
    const [count, setCount] = signal(0);
    const doubled = computed(() => count() * 2);
    const values: number[] = [];

    const dispose = effect(() => {
      values.push(doubled());
    });

    expect(values).toEqual([0]);

    setCount(3);
    expect(values).toEqual([0, 6]);

    dispose();
  });

  it('should stop re-running after dispose', () => {
    const [count, setCount] = signal(0);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(count());
    });

    setCount(1);
    expect(values).toEqual([0, 1]);

    dispose();

    setCount(2);
    expect(values).toEqual([0, 1]); // no new entry
  });

  it('should call cleanup function on re-run', () => {
    const [count, setCount] = signal(0);
    const cleanupCalls: number[] = [];

    const dispose = effect(() => {
      const current = count();
      return () => {
        cleanupCalls.push(current);
      };
    });

    expect(cleanupCalls).toEqual([]);

    setCount(1); // re-runs effect; cleanup from previous run (value=0) should be called
    expect(cleanupCalls).toEqual([0]);

    setCount(2);
    expect(cleanupCalls).toEqual([0, 1]);

    dispose();
  });

  it('should call cleanup function on dispose', () => {
    const [count] = signal(0);
    const cleanupCalls: number[] = [];

    const dispose = effect(() => {
      const current = count();
      return () => {
        cleanupCalls.push(current);
      };
    });

    expect(cleanupCalls).toEqual([]);
    dispose();
    expect(cleanupCalls).toEqual([0]);
  });

  it('should handle effects that conditionally read signals', () => {
    const [toggle, setToggle] = signal(true);
    const [a, setA] = signal('A');
    const [b, setB] = signal('B');
    const values: string[] = [];

    const dispose = effect(() => {
      if (toggle()) {
        values.push(a());
      } else {
        values.push(b());
      }
    });

    expect(values).toEqual(['A']);

    setA('A2');
    expect(values).toEqual(['A', 'A2']);

    // Changing b should NOT trigger the effect since toggle is true
    setB('B2');
    expect(values).toEqual(['A', 'A2']);

    // Switch to reading b
    setToggle(false);
    expect(values).toEqual(['A', 'A2', 'B2']);

    // Now a changes should NOT trigger
    setA('A3');
    expect(values).toEqual(['A', 'A2', 'B2']);

    // But b changes should trigger
    setB('B3');
    expect(values).toEqual(['A', 'A2', 'B2', 'B3']);

    dispose();
  });
});
