// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { extractAutomationTextRuns } from '../../automation.js';
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

function _textNode(content: string): TextNode {
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

// ─── extractAutomationTextRuns ──────────────────────────────────────────────

describe('extractAutomationTextRuns', () => {
  it('extracts text runs from a single-line grid', () => {
    const grid = makeCellGrid(['Hello World']);
    const runs = extractAutomationTextRuns(grid);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    const allText = runs.map((r) => r.text).join(' ');
    expect(allText).toContain('Hello');
  });

  it('returns empty for empty grid', () => {
    const grid: CellGrid = { cells: [], width: 0, height: 0 };
    const runs = extractAutomationTextRuns(grid);
    expect(runs).toEqual([]);
  });

  it('returns empty for whitespace-only grid', () => {
    const grid = makeCellGrid(['     ', '     ']);
    const runs = extractAutomationTextRuns(grid);
    expect(runs).toEqual([]);
  });

  it('extracts text from multiple rows', () => {
    const grid = makeCellGrid(['First Row', 'Second Row']);
    const runs = extractAutomationTextRuns(grid);
    const texts = runs.map((r) => r.text);
    expect(texts).toContain('First Row');
    expect(texts).toContain('Second Row');
  });

  it('trims trailing whitespace from runs', () => {
    const grid = makeCellGrid(['Text   '], 7);
    const runs = extractAutomationTextRuns(grid);
    expect(runs.length).toBe(1);
    expect(runs[0]!.text).toBe('Text');
  });

  it('captures correct row and col positions', () => {
    const grid = makeCellGrid(['  Hello'], 7);
    const runs = extractAutomationTextRuns(grid);
    expect(runs.length).toBe(1);
    expect(runs[0]!.row).toBe(0);
    expect(runs[0]!.col).toBe(2);
    expect(runs[0]!.width).toBe(5);
    expect(runs[0]!.height).toBe(1);
  });

  it('handles rows with no cells gracefully', () => {
    const grid: CellGrid = {
      cells: [undefined as unknown as Cell[]],
      width: 5,
      height: 1,
    };
    const runs = extractAutomationTextRuns(grid);
    expect(runs).toEqual([]);
  });

  it('handles cells with undefined entries', () => {
    const cells: Cell[][] = [[undefined as unknown as Cell, makeCell('A'), makeCell('B')]];
    const grid: CellGrid = { cells, width: 3, height: 1 };
    const runs = extractAutomationTextRuns(grid);
    // The undefined cell becomes ' ', so AB starts at col 1
    expect(runs.length).toBe(1);
    expect(runs[0]!.text).toBe('AB');
    expect(runs[0]!.col).toBe(1);
  });
});
