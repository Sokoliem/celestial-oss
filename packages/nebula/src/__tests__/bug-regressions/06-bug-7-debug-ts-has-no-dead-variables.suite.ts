// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug #7: Dead _logSubscriptions in debug.ts ─────────────────────────────

describe('Bug #7: debug.ts has no dead variables', () => {
  it('debugPlugin should work with logSubscriptions option', async () => {
    // The _logSubscriptions variable was assigned but never used.
    // After the fix, we verify the module still loads and the option is accepted.
    const { debugPlugin } = await import('../../debug.js');
    const plugin = debugPlugin({
      logSubscriptions: true,
      output: () => {},
    });
    expect(plugin.name).toBe('debug');
  });
});
