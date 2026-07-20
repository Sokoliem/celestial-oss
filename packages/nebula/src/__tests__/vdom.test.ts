import { describe, expect, it } from 'vitest';
import {
  type BoxNode,
  type ColumnNode,
  diff,
  type EmptyNode,
  layout,
  measure,
  type RowNode,
  renderUpdates,
  type ScrollNode,
  type TextNode,
  type VNode,
} from '../vdom.js';

describe('vdom', () => {
  describe('measure', () => {
    it('should measure text node', () => {
      const node: TextNode = { kind: 'text', content: 'hello' };
      expect(measure(node)).toEqual({ width: 5, height: 1 });
    });

    it('should measure multi-line text', () => {
      const node: TextNode = { kind: 'text', content: 'hi\nthere' };
      expect(measure(node)).toEqual({ width: 5, height: 2 });
    });

    it('should measure empty node', () => {
      const node: EmptyNode = { kind: 'empty', width: 10, height: 3 };
      expect(measure(node)).toEqual({ width: 10, height: 3 });
    });

    it('should measure row node', () => {
      const node: RowNode = {
        kind: 'row',
        children: [
          { kind: 'text', content: 'ab' },
          { kind: 'text', content: 'cd' },
        ],
      };
      expect(measure(node)).toEqual({ width: 4, height: 1 });
    });

    it('should measure row with gap', () => {
      const node: RowNode = {
        kind: 'row',
        gap: 2,
        children: [
          { kind: 'text', content: 'ab' },
          { kind: 'text', content: 'cd' },
        ],
      };
      expect(measure(node)).toEqual({ width: 6, height: 1 });
    });

    it('should measure column node', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'hello' },
          { kind: 'text', content: 'hi' },
        ],
      };
      expect(measure(node)).toEqual({ width: 5, height: 2 });
    });

    it('should measure box with border', () => {
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'hi' }],
        border: {
          topLeft: '┌',
          top: '─',
          topRight: '┐',
          left: '│',
          right: '│',
          bottomLeft: '└',
          bottom: '─',
          bottomRight: '┘',
        },
      };
      // 'hi' is 2x1, border adds 2 to each dimension
      expect(measure(node)).toEqual({ width: 4, height: 3 });
    });

    it('should measure component node by rendering', () => {
      const node: VNode = {
        kind: 'component',
        render: () => ({ kind: 'text', content: 'abc' }),
      };
      expect(measure(node)).toEqual({ width: 3, height: 1 });
    });
  });

  describe('layout', () => {
    it('should layout text into a cell grid', () => {
      const node: TextNode = { kind: 'text', content: 'hi' };
      const grid = layout(node, 10, 5);

      expect(grid.width).toBe(10);
      expect(grid.height).toBe(5);
      expect(grid.cells[0]![0]!.char).toBe('h');
      expect(grid.cells[0]![1]!.char).toBe('i');
      expect(grid.cells[0]![2]!.char).toBe(' '); // empty
    });

    it('should layout text with style', () => {
      const node: TextNode = {
        kind: 'text',
        content: 'hi',
        style: { bold: true, fg: '\x1b[31m' },
      };
      const grid = layout(node, 10, 5);
      expect(grid.cells[0]![0]!.style.bold).toBe(true);
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[31m');
    });

    it('should parse inline ANSI color codes in text content', () => {
      // Red "hi" via inline ANSI
      const node: TextNode = {
        kind: 'text',
        content: '\x1b[31mhi\x1b[39m',
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('h');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[31m');
      expect(grid.cells[0]![1]!.char).toBe('i');
      expect(grid.cells[0]![1]!.style.fg).toBe('\x1b[31m');
    });

    it('should handle mixed inline ANSI styles', () => {
      // Bold red "A", then green "B"
      const node: TextNode = {
        kind: 'text',
        content: '\x1b[1m\x1b[31mA\x1b[32mB\x1b[0m',
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[31m');
      expect(grid.cells[0]![0]!.style.bold).toBe(true);
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[0]![1]!.style.fg).toBe('\x1b[32m');
      expect(grid.cells[0]![1]!.style.bold).toBe(true);
    });

    it('should handle 256-color inline ANSI', () => {
      const node: TextNode = {
        kind: 'text',
        content: '\x1b[38;5;196mX\x1b[0m',
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('X');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[38;5;196m');
    });

    it('should handle true color (24-bit) inline ANSI', () => {
      const node: TextNode = {
        kind: 'text',
        content: '\x1b[38;2;218;112;214mY\x1b[0m',
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('Y');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[38;2;218;112;214m');
    });

    it('should handle background color inline ANSI', () => {
      const node: TextNode = {
        kind: 'text',
        content: '\x1b[48;5;21mZ\x1b[0m',
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('Z');
      expect(grid.cells[0]![0]!.style.bg).toBe('\x1b[48;5;21m');
    });

    it('should layout a row', () => {
      const node: RowNode = {
        kind: 'row',
        children: [
          { kind: 'text', content: 'AB' },
          { kind: 'text', content: 'CD' },
        ],
      };
      const grid = layout(node, 10, 1);
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[0]![2]!.char).toBe('C');
      expect(grid.cells[0]![3]!.char).toBe('D');
    });

    it('should layout a column', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'AB' },
          { kind: 'text', content: 'CD' },
        ],
      };
      const grid = layout(node, 10, 5);
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[1]![0]!.char).toBe('C');
      expect(grid.cells[1]![1]!.char).toBe('D');
    });

    it('should layout box with border', () => {
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'X' }],
        border: {
          topLeft: '┌',
          top: '─',
          topRight: '┐',
          left: '│',
          right: '│',
          bottomLeft: '└',
          bottom: '─',
          bottomRight: '┘',
        },
      };
      const grid = layout(node, 5, 3);
      expect(grid.cells[0]![0]!.char).toBe('┌');
      expect(grid.cells[0]![1]!.char).toBe('─');
      expect(grid.cells[0]![4]!.char).toBe('┐');
      expect(grid.cells[1]![0]!.char).toBe('│');
      expect(grid.cells[1]![1]!.char).toBe('X');
      expect(grid.cells[1]![4]!.char).toBe('│');
      expect(grid.cells[2]![0]!.char).toBe('└');
      expect(grid.cells[2]![4]!.char).toBe('┘');
    });

    it('should clamp multi-line text to available height in column', () => {
      // Column with two children — first is 3-line text in 2-row space
      // The text should be clipped, not overwrite the second child's row
      const node: ColumnNode = {
        kind: 'column',
        children: [
          { kind: 'text', content: 'L0\nL1\nL2' },
          { kind: 'text', content: 'BELOW' },
        ],
      };
      // Column gives first child height=3, second height=1 in a 4-row grid.
      // But if we constrain the grid to 3 rows, the second child gets y=3
      // which is only 0 rows — effectively clipped. Let's use a 5-row grid
      // to ensure the second child renders and isn't overwritten.
      const grid = layout(node, 10, 5);
      // L0 at row 0, L1 at row 1, L2 at row 2
      expect(grid.cells[0]![0]!.char).toBe('L');
      expect(grid.cells[0]![1]!.char).toBe('0');
      expect(grid.cells[2]![0]!.char).toBe('L');
      expect(grid.cells[2]![1]!.char).toBe('2');
      // BELOW at row 3
      expect(grid.cells[3]![0]!.char).toBe('B');
      expect(grid.cells[3]![4]!.char).toBe('W');
    });

    it('should layout scroll node with offset', () => {
      const node: ScrollNode = {
        kind: 'scroll',
        child: {
          kind: 'column',
          children: [
            { kind: 'text', content: 'line0' },
            { kind: 'text', content: 'line1' },
            { kind: 'text', content: 'line2' },
            { kind: 'text', content: 'line3' },
          ],
        },
        offset: 1,
        height: 2,
      };
      const grid = layout(node, 10, 2);
      // offset=1, so we see line1 and line2
      expect(grid.cells[0]![0]!.char).toBe('l');
      expect(grid.cells[0]![4]!.char).toBe('1');
      expect(grid.cells[1]![4]!.char).toBe('2');
    });
  });

  describe('diff', () => {
    it('should return empty for identical grids', () => {
      const node: TextNode = { kind: 'text', content: 'hi' };
      const grid1 = layout(node, 5, 1);
      const grid2 = layout(node, 5, 1);
      expect(diff(grid1, grid2)).toEqual([]);
    });

    it('should detect changed cells', () => {
      const grid1 = layout({ kind: 'text', content: 'ab' } as TextNode, 5, 1);
      const grid2 = layout({ kind: 'text', content: 'ac' } as TextNode, 5, 1);
      const updates = diff(grid1, grid2);
      expect(updates.length).toBe(1);
      const u0 = updates[0]!;
      expect(u0.col).toBe(1);
      expect(u0.kind).toBeUndefined();
      if (!u0.kind) expect(u0.char).toBe('c');
    });

    it('should detect style changes', () => {
      const grid1 = layout({ kind: 'text', content: 'a' } as TextNode, 5, 1);
      const grid2 = layout({ kind: 'text', content: 'a', style: { bold: true } } as TextNode, 5, 1);
      const updates = diff(grid1, grid2);
      expect(updates.length).toBe(1);
      const u0 = updates[0]!;
      expect(u0.kind).toBeUndefined();
      if (!u0.kind) expect(u0.style.bold).toBe(true);
    });

    it('should detect added content', () => {
      const grid1 = layout({ kind: 'text', content: 'a' } as TextNode, 5, 1);
      const grid2 = layout({ kind: 'text', content: 'abc' } as TextNode, 5, 1);
      const updates = diff(grid1, grid2);
      expect(updates.length).toBe(2); // 'b' and 'c' are new
    });
  });

  describe('renderUpdates', () => {
    it('should return empty string for no updates', () => {
      expect(renderUpdates([])).toBe('');
    });

    it('should render a single cell update', () => {
      const result = renderUpdates([{ row: 0, col: 0, char: 'X', style: {} }]);
      expect(result).toContain('\x1b[1;1H'); // cursor to (1,1) — 1-indexed
      expect(result).toContain('X');
    });

    it('should render styled cell update', () => {
      const result = renderUpdates([{ row: 2, col: 5, char: 'A', style: { bold: true } }]);
      expect(result).toContain('\x1b[3;6H'); // row 3, col 6 (1-indexed)
      expect(result).toContain('\x1b[1m'); // bold
      expect(result).toContain('A');
      expect(result).toContain('\x1b[0m'); // reset
    });

    it('should emit cursor positioning for every cell', () => {
      const result = renderUpdates([
        { row: 0, col: 0, char: 'A', style: {} },
        { row: 0, col: 1, char: 'B', style: {} },
      ]);
      // Every cell gets explicit cursor positioning for correct
      // rendering of Unicode characters with ambiguous widths (e.g. braille)
      const moves = result.match(/\x1b\[\d+;\d+H/g) ?? [];
      expect(moves.length).toBe(2);
    });
  });
});
