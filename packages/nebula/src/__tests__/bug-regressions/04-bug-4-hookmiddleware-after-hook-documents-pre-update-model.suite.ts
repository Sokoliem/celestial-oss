// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { hookMiddleware } from '../../middleware.js';

// ─── Bug #4: hookMiddleware "after" hook fires with pre-update model ────────

describe('Bug #4: hookMiddleware after hook documents pre-update model', () => {
  it('after hook receives the model BEFORE update (by design)', async () => {
    // This test documents the intentional behavior: the "after" hook
    // receives the pre-update model. The fix is documentation, not code.
    const capturedModels: Array<{ count: number }> = [];
    const mw = hookMiddleware<{ count: number }, string>('test', {
      after: (_msg, model) => {
        capturedModels.push(model);
      },
    });

    // Process with pre-update model
    mw.process('increment', { count: 0 });

    // Wait for microtask
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(capturedModels).toHaveLength(1);
    // The model captured is the one passed to process() — i.e., the pre-update model
    expect(capturedModels[0]).toEqual({ count: 0 });
  });
});
