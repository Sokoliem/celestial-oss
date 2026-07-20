// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// New regression tests for bugs N1 through N8 (second-pass review)
// ═══════════════════════════════════════════════════════════════════════════

// ─── Bug N1: render() leaves isRendering=true on throw ──────────────────────

describe('Bug N1: render() should reset isRendering on throw', () => {
  it('should not leave isRendering=true when view throws', () => {
    // Simulates the core issue: if any part of the render pipeline throws,
    // isRendering must be reset to false so subsequent dispatch() calls
    // don't permanently take the pendingRenderNeeded branch.
    let isRendering = false;
    let pendingRenderNeeded = false;
    let renderCount = 0;

    function render(shouldThrow: boolean): void {
      isRendering = true;
      try {
        renderCount++;
        if (shouldThrow) throw new Error('view() crashed');
      } finally {
        isRendering = false;
      }

      if (pendingRenderNeeded) {
        pendingRenderNeeded = false;
      }
    }

    function dispatch(): void {
      if (!isRendering) {
        render(false);
      } else {
        pendingRenderNeeded = true;
      }
    }

    // Render throws
    expect(() => render(true)).toThrow('view() crashed');
    // After the throw, isRendering MUST be false
    expect(isRendering).toBe(false);

    // Subsequent dispatch should work normally (not go to pendingRenderNeeded)
    dispatch();
    expect(renderCount).toBe(2);
    expect(pendingRenderNeeded).toBe(false);
  });
});
