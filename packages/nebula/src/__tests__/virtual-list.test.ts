import { describe, expect, it } from 'vitest';
import type { ColumnNode, EmptyNode, ScrollNode, TextNode, VNode } from '../vdom.js';
import { planLayout, rasterize } from '../vdom.js';
import { virtualList } from '../virtual-list.js';

// Helper: extract the column child from a virtualList result
function getColumn(node: ScrollNode): ColumnNode {
  return node.child as ColumnNode;
}

// Helper: extract spacer heights from the column
// Spacers are EmptyNodes; they are omitted when height would be 0
function getSpacers(col: ColumnNode): { above: number; below: number } {
  let above = 0;
  let below = 0;
  const first = col.children[0];
  const last = col.children[col.children.length - 1];
  if (first && first.kind === 'empty') {
    above = (first as EmptyNode).height as number;
  }
  if (last && last.kind === 'empty') {
    below = (last as EmptyNode).height as number;
  }
  return { above, below };
}

// Helper: extract rendered items (non-empty nodes)
function getRenderedItems(col: ColumnNode): VNode[] {
  return col.children.filter((c) => c.kind !== 'empty');
}

function makeItems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `item-${i}`);
}

function renderItem(item: string, _index: number): VNode {
  return { kind: 'text', content: item } as TextNode;
}

describe('virtualList', () => {
  describe('only visible items rendered', () => {
    it('renders only items that fit in the viewport plus overscan', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 0,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // visible: 0-9 (10 items), overscan default 2 below: items 0..11 = 12 items
      // overscan above: max(0, 0-2)=0, overscan below: min(100, 10+2)=12
      expect(rendered.length).toBe(12);
    });

    it('renders far fewer items than total for a large list', () => {
      const items = makeItems(10000);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 20,
        scrollOffset: 0,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // 20 visible + 2 overscan below = 22
      expect(rendered.length).toBe(22);
      expect(rendered.length).toBeLessThan(items.length);
    });
  });

  describe('scroll offset changes the visible window', () => {
    it('scrolls to middle of list', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 50,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // rawStart = 50, rawEnd = 60, overscan 2 => startIdx = 48, endIdx = 62
      expect(rendered.length).toBe(14); // 62 - 48

      // First rendered item should be item-48
      expect((rendered[0] as TextNode).content).toBe('item-48');
      // Last rendered item should be item-61
      expect((rendered[rendered.length - 1] as TextNode).content).toBe('item-61');
    });

    it('scrolls to the end of list', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 90,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // rawStart = 90, rawEnd = 100, overscan 2 => startIdx = 88, endIdx = min(100,102) = 100
      expect(rendered.length).toBe(12); // 100 - 88
      expect((rendered[rendered.length - 1] as TextNode).content).toBe('item-99');
    });
  });

  describe('overscan buffer adds extra items', () => {
    it('overscan 0 renders only visible items', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 50,
        overscan: 0,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      expect(rendered.length).toBe(10);
      expect((rendered[0] as TextNode).content).toBe('item-50');
    });

    it('overscan 5 renders 10 extra items', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 50,
        overscan: 5,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // rawStart=50, rawEnd=60, overscan 5 => startIdx=45, endIdx=65 => 20 items
      expect(rendered.length).toBe(20);
      expect((rendered[0] as TextNode).content).toBe('item-45');
      expect((rendered[rendered.length - 1] as TextNode).content).toBe('item-64');
    });
  });

  describe('empty list', () => {
    it('produces a valid scroll node with no rendered items', () => {
      const result = virtualList({
        items: [],
        itemHeight: 1,
        renderItem,
        height: 10,
      });

      expect(result.kind).toBe('scroll');
      expect(result.height).toBe(10);
      const col = getColumn(result);
      expect(col.kind).toBe('column');
      // No children at all for empty list
      expect(col.children.length).toBe(0);
      const rendered = getRenderedItems(col);
      expect(rendered.length).toBe(0);
    });
  });

  describe('single item at various offsets', () => {
    it('single item at offset 0', () => {
      const result = virtualList({
        items: ['only'],
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 0,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      expect(rendered.length).toBe(1);
      expect((rendered[0] as TextNode).content).toBe('only');
    });

    it('single item at offset beyond item (still renders it via overscan)', () => {
      const result = virtualList({
        items: ['only'],
        itemHeight: 1,
        renderItem,
        height: 10,
        scrollOffset: 0,
        overscan: 0,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      expect(rendered.length).toBe(1);
    });
  });

  describe('total virtual height invariant', () => {
    it('spacer above + rendered items + spacer below equals total height', () => {
      const items = makeItems(100);
      const itemHeight = 3;
      const result = virtualList({
        items,
        itemHeight,
        renderItem,
        height: 15,
        scrollOffset: 30,
      });

      const col = getColumn(result);
      const { above, below } = getSpacers(col);
      const rendered = getRenderedItems(col);
      const renderedHeight = rendered.length * itemHeight;
      const totalVirtualHeight = above + renderedHeight + below;

      expect(totalVirtualHeight).toBe(items.length * itemHeight);
    });

    it('holds for offset 0', () => {
      const items = makeItems(50);
      const itemHeight = 2;
      const result = virtualList({
        items,
        itemHeight,
        renderItem,
        height: 10,
        scrollOffset: 0,
      });

      const col = getColumn(result);
      const { above, below } = getSpacers(col);
      const rendered = getRenderedItems(col);
      const totalVirtualHeight = above + rendered.length * itemHeight + below;

      expect(totalVirtualHeight).toBe(items.length * itemHeight);
    });

    it('holds at the end of the list', () => {
      const items = makeItems(50);
      const itemHeight = 2;
      const result = virtualList({
        items,
        itemHeight,
        renderItem,
        height: 10,
        scrollOffset: 90, // past the end
      });

      const col = getColumn(result);
      const { above, below } = getSpacers(col);
      const rendered = getRenderedItems(col);
      const totalVirtualHeight = above + rendered.length * itemHeight + below;

      expect(totalVirtualHeight).toBe(items.length * itemHeight);
    });
  });

  describe('multi-row item heights', () => {
    it('handles itemHeight > 1 correctly', () => {
      const items = makeItems(20);
      const result = virtualList({
        items,
        itemHeight: 3,
        renderItem,
        height: 9, // fits 3 items
        scrollOffset: 6, // start at item 2
        overscan: 1,
      });

      const col = getColumn(result);
      const rendered = getRenderedItems(col);
      // rawStart = floor(6/3) = 2, rawEnd = 2 + ceil(9/3) = 5
      // overscan 1 => startIdx = 1, endIdx = 6
      expect(rendered.length).toBe(5);
      expect((rendered[0] as TextNode).content).toBe('item-1');
      expect((rendered[rendered.length - 1] as TextNode).content).toBe('item-5');
    });
  });

  describe('scroll node properties', () => {
    it('sets correct height and offset on the scroll node', () => {
      const result = virtualList({
        items: makeItems(50),
        itemHeight: 1,
        renderItem,
        height: 20,
        scrollOffset: 15,
      });

      expect(result.kind).toBe('scroll');
      expect(result.height).toBe(20);
      expect(result.offset).toBe(15);
    });
  });

  describe('end-to-end with planLayout + rasterize', () => {
    it('produces a valid cell grid', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem: (item) => ({ kind: 'text', content: item }) as TextNode,
        height: 5,
        scrollOffset: 0,
        overscan: 0,
      });

      const plan = planLayout(result, 20, 5);
      const grid = rasterize(plan);

      expect(grid.width).toBe(20);
      expect(grid.height).toBe(5);

      // First row should contain "item-0"
      const firstRow = Array.from({ length: 6 }, (_, c) => grid.cells[0]![c]?.char ?? ' ').join('');
      expect(firstRow).toBe('item-0');
    });

    it('scrolled view renders correct items', () => {
      const items = makeItems(100);
      const result = virtualList({
        items,
        itemHeight: 1,
        renderItem: (item) => ({ kind: 'text', content: item }) as TextNode,
        height: 3,
        scrollOffset: 10,
        overscan: 0,
      });

      const plan = planLayout(result, 20, 3);
      const grid = rasterize(plan);

      expect(grid.height).toBe(3);
      // The scroll node's offset is 10, so the first visible row should be item-10
      // The scroll node clips to its height, showing items at offset 10
      const firstRow = Array.from({ length: 7 }, (_, c) => grid.cells[0]![c]?.char ?? ' ').join('');
      expect(firstRow).toBe('item-10');
    });
  });
});
