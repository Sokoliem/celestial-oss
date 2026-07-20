import { describe, expect, it } from 'vitest';
import {
  applyScrollDelta,
  computeIntersections,
  computeScrollIndicator,
  computeScrollInfo,
  computeVirtualViewport,
  createMomentumState,
  generateSnapPoints,
  parallaxOffset,
  renderScrollIndicator,
  scrollBy,
  scrollTo,
  scrollToElement,
  snapToNearest,
  stickyPosition,
  tickMomentum,
} from '../scroll-driver.js';

// ─── Existing tests ─────────────────────────────────────────────────────────

describe('computeScrollInfo', () => {
  it('returns progress 0 at offset 0', () => {
    const info = computeScrollInfo(0, 200, 100);
    expect(info.offset).toBe(0);
    expect(info.maxOffset).toBe(100);
    expect(info.progress).toBe(0);
    expect(info.viewportHeight).toBe(100);
  });

  it('returns progress 1 at maxOffset', () => {
    const info = computeScrollInfo(100, 200, 100);
    expect(info.progress).toBe(1);
  });

  it('returns progress 0.5 at midpoint', () => {
    const info = computeScrollInfo(50, 200, 100);
    expect(info.progress).toBe(0.5);
  });

  it('returns maxOffset 0 and progress 0 when content fits viewport', () => {
    const info = computeScrollInfo(0, 50, 100);
    expect(info.maxOffset).toBe(0);
    expect(info.progress).toBe(0);
  });

  it('clamps progress to 0 when offset is negative', () => {
    const info = computeScrollInfo(-10, 200, 100);
    expect(info.progress).toBe(0);
  });

  it('clamps progress to 1 when offset exceeds maxOffset', () => {
    const info = computeScrollInfo(150, 200, 100);
    expect(info.progress).toBe(1);
  });
});

describe('computeIntersections', () => {
  it('returns ratio 1 for a fully visible element', () => {
    const elements = [{ id: 'a', y: 10, height: 20 }];
    const entry = computeIntersections(elements, 0, 100)[0]!;
    expect(entry.ratio).toBe(1);
    expect(entry.isIntersecting).toBe(true);
  });

  it('returns ratio 0.5 when element is half visible (top clipped)', () => {
    const elements = [{ id: 'a', y: 0, height: 20 }];
    const entry = computeIntersections(elements, 10, 100)[0]!;
    expect(entry.ratio).toBe(0.5);
    expect(entry.isIntersecting).toBe(true);
  });

  it('returns ratio 0.5 when element is half visible (bottom clipped)', () => {
    const elements = [{ id: 'a', y: 90, height: 20 }];
    const entry = computeIntersections(elements, 0, 100)[0]!;
    expect(entry.ratio).toBe(0.5);
    expect(entry.isIntersecting).toBe(true);
  });

  it('returns ratio 0 and isIntersecting false for a not visible element', () => {
    const elements = [{ id: 'a', y: 200, height: 20 }];
    const entry = computeIntersections(elements, 0, 100)[0]!;
    expect(entry.ratio).toBe(0);
    expect(entry.isIntersecting).toBe(false);
  });

  it('handles multiple elements at various positions', () => {
    const elements = [
      { id: 'visible', y: 10, height: 20 },
      { id: 'clipped', y: 90, height: 20 },
      { id: 'offscreen', y: 200, height: 20 },
    ];
    const entries = computeIntersections(elements, 0, 100);

    expect(entries).toHaveLength(3);

    const visible = entries.find((e) => e.id === 'visible')!;
    expect(visible.ratio).toBe(1);
    expect(visible.isIntersecting).toBe(true);

    const clipped = entries.find((e) => e.id === 'clipped')!;
    expect(clipped.ratio).toBe(0.5);
    expect(clipped.isIntersecting).toBe(true);

    const offscreen = entries.find((e) => e.id === 'offscreen')!;
    expect(offscreen.ratio).toBe(0);
    expect(offscreen.isIntersecting).toBe(false);
  });
});

describe('parallaxOffset', () => {
  it('returns scrollOffset when speed is 1', () => {
    expect(parallaxOffset(100, 1)).toBe(100);
  });

  it('returns half scrollOffset when speed is 0.5', () => {
    expect(parallaxOffset(100, 0.5)).toBe(50);
  });

  it('returns 0 when speed is 0', () => {
    expect(parallaxOffset(100, 0)).toBe(0);
  });

  it('returns double scrollOffset when speed is 2', () => {
    expect(parallaxOffset(50, 2)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(parallaxOffset(33, 0.5)).toBe(Math.round(33 * 0.5));
  });
});

describe('stickyPosition', () => {
  it('returns normal position when element is above sticky threshold', () => {
    expect(stickyPosition(50, 0, 10)).toBe(50);
  });

  it('returns pinned position when element scrolled past threshold', () => {
    expect(stickyPosition(50, 100, 10)).toBe(110);
  });

  it('returns normal position exactly at threshold boundary', () => {
    expect(stickyPosition(50, 40, 10)).toBe(50);
  });

  it('returns pinned position one pixel past threshold', () => {
    expect(stickyPosition(50, 41, 10)).toBe(51);
  });
});

// ─── New: Momentum scrolling ────────────────────────────────────────────────

describe('createMomentumState', () => {
  it('creates state with zero velocity and given offset', () => {
    const state = createMomentumState(10);
    expect(state.offset).toBe(10);
    expect(state.velocity).toBe(0);
    expect(state.isAnimating).toBe(false);
  });

  it('defaults to offset 0', () => {
    const state = createMomentumState();
    expect(state.offset).toBe(0);
  });
});

describe('applyScrollDelta', () => {
  it('updates offset by delta', () => {
    const state = createMomentumState(50);
    const next = applyScrollDelta(state, 10, 100, 200);
    expect(next.offset).toBe(60);
  });

  it('clamps offset to maxOffset', () => {
    const state = createMomentumState(190);
    const next = applyScrollDelta(state, 20, 100, 200);
    expect(next.offset).toBe(200);
  });

  it('clamps offset to 0', () => {
    const state = createMomentumState(5);
    const next = applyScrollDelta(state, -10, 100, 200);
    expect(next.offset).toBe(0);
  });

  it('sets isAnimating when velocity is significant', () => {
    const state = createMomentumState(0);
    const next = applyScrollDelta(state, 10, 100, 200);
    expect(next.isAnimating).toBe(true);
  });

  it('tracks velocity based on delta and time', () => {
    const state = createMomentumState(0);
    const next = applyScrollDelta(state, 16, 1000, 200);
    // First call: lastTimestamp is 0, so dt defaults to 16
    expect(next.velocity).toBeCloseTo(16, 0);
  });
});

describe('tickMomentum', () => {
  it('decelerates velocity by friction', () => {
    const state: ReturnType<typeof createMomentumState> = {
      velocity: 10,
      offset: 50,
      lastTimestamp: 100,
      isAnimating: true,
    };
    const next = tickMomentum(state, 200, 0.9);
    expect(next.velocity).toBeCloseTo(9, 0);
    expect(next.offset).toBeCloseTo(59, 0);
    expect(next.isAnimating).toBe(true);
  });

  it('stops animating when velocity drops below threshold', () => {
    const state: ReturnType<typeof createMomentumState> = {
      velocity: 0.4,
      offset: 50,
      lastTimestamp: 100,
      isAnimating: true,
    };
    const next = tickMomentum(state, 200, 0.5);
    expect(next.isAnimating).toBe(false);
    expect(next.velocity).toBe(0);
  });

  it('returns same state when not animating', () => {
    const state = createMomentumState(50);
    const next = tickMomentum(state, 200);
    expect(next).toBe(state);
  });

  it('clamps offset to maxOffset during tick', () => {
    const state: ReturnType<typeof createMomentumState> = {
      velocity: 100,
      offset: 190,
      lastTimestamp: 100,
      isAnimating: true,
    };
    const next = tickMomentum(state, 200);
    expect(next.offset).toBeLessThanOrEqual(200);
  });
});

// ─── New: Snap points ───────────────────────────────────────────────────────

describe('snapToNearest', () => {
  it('returns original offset when no snap points', () => {
    expect(snapToNearest(42, [])).toBe(42);
  });

  it('snaps to closest point', () => {
    const snaps = [{ offset: 0 }, { offset: 50 }, { offset: 100 }];
    expect(snapToNearest(42, snaps)).toBe(50);
    expect(snapToNearest(10, snaps)).toBe(0);
    expect(snapToNearest(80, snaps)).toBe(100);
  });

  it('snaps to exact point', () => {
    const snaps = [{ offset: 0 }, { offset: 50 }];
    expect(snapToNearest(50, snaps)).toBe(50);
  });

  it('snaps to first point when equidistant', () => {
    const snaps = [{ offset: 0 }, { offset: 50 }];
    // 25 is equidistant — should snap to first (0) since < comparison
    expect(snapToNearest(25, snaps)).toBe(0);
  });
});

describe('generateSnapPoints', () => {
  it('generates snap points from items', () => {
    const items = [
      { id: 'a', y: 0, height: 20 },
      { id: 'b', y: 20, height: 30 },
      { id: 'c', y: 50, height: 10 },
    ];
    const snaps = generateSnapPoints(items);
    expect(snaps).toEqual([
      { offset: 0, id: 'a' },
      { offset: 20, id: 'b' },
      { offset: 50, id: 'c' },
    ]);
  });

  it('returns empty array for empty items', () => {
    expect(generateSnapPoints([])).toEqual([]);
  });
});

// ─── New: Scroll indicators ─────────────────────────────────────────────────

describe('computeScrollIndicator', () => {
  it('returns not visible when content fits viewport', () => {
    const ind = computeScrollIndicator(0, 50, 100);
    expect(ind.visible).toBe(false);
    expect(ind.thumbSize).toBe(0);
  });

  it('returns visible with correct geometry', () => {
    const ind = computeScrollIndicator(0, 200, 100);
    expect(ind.visible).toBe(true);
    expect(ind.thumbSize).toBe(50); // 100*100/200
    expect(ind.thumbStart).toBe(0); // progress=0
    expect(ind.trackStart).toBe(0);
    expect(ind.trackEnd).toBe(99);
  });

  it('moves thumb with scroll progress', () => {
    const ind = computeScrollIndicator(50, 200, 100);
    // progress = 50/100 = 0.5
    // thumbStart = floor(0.5 * (100 - 50)) = 25
    expect(ind.thumbStart).toBe(25);
    expect(ind.thumbEnd).toBe(74);
  });

  it('thumb at bottom when fully scrolled', () => {
    const ind = computeScrollIndicator(100, 200, 100);
    // progress = 1, thumbStart = floor(1 * (100-50)) = 50
    expect(ind.thumbStart).toBe(50);
    expect(ind.thumbEnd).toBe(99);
  });

  it('ensures minimum thumb size of 1', () => {
    // Very large content relative to viewport
    const ind = computeScrollIndicator(0, 10000, 10);
    expect(ind.thumbSize).toBeGreaterThanOrEqual(1);
    expect(ind.visible).toBe(true);
  });
});

describe('renderScrollIndicator', () => {
  it('returns empty array when not visible', () => {
    const ind = computeScrollIndicator(0, 50, 100);
    const result = renderScrollIndicator(ind, 100);
    expect(result).toEqual([]);
  });

  it('renders track and thumb characters', () => {
    const ind = computeScrollIndicator(0, 200, 10);
    const result = renderScrollIndicator(ind, 10);
    expect(result).toHaveLength(10);

    // Thumb should be at the top (progress=0)
    const thumbChars = result.filter((c) => c === '█');
    const trackChars = result.filter((c) => c === '│');
    expect(thumbChars.length).toBe(ind.thumbSize);
    expect(trackChars.length).toBe(10 - ind.thumbSize);
  });

  it('uses custom characters', () => {
    const ind = computeScrollIndicator(0, 200, 10);
    const result = renderScrollIndicator(ind, 10, { track: '.', thumb: '#' });
    expect(result.some((c) => c === '#')).toBe(true);
    expect(result.some((c) => c === '.')).toBe(true);
  });
});

// ─── New: Virtual viewport ──────────────────────────────────────────────────

describe('computeVirtualViewport', () => {
  it('returns empty for empty items', () => {
    const vp = computeVirtualViewport([], 20, 0, 100);
    expect(vp.visibleItems).toEqual([]);
    expect(vp.totalHeight).toBe(0);
  });

  it('returns all items when they fit in viewport', () => {
    const items = ['a', 'b', 'c'];
    const vp = computeVirtualViewport(items, 10, 0, 100, 0);
    expect(vp.visibleItems).toHaveLength(3);
    expect(vp.totalHeight).toBe(30);
  });

  it('returns only visible items plus overscan', () => {
    const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
    const vp = computeVirtualViewport(items, 10, 200, 50, 2);
    // scrollOffset=200, viewport=50, itemHeight=10
    // rawStart = 20, rawEnd = 25
    // With overscan 2: startIndex = 18, endIndex = 27
    expect(vp.startIndex).toBe(18);
    expect(vp.endIndex).toBe(27);
    expect(vp.visibleItems).toHaveLength(9);
    expect(vp.visibleItems[0]!.index).toBe(18);
    expect(vp.visibleItems[0]!.item).toBe('item-18');
  });

  it('clamps indices to valid range', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const vp = computeVirtualViewport(items, 10, 0, 100, 5);
    expect(vp.startIndex).toBe(0);
    expect(vp.endIndex).toBeLessThanOrEqual(5);
  });

  it('computes correct offsets', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const vp = computeVirtualViewport(items, 10, 100, 50, 0);
    // rawStart = 10, rawEnd = 15
    expect(vp.offsetBefore).toBe(100); // 10 * 10
    expect(vp.offsetAfter).toBe(350); // (50 - 15) * 10
  });

  it('returns zero for itemHeight 0', () => {
    const vp = computeVirtualViewport(['a', 'b'], 0, 0, 100);
    expect(vp.visibleItems).toEqual([]);
  });
});

// ─── New: scrollTo, scrollBy, scrollToElement ───────────────────────────────

describe('scrollTo', () => {
  it('returns target offset within range', () => {
    expect(scrollTo(50, 200)).toBe(50);
  });

  it('clamps to maxOffset', () => {
    expect(scrollTo(300, 200)).toBe(200);
  });

  it('clamps to 0', () => {
    expect(scrollTo(-10, 200)).toBe(0);
  });
});

describe('scrollBy', () => {
  it('adds delta to current offset', () => {
    expect(scrollBy(50, 10, 200)).toBe(60);
  });

  it('clamps to maxOffset', () => {
    expect(scrollBy(190, 20, 200)).toBe(200);
  });

  it('clamps to 0 for negative delta', () => {
    expect(scrollBy(5, -10, 200)).toBe(0);
  });
});

describe('scrollToElement', () => {
  it('returns current offset when element is fully visible', () => {
    // Element at y=20, height=10, viewport=[10, 110)
    expect(scrollToElement(20, 10, 10, 100, 200)).toBe(10);
  });

  it('scrolls up when element is above viewport', () => {
    // Element at y=5, height=10, viewport=[20, 120)
    expect(scrollToElement(5, 10, 20, 100, 200)).toBe(5);
  });

  it('scrolls down when element is below viewport', () => {
    // Element at y=150, height=10, viewport=[0, 100)
    // elBottom=160, need to show at bottom: 160 - 100 = 60
    expect(scrollToElement(150, 10, 0, 100, 200)).toBe(60);
  });

  it('clamps result to maxOffset', () => {
    expect(scrollToElement(300, 10, 0, 100, 200)).toBe(200);
  });

  it('clamps result to 0', () => {
    expect(scrollToElement(0, 5, 10, 100, 200)).toBe(0);
  });
});
