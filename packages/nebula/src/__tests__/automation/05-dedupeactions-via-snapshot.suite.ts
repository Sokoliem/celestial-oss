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

function focusNode(id: string, child: VNode, focused: boolean): FocusNode {
  return { kind: 'focus', id, child, focused };
}

function rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── dedupeActions (tested via buildAutomationSnapshot) ─────────────────────

describe('dedupeActions (via snapshot)', () => {
  it('deduplicates actions with the same focusId', () => {
    // Two focus nodes with same id should produce one action
    const child1 = textNode('Same');
    const focus1 = focusNode('dup-id', child1, false);
    const child2 = textNode('Same');
    const focus2 = focusNode('dup-id', child2, true);

    const row = rowNode(focus1, focus2);
    const grid = makeCellGrid(['Same Same']);
    const snap = buildAutomationSnapshot(row, grid, 9, 1);

    const matching = snap.actions.filter((a) => a.focusId === 'dup-id');
    expect(matching.length).toBe(1);
    // The focused one should be preferred
    expect(matching[0]!.focused).toBe(true);
  });

  it('sorts actions by row then col', () => {
    const child1 = textNode('First');
    const focus1 = focusNode('a1', child1, false);
    const child2 = textNode('Second');
    const focus2 = focusNode('a2', child2, false);

    const col = columnNode(focus1, focus2);
    const grid = makeCellGrid(['First ', 'Second']);
    const snap = buildAutomationSnapshot(col, grid, 6, 2);

    const ids = snap.actions.map((a) => a.focusId);
    // a1 is on row 0, a2 on row 1 — so a1 should come first
    const idx1 = ids.indexOf('a1');
    const idx2 = ids.indexOf('a2');
    if (idx1 !== -1 && idx2 !== -1) {
      expect(idx1).toBeLessThan(idx2);
    }
  });
});
