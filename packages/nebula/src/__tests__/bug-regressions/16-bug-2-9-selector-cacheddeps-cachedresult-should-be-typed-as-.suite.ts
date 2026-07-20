// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it, vi } from 'vitest';
import { composeSelectors, createSelector } from '../../selector.js';

// ─── Bug 2.9: selector.ts cachedDeps/cachedResult typed as definite ─────────

describe('Bug 2.9: selector cachedDeps/cachedResult should be typed as possibly undefined', () => {
  it('should work correctly after invalidation when deps produce undefined', () => {
    // The bug: cachedDeps is typed as `Deps` but uninitialized (actually undefined).
    // This matters when the computed deps could legitimately be `undefined`.
    const compute = vi.fn((deps: number | undefined) => deps ?? -1);
    const selector = createSelector((model: { val?: number }) => model.val, compute);

    // First call with undefined deps
    const result1 = selector({ val: undefined });
    expect(result1).toBe(-1);
    expect(compute).toHaveBeenCalledTimes(1);

    // Invalidate and call again with undefined deps
    selector.invalidate();
    const result2 = selector({ val: undefined });
    expect(result2).toBe(-1);
    // After fix: should recompute because hasCached was reset to false
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('composeSelectors should also handle invalidation with undefined-like values', () => {
    const compute = vi.fn((count: number | undefined) => count ?? 0);
    const getVal = createSelector((model: { val?: number }) => model.val, compute);
    const doubled = composeSelectors(getVal, (v) => v * 2);

    const result1 = doubled({ val: undefined });
    expect(result1).toBe(0);

    doubled.invalidate();
    const result2 = doubled({ val: undefined });
    expect(result2).toBe(0);
    // Should still recompute properly after invalidation
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
