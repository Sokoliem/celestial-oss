// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { computed, effect, signal } from '../../signals.js';

describe('PossiblyDirty optimization', () => {
  it('should skip effect when intermediate computed value is unchanged', () => {
    // a -> b (computed: a % 2) -> effect
    // Changing a from 2 to 4 keeps b at 0 — effect should not re-run
    const [a, setA] = signal(2);
    const parity = computed(() => a() % 2);
    const values: number[] = [];

    const dispose = effect(() => {
      values.push(parity());
    });

    expect(values).toEqual([0]);

    setA(4); // parity still 0
    expect(values).toEqual([0]); // effect did not re-run

    setA(3); // parity now 1
    expect(values).toEqual([0, 1]);

    dispose();
  });

  it('should skip deeply chained PossiblyDirty when value unchanged', () => {
    const [a, setA] = signal(10);
    const b = computed(() => a() * 2); // 20
    const c = computed(() => b() > 10); // true
    const results: boolean[] = [];

    const dispose = effect(() => {
      results.push(c());
    });
    expect(results).toEqual([true]);

    setA(20); // b=40, c=true (unchanged)
    expect(results).toEqual([true]); // no re-run

    setA(1); // b=2, c=false (changed)
    expect(results).toEqual([true, false]);

    dispose();
  });
});
