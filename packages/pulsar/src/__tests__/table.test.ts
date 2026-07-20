import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../parser/index.js';
import { renderMarkdown } from '../renderer.js';
import type { Token } from '../types.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('parseMarkdown table alignment', () => {
  it('detects left, center, right and default alignment from separator', () => {
    const tokens = parseMarkdown('| L | C | R | D |\n|:--|:-:|--:|---|\n| a | b | c | d |');
    const table = tokens[0] as Extract<Token, { type: 'table' }>;
    expect(table.type).toBe('table');
    expect(table.align).toEqual(['left', 'center', 'right', 'default']);
  });

  it('pads alignment to match column count when separator is short', () => {
    const tokens = parseMarkdown('| A | B | C |\n|:--|---|\n| 1 | 2 | 3 |');
    const table = tokens[0] as Extract<Token, { type: 'table' }>;
    expect(table.align).toEqual(['left', 'default', 'default']);
  });
});

describe('renderMarkdown table layout', () => {
  it('right-aligns numeric column when separator says so', () => {
    const md = '| Name | Score |\n| --- | ---: |\n| a | 1 |\n| bb | 22 |';
    const out = stripAnsi(renderMarkdown(md));
    const lines = out.split('\n');
    // Header: "Name" then padding, "Score" right-aligned
    expect(lines[2]).toMatch(/a\s+│\s+1\s*$/);
    expect(lines[3]).toMatch(/bb\s+│\s+22\s*$/);
  });

  it('center-aligns when separator is :---:', () => {
    const md = '| H |\n|:-:|\n| ab |\n| zzzzz |';
    const out = stripAnsi(renderMarkdown(md));
    const lines = out.split('\n');
    // Body row "ab" should be centered within the 5-char column.
    expect(lines[2]).toMatch(/^\s*ab\s+/);
    // Pre-padding should be at least one char before "ab"
    expect(/^( +)ab/.exec(lines[2]!)?.[1]?.length).toBeGreaterThanOrEqual(1);
  });

  it('truncates oversized cells with an ellipsis when over the width budget', () => {
    const wide = 'x'.repeat(80);
    const md = `| Col |\n| --- |\n| ${wide} |`;
    const out = stripAnsi(renderMarkdown(md, { width: 30 }));
    expect(out).toContain('…');
    // No line should exceed the 30-char budget.
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });
});
