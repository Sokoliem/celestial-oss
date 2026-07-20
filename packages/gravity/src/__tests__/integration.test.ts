import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flex, flexItem, grid, gridItem, responsive, setTerminalSize } from '../index.js';

/**
 * Integration tests verify that Gravity's layout components compose correctly
 * and produce valid VNode trees that Nebula can consume.
 *
 * Since Nebula's layout() is not part of its public API, we verify the VNode
 * tree structure (kind, children, widths, heights) rather than going through
 * the cell-level layout engine.
 */

/** Recursively render all ComponentNodes in a VNode tree */
function resolveTree(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render());
  }
  if (node.kind === 'row' || node.kind === 'column') {
    return {
      ...node,
      children: node.children.map(resolveTree),
    };
  }
  if (node.kind === 'box') {
    return {
      ...node,
      children: node.children.map(resolveTree),
    };
  }
  return node;
}

describe('integration', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 120, rows: 40 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('flex layout produces valid VNode tree', () => {
    const layout = flex({
      direction: 'row',
      gap: 2,
      children: [flexItem({ kind: 'text', content: 'Sidebar' }, { basis: 30 }), flexItem({ kind: 'text', content: 'Main Content' }, { basis: 30, grow: 1 })],
    });

    const tree = resolveTree(layout);
    expect(tree.kind).toBe('row');

    const rowTree = tree as RowNode;
    expect(rowTree.gap).toBe(2);
    expect(rowTree.children.length).toBe(2);

    // Sidebar stays at 30, Main grows to fill remaining (120 - 2 gap - 30 sidebar = 88)
    const sidebar = rowTree.children[0] as BoxNode;
    const main = rowTree.children[1] as BoxNode;
    expect(sidebar.width).toBe(30);
    expect(main.width).toBe(88);
  });

  it('grid layout produces valid VNode tree', () => {
    const layout = grid({
      cols: 4,
      gap: 2,
      children: [
        gridItem({ kind: 'text', content: 'A' }, { col: 0, row: 0 }),
        gridItem({ kind: 'text', content: 'B' }, { col: 1, row: 0 }),
        gridItem({ kind: 'text', content: 'C' }, { col: 2, row: 0 }),
        gridItem({ kind: 'text', content: 'D' }, { col: 3, row: 0 }),
      ],
    });

    const tree = resolveTree(layout);
    expect(tree.kind).toBe('column');

    const colTree = tree as ColumnNode;
    expect(colTree.children.length).toBe(1); // 1 row

    const row = colTree.children[0] as RowNode;
    expect(row.children.length).toBe(4);

    // colWidth = floor((120 - 2*3) / 4) = floor(114/4) = 28
    for (const child of row.children) {
      expect((child as BoxNode).width).toBe(28);
    }
  });

  it('nested flex layouts compose correctly', () => {
    const innerFlex = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'Left' }, { basis: 10, grow: 1 }), flexItem({ kind: 'text', content: 'Right' }, { basis: 10, grow: 1 })],
    });

    const outerFlex = flex({
      direction: 'column',
      children: [
        flexItem({ kind: 'text', content: 'Header' }, { basis: 3 }),
        flexItem(innerFlex, { basis: 10, grow: 1 }),
        flexItem({ kind: 'text', content: 'Footer' }, { basis: 3 }),
      ],
    });

    const tree = resolveTree(outerFlex);
    expect(tree.kind).toBe('column');

    const colTree = tree as ColumnNode;
    expect(colTree.children.length).toBe(3);

    // Header: basis 3, no grow → stays at 3
    expect((colTree.children[0] as BoxNode).height).toBe(3);
    // Footer: basis 3, no grow → stays at 3
    expect((colTree.children[2] as BoxNode).height).toBe(3);
    // Middle: basis 10 + grows to fill (40 - 3 - 3 = 34)
    expect((colTree.children[1] as BoxNode).height).toBe(34);

    // The middle child contains the inner flex (component)
    const middleBox = colTree.children[1] as BoxNode;
    const innerResolved = resolveTree(middleBox.children[0]!);
    expect(innerResolved.kind).toBe('row');
  });

  it('responsive switches layout when terminal size changes', () => {
    const compactLayout: VNode = { kind: 'text', content: 'compact view' };
    const wideLayout: VNode = { kind: 'text', content: 'wide view' };

    const layout = responsive({
      compact: compactLayout,
      wide: wideLayout,
    });

    // Wide terminal — 'wide' alias maps to 'lg' (min: 120, max: 159)
    setTerminalSize({ cols: 150, rows: 24 });
    expect(layout.render()).toBe(wideLayout);

    // Compact terminal — 'compact' alias maps to 'xs' (max: 39)
    setTerminalSize({ cols: 30, rows: 24 });
    expect(layout.render()).toBe(compactLayout);
  });

  it('flex with responsive direction creates correct tree structure', () => {
    const layout = flex({
      direction: { _tag: 'when-conditional', condition: { _tag: 'when', min: 100 }, ifTrue: 'row' as const, ifFalse: 'column' as const },
      children: [flexItem({ kind: 'text', content: 'A' }, { basis: 20 }), flexItem({ kind: 'text', content: 'B' }, { basis: 20 })],
    });

    // Wide → row
    setTerminalSize({ cols: 120, rows: 24 });
    const wideTree = resolveTree(layout);
    expect(wideTree.kind).toBe('row');

    // Narrow → column
    setTerminalSize({ cols: 60, rows: 24 });
    const narrowTree = resolveTree(layout);
    expect(narrowTree.kind).toBe('column');
  });

  it('grid with colSpan items produces correct widths', () => {
    // 120 cols, 4 cols, gap=4 → colWidth = floor((120 - 4*3) / 4) = floor(108/4) = 27
    const layout = grid({
      cols: 4,
      gap: 4,
      children: [
        gridItem({ kind: 'text', content: 'Header' }, { col: 0, row: 0, colSpan: 4 }),
        gridItem({ kind: 'text', content: 'Sidebar' }, { col: 0, row: 1 }),
        gridItem({ kind: 'text', content: 'Content' }, { col: 1, row: 1, colSpan: 3 }),
      ],
    });

    const tree = resolveTree(layout);
    const colTree = tree as ColumnNode;
    expect(colTree.children.length).toBe(2);

    // Row 0: header spanning 4 cols → 27*4 + 4*3 = 108 + 12 = 120
    const row0 = colTree.children[0] as RowNode;
    const header = row0.children[0] as BoxNode;
    expect(header.width).toBe(27 * 4 + 4 * 3); // 120

    // Row 1: sidebar (27) + content spanning 3 cols (27*3 + 4*2 = 89)
    const row1 = colTree.children[1] as RowNode;
    const sidebar = row1.children[0] as BoxNode;
    expect(sidebar.width).toBe(27);

    const content = row1.children[1] as BoxNode;
    expect(content.width).toBe(27 * 3 + 4 * 2); // 89
  });
});
