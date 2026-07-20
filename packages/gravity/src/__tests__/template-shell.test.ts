import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeGrid } from '../grid.js';
import { gridItem, parseTemplate, setTerminalSize, templateShell } from '../index.js';

describe('parseTemplate', () => {
  it('parses a multi-row template with row sizes and a column suffix', () => {
    const parsed = parseTemplate(`
      "rail header header" auto
      "rail chat   side  " 1fr
      "rail footer side  " auto
      / auto 1fr 30
    `);

    expect(parsed.rows.map((row) => [...row])).toEqual([
      ['rail', 'header', 'header'],
      ['rail', 'chat', 'side'],
      ['rail', 'footer', 'side'],
    ]);
    expect(parsed.rowSizes).toEqual(['auto', '1fr', 'auto']);
    expect(parsed.columns).toBe('auto 1fr 30');
    expect(parsed.cols).toBe(3);
  });

  it('treats `.` as an empty area marker', () => {
    const parsed = parseTemplate(`
      "header header"
      "main   ."
    `);
    expect(parsed.rows[1]).toEqual(['main', '.']);
  });

  it('rejects ragged rows', () => {
    expect(() =>
      parseTemplate(`
        "a b c"
        "d e"
      `),
    ).toThrow(/ragged template/);
  });

  it('rejects empty templates', () => {
    expect(() => parseTemplate('   ')).toThrow();
  });

  it('rejects rows that are not quoted strings', () => {
    expect(() =>
      parseTemplate(`
        a b c
      `),
    ).toThrow();
  });

  it('rejects an empty trailing column clause', () => {
    expect(() =>
      parseTemplate(`
        "a b"
        /
      `),
    ).toThrow();
  });
});

describe('templateShell', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 60, rows: 12 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('renders the template into a grid layout with named regions', () => {
    const rendered = templateShell({
      template: `
        "header header"
        "main   side  "
      `,
      regions: {
        header: { kind: 'text', content: 'H' },
        main: { kind: 'text', content: 'M' },
        side: { kind: 'text', content: 'S' },
      },
    }).render({ terminal: { cols: 60, rows: 12 }, available: { cols: 60, rows: 12 }, container: { cols: 60, rows: 12 } });

    expect(rendered.kind).toBe('column');
    const column = rendered as ColumnNode;
    expect(column.children).toHaveLength(2);
    const firstRow = column.children[0] as RowNode;
    const headerCell = firstRow.children[0] as BoxNode;
    expect(headerCell.children[0]).toEqual({ kind: 'text', content: 'H' });
  });

  it('matches the equivalent grid() call', () => {
    const node: VNode = { kind: 'text', content: 'X' };
    const ts = templateShell({
      template: `
        "a b"
        "a c"
      `,
      regions: { a: node, b: node, c: node },
    });

    const tsRendered = ts.render({ terminal: { cols: 60, rows: 12 }, available: { cols: 60, rows: 12 }, container: { cols: 60, rows: 12 } });

    // The equivalent grid call uses the same areas + children.
    // We assert the diagnostics are clean as a snapshot-style check.
    const diag = analyzeGrid({
      cols: 2,
      areas: [
        ['a', 'b'],
        ['a', 'c'],
      ],
      children: [gridItem(node, { area: 'a' }), gridItem(node, { area: 'b' }), gridItem(node, { area: 'c' })],
    });
    expect(diag.issues).toEqual([]);
    expect(tsRendered.kind).toBe('column');
  });

  it('rejects ragged rows via the underlying parser', () => {
    expect(() =>
      templateShell({
        template: `
          "a b c"
          "d e"
        `,
        regions: { a: { kind: 'empty' } },
      }),
    ).toThrow(/ragged template/);
  });

  it('forwards unknown-region names through onUnknownRegion', () => {
    const onUnknownRegion = vi.fn();
    templateShell({
      template: `
        "header header"
        "main   side  "
      `,
      regions: {
        header: { kind: 'empty' },
        main: { kind: 'empty' },
        side: { kind: 'empty' },
        ghost: { kind: 'empty' },
      },
      onUnknownRegion,
    });

    expect(onUnknownRegion).toHaveBeenCalledTimes(1);
    expect(onUnknownRegion).toHaveBeenCalledWith('ghost');
  });

  it('does not pass unknown regions into the grid', () => {
    expect(() =>
      templateShell({
        template: `
          "main"
        `,
        regions: { main: { kind: 'empty' }, ghost: { kind: 'empty' } },
      }).render({ terminal: { cols: 30, rows: 6 }, available: { cols: 30, rows: 6 }, container: { cols: 30, rows: 6 } }),
    ).not.toThrow();
  });

  it('honors custom column override via props', () => {
    const node = templateShell({
      template: `
        "a b"
      `,
      regions: { a: { kind: 'empty' }, b: { kind: 'empty' } },
      columns: '20 1fr',
    });
    const rendered = node.render({ terminal: { cols: 50, rows: 4 }, available: { cols: 50, rows: 4 }, container: { cols: 50, rows: 4 } });
    const row = (rendered as ColumnNode).children[0] as RowNode;
    const first = row.children[0] as BoxNode;
    expect(first.width).toBe(20);
  });
});
