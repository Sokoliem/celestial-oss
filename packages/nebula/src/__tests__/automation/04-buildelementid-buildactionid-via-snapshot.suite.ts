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

// ─── buildElementId / buildActionId (tested via buildAutomationSnapshot) ────

describe('buildElementId / buildActionId (via snapshot)', () => {
  it('uses testId when available', () => {
    const child = textNode('Submit');
    const focus = focusNode('f1', child, true);
    setVNodeMeta(child, { testId: 'submit-btn', a11y: { role: 'button', label: 'Submit' } });

    const grid = makeCellGrid(['Submit']);
    const snap = buildAutomationSnapshot(focus, grid, 6, 1);

    const element = snap.elements.find((e) => e.testId === 'submit-btn');
    expect(element).toBeDefined();
    expect(element!.id).toBe('testId:submit-btn');
  });

  it('falls back to role:label when no testId', () => {
    const child = textNode('OK');
    const focus = focusNode('f1', child, false);
    setVNodeMeta(child, { a11y: { role: 'button', label: 'OK' } });

    const grid = makeCellGrid(['OK']);
    const snap = buildAutomationSnapshot(focus, grid, 2, 1);

    const element = snap.elements.find((e) => e.a11y?.role === 'button');
    expect(element).toBeDefined();
    expect(element!.id).toBe('role:button:OK');
  });

  it('uses focusId for action ids', () => {
    const child = textNode('Click');
    const focus = focusNode('action-1', child, true);

    const grid = makeCellGrid(['Click']);
    const snap = buildAutomationSnapshot(focus, grid, 5, 1);

    const action = snap.actions.find((a) => a.focusId === 'action-1');
    expect(action).toBeDefined();
    expect(action!.id).toBe('focus:action-1');
  });
});
