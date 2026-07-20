import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeGrid } from '../grid.js';
import { grid, gridItem, setTerminalSize } from '../index.js';

describe('grid', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 120, rows: 24 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('gridItem creates GridChild with position', () => {
    const node: VNode = { kind: 'text', content: 'cell' };
    const child = gridItem(node, { col: 1, row: 2 });

    expect(child.node).toBe(node);
    expect(child.options.col).toBe(1);
    expect(child.options.row).toBe(2);
  });

  it('gridItem uses default colSpan of undefined', () => {
    const node: VNode = { kind: 'text', content: 'cell' };
    const child = gridItem(node, { col: 0, row: 0 });

    expect(child.options.colSpan).toBeUndefined();
  });

  it('grid returns ComponentNode', () => {
    const result = grid({
      cols: 3,
      children: [gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 })],
    });

    expect(result.kind).toBe('component');
    expect(typeof result.render).toBe('function');
  });

  it('grid ComponentNode render() returns ColumnNode of RowNodes', () => {
    const result = grid({
      cols: 3,
      children: [
        gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'b' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'c' }, { col: 0, row: 1 }),
      ],
    });

    const rendered = result.render() as ColumnNode;
    expect(rendered.kind).toBe('column');

    // Should have 2 rows
    expect(rendered.children.length).toBe(2);

    for (const rowNode of rendered.children) {
      expect(rowNode.kind).toBe('row');
    }
  });

  it('grid with 3 cols creates equal-width columns', () => {
    // 120 cols / 3 = 40 each (no gap)
    const result = grid({
      cols: 3,
      children: [
        gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'b' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'c' }, { col: 2, row: 0 }),
      ],
    });

    const rendered = result.render() as ColumnNode;
    const rowNode = rendered.children[0] as RowNode;

    for (const child of rowNode.children) {
      expect((child as BoxNode).width).toBe(40);
    }
  });

  it('grid supports minmax track sizing in column templates', () => {
    setTerminalSize({ cols: 60, rows: 24 });

    const result = grid({
      columns: 'minmax(10, 1fr) 2fr',
      children: [gridItem({ kind: 'text', content: 'left' }, { col: 0, row: 0 }), gridItem({ kind: 'text', content: 'right' }, { col: 1, row: 0 })],
    });

    const row = ((result.render() as ColumnNode).children[0] as RowNode).children as BoxNode[];
    expect(row[0]?.width).toBe(27);
    expect(row[1]?.width).toBe(33);
    expect(row.reduce((sum, cell) => sum + (cell.width as number), 0)).toBe(60);
  });

  it('grid places items at correct col/row positions', () => {
    const result = grid({
      cols: 3,
      children: [
        gridItem({ kind: 'text', content: 'top-left' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'top-right' }, { col: 2, row: 0 }),
        gridItem({ kind: 'text', content: 'bottom-middle' }, { col: 1, row: 1 }),
      ],
    });

    const rendered = result.render() as ColumnNode;

    // Row 0: should have items at col 0 and col 2 (with empty spacer at col 1)
    const row0 = rendered.children[0] as RowNode;
    expect(row0.children.length).toBe(3); // all 3 columns filled

    // First item (col 0) should contain 'top-left'
    const cell00 = row0.children[0] as BoxNode;
    expect(cell00.children[0]).toEqual({ kind: 'text', content: 'top-left' });

    // Third item (col 2) should contain 'top-right'
    const cell02 = row0.children[2] as BoxNode;
    expect(cell02.children[0]).toEqual({ kind: 'text', content: 'top-right' });

    // Row 1: should have item at col 1
    const row1 = rendered.children[1] as RowNode;
    const cell11 = row1.children[1] as BoxNode;
    expect(cell11.children[0]).toEqual({ kind: 'text', content: 'bottom-middle' });
  });

  it('grid handles colSpan (wider BoxNode)', () => {
    // 120 cols / 3 = 40 each, colSpan=2 → 80
    const result = grid({
      cols: 3,
      children: [
        gridItem({ kind: 'text', content: 'wide' }, { col: 0, row: 0, colSpan: 2 }),
        gridItem({ kind: 'text', content: 'normal' }, { col: 2, row: 0 }),
      ],
    });

    const rendered = result.render() as ColumnNode;
    const row0 = rendered.children[0] as RowNode;

    // First child spans 2 columns: 40*2 = 80 (no gap)
    const wideCell = row0.children[0] as BoxNode;
    expect(wideCell.width).toBe(80);
    expect(wideCell.children[0]).toEqual({ kind: 'text', content: 'wide' });

    // Second child is normal: 40
    const normalCell = row0.children[1] as BoxNode;
    expect(normalCell.width).toBe(40);
  });

  it('grid applies gap between cells', () => {
    // 120 cols, 3 cols, gap=6 → colGap=6
    // colWidth = floor((120 - 6*2) / 3) = floor(108/3) = 36
    const result = grid({
      cols: 3,
      gap: 6,
      children: [
        gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'b' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'c' }, { col: 0, row: 1 }),
      ],
    });

    const rendered = result.render() as ColumnNode;

    // Column gap should be set on row nodes
    const row0 = rendered.children[0] as RowNode;
    expect(row0.gap).toBe(6);

    // Row gap should be set on the outer column
    expect(rendered.gap).toBe(6);

    // Each cell should have reduced width
    const cellWidth = (row0.children[0] as BoxNode).width;
    expect(cellWidth).toBe(36);
  });

  it('grid with tuple gap uses separate row and col gaps', () => {
    // gap: [4, 8] → rowGap=4, colGap=8
    // The 104 available cells are apportioned without dropping the remainder.
    const result = grid({
      cols: 3,
      gap: [4, 8],
      children: [gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 }), gridItem({ kind: 'text', content: 'b' }, { col: 0, row: 1 })],
    });

    const rendered = result.render() as ColumnNode;

    // Row gap = 4
    expect(rendered.gap).toBe(4);

    // Col gap = 8
    const row0 = rendered.children[0] as RowNode;
    expect(row0.gap).toBe(8);

    expect((row0.children[0] as BoxNode).width).toBe(35);
  });

  it('grid returns empty node when no children', () => {
    const result = grid({
      cols: 3,
      children: [],
    });

    const rendered = result.render();
    expect(rendered.kind).toBe('empty');
  });

  it('grid applies rowSpan height across configured rows', () => {
    setTerminalSize({ cols: 120, rows: 24 });

    const result = grid({
      cols: 2,
      rows: 3,
      gap: [2, 0],
      children: [
        gridItem({ kind: 'text', content: 'hero' }, { col: 0, row: 0, rowSpan: 2 }),
        gridItem({ kind: 'text', content: 'top' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'bottom' }, { col: 1, row: 1 }),
      ],
    });

    const rendered = result.render() as ColumnNode;
    const row0 = rendered.children[0] as RowNode;
    const hero = row0.children[0] as BoxNode;
    expect(hero.height).toBe(16);
  });

  it('named areas resolve vertical spans and explicit row heights', () => {
    setTerminalSize({ cols: 120, rows: 20 });

    const result = grid({
      columns: '1fr 2fr',
      rows: '1fr 2fr',
      gap: { row: 1, col: 2 },
      areas: ['hero sidebar', 'hero sidebar'],
      children: [gridItem({ area: 'hero' }, { kind: 'text', content: 'Hero' }), gridItem({ area: 'sidebar' }, { kind: 'text', content: 'Sidebar' })],
    });

    const rendered = result.render() as ColumnNode;
    const hero = (rendered.children[0] as RowNode).children[0] as BoxNode;
    expect(hero.width).toBe(39);
    expect(hero.height).toBe(20);
  });

  it('consumes every available cell and reflows from the render context', () => {
    const result = grid({
      cols: 3,
      gap: 1,
      children: [
        gridItem({ kind: 'text', content: 'a' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'b' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'c' }, { col: 2, row: 0 }),
      ],
    });

    const renderAt = (cols: number): number[] => {
      const context = { terminal: { cols, rows: 4 }, available: { cols, rows: 4 }, container: { cols, rows: 4 } };
      const row = (result.render(context) as ColumnNode).children[0] as RowNode;
      return row.children.map((child) => (child as BoxNode).width as number);
    };

    expect(renderAt(10)).toEqual([3, 3, 2]);
    expect(renderAt(7)).toEqual([2, 2, 1]);
  });

  it('grid resolves named line placements', () => {
    setTerminalSize({ cols: 60, rows: 12 });

    const result = grid({
      columns: '[sidebar-start] 1fr [sidebar-end content-start] 2fr [content-end]',
      children: [gridItem({ kind: 'text', content: 'content' }, { column: ['content-start', 'content-end'], row: 0 })],
    });

    const row = (result.render() as ColumnNode).children[0] as RowNode;
    expect((row.children[0] as BoxNode).children[0]).toEqual({ kind: 'empty' });
    expect((row.children[1] as BoxNode).width).toBe(40);
    expect((row.children[1] as BoxNode).children[0]).toEqual({ kind: 'text', content: 'content' });
  });

  it('grid wraps layouts in a scroll box when overflow is configured', () => {
    setTerminalSize({ cols: 30, rows: 6 });

    const result = grid({
      cols: 2,
      overflow: 'scroll',
      scrollOffset: 1,
      children: [gridItem({ kind: 'text', content: 'left' }, { col: 0, row: 0 }), gridItem({ kind: 'text', content: 'right' }, { col: 1, row: 0 })],
    });

    const rendered = result.render() as BoxNode;
    expect(rendered.kind).toBe('box');
    expect(rendered.overflow).toBe('scroll');
    expect(rendered.scrollOffset).toBe(1);
    expect(rendered.width).toBe(30);
    expect(rendered.height).toBe(6);
    expect(rendered.children[0]).toMatchObject({ kind: 'column' });
  });

  it('analyzeGrid reports overlaps and invalid areas', () => {
    const diagnostics = analyzeGrid({
      cols: 2,
      rows: 2,
      areas: ['a .', '. a'],
      children: [gridItem({ kind: 'text', content: 'left' }, { col: 0, row: 0, rowSpan: 2 }), gridItem({ kind: 'text', content: 'right' }, { col: 0, row: 1 })],
    });

    expect(diagnostics.issues.some((issue) => issue.code === 'invalid-area')).toBe(true);
    expect(diagnostics.issues.some((issue) => issue.code === 'overlap')).toBe(true);
  });

  it('analyzeGrid accepts string[] rows of mixed widths (parseAreaRows regression)', () => {
    // The previous implementation only checked Array.isArray(areas[0]) which
    // misclassifies the first row as a tokenized array when it is a single
    // string. This case asserts a 2-D string[] shape parses cleanly without
    // throwing or mis-tokenizing.
    const diagnostics = analyzeGrid({
      cols: 3,
      rows: 2,
      areas: [
        ['header', 'header', 'header'],
        ['rail', 'main', 'side'],
      ],
      children: [
        gridItem({ kind: 'text', content: 'h' }, { area: 'header' }),
        gridItem({ kind: 'text', content: 'r' }, { area: 'rail' }),
        gridItem({ kind: 'text', content: 'm' }, { area: 'main' }),
        gridItem({ kind: 'text', content: 's' }, { area: 'side' }),
      ],
    });

    expect(diagnostics.issues.filter((issue) => issue.code === 'invalid-area')).toHaveLength(0);
    expect(diagnostics.issues.filter((issue) => issue.code === 'unknown-area')).toHaveLength(0);
  });

  it('analyzeGrid emits unknown-area when a child references an area not in the template', () => {
    const diagnostics = analyzeGrid({
      cols: 2,
      areas: ['header header', 'main side'],
      children: [gridItem({ kind: 'text', content: 'h' }, { area: 'header' }), gridItem({ kind: 'text', content: 'orphan' }, { area: 'ghost' })],
    });

    const unknown = diagnostics.issues.filter((issue) => issue.code === 'unknown-area');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.message).toContain('ghost');
  });

  it('analyzeGrid emits area-unused when the template declares an area no child claims', () => {
    const diagnostics = analyzeGrid({
      cols: 2,
      areas: ['header header', 'main side'],
      children: [
        gridItem({ kind: 'text', content: 'h' }, { area: 'header' }),
        gridItem({ kind: 'text', content: 'm' }, { area: 'main' }),
        // 'side' is declared but never referenced by a child.
      ],
    });

    const unused = diagnostics.issues.filter((issue) => issue.code === 'area-unused');
    expect(unused).toHaveLength(1);
    expect(unused[0]?.message).toContain('side');
  });
});
