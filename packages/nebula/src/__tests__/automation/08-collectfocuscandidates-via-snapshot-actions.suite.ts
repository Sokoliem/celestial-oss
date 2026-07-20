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

function rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── collectFocusCandidates (tested via snapshot actions) ───────────────────

describe('collectFocusCandidates (via snapshot actions)', () => {
  it('collects focus nodes as actions', () => {
    const child = textNode('Clickable');
    const focus = focusNode('click-1', child, false);

    const grid = makeCellGrid(['Clickable']);
    const snap = buildAutomationSnapshot(focus, grid, 9, 1);

    expect(snap.actions.some((a) => a.focusId === 'click-1')).toBe(true);
  });

  it('marks focused action correctly', () => {
    const child = textNode('Active');
    const focus = focusNode('active-1', child, true);

    const grid = makeCellGrid(['Active']);
    const snap = buildAutomationSnapshot(focus, grid, 6, 1);

    const action = snap.actions.find((a) => a.focusId === 'active-1');
    expect(action).toBeDefined();
    expect(action!.focused).toBe(true);
  });

  it('collects multiple focus nodes from a row', () => {
    const c1 = textNode('One');
    const c2 = textNode('Two');
    const f1 = focusNode('f-one', c1, false);
    const f2 = focusNode('f-two', c2, false);

    const tree = rowNode(f1, f2);
    const grid = makeCellGrid(['One Two']);
    const snap = buildAutomationSnapshot(tree, grid, 7, 1);

    expect(snap.actions.some((a) => a.focusId === 'f-one')).toBe(true);
    expect(snap.actions.some((a) => a.focusId === 'f-two')).toBe(true);
  });

  it('skips focus nodes with empty text and no testId', () => {
    const child = emptyNode();
    const focus = focusNode('empty-focus', child, false);

    const grid = makeCellGrid(['   '], 3);
    const snap = buildAutomationSnapshot(focus, grid, 3, 1);

    // Empty focus node with no text and no testId should not become an action
    expect(snap.actions.some((a) => a.focusId === 'empty-focus')).toBe(false);
  });

  it('includes focus nodes with testId even if text is empty', () => {
    const child = emptyNode();
    setVNodeMeta(child, { testId: 'empty-with-id' });
    const focus = focusNode('empty-id', child, false);

    const grid = makeCellGrid(['   '], 3);
    const snap = buildAutomationSnapshot(focus, grid, 3, 1);

    expect(snap.actions.some((a) => a.focusId === 'empty-id')).toBe(true);
  });

  it('collects from nested structures', () => {
    const child = textNode('Nested');
    const focus = focusNode('nested-f', child, false);
    const box = boxNode(focus);
    const col = columnNode(box);

    const grid = makeCellGrid(['Nested']);
    const snap = buildAutomationSnapshot(col, grid, 6, 1);

    expect(snap.actions.some((a) => a.focusId === 'nested-f')).toBe(true);
  });
});
