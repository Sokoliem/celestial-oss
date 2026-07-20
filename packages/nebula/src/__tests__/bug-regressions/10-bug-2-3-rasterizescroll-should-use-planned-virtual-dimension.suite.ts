// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { planLayout, rasterize, type ScrollNode, type VNode } from '../../vdom.js';

// ─── Bug 2.3: rasterizeScroll re-measures child instead of using plan ───────

describe('Bug 2.3: rasterizeScroll should use planned virtual dimensions', () => {
  it('should render scroll content consistently with plan phase', () => {
    // Create a scroll node with known content
    const scrollChild: VNode = {
      kind: 'column',
      children: [
        { kind: 'text', content: 'line-0' },
        { kind: 'text', content: 'line-1' },
        { kind: 'text', content: 'line-2' },
        { kind: 'text', content: 'line-3' },
        { kind: 'text', content: 'line-4' },
      ],
    };
    const scrollNode: ScrollNode = {
      kind: 'scroll',
      child: scrollChild,
      offset: 2,
      height: 2,
    };

    // Plan and rasterize — should not re-measure internally
    const plan = planLayout(scrollNode, 10, 2);
    const grid = rasterize(plan);

    // Verify the grid shows lines 2 and 3 (offset=2, height=2)
    const row0 = grid.cells[0]!.map((c) => c.char)
      .join('')
      .trim();
    const row1 = grid.cells[1]!.map((c) => c.char)
      .join('')
      .trim();
    expect(row0).toBe('line-2');
    expect(row1).toBe('line-3');
  });
});
