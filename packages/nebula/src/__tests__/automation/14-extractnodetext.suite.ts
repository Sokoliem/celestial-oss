// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { extractNodeText } from '../../automation.js';
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

function rowNode(...children: VNode[]): RowNode {
  return { kind: 'row', children };
}

function columnNode(...children: VNode[]): ColumnNode {
  return { kind: 'column', children };
}

function _boxNode(...children: VNode[]): BoxNode {
  return { kind: 'box', children };
}

function emptyNode(): EmptyNode {
  return { kind: 'empty' };
}

// ─── extractNodeText (exported) ────────────────────────────────────────────────

describe('extractNodeText', () => {
  it('extracts text from a text node', () => {
    expect(extractNodeText(textNode('Hello'))).toBe('Hello');
  });

  it('extracts text from a row of text nodes', () => {
    const row = rowNode(textNode('A'), textNode('B'));
    expect(extractNodeText(row)).toBe('A B');
  });

  it('extracts text from nested structures', () => {
    const col = columnNode(textNode('Line1'), textNode('Line2'));
    expect(extractNodeText(col)).toBe('Line1 Line2');
  });

  it('returns empty string for empty nodes', () => {
    expect(extractNodeText(emptyNode())).toBe('');
  });
});
