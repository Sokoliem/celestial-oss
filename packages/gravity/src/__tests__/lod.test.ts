import type { ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import type { LodLevels } from '../lod.js';
import { autoZoom, lod, zoom, zoomGrid } from '../lod.js';

/** Helper to create a simple set of LOD levels */
function makeLevels(id: string): LodLevels {
  return {
    compact: () => ({ kind: 'text', content: `${id}-compact` }) as VNode,
    summary: () => ({ kind: 'text', content: `${id}-summary` }) as VNode,
    detail: () => ({ kind: 'text', content: `${id}-detail` }) as VNode,
  };
}

describe('lod', () => {
  it('creates a node with correct id and levels', () => {
    const levels = makeLevels('widget');
    const node = lod('widget', levels);

    expect(node.kind).toBe('lod');
    expect(node.id).toBe('widget');
    expect(node.levels).toBe(levels);
  });

  it('node.at(0) returns compact view', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(0);

    expect(result).toEqual({ kind: 'text', content: 'w-compact' });
  });

  it('node.at(1) returns summary view', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(1);

    expect(result).toEqual({ kind: 'text', content: 'w-summary' });
  });

  it('node.at(2) returns detail view', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(2);

    expect(result).toEqual({ kind: 'text', content: 'w-detail' });
  });

  it('node.at(-1) clamps to compact', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(-1);

    expect(result).toEqual({ kind: 'text', content: 'w-compact' });
  });

  it('node.at(5) clamps to detail', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(5);

    expect(result).toEqual({ kind: 'text', content: 'w-detail' });
  });

  it('node.at(0.5) rounds to nearest (1 = summary)', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(0.5);

    expect(result).toEqual({ kind: 'text', content: 'w-summary' });
  });

  it('node.at(0.4) rounds to nearest (0 = compact)', () => {
    const node = lod('w', makeLevels('w'));
    const result = node.at(0.4);

    expect(result).toEqual({ kind: 'text', content: 'w-compact' });
  });

  it('config-style lod semantic levels map to ordered thresholds', () => {
    const node = lod({
      data: { label: 'CPU' },
      levels: [
        { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:compact` }) },
        { minWidth: 12, render: ({ label }) => ({ kind: 'text', content: `${label}:summary` }) },
        { minWidth: 80, render: ({ label }) => ({ kind: 'text', content: `${label}:detail` }) },
      ],
    });

    expect(node.at(0)).toEqual({ kind: 'text', content: 'CPU:compact' });
    expect(node.at(1)).toEqual({ kind: 'text', content: 'CPU:summary' });
    expect(node.at(2)).toEqual({ kind: 'text', content: 'CPU:detail' });
  });

  it('config-style lod exposes atWidth and sorts width rules', () => {
    const node = lod({
      data: { label: 'CPU' },
      levels: [
        { minWidth: 80, render: ({ label }) => ({ kind: 'text', content: `${label}:detail` }) },
        { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:compact` }) },
        { minWidth: 20, render: ({ label }) => ({ kind: 'text', content: `${label}:summary` }) },
      ],
    });

    expect(node.atWidth(10)).toEqual({ kind: 'text', content: 'CPU:compact' });
    expect(node.atWidth(40)).toEqual({ kind: 'text', content: 'CPU:summary' });
    expect(node.atWidth(120)).toEqual({ kind: 'text', content: 'CPU:detail' });
  });

  it('rejects config-style lod with no levels', () => {
    expect(() => lod({ data: { label: 'CPU' }, levels: [] })).toThrow(/at least one/i);
  });
});

describe('zoom', () => {
  it('resolves all nodes at given level', () => {
    const a = lod('a', makeLevels('a'));
    const b = lod('b', makeLevels('b'));

    const result = zoom(1, [a, b]);

    // Should be a column containing the summary views
    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    expect(col.children).toHaveLength(2);
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-summary' });
    expect(col.children[1]).toEqual({ kind: 'text', content: 'b-summary' });
  });

  it('returns a column of resolved VNodes', () => {
    const a = lod('a', makeLevels('a'));
    const result = zoom(2, [a]);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    expect(col.children).toHaveLength(1);
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-detail' });
  });

  it('with empty array returns empty column', () => {
    const result = zoom(1, []);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    expect(col.children).toHaveLength(0);
  });

  it('with fractional level rounds to nearest', () => {
    const a = lod('a', makeLevels('a'));
    const result = zoom(1.6, [a]);

    const col = result as ColumnNode;
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-detail' });
  });
});

describe('autoZoom', () => {
  it('with width 30 selects compact', () => {
    const a = lod('a', makeLevels('a'));
    const result = autoZoom(30, [a]);

    const col = result as ColumnNode;
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-compact' });
  });

  it('with width 50 selects summary', () => {
    const a = lod('a', makeLevels('a'));
    const result = autoZoom(50, [a]);

    const col = result as ColumnNode;
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-summary' });
  });

  it('with width 100 selects detail', () => {
    const a = lod('a', makeLevels('a'));
    const result = autoZoom(100, [a]);

    const col = result as ColumnNode;
    expect(col.children[0]).toEqual({ kind: 'text', content: 'a-detail' });
  });

  it('with custom thresholds', () => {
    const a = lod('a', makeLevels('a'));

    // Custom: summary at 20, detail at 60
    const compactResult = autoZoom(15, [a], { summary: 20, detail: 60 });
    const summaryResult = autoZoom(40, [a], { summary: 20, detail: 60 });
    const detailResult = autoZoom(80, [a], { summary: 20, detail: 60 });

    expect((compactResult as ColumnNode).children[0]).toEqual({ kind: 'text', content: 'a-compact' });
    expect((summaryResult as ColumnNode).children[0]).toEqual({ kind: 'text', content: 'a-summary' });
    expect((detailResult as ColumnNode).children[0]).toEqual({ kind: 'text', content: 'a-detail' });
  });

  it('at exact threshold boundary selects higher level', () => {
    const a = lod('a', makeLevels('a'));

    // At exactly 40 (summary threshold) should select summary
    const atSummary = autoZoom(40, [a]);
    expect((atSummary as ColumnNode).children[0]).toEqual({ kind: 'text', content: 'a-summary' });

    // At exactly 80 (detail threshold) should select detail
    const atDetail = autoZoom(80, [a]);
    expect((atDetail as ColumnNode).children[0]).toEqual({ kind: 'text', content: 'a-detail' });
  });

  it('config-style lod uses actual minWidth thresholds for object autoZoom', () => {
    const node = lod({
      data: { label: 'CPU' },
      levels: [
        { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:compact` }) },
        { minWidth: 50, render: ({ label }) => ({ kind: 'text', content: `${label}:summary` }) },
        { minWidth: 100, render: ({ label }) => ({ kind: 'text', content: `${label}:detail` }) },
      ],
    });

    expect(autoZoom({ content: node, targetWidth: 40 })).toEqual({ kind: 'text', content: 'CPU:compact' });
    expect(autoZoom({ content: node, targetWidth: 60 })).toEqual({ kind: 'text', content: 'CPU:summary' });
    expect(autoZoom({ content: node, targetWidth: 120 })).toEqual({ kind: 'text', content: 'CPU:detail' });
  });

  it('config-style autoZoom applies width thresholds to every node in object form', () => {
    const nodes = [
      lod({
        data: { label: 'CPU' },
        levels: [
          { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:compact` }) },
          { minWidth: 70, render: ({ label }) => ({ kind: 'text', content: `${label}:summary` }) },
          { minWidth: 110, render: ({ label }) => ({ kind: 'text', content: `${label}:detail` }) },
        ],
      }),
      lod({
        data: { label: 'RAM' },
        levels: [
          { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:compact` }) },
          { minWidth: 70, render: ({ label }) => ({ kind: 'text', content: `${label}:summary` }) },
          { minWidth: 110, render: ({ label }) => ({ kind: 'text', content: `${label}:detail` }) },
        ],
      }),
    ];

    expect(autoZoom({ content: nodes, targetWidth: 60 })).toEqual({
      kind: 'column',
      children: [
        { kind: 'text', content: 'CPU:compact' },
        { kind: 'text', content: 'RAM:compact' },
      ],
    });
  });
});

describe('zoomGrid', () => {
  it('at level 0 produces 4-column layout', () => {
    const nodes = Array.from({ length: 4 }, (_, i) => lod(`n${i}`, makeLevels(`n${i}`)));
    const result = zoomGrid(0, nodes);

    // Should be a column of rows, each row having up to 4 items
    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    // 4 nodes / 4 cols = 1 row
    expect(col.children).toHaveLength(1);
    expect(col.children[0]!.kind).toBe('row');
    const row0 = col.children[0] as RowNode;
    expect(row0.children).toHaveLength(4);
  });

  it('at level 1 produces 2-column layout', () => {
    const nodes = Array.from({ length: 4 }, (_, i) => lod(`n${i}`, makeLevels(`n${i}`)));
    const result = zoomGrid(1, nodes);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    // 4 nodes / 2 cols = 2 rows
    expect(col.children).toHaveLength(2);
    for (const child of col.children) {
      expect(child.kind).toBe('row');
      expect((child as RowNode).children).toHaveLength(2);
    }
  });

  it('at level 2 produces 1-column layout', () => {
    const nodes = Array.from({ length: 3 }, (_, i) => lod(`n${i}`, makeLevels(`n${i}`)));
    const result = zoomGrid(2, nodes);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    // 3 nodes / 1 col = 3 rows, each with 1 item
    expect(col.children).toHaveLength(3);
    for (const child of col.children) {
      expect(child.kind).toBe('row');
      expect((child as RowNode).children).toHaveLength(1);
    }
  });

  it('with custom cols overrides default', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => lod(`n${i}`, makeLevels(`n${i}`)));
    const result = zoomGrid(0, nodes, 3);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    // 6 nodes / 3 cols = 2 rows
    expect(col.children).toHaveLength(2);
    for (const child of col.children) {
      expect(child.kind).toBe('row');
      expect((child as RowNode).children).toHaveLength(3);
    }
  });

  it('handles uneven distribution (last row partial)', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => lod(`n${i}`, makeLevels(`n${i}`)));
    const result = zoomGrid(0, nodes); // 4 cols default

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    // 5 nodes / 4 cols = 2 rows (4 + 1)
    expect(col.children).toHaveLength(2);
    expect((col.children[0] as RowNode).children).toHaveLength(4);
    expect((col.children[1] as RowNode).children).toHaveLength(1);
  });

  it('resolves nodes at the correct level', () => {
    const nodes = [lod('a', makeLevels('a')), lod('b', makeLevels('b'))];
    const result = zoomGrid(1, nodes);

    const col = result as ColumnNode;
    const row0 = col.children[0] as RowNode;
    // Level 1 = summary
    expect(row0.children[0]).toEqual({ kind: 'text', content: 'a-summary' });
    expect(row0.children[1]).toEqual({ kind: 'text', content: 'b-summary' });
  });

  it('with empty array returns empty column', () => {
    const result = zoomGrid(0, []);

    expect(result.kind).toBe('column');
    const col = result as ColumnNode;
    expect(col.children).toHaveLength(0);
  });

  it('rejects non-positive custom column counts', () => {
    expect(() => zoomGrid(0, [lod('a', makeLevels('a'))], 0)).toThrow(/positive/i);
    expect(() => zoomGrid(0, [lod('a', makeLevels('a'))], -1)).toThrow(/positive/i);
    expect(() => zoomGrid(0, [lod('a', makeLevels('a'))], 1.5)).toThrow(/positive integer/i);
    expect(() => zoomGrid(0, [lod('a', makeLevels('a'))], Number.NaN)).toThrow(/positive integer/i);
  });
});
