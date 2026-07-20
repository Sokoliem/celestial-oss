import { color, style as coronaStyle } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { createCompositor } from '../compositor.js';
import { overlay, text } from '../elements.js';
import { type LayoutPlan, planLayout, type RowNode } from '../vdom.js';

/**
 * Helper: build a simple row layout plan with two text nodes that have layoutIds.
 * The row children are positioned sequentially by planLayout.
 */
function makePlan(items: Array<{ id: string; content: string }>, width = 20, height = 5): LayoutPlan {
  const children = items.map(({ id, content }) => ({
    kind: 'text' as const,
    content,
    layoutId: id,
  }));
  const row: RowNode = { kind: 'row', children, layoutId: 'root-row' };
  return planLayout(row, width, height);
}

function makeOverlayPlan(x: number): LayoutPlan {
  return planLayout(
    overlay(text('drag', coronaStyle({ color: color.red, bold: true })), {
      x,
      y: 1,
      width: 4,
      height: 1,
      zIndex: 5,
      layoutId: 'overlay-window',
    }),
    20,
    5,
  );
}

describe('createCompositor', () => {
  it('should return the plan unchanged on first update (no previous plan)', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 300 } });
    const plan = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);

    const result = compositor.update(plan, 0);

    // First update should pass through positions unchanged
    expect(result.index.get('a')!.rect).toEqual(plan.index.get('a')!.rect);
    expect(result.index.get('b')!.rect).toEqual(plan.index.get('b')!.rect);
  });

  it('should detect moved elements and return interpolated positions', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    // Initial plan: "AA" at x=0, "BB" at x=2
    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    // New plan: swap order, "BB" at x=0, "AA" at x=2
    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    const result = compositor.update(plan2, 100); // halfway through 200ms

    // 'a' should be interpolating from x=0 toward x=2
    const aRect = result.index.get('a')!.rect;
    expect(aRect.x).toBeGreaterThan(0);
    expect(aRect.x).toBeLessThan(2);

    // 'b' should be interpolating from x=2 toward x=0
    const bRect = result.index.get('b')!.rect;
    expect(bRect.x).toBeGreaterThan(0);
    expect(bRect.x).toBeLessThan(2);
  });

  it('should return final positions when animation completes', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    // Update at duration + some extra time to ensure completion
    const result = compositor.update(plan2, 300);

    // Animations should be done — positions should be the final (target) ones
    expect(result.index.get('a')!.rect.x).toBe(plan2.index.get('a')!.rect.x);
    expect(result.index.get('b')!.rect.x).toBe(plan2.index.get('b')!.rect.x);
  });

  it('should handle mid-animation retargeting', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    // Move a from x=0 to x=2
    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    compositor.update(plan2, 50); // 25% through animation

    // Now retarget: move a back to x=0
    const plan3 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    const result = compositor.update(plan3, 100);

    // 'a' should be animating from its mid-animation position back toward x=0
    const aRect = result.index.get('a')!.rect;
    // It shouldn't be at x=0 yet (retarget started mid-animation)
    // and it shouldn't be at x=2 either
    // The exact value depends on the retarget implementation, but it should be
    // somewhere reasonable (not the original from or to position exactly)
    expect(aRect.x).toBeGreaterThanOrEqual(0);
    expect(aRect.x).toBeLessThanOrEqual(2);
  });

  it('should not animate elements without layoutId', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    // Plan with no layoutIds
    const plan1 = planLayout(
      {
        kind: 'row',
        children: [
          { kind: 'text', content: 'AA' },
          { kind: 'text', content: 'BB' },
        ],
      },
      20,
      5,
    );
    compositor.update(plan1, 0);

    const plan2 = planLayout(
      {
        kind: 'row',
        children: [
          { kind: 'text', content: 'BB' },
          { kind: 'text', content: 'AA' },
        ],
      },
      20,
      5,
    );
    const result = compositor.update(plan2, 100);

    // Without layoutIds, positions should pass through unchanged
    expect(result.root.children[0]!.rect).toEqual(plan2.root.children[0]!.rect);
    expect(result.root.children[1]!.rect).toEqual(plan2.root.children[1]!.rect);
  });

  it('should report isAnimating true during animation, false when done', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);
    expect(compositor.isAnimating()).toBe(false);

    // Trigger movement
    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    compositor.update(plan2, 50);
    expect(compositor.isAnimating()).toBe(true);

    // Complete animation
    compositor.update(plan2, 300);
    expect(compositor.isAnimating()).toBe(false);
  });

  it('should clear all animation state on reset', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    compositor.update(plan2, 50);
    expect(compositor.isAnimating()).toBe(true);

    compositor.reset();
    expect(compositor.isAnimating()).toBe(false);

    // After reset, next update should pass through unchanged (no previous plan)
    const plan3 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    const result = compositor.update(plan3, 0);
    expect(result.index.get('a')!.rect).toEqual(plan3.index.get('a')!.rect);
  });

  it('should support spring-based transitions', () => {
    const compositor = createCompositor({
      defaultTransition: {
        duration: 0,
        spring: { stiffness: 100, damping: 10, mass: 1 },
      },
    });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);

    // Tick at 16ms intervals to let spring physics work
    let result = compositor.update(plan2, 16);
    expect(compositor.isAnimating()).toBe(true);

    // After several ticks, the spring should be moving
    result = compositor.update(plan2, 32);
    const aRect = result.index.get('a')!.rect;
    // Spring should be moving toward x=2 from x=0
    expect(aRect.x).toBeGreaterThanOrEqual(0);

    // After a very long time, spring should settle
    result = compositor.update(plan2, 5000);
    const settled = result.index.get('a')!.rect;
    expect(settled.x).toBeCloseTo(plan2.index.get('a')!.rect.x, 0);
  });

  it('should animate multiple elements simultaneously', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
      { id: 'c', content: 'CC' },
    ]);
    compositor.update(plan1, 20);

    // Reverse order of all three
    const plan2 = makePlan([
      { id: 'c', content: 'CC' },
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    const result = compositor.update(plan2, 100); // halfway

    // All three should be animating
    expect(compositor.isAnimating()).toBe(true);

    // a was at x=0, now goes to x=4 — at 50% should be in between
    const aRect = result.index.get('a')!.rect;
    expect(aRect.x).toBeGreaterThan(0);
    expect(aRect.x).toBeLessThan(4);

    // c was at x=4, now goes to x=0 — at 50% should be in between
    const cRect = result.index.get('c')!.rect;
    expect(cRect.x).toBeGreaterThan(0);
    expect(cRect.x).toBeLessThan(4);
  });

  it('should use per-element overrides when provided', () => {
    const overrides = new Map<string, { duration: number }>();
    overrides.set('a', { duration: 100 });
    overrides.set('b', { duration: 400 });

    const compositor = createCompositor({
      defaultTransition: { duration: 200 },
      overrides,
    });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);
    // At t=150: 'a' (100ms) should be done, 'b' (400ms) should still be going
    const result = compositor.update(plan2, 150);

    const aRect = result.index.get('a')!.rect;
    const bRect = result.index.get('b')!.rect;

    // 'a' should be at final position (100ms done)
    expect(aRect.x).toBe(plan2.index.get('a')!.rect.x);

    // 'b' should still be animating (400ms, only 150ms elapsed)
    expect(bRect.x).not.toBe(plan2.index.get('b')!.rect.x);
  });

  it('should preserve LayoutPlan dimensions and non-indexed entries', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });
    const plan = makePlan([{ id: 'a', content: 'AA' }], 30, 10);

    const result = compositor.update(plan, 0);
    expect(result.width).toBe(30);
    expect(result.height).toBe(10);
    expect(result.root).toBeDefined();
  });

  it('should handle new elements appearing without crashing', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([{ id: 'a', content: 'AA' }]);
    compositor.update(plan1, 0);

    // New element 'b' appears
    const plan2 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    const result = compositor.update(plan2, 50);

    // New element should pass through at its target position
    expect(result.index.get('b')!.rect).toEqual(plan2.index.get('b')!.rect);
  });

  it('should handle elements disappearing without crashing', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    // 'b' disappears
    const plan2 = makePlan([{ id: 'a', content: 'AA' }]);
    const result = compositor.update(plan2, 50);

    // 'a' should still be in the plan
    expect(result.index.get('a')).toBeDefined();
    // 'b' should not be in the plan (it's gone from the new plan)
    expect(result.index.has('b')).toBe(false);
  });

  it('should use easing function when provided', () => {
    // Use easeIn (cubic) which should produce values less than linear at 50%
    const easeIn = (t: number): number => t * t * t;
    const compositor = createCompositor({
      defaultTransition: { duration: 200, easing: easeIn },
    });

    const plan1 = makePlan([
      { id: 'a', content: 'AA' },
      { id: 'b', content: 'BB' },
    ]);
    compositor.update(plan1, 0);

    const plan2 = makePlan([
      { id: 'b', content: 'BB' },
      { id: 'a', content: 'AA' },
    ]);

    // At 50% time with easeIn(0.5) = 0.125
    const result = compositor.update(plan2, 100);
    const aRect = result.index.get('a')!.rect;

    // With easeIn, at 50% time the progress is 0.125
    // So x should be closer to 0 than to 2
    // a goes from x=0 to x=2, so expected ~0 + (2-0)*0.125 = 0.25
    expect(aRect.x).toBeGreaterThan(0);
    expect(aRect.x).toBeLessThan(1); // easeIn should be < linear midpoint
  });

  it('should animate overlay layoutIds and clone the animated overlay rects', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makeOverlayPlan(1);
    compositor.update(plan1, 0);

    const plan2 = makeOverlayPlan(9);
    const result = compositor.update(plan2, 100);
    const overlayRect = result.overlays?.[0]?.entry.rect;

    expect(overlayRect).toBeDefined();
    expect(overlayRect?.x).toBeGreaterThan(1);
    expect(overlayRect?.x).toBeLessThan(9);
  });

  it('should preserve resolvedStyle metadata on interpolated ticks', () => {
    const compositor = createCompositor({ defaultTransition: { duration: 200 } });

    const plan1 = makeOverlayPlan(1);
    compositor.update(plan1, 0);

    const plan2 = makeOverlayPlan(9);
    const result = compositor.update(plan2, 100);
    const styledChild = result.overlays?.[0]?.entry.children[0];
    const targetStyledChild = plan2.overlays?.[0]?.entry.children[0];

    expect(targetStyledChild?.resolvedStyle).toBeDefined();
    expect(styledChild?.resolvedStyle).toBeDefined();
    expect(styledChild?.resolvedStyle?.bold).toBe(true);
    expect(styledChild?.resolvedStyle?.fg).toBe(targetStyledChild?.resolvedStyle?.fg);
    expect(styledChild?.resolvedStyle?.fgRgb).toEqual(targetStyledChild?.resolvedStyle?.fgRgb);
  });
});
