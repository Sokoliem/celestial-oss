// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { computed, effect, signal } from '../../signals.js';

describe('computed', () => {
  it('should derive a value from a signal', () => {
    const [count] = signal(3);
    const doubled = computed(() => count() * 2);
    expect(doubled()).toBe(6);
  });

  it('should auto-track dependencies and update when they change', () => {
    const [count, setCount] = signal(3);
    const doubled = computed(() => count() * 2);
    expect(doubled()).toBe(6);

    setCount(10);
    expect(doubled()).toBe(20);
  });

  it('should track multiple dependencies', () => {
    const [a, setA] = signal(1);
    const [b, setB] = signal(2);
    const sum = computed(() => a() + b());

    expect(sum()).toBe(3);

    setA(10);
    expect(sum()).toBe(12);

    setB(20);
    expect(sum()).toBe(30);
  });

  it('should support chained computeds', () => {
    const [count, setCount] = signal(2);
    const doubled = computed(() => count() * 2);
    const quadrupled = computed(() => doubled() * 2);

    expect(quadrupled()).toBe(8);

    setCount(5);
    expect(quadrupled()).toBe(20);
  });

  it('should lazily re-evaluate (not eagerly)', () => {
    const [count, setCount] = signal(0);
    const fn = vi.fn(() => count() * 2);
    const doubled = computed(fn);

    // First read triggers evaluation
    expect(doubled()).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Setting the signal marks dirty but does not re-evaluate yet
    setCount(5);
    expect(fn).toHaveBeenCalledTimes(1);

    // Reading triggers re-evaluation
    expect(doubled()).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not re-evaluate if dependencies have not changed', () => {
    const [count, setCount] = signal(3);
    const fn = vi.fn(() => count() * 2);
    const doubled = computed(fn);

    doubled();
    doubled();
    doubled();
    expect(fn).toHaveBeenCalledTimes(1);

    // Set to the same value — signal skips same-value writes (Object.is)
    setCount(3);
    doubled();
    expect(fn).toHaveBeenCalledTimes(1); // no re-evaluation
    expect(doubled()).toBe(6);
  });

  it('should skip same-value signal writes via Object.is', () => {
    const [count, setCount] = signal(0);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(count());
    });

    expect(values).toEqual([0]);

    setCount(0); // same value
    expect(values).toEqual([0]); // effect did not re-run

    setCount(1);
    expect(values).toEqual([0, 1]);

    dispose();
  });
});
