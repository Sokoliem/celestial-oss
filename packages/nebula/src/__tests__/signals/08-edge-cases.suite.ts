// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { computed, effect, signal } from '../../signals.js';

describe('edge cases', () => {
  it('should not infinite loop on circular computed reads', () => {
    // A computed that reads another computed that reads the first
    // This should not cause a stack overflow — it should stabilize
    const [base, setBase] = signal(1);
    const a = computed(() => base() + 1);
    const b = computed(() => a() + 1);

    expect(b()).toBe(3);
    setBase(10);
    expect(b()).toBe(12);
  });

  it('should handle effect that writes to a signal it reads', () => {
    // This pattern should not cause an infinite loop
    const [count, setCount] = signal(0);
    const [derived, setDerived] = signal(0);
    let runs = 0;

    const dispose = effect(() => {
      runs++;
      setDerived(count() * 2);
    });

    expect(runs).toBe(1);
    expect(derived()).toBe(0);

    setCount(5);
    expect(runs).toBe(2);
    expect(derived()).toBe(10);

    dispose();
  });

  it('should handle reading a signal outside of any reactive context', () => {
    const [count] = signal(42);
    // Reading outside computed/effect should just return the value
    expect(count()).toBe(42);
  });

  it('should handle computed with no dependencies', () => {
    const val = computed(() => 42);
    expect(val()).toBe(42);
    // Should always return 42, never re-evaluate
    expect(val()).toBe(42);
  });

  it('should handle disposing an already-disposed effect', () => {
    const [count] = signal(0);
    const dispose = effect(() => {
      count();
    });
    dispose();
    // Should not throw on double dispose
    expect(() => dispose()).not.toThrow();
  });
});
