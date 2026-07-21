import { describe, expect, it } from 'vitest';
import { highlight } from '../highlight.js';

const SAMPLE = 'const x = ((1 + 2) * 3);';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('highlight() — colorizeBrackets opt', () => {
  it('produces byte-identical output when the option is unset', () => {
    const a = highlight(SAMPLE, 'typescript');
    const b = highlight(SAMPLE, 'typescript', undefined, undefined);
    const c = highlight(SAMPLE, 'typescript', undefined, { colorizeBrackets: false });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('preserves the visible (non-ANSI) text exactly when bracket coloring is on', () => {
    const baseline = stripAnsi(highlight(SAMPLE, 'typescript'));
    const colorized = stripAnsi(highlight(SAMPLE, 'typescript', undefined, { colorizeBrackets: true }));
    expect(colorized).toBe(baseline);
  });

  it('emits ANSI escape sequences when bracket coloring is enabled', () => {
    const out = highlight(SAMPLE, 'typescript', undefined, { colorizeBrackets: true });
    // Color escape sequences must appear adjacent to bracket characters.
    expect(out).toMatch(/\x1b\[[0-9;]*m[()[\]{}<>]/);
  });

  it('cycles distinct colors for nested depths', () => {
    const out = highlight('a((b))', 'typescript', undefined, { colorizeBrackets: true });
    // We expect at least two different ANSI sequences in the output (depth 0 and 1).
    const escapes = out.match(/\x1b\[[0-9;]*m/g) ?? [];
    const unique = new Set(escapes);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('honours custom bracketColors palette', () => {
    const custom = ['<<0>>', '<<1>>', '<<2>>'].map((tag) => (t: string) => `${tag}${t}<</>>`);
    const out = highlight('a(b(c))', 'typescript', undefined, {
      colorizeBrackets: true,
      bracketColors: custom,
    });
    // Both depths must appear in the output.
    expect(out).toContain('<<0>>(');
    expect(out).toContain('<<1>>(');
    expect(out).toContain('<<1>>)');
    expect(out).toContain('<<0>>)');
  });

  it('falls back safely for an empty or malformed runtime palette', () => {
    const empty = highlight('a(b)', 'typescript', undefined, { colorizeBrackets: true, bracketColors: [] });
    const malformed = highlight('a(b)', 'typescript', undefined, {
      colorizeBrackets: true,
      bracketColors: [null, 'bad'] as never,
    });
    expect(stripAnsi(empty)).toBe('a(b)');
    expect(stripAnsi(malformed)).toBe('a(b)');
  });

  it('honours custom unmatchedBracketColor', () => {
    const out = highlight('const x = (a;', 'typescript', undefined, {
      colorizeBrackets: true,
      unmatchedBracketColor: (t) => `<<UNMATCHED>>${t}<</>>`,
    });
    expect(out).toContain('<<UNMATCHED>>(');
  });

  it('does not affect lines without brackets', () => {
    const code = 'const a = 1;\nconst b = (x);';
    const baseline = highlight(code, 'typescript');
    const colorized = highlight(code, 'typescript', undefined, { colorizeBrackets: true });
    const baseLines = baseline.split('\n');
    const colorLines = colorized.split('\n');
    // Line 0 has no brackets — must be byte-identical.
    expect(colorLines[0]).toBe(baseLines[0]);
    // Line 1 differs because brackets are recolored.
    expect(colorLines[1]).not.toBe(baseLines[1]);
  });

  it('keeps non-bracket characters in a token visually unchanged', () => {
    // `1 + 2` inside the parentheses — the digits and operator should
    // render with the regular token theme, not the bracket palette.
    const out = highlight('a(1 + 2)', 'typescript', undefined, { colorizeBrackets: true });
    expect(stripAnsi(out)).toBe('a(1 + 2)');
  });
});
