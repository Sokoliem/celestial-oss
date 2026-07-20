// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug N3: computed PossiblyDirty skip ignores signal sources ─────────────

describe('Bug N3: computed PossiblyDirty should re-evaluate when signal sources exist', () => {
  it('should re-evaluate computed in diamond pattern when signal changes', async () => {
    const { signal, computed } = await import('../../signals.js');

    // Diamond: signal S -> computed A -> computed C
    //                    -> computed B -> computed C
    // When S changes, A and B become Dirty, C becomes PossiblyDirty.
    // If A and B return the same values, C should still check if it has
    // direct signal sources that changed.

    const [getS, setS] = signal(1);
    const getA = computed(() => (getS() > 0 ? 'pos' : 'neg')); // returns 'pos' for 1 and 2
    const getB = computed(() => (getS() > 0 ? 'pos' : 'neg')); // same

    // C depends on A, B, AND directly on S
    const getC = computed(() => `${getA()}-${getB()}-${getS()}`);

    expect(getC()).toBe('pos-pos-1');

    setS(2); // A still returns 'pos', B still returns 'pos', but S changed to 2

    // Before fix: C might skip re-evaluation because its computed sources
    // (A and B) didn't change values, even though signal S did.
    // After fix: C sees it has signal sources and re-evaluates.
    expect(getC()).toBe('pos-pos-2');
  });

  it('should skip re-evaluation when computed sources unchanged and no signal sources', async () => {
    const { signal, computed } = await import('../../signals.js');

    const [getS, setS] = signal(1);
    const getA = computed(() => (getS() > 0 ? 'pos' : 'neg'));

    // C only depends on A (a computed), not directly on S
    let cCallCount = 0;
    const getC = computed(() => {
      cCallCount++;
      return `result:${getA()}`;
    });

    expect(getC()).toBe('result:pos');
    expect(cCallCount).toBe(1);

    setS(2); // A still returns 'pos'
    // C should be PossiblyDirty, but since A didn't change and C has no
    // direct signal sources, it should skip re-evaluation
    expect(getC()).toBe('result:pos');
    // cCallCount should still be 1 (skipped)
    expect(cCallCount).toBe(1);
  });
});
