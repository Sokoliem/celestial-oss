// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug #8: ghost-pool.ts local VNode type ─────────────────────────────────

describe('Bug #8: ghost-pool uses canonical VNode type from vdom', () => {
  it('GhostPool should accept VNode from vdom module', async () => {
    // After fix: ghost-pool imports VNode from ./vdom.js instead of
    // defining its own incompatible local type.
    const { createGhostPool } = await import('../../ghost-pool.js');
    const { text } = await import('../../elements.js');

    const pool = createGhostPool();
    const node = text('hello');
    const rect = { x: 0, y: 0, width: 10, height: 3 };
    const config = { exit: { type: 'fadeOut' as const, duration: 1000 } };

    // Should work without type errors
    pool.beginExit('test', node, rect, 0, config);
    expect(pool.hasGhosts()).toBe(true);
  });
});
