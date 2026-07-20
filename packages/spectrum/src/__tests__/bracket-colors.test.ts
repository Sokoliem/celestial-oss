import { describe, expect, it } from 'vitest';
import { bracketPairColors, groupBracketDepthsByLine } from '../bracket-colors.js';
import { tokenizeDocument } from '../document.js';

function compute(code: string, lang = 'typescript') {
  const doc = tokenizeDocument(code, lang)!;
  expect(doc).not.toBeNull();
  return bracketPairColors(doc);
}

describe('bracketPairColors — basic depth assignment', () => {
  it('returns no entries for code without brackets', () => {
    const result = compute('const x = 42;');
    expect(result.length).toBe(0);
  });

  it('assigns depth 0 to a single matched pair', () => {
    const result = compute('const x = (1 + 2);');
    expect(result.length).toBe(2);
    expect(result.every((d) => d.depth === 0)).toBe(true);
    expect(result.every((d) => d.unmatched === false)).toBe(true);
  });

  it('increments depth for nested pairs', () => {
    const result = compute('const x = ((1 + 2) * 3);');
    // Order: outer `(`, inner `(`, inner `)`, outer `)`.
    expect(result.length).toBe(4);
    expect(result.map((d) => d.depth)).toEqual([0, 1, 1, 0]);
    expect(result.every((d) => !d.unmatched)).toBe(true);
  });

  it('handles three-deep nesting', () => {
    const result = compute('const x = (a[b{c}d]e);');
    // ( [ { } ] )
    expect(result.length).toBe(6);
    expect(result.map((d) => d.bracket)).toEqual(['(', '[', '{', '}', ']', ')']);
    expect(result.map((d) => d.depth)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('cycles depth across sibling pairs at the same level', () => {
    const result = compute('const x = [1] + [2];');
    expect(result.map((d) => d.bracket)).toEqual(['[', ']', '[', ']']);
    expect(result.map((d) => d.depth)).toEqual([0, 0, 0, 0]);
  });
});

describe('bracketPairColors — unmatched brackets', () => {
  it('marks an unclosed opener as unmatched', () => {
    const result = compute('const x = (a + b;');
    const open = result.find((d) => d.bracket === '(');
    expect(open?.unmatched).toBe(true);
  });

  it('marks an extra closer as unmatched', () => {
    const result = compute('const x = a) + b;');
    const close = result.find((d) => d.bracket === ')');
    expect(close?.unmatched).toBe(true);
    expect(close?.depth).toBe(0);
  });

  it('handles mismatched pairs by leaving the unmatched ones flagged', () => {
    const result = compute('const x = ({);');
    const lookup = new Map(result.map((d) => [`${d.bracket}@${d.column}`, d]));
    // The `(` and `)` form a pair; the `{` between them stays unmatched.
    const openParen = result.find((d) => d.bracket === '(');
    const closeParen = result.find((d) => d.bracket === ')');
    const openBrace = result.find((d) => d.bracket === '{');
    expect(openParen?.unmatched).toBe(false);
    expect(closeParen?.unmatched).toBe(false);
    expect(openBrace?.unmatched).toBe(true);
    expect(lookup.size).toBeGreaterThan(0);
  });
});

describe('bracketPairColors — exclusions', () => {
  it('ignores brackets inside string literals', () => {
    const result = compute('const x = "(not a bracket)" + 1;');
    expect(result.length).toBe(0);
  });

  it('ignores brackets inside comments', () => {
    const result = compute('// (((\nconst x = 1;');
    expect(result.length).toBe(0);
  });
});

describe('bracketPairColors — angle brackets', () => {
  it('treats `<T>` after a type identifier as angle-bracket nesting', () => {
    const result = compute('const x: Array<number> = [];');
    const angles = result.filter((d) => d.bracket === '<' || d.bracket === '>');
    expect(angles.length).toBe(2);
    expect(angles[0]?.depth).toBe(0);
    expect(angles[1]?.depth).toBe(0);
    expect(angles.every((d) => !d.unmatched)).toBe(true);
  });

  it('does NOT treat `a < b` as angle brackets', () => {
    const result = compute('const r = a < b && c > d;');
    expect(result.filter((d) => d.bracket === '<').length).toBe(0);
    expect(result.filter((d) => d.bracket === '>').length).toBe(0);
  });
});

describe('groupBracketDepthsByLine', () => {
  it('groups depth entries by their line number', () => {
    const result = compute('const x = (\n  [1, 2]\n);');
    const grouped = groupBracketDepthsByLine(result);
    expect(grouped.size).toBe(3); // lines 0 (`(`), 1 (`[` and `]`), 2 (`)`)
    expect(grouped.get(0)?.length).toBe(1);
    expect(grouped.get(1)?.length).toBe(2);
    expect(grouped.get(2)?.length).toBe(1);
  });

  it('preserves left-to-right column order within a line', () => {
    const result = compute('const x = (a)(b);');
    const grouped = groupBracketDepthsByLine(result);
    const onLine0 = grouped.get(0) ?? [];
    expect(onLine0.length).toBe(4);
    for (let i = 1; i < onLine0.length; i++) {
      expect(onLine0[i]!.column).toBeGreaterThan(onLine0[i - 1]!.column);
    }
  });

  it('returns an empty map when no brackets are present', () => {
    const result = compute('const x = 42;');
    const grouped = groupBracketDepthsByLine(result);
    expect(grouped.size).toBe(0);
  });
});
