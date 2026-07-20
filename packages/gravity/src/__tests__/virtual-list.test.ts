import type { ColumnNode, ScrollNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { clearVirtualListCache, createScrollController, virtualList } from '../index.js';

function renderComponent(node: VNode): VNode {
  if (node.kind === 'component') {
    return node.render({
      terminal: { cols: 80, rows: 30 },
      available: { cols: 80, rows: 30 },
      container: { cols: 80, rows: 30 },
    });
  }
  return node;
}

function asScroll(node: VNode): ScrollNode {
  expect(node.kind).toBe('scroll');
  return node as ScrollNode;
}

describe('virtualList', () => {
  it('renders only the visible window plus overscan', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    const controller = createScrollController({ viewportHeight: 30 });
    const node = virtualList({
      items,
      estimateSize: 3,
      overscan: 2,
      viewportHeight: 30,
      keyBy: (item) => item,
      renderItem: (item) => ({ kind: 'text', content: item }),
      controller,
    });

    const tree = asScroll(renderComponent(node));
    const col = tree.child as ColumnNode;
    // overscan 2 above + 10 visible (30/3) + 2 below = 14 items, plus a single
    // bottom spacer (no top spacer since startIndex == 0).
    const renderedItems = col.children.filter((c) => c.kind === 'text');
    const spacers = col.children.filter((c) => c.kind === 'empty');
    expect(renderedItems.length).toBeGreaterThanOrEqual(12);
    expect(renderedItems.length).toBeLessThanOrEqual(15);
    expect(spacers.length).toBeGreaterThan(0);
  });

  it('shifts the visible window when offset advances', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    const controller = createScrollController({ viewportHeight: 30 });
    const node = virtualList({
      items,
      estimateSize: 3,
      overscan: 2,
      viewportHeight: 30,
      keyBy: (item) => item,
      renderItem: (item) => ({ kind: 'text', content: item }),
      controller,
    });

    renderComponent(node);
    const initialRange = controller.visibleRange();
    expect(initialRange.startIndex).toBe(0);

    controller.setOffset(300);
    renderComponent(node);
    const afterScroll = controller.visibleRange();
    expect(afterScroll.startIndex).toBeGreaterThan(initialRange.startIndex);
  });

  it('explicit measure(i) populates the cache and refines contentHeight', () => {
    const items = ['a', 'b', 'c'];
    const controller = createScrollController({ viewportHeight: 10 });
    let measureCalls = 0;
    const node = virtualList({
      items,
      estimateSize: 1,
      overscan: 0,
      viewportHeight: 10,
      keyBy: (item) => item,
      measure: (item) => {
        measureCalls++;
        return item === 'b' ? 5 : 1;
      },
      renderItem: (item) => ({ kind: 'text', content: item }),
      controller,
    });

    renderComponent(node);
    const explicit = controller.measure(1);
    expect(explicit).toBe(5);
    expect(measureCalls).toBeGreaterThan(0);
    expect(controller.cache.get('b')).toBe(5);
  });

  it('keyBy stabilizes measurements across reorderings', () => {
    const controller = createScrollController({ viewportHeight: 6 });
    const sizes: Record<string, number> = { x: 2, y: 3, z: 4 };
    let measureCount = 0;
    const buildNode = (items: string[]) =>
      virtualList({
        items,
        estimateSize: 1,
        overscan: 0,
        viewportHeight: 6,
        keyBy: (item) => item,
        measure: (item) => {
          measureCount++;
          return sizes[item] ?? 1;
        },
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
      });

    renderComponent(buildNode(['x', 'y', 'z']));
    expect(controller.cache.get('x')).toBe(2);
    expect(controller.cache.get('y')).toBe(3);

    const callsAfterFirst = measureCount;
    renderComponent(buildNode(['z', 'y', 'x']));
    // No new measure calls — cached values keyed by id, not index
    expect(measureCount).toBe(callsAfterFirst);
    expect(controller.cache.get('x')).toBe(2);
    expect(controller.cache.get('y')).toBe(3);
    expect(controller.cache.get('z')).toBe(4);
  });

  it('clearVirtualListCache empties controller cache', () => {
    const controller = createScrollController({ viewportHeight: 10 });
    controller.cache.set('foo', 7);
    expect(controller.cache.get('foo')).toBe(7);
    clearVirtualListCache(controller);
    expect(controller.cache.get('foo')).toBeUndefined();
  });

  it('accepts a Signal of items via callable form', () => {
    const items = ['a', 'b', 'c'];
    const itemsSignal = (() => items) as () => readonly string[];
    const controller = createScrollController({ viewportHeight: 10 });
    const node = virtualList({
      items: itemsSignal,
      estimateSize: 1,
      viewportHeight: 10,
      renderItem: (item) => ({ kind: 'text', content: item }),
      keyBy: (item) => item,
      controller,
    });
    const tree = asScroll(renderComponent(node));
    const col = tree.child as ColumnNode;
    const text = col.children.filter((c) => c.kind === 'text');
    expect(text).toHaveLength(3);
  });

  describe('snap', () => {
    it('item-snap rounds setOffset to the nearest item boundary', () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const controller = createScrollController({ viewportHeight: 30 });
      const node = virtualList({
        items,
        estimateSize: 4,
        viewportHeight: 30,
        keyBy: (item) => item,
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
        snap: 'item',
      });

      // First render emits snap points at multiples of 4 (estimate).
      renderComponent(node);
      controller.setOffset(13);
      // Nearest item boundary to 13 is 12 (item index 3).
      expect(controller.offset()).toBe(12);
      controller.setOffset(15);
      // Nearest to 15 is 16 (item index 4).
      expect(controller.offset()).toBe(16);
    });

    it('page-snap rounds setOffset to viewport-height multiples', () => {
      const items = Array.from({ length: 200 }, (_, i) => `item-${i}`);
      const controller = createScrollController({ viewportHeight: 30 });
      const node = virtualList({
        items,
        estimateSize: 4,
        viewportHeight: 30,
        keyBy: (item) => item,
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
        snap: 'page',
      });

      renderComponent(node);
      controller.setOffset(35);
      // Page stride = 30; nearest boundary to 35 is 30.
      expect(controller.offset()).toBe(30);
      controller.setOffset(50);
      // Nearest to 50 is 60.
      expect(controller.offset()).toBe(60);
    });

    it('snap is off by default (raw offset preserved)', () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const controller = createScrollController({ viewportHeight: 30 });
      const node = virtualList({
        items,
        estimateSize: 4,
        viewportHeight: 30,
        keyBy: (item) => item,
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
      });

      renderComponent(node);
      controller.setOffset(13);
      expect(controller.offset()).toBe(13);
    });

    it('item-snap respects per-item measured sizes (variable-size path)', () => {
      const items = ['x', 'y', 'z', 'w'];
      const sizes: Record<string, number> = { x: 2, y: 5, z: 3, w: 4 };
      const controller = createScrollController({ viewportHeight: 10 });
      const node = virtualList({
        items,
        estimateSize: 1,
        viewportHeight: 10,
        keyBy: (item) => item,
        measure: (item) => sizes[item] ?? 1,
        renderItem: (item) => ({ kind: 'text', content: item }),
        controller,
        snap: 'item',
      });

      renderComponent(node);
      // Item offsets: x=0, y=2, z=7, w=10
      controller.setOffset(3);
      // Nearest to 3 is 2 (start of y).
      expect(controller.offset()).toBe(2);
      controller.setOffset(8);
      // Nearest to 8 is 7 (start of z).
      expect(controller.offset()).toBe(7);
    });
  });
});
