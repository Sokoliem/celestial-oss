// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { type EventNode, type HoverNode, planLayout } from '../../vdom.js';

// ─── Bug 2.7: event/hover wrapper rects use full space instead of child ─────

describe('Bug 2.7: event/hover planNode should use child dimensions', () => {
  it('event node rect should match child dimensions, not full available space', () => {
    const eventNode: EventNode = {
      kind: 'event',
      id: 'btn',
      child: { kind: 'text', content: 'OK' }, // 2 wide, 1 tall
      handlers: { onClick: 'click' },
    };

    const plan = planLayout(eventNode, 80, 24);
    // The event wrapper rect should be sized to its child (2x1), not 80x24
    expect(plan.root.rect.width).toBe(2);
    expect(plan.root.rect.height).toBe(1);
  });

  it('hover node rect should match child dimensions, not full available space', () => {
    const hoverNode: HoverNode = {
      kind: 'hover',
      id: 'hov',
      child: { kind: 'text', content: 'Hi' }, // 2 wide, 1 tall
      hovered: false,
    };

    const plan = planLayout(hoverNode, 80, 24);
    // The hover wrapper rect should be sized to its child (2x1), not 80x24
    expect(plan.root.rect.width).toBe(2);
    expect(plan.root.rect.height).toBe(1);
  });

  it('event/hover rects should match multi-line child dimensions', () => {
    const eventNode: EventNode = {
      kind: 'event',
      id: 'btn',
      child: { kind: 'text', content: 'Line1\nLine2\nLine3' }, // 5 wide, 3 tall
      handlers: { onClick: 'click' },
    };

    const plan = planLayout(eventNode, 40, 10);
    expect(plan.root.rect.width).toBe(5);
    expect(plan.root.rect.height).toBe(3);
  });
});
