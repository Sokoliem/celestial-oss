// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildAutomationSnapshot, setVNodeMeta } from '../../automation.js';
import type { BoxNode, Cell, CellGrid, ColumnNode, EmptyNode, FocusNode, RowNode, TextNode, VNode } from '../../vdom.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeCell(char: string): Cell {
  return { char, style: {} };
}

function makeCellGrid(lines: string[], width?: number): CellGrid {
  const maxWidth = width ?? Math.max(...lines.map((l) => l.length), 1);
  const cells: Cell[][] = lines.map((line) => {
    const row: Cell[] = [];
    for (let i = 0; i < maxWidth; i++) {
      row.push(makeCell(line[i] ?? ' '));
    }
    return row;
  });
  return { cells, width: maxWidth, height: lines.length };
}

function textNode(content: string): TextNode {
  return { kind: 'text', content };
}

function _focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function _rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function _columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── collectAnnotatedNodes (tested via buildAutomationSnapshot) ─────────────

describe('collectAnnotatedNodes (via snapshot elements)', () => {
  it('collects nodes with testId', () => {
    const child = textNode('Labeled');
    setVNodeMeta(child, { testId: 'my-element' });

    const grid = makeCellGrid(['Labeled']);
    const snap = buildAutomationSnapshot(child, grid, 7, 1);

    expect(snap.elements.some((e) => e.testId === 'my-element')).toBe(true);
  });

  it('collects nodes with a11y attrs', () => {
    const child = textNode('Navigation');
    setVNodeMeta(child, { a11y: { role: 'navigation', label: 'Main Nav' } });

    const grid = makeCellGrid(['Navigation']);
    const snap = buildAutomationSnapshot(child, grid, 10, 1);

    expect(snap.elements.some((e) => e.role === 'navigation')).toBe(true);
  });

  it('excludes hidden elements', () => {
    const child = textNode('Hidden');
    setVNodeMeta(child, { testId: 'hidden-el', a11y: { hidden: true } });

    const grid = makeCellGrid(['Hidden']);
    const snap = buildAutomationSnapshot(child, grid, 6, 1);

    expect(snap.elements.some((e) => e.testId === 'hidden-el')).toBe(false);
  });

  it('collects from nested children', () => {
    const inner = textNode('Deep');
    setVNodeMeta(inner, { testId: 'deep-node' });
    const box = boxNode(inner);

    const grid = makeCellGrid(['Deep']);
    const snap = buildAutomationSnapshot(box, grid, 4, 1);

    expect(snap.elements.some((e) => e.testId === 'deep-node')).toBe(true);
  });

  it('collects from component nodes', () => {
    const inner = textNode('Rendered');
    setVNodeMeta(inner, { testId: 'from-component' });
    const comp: VNode = { kind: 'component', render: () => inner };

    const grid = makeCellGrid(['Rendered']);
    const snap = buildAutomationSnapshot(comp, grid, 8, 1);

    expect(snap.elements.some((e) => e.testId === 'from-component')).toBe(true);
  });
});
