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

function focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function _rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function _columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── findBestTextRun (tested indirectly via snapshot matching) ──────────────

describe('findBestTextRun (via snapshot)', () => {
  it('matches exact text to grid runs', () => {
    const child = textNode('Save');
    setVNodeMeta(child, { a11y: { role: 'button', label: 'Save' } });
    const focus = focusNode('f1', child, false);

    const grid = makeCellGrid(['Save']);
    const snap = buildAutomationSnapshot(focus, grid, 4, 1);

    const element = snap.elements.find((e) => e.a11y?.label === 'Save');
    expect(element).toBeDefined();
    expect(element!.row).toBe(0);
    expect(element!.col).toBe(0);
  });

  it('matches inclusive text (run contains label)', () => {
    const child = textNode('[ Save ]');
    setVNodeMeta(child, { a11y: { role: 'button', label: 'Save' } });
    const focus = focusNode('f1', child, true);

    const grid = makeCellGrid(['[ Save ]']);
    const snap = buildAutomationSnapshot(focus, grid, 8, 1);

    const element = snap.elements.find((e) => e.a11y?.label === 'Save');
    expect(element).toBeDefined();
    // The element should have been matched to a run on the grid
    expect(element!.row).toBe(0);
  });
});
