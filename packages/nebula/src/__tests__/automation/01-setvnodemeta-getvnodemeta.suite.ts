// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { getVNodeMeta, setVNodeMeta } from '../../automation.js';
import type { BoxNode, Cell, CellGrid, ColumnNode, EmptyNode, FocusNode, RowNode, TextNode, VNode } from '../../vdom.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeCell(char: string): Cell {
  return { char, style: {} };
}

function _makeCellGrid(lines: string[], width?: number): CellGrid {
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

function _emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── setVNodeMeta / getVNodeMeta ────────────────────────────────────────────

describe('setVNodeMeta / getVNodeMeta', () => {
  it('stores and retrieves metadata', () => {
    const node = textNode('Hello');
    setVNodeMeta(node, { testId: 'greeting' });
    const meta = getVNodeMeta(node);
    expect(meta).toBeDefined();
    expect(meta!.testId).toBe('greeting');
  });

  it('returns undefined for nodes without metadata', () => {
    const node = textNode('No meta');
    expect(getVNodeMeta(node)).toBeUndefined();
  });

  it('merges metadata on repeated calls', () => {
    const node = textNode('Merged');
    setVNodeMeta(node, { testId: 'first' });
    setVNodeMeta(node, { a11y: { role: 'button', label: 'Click me' } });
    const meta = getVNodeMeta(node);
    expect(meta!.testId).toBe('first');
    expect(meta!.a11y!.role).toBe('button');
  });
});
