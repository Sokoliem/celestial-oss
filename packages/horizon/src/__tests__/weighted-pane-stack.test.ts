import type { ColumnNode, RowNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { getWeightedPaneStackLayout, weightedPaneStack } from '../weighted-pane-stack.js';

function textNode(content: string): VNode {
  return { kind: 'text', content };
}

describe('getWeightedPaneStackLayout', () => {
  it('distributes equal weights evenly across two panes (no handle would shrink it)', () => {
    // totalSize 11, 1 handle row → 10 rows for panes → 5/5.
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
      ],
      11,
    );
    expect(layout.paneRanges).toHaveLength(2);
    expect(layout.paneRanges[0]).toEqual({ id: 'a', startRow: 0, endRow: 5, size: 5, collapsed: false });
    expect(layout.paneRanges[1]).toEqual({ id: 'b', startRow: 6, endRow: 11, size: 5, collapsed: false });
    expect(layout.resizeHandleRows).toEqual([{ rowIndex: 5, betweenIds: ['a', 'b'] }]);
    expect(layout.usedSize).toBe(11);
  });

  it('honors 70/30 weighting with no clamps', () => {
    // totalSize 11, 1 handle row → 10 for panes → 7/3.
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 0.7 },
        { id: 'b', weight: 0.3 },
      ],
      11,
    );
    expect(layout.paneRanges[0]!.size).toBe(7);
    expect(layout.paneRanges[1]!.size).toBe(3);
  });

  it('zeroes a collapsed pane and donates its weight to siblings', () => {
    // totalSize 11. b is collapsed → 0 handle rows (only 1 visible pane pair,
    // but b is collapsed so a is alone with c, 1 handle). Wait — a, b
    // collapsed, c. a and c are visible → 1 handle between them → 10 for
    // the two visible panes split by their weights.
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1, collapsed: true },
        { id: 'c', weight: 1 },
      ],
      11,
    );
    expect(layout.paneRanges).toHaveLength(3);
    expect(layout.paneRanges[1]!.collapsed).toBe(true);
    expect(layout.paneRanges[1]!.size).toBe(0);
    expect(layout.paneRanges[0]!.size + layout.paneRanges[2]!.size).toBe(10);
    expect(layout.resizeHandleRows).toHaveLength(1);
    expect(layout.resizeHandleRows[0]!.betweenIds).toEqual(['a', 'c']);
  });

  it('respects minSize even when weight would yield less', () => {
    // totalSize 12, 1 handle → 11 for panes. Weights 9:1 would give 9.9/1.1
    // → 10/1; but b has minSize 4, so b freezes at 4 and a gets the remaining
    // 7. Sum 11.
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 9 },
        { id: 'b', weight: 1, minSize: 4 },
      ],
      12,
    );
    expect(layout.paneRanges[1]!.size).toBe(4);
    expect(layout.paneRanges[0]!.size).toBe(7);
    expect(layout.paneRanges[0]!.size + layout.paneRanges[1]!.size).toBe(11);
  });

  it('respects maxSize even when weight would yield more', () => {
    // totalSize 21, 1 handle → 20 for panes. Weights 9:1 would give 18/2;
    // a has maxSize 5, so a freezes at 5 and b gets the remaining 15.
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 9, maxSize: 5 },
        { id: 'b', weight: 1 },
      ],
      21,
    );
    expect(layout.paneRanges[0]!.size).toBe(5);
    expect(layout.paneRanges[1]!.size).toBe(15);
  });

  it('inserts a resize-handle row between every adjacent visible pane', () => {
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 1 },
        { id: 'c', weight: 1 },
        { id: 'd', weight: 1 },
      ],
      20,
    );
    expect(layout.resizeHandleRows).toHaveLength(3);
    expect(layout.resizeHandleRows.map((h) => h.betweenIds)).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    // Ranges and handles together cover [0, usedSize) without gaps or overlap.
    const ranges = layout.paneRanges.filter((r) => r.size > 0);
    for (let i = 1; i < ranges.length; i += 1) {
      const prev = ranges[i - 1]!;
      const handle = layout.resizeHandleRows[i - 1]!;
      expect(handle.rowIndex).toBe(prev.endRow);
      expect(ranges[i]!.startRow).toBe(handle.rowIndex + 1);
    }
  });

  it('falls back to even split when all weights are zero or invalid', () => {
    const layout = getWeightedPaneStackLayout(
      [
        { id: 'a', weight: 0 },
        { id: 'b', weight: Number.NaN },
      ],
      11,
    );
    // 10 rows after the handle, split evenly → 5/5.
    expect(layout.paneRanges[0]!.size).toBe(5);
    expect(layout.paneRanges[1]!.size).toBe(5);
  });

  it('returns empty layout for zero totalSize or empty panes', () => {
    expect(getWeightedPaneStackLayout([], 100)).toEqual({ paneRanges: [], resizeHandleRows: [], usedSize: 0 });
    expect(getWeightedPaneStackLayout([{ id: 'a', weight: 1 }], 0)).toEqual({
      paneRanges: [],
      resizeHandleRows: [],
      usedSize: 0,
    });
  });
});

describe('weightedPaneStack', () => {
  it('renders a column with interleaved handle rows between visible panes', () => {
    const node = weightedPaneStack(
      {
        panes: [
          { id: 'a', weight: 1, view: () => textNode('A') },
          { id: 'b', weight: 1, view: () => textNode('B') },
          { id: 'c', weight: 1, view: () => textNode('C') },
        ],
        totalSize: 12,
      },
      {},
    );
    expect(node.kind).toBe('column');
    const col = node as ColumnNode;
    // 3 flex cells + 2 handle text rows between them = 5 children.
    expect(col.children).toHaveLength(5);
    expect(col.children[1]!.kind).toBe('text');
    expect(col.children[3]!.kind).toBe('text');
  });

  it('renders a row for horizontal direction', () => {
    const node = weightedPaneStack(
      {
        panes: [
          { id: 'a', weight: 1, view: () => textNode('A') },
          { id: 'b', weight: 1, view: () => textNode('B') },
        ],
        totalSize: 11,
        direction: 'horizontal',
      },
      {},
    );
    expect(node.kind).toBe('row');
    const row = node as RowNode;
    expect(row.children).toHaveLength(3); // pane, handle, pane
  });

  it('omits collapsed panes from the rendered tree but keeps them in the layout', () => {
    const node = weightedPaneStack(
      {
        panes: [
          { id: 'a', weight: 1, view: () => textNode('A') },
          { id: 'b', weight: 1, collapsed: true, view: () => textNode('B') },
          { id: 'c', weight: 1, view: () => textNode('C') },
        ],
        totalSize: 11,
      },
      {},
    );
    const col = node as ColumnNode;
    // 2 visible panes + 1 handle between them = 3 children.
    expect(col.children).toHaveLength(3);
  });
});
