// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { planLayout, type ScrollNode, type VNode } from '../../vdom.js';

// ─── Bug N4: planScroll calls measure then planNode (double render) ─────────

describe('Bug N4: planScroll should not double-render component children', () => {
  it('should only call component render once during planLayout', () => {
    let renderCount = 0;
    const componentChild: VNode = {
      kind: 'component',
      render: () => {
        renderCount++;
        return {
          kind: 'column',
          children: [
            { kind: 'text', content: 'line 0' },
            { kind: 'text', content: 'line 1' },
            { kind: 'text', content: 'line 2' },
          ],
        };
      },
    };

    const scrollNode: ScrollNode = {
      kind: 'scroll',
      child: componentChild,
      offset: 0,
      height: 2,
    };

    planLayout(scrollNode, 20, 5);

    // Before fix: measure() calls component.render(), then planNode() calls it again
    // After fix: planNode is called once with a large sentinel height; no separate measure()
    expect(renderCount).toBe(1);
  });
});
