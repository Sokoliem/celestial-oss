// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { buildAutomationSnapshot } from '../../automation.js';
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

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── gridToText (tested indirectly via buildAutomationSnapshot) ─────────────

describe('gridToText (via buildAutomationSnapshot)', () => {
  it('converts grid to text in snapshot', () => {
    const tree = textNode('Hello');
    const grid = makeCellGrid(['Hello', 'World']);
    const snap = buildAutomationSnapshot(tree, grid, 5, 2);
    expect(snap.text).toBe('Hello\nWorld');
  });

  it('trims trailing empty lines', () => {
    const tree = textNode('Hi');
    const grid = makeCellGrid(['Hi   ', '     ', '     '], 5);
    const snap = buildAutomationSnapshot(tree, grid, 5, 3);
    expect(snap.text).toBe('Hi');
  });

  it('trims trailing whitespace on each line', () => {
    const tree = textNode('AB');
    const grid = makeCellGrid(['AB   '], 5);
    const snap = buildAutomationSnapshot(tree, grid, 5, 1);
    expect(snap.text).toBe('AB');
  });

  it('returns empty string for blank grid', () => {
    const tree = emptyNode();
    const grid = makeCellGrid(['   ', '   '], 3);
    const snap = buildAutomationSnapshot(tree, grid, 3, 2);
    expect(snap.text).toBe('');
  });
});
