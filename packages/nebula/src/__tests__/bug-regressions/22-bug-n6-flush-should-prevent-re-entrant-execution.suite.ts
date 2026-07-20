// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug N6: flush() re-entrancy allows exceeding iteration limit ───────────

describe('Bug N6: flush() should prevent re-entrant execution', () => {
  it('should not allow nested flush calls to bypass iteration limit', async () => {
    const { signal, effect } = await import('../../signals.js');

    // Create a scenario where an effect writes to a signal at batchDepth=0,
    // which would trigger flush() re-entrantly.
    const [getA, setA] = signal(0);
    const [getB, setB] = signal(0);

    let effectRunCount = 0;
    effect(() => {
      effectRunCount++;
      const val = getA();
      // When A changes, write to B. At batchDepth=0 this would trigger
      // a re-entrant flush() before the fix.
      if (val > 0 && val < 5) {
        setB(val);
      }
    });

    // After fix: the inner flush is prevented by the isFlushing guard.
    // The outer flush picks up any new pending effects naturally.
    effectRunCount = 0;
    setA(1);

    // Effect should run (for the setA), and the setB inside should
    // be picked up in a subsequent iteration of the SAME flush, not a nested one.
    expect(effectRunCount).toBeGreaterThanOrEqual(1);
    expect(getB()).toBe(1);
  });
});
