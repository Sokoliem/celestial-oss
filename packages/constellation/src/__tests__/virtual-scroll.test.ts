import { describe, expect, it } from 'vitest';
import { createVirtualScrollState, getVisibleRange, scrollToIndex, virtualScrollUpdate } from '../virtual-scroll.js';

describe('virtualScroll numeric hardening', () => {
  const items = Array.from({ length: 100 }, (_, index) => index);

  it('normalizes non-finite geometry and offsets', () => {
    const config = { items, viewportHeight: Number.POSITIVE_INFINITY, rowHeight: Number.NaN, overscan: Number.NEGATIVE_INFINITY };
    const state = createVirtualScrollState(config);
    expect(state).toEqual({ scrollOffset: 0, totalHeight: 100 });
    expect(getVisibleRange({ scrollOffset: Number.NaN, totalHeight: Number.POSITIVE_INFINITY }, config)).toEqual({
      startIndex: 0,
      endIndex: 3,
      offsetAbove: 0,
      offsetBelow: 96,
    });
  });

  it('clamps malformed messages and stale external state', () => {
    const config = { items, viewportHeight: 10, rowHeight: 2, overscan: 0 };
    const stale = { scrollOffset: Number.POSITIVE_INFINITY, totalHeight: Number.NaN };
    expect(virtualScrollUpdate({ type: 'vscroll-to', index: Number.NaN }, stale, config)).toEqual({ totalHeight: 200, scrollOffset: 0 });
    expect(virtualScrollUpdate({ type: 'vscroll-down', amount: Number.POSITIVE_INFINITY }, stale, config)).toEqual({
      totalHeight: 200,
      scrollOffset: 190,
    });
  });

  it('keeps empty collections stable', () => {
    const config = { items: [] as number[], viewportHeight: -10, rowHeight: 0 };
    const state = { scrollOffset: 50, totalHeight: 999 };
    expect(getVisibleRange(state, config)).toEqual({ startIndex: 0, endIndex: -1, offsetAbove: 0, offsetBelow: 0 });
    expect(scrollToIndex(config, state, Number.POSITIVE_INFINITY)).toEqual({ totalHeight: 0, scrollOffset: 0 });
  });
});
