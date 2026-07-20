import { describe, expect, it } from 'vitest';
import { type BoxNode, type ColumnNode, layout, measure, planLayout, type TextNode } from '../vdom.js';

/** Helper: extract a row of characters from a CellGrid as a trimmed string */
function gridRow(grid: ReturnType<typeof layout>, row: number): string {
  if (row >= grid.height) return '';
  return grid.cells[row]!.map((c) => c.char).join('');
}

/** Helper: extract a row of characters without trailing spaces */
function gridRowTrimmed(grid: ReturnType<typeof layout>, row: number): string {
  return gridRow(grid, row).trimEnd();
}

describe('text wrapping', () => {
  it('should wrap long text at container boundary', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'hello world!',
      wrap: true,
    };
    // Container is 6 wide — "hello " fits on line 1, "world!" on line 2
    const grid = layout(node, 6, 5);
    expect(gridRowTrimmed(grid, 0)).toBe('hello');
    expect(gridRowTrimmed(grid, 1)).toBe('world!');
  });

  it('should wrap at word boundaries', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'hello world foo',
      wrap: true,
    };
    // 11 columns — "hello world" fits (11 chars), "foo" goes to line 2
    const grid = layout(node, 11, 5);
    expect(gridRowTrimmed(grid, 0)).toBe('hello world');
    expect(gridRowTrimmed(grid, 1)).toBe('foo');
  });

  it('should break mid-word when a single word exceeds container width', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'abcdefghijklmnop',
      wrap: true,
    };
    // 5-wide: "abcde" + "fghij" + "klmno" + "p"
    const grid = layout(node, 5, 10);
    expect(gridRowTrimmed(grid, 0)).toBe('abcde');
    expect(gridRowTrimmed(grid, 1)).toBe('fghij');
    expect(gridRowTrimmed(grid, 2)).toBe('klmno');
    expect(gridRowTrimmed(grid, 3)).toBe('p');
  });

  it('should NOT wrap text when wrap is not set (default behavior)', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'hello world foo',
    };
    // 6-wide — without wrap, text is simply clipped
    const grid = layout(node, 6, 5);
    expect(gridRowTrimmed(grid, 0)).toBe('hello');
    // Second line should be empty (no wrapping occurred)
    expect(gridRowTrimmed(grid, 1)).toBe('');
  });

  it('should handle empty text with wrap enabled', () => {
    const node: TextNode = {
      kind: 'text',
      content: '',
      wrap: true,
    };
    const grid = layout(node, 10, 5);
    // Should render nothing — all spaces
    expect(gridRowTrimmed(grid, 0)).toBe('');
  });

  it('should preserve existing newlines and also wrap long lines', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'line1\nthis is a longer line2',
      wrap: true,
    };
    // 10-wide: "line1" stays on line 1
    // "this is a longer line2" wraps: "this is a" (9), "longer" (6), "line2" (5)
    const grid = layout(node, 10, 10);
    expect(gridRowTrimmed(grid, 0)).toBe('line1');
    expect(gridRowTrimmed(grid, 1)).toBe('this is a');
    expect(gridRowTrimmed(grid, 2)).toBe('longer');
    expect(gridRowTrimmed(grid, 3)).toBe('line2');
  });

  it('should compute correct layout rect height for wrapped text', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'hello world foo bar',
      wrap: true,
    };
    // 10-wide: "hello" (5), "world foo" (9), "bar" (3) — 3 lines
    const plan = planLayout(node, 10, 10);
    expect(plan.root.rect.height).toBe(3);
    expect(plan.root.rect.width).toBe(10);
  });

  it('measures wrapped text against each requested container width', () => {
    const node: TextNode = { kind: 'text', content: 'alpha beta', wrap: true };

    expect(measure(node, 12)).toEqual({ width: 10, height: 1 });
    expect(measure(node, 5)).toEqual({ width: 5, height: 2 });
    expect(measure(node, 12)).toEqual({ width: 10, height: 1 });
  });

  it('measures wrapping row children against the space left by siblings', () => {
    const node = {
      kind: 'row' as const,
      children: [
        { kind: 'text' as const, content: '> ' },
        { kind: 'text' as const, content: 'abc def', wrap: true },
      ],
    };

    expect(measure(node, 7)).toEqual({ width: 6, height: 2 });
  });

  it('should stack correctly in a column with other nodes', () => {
    const col: ColumnNode = {
      kind: 'column',
      children: [{ kind: 'text', content: 'hello world foo', wrap: true } as TextNode, { kind: 'text', content: 'after' }],
    };
    // 8-wide: "hello" wraps to line 1, "world" to line 2, "foo" to line 3
    // Then "after" should appear on line 4
    const grid = layout(col, 8, 10);
    expect(gridRowTrimmed(grid, 0)).toBe('hello');
    expect(gridRowTrimmed(grid, 1)).toBe('world');
    expect(gridRowTrimmed(grid, 2)).toBe('foo');
    expect(gridRowTrimmed(grid, 3)).toBe('after');
  });

  it('should work inside a bordered box', () => {
    const boxNode: BoxNode = {
      kind: 'box',
      children: [{ kind: 'text', content: 'hello world', wrap: true } as TextNode],
      border: {
        topLeft: '+',
        top: '-',
        topRight: '+',
        left: '|',
        right: '|',
        bottomLeft: '+',
        bottom: '-',
        bottomRight: '+',
      },
    };
    // Box is 10 wide; inner is 8 wide. "hello" + "world" wraps to 2 lines.
    // Total box height: border(2) + content(2) = 4
    const grid = layout(boxNode, 10, 10);
    expect(gridRow(grid, 0)).toBe('+--------+');
    // Inner rows: left border + text padded to inner width + right border
    expect(gridRow(grid, 1)).toBe('|hello   |');
    expect(gridRow(grid, 2)).toBe('|world   |');
  });

  it('grows a fit-content painted box for text wrapped inside its border', () => {
    const boxNode: BoxNode = {
      kind: 'box',
      width: 10,
      fit: 'content',
      style: { bg: '\x1b[40m' },
      children: [{ kind: 'text', content: 'abcdefghij', wrap: true } as TextNode],
      border: {
        topLeft: '+',
        top: '-',
        topRight: '+',
        left: '|',
        right: '|',
        bottomLeft: '+',
        bottom: '-',
        bottomRight: '+',
      },
    };

    const plan = planLayout(boxNode, 10, 10);
    const grid = layout(boxNode, 10, 10);

    expect(plan.root.rect.height).toBe(4);
    expect(gridRow(grid, 1)).toBe('|abcdefgh|');
    expect(gridRow(grid, 2)).toBe('|ij      |');
    expect(gridRow(grid, 3)).toBe('+--------+');
  });

  it('should handle text that fits within container without wrapping', () => {
    const node: TextNode = {
      kind: 'text',
      content: 'short',
      wrap: true,
    };
    const grid = layout(node, 20, 5);
    expect(gridRowTrimmed(grid, 0)).toBe('short');
    expect(gridRowTrimmed(grid, 1)).toBe('');
  });
});
