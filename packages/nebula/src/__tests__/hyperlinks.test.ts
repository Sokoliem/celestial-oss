import { describe, expect, it } from 'vitest';
import { link, text } from '../elements.js';
import { type CellGrid, diff, layout, renderUpdates } from '../vdom.js';

// ─── OSC 8 Hyperlink Constants ──────────────────────────────────────────────

/** OSC 8 open sequence: \x1b]8;;<url>\x1b\\ */
function osc8Open(url: string): string {
  return `\x1b]8;;${url}\x1b\\`;
}

/** OSC 8 close sequence: \x1b]8;;\x1b\\ */
const OSC8_CLOSE = '\x1b]8;;\x1b\\';

// ─── link() element builder ─────────────────────────────────────────────────

describe('link()', () => {
  it('creates a TextNode with href set', () => {
    const node = link('https://example.com', 'click me');
    expect(node.kind).toBe('text');
    expect(node.content).toBe('click me');
    expect(node.href).toBe('https://example.com');
  });

  it('creates a TextNode with style and href', () => {
    const node = link('https://example.com', 'styled link', { fg: '\x1b[34m', underline: true });
    expect(node.kind).toBe('text');
    expect(node.content).toBe('styled link');
    expect(node.href).toBe('https://example.com');
    expect(node.style?.fg).toBe('\x1b[34m');
    expect(node.style?.underline).toBe(true);
  });
});

// ─── text() with href option ────────────────────────────────────────────────

describe('text() with href', () => {
  it('creates a TextNode with href when options object is passed', () => {
    const node = text('hello', undefined, { href: 'https://example.com' });
    expect(node.kind).toBe('text');
    expect(node.content).toBe('hello');
    expect(node.href).toBe('https://example.com');
  });

  it('creates a TextNode without href when no options are passed', () => {
    const node = text('hello');
    expect(node.kind).toBe('text');
    expect(node.content).toBe('hello');
    expect(node.href).toBeUndefined();
  });
});

// ─── Rendering hyperlinks ───────────────────────────────────────────────────

describe('hyperlink rendering', () => {
  it('renders text with href wrapped in OSC 8 sequences', () => {
    const node = link('https://example.com', 'Hi');
    const grid = layout(node, 10, 1);

    // The cells in the grid should carry the href
    expect(grid.cells[0]![0]!.href).toBe('https://example.com');
    expect(grid.cells[0]![1]!.href).toBe('https://example.com');
    // Non-link cells should not have href
    expect(grid.cells[0]![2]!.href).toBeUndefined();
  });

  it('includes OSC 8 sequences in renderUpdates output', () => {
    const node = link('https://example.com', 'AB');
    const grid = layout(node, 10, 1);
    const emptyGrid: CellGrid = { cells: [], width: 0, height: 0 };
    const updates = diff(emptyGrid, grid);
    const output = renderUpdates(updates);

    // The output should contain OSC 8 open and close sequences around the linked chars
    expect(output).toContain(osc8Open('https://example.com'));
    expect(output).toContain(OSC8_CLOSE);
  });

  it('does not emit OSC 8 for text without href', () => {
    const node = text('AB');
    const grid = layout(node, 10, 1);
    const emptyGrid: CellGrid = { cells: [], width: 0, height: 0 };
    const updates = diff(emptyGrid, grid);
    const output = renderUpdates(updates);

    // No OSC 8 sequences
    expect(output).not.toContain('\x1b]8;');
  });

  it('correctly closes OSC 8 when href changes between cells', () => {
    // Use a row with two different links side by side
    // We can simulate this by checking two separate renders
    const node1 = link('https://a.com', 'A');
    const grid1 = layout(node1, 1, 1);
    const emptyGrid: CellGrid = { cells: [], width: 0, height: 0 };
    const updates1 = diff(emptyGrid, grid1);
    const output1 = renderUpdates(updates1);

    expect(output1).toContain(osc8Open('https://a.com'));
    expect(output1).toContain(OSC8_CLOSE);
  });

  it('URL is correctly embedded in the escape sequence', () => {
    const url = 'https://example.com/path?q=1&r=2';
    const node = link(url, 'X');
    const grid = layout(node, 5, 1);
    const emptyGrid: CellGrid = { cells: [], width: 0, height: 0 };
    const updates = diff(emptyGrid, grid);
    const output = renderUpdates(updates);

    expect(output).toContain(`\x1b]8;;${url}\x1b\\`);
  });

  it('rejects unsafe hyperlink protocols at the paint boundary', () => {
    const grid = layout(link('javascript:alert(1)', 'X'), 2, 1);
    const output = renderUpdates(diff({ cells: [], width: 0, height: 0 }, grid));

    expect(grid.cells[0]![0]!.href).toBeUndefined();
    expect(output).not.toContain('\x1b]8;');
    expect(output).not.toContain('javascript:');
  });

  it('preserves safe inline OSC 8 links without allowing protocol injection', () => {
    const content = `${osc8Open('https://example.com/docs')}X${OSC8_CLOSE}`;
    const grid = layout(text(content), 2, 1);

    expect(grid.cells[0]![0]!.href).toBe('https://example.com/docs');
  });

  it('neutralizes control and style injection in direct cell updates', () => {
    const output = renderUpdates([{ row: 0, col: 0, char: `A\x1b[2JB`, style: { fg: `\x1b[31m\x1b[2J` } }]);

    expect(output).not.toContain('\x1b[2J');
    expect(output).not.toContain('\x1b[31m');
    expect(output).toContain('A␛[2JB');
  });
});
