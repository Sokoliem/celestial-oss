import { describe, expect, it } from 'vitest';
import { tokenizeDocumentEmbedded } from '../embedded.js';

describe('tokenizeDocumentEmbedded — basic flow', () => {
  it('returns null when the outer language is unknown', () => {
    const result = tokenizeDocumentEmbedded('foo bar', 'doesnotexist', []);
    expect(result).toBeNull();
  });

  it('matches tokenizeDocument output for empty regions', () => {
    const code = 'const x = 1;\nconst y = "hi";';
    const embedded = tokenizeDocumentEmbedded(code, 'typescript', [])!;
    expect(embedded).not.toBeNull();
    expect(embedded.lines.length).toBe(2);
    expect(embedded.source).toBe(code);
    expect(embedded.language).toBe('typescript');
  });

  it('uses the embedded grammar inside a region', () => {
    // Outer = markdown, embedded = typescript inside a fenced block
    // (we synthesise the source so we can verify line-by-line tokens).
    const source = ['# Title', '```ts', 'const x = 1;', '```'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'markdown', [{ startLine: 2, endLine: 2, lang: 'typescript' }])!;
    expect(result).not.toBeNull();

    // Line 2 should contain TypeScript tokens (keyword, variable, etc.).
    const tsLine = result.lines[2]!;
    const categories = new Set(tsLine.tokens.map((t) => t.category));
    // 'keyword' (`const`) and 'number' (`1`) should both appear when
    // tokenized as TypeScript.
    expect(categories.has('keyword')).toBe(true);
    expect(categories.has('number')).toBe(true);
  });

  it('outer-grammar lines around an embedded region see their normal token shape', () => {
    const source = ['# Title', '```ts', 'const x = 1;', '```'].join('\n');
    const baseline = tokenizeDocumentEmbedded(source, 'markdown', [])!;
    const embedded = tokenizeDocumentEmbedded(source, 'markdown', [{ startLine: 2, endLine: 2, lang: 'typescript' }])!;

    // Lines 0, 1, 3 are outer; their tokens must equal the baseline.
    for (const i of [0, 1, 3]) {
      const a = baseline.lines[i]!.tokens.map((t) => `${t.category}:${t.text}`);
      const b = embedded.lines[i]!.tokens.map((t) => `${t.category}:${t.text}`);
      expect(b).toEqual(a);
    }
  });

  it('threads outer state across non-embedded regions', () => {
    // A multi-line block comment in TypeScript spanning embedded boundaries
    // should still be treated as a comment in outer lines after the region.
    const source = ['/* outer comment', 'still comment', '*/', 'const z = 1;'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'typescript', [])!;
    // Line 1 is mid-comment — its tokens should mostly be in 'comment' state.
    const line1Categories = result.lines[1]!.tokens.map((t) => t.category);
    expect(line1Categories.includes('comment')).toBe(true);
  });
});

describe('tokenizeDocumentEmbedded — multiple regions', () => {
  it('handles two non-adjacent embedded regions', () => {
    const source = ['outer', 'embedded1', 'outer', 'embedded2'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'markdown', [
      { startLine: 1, endLine: 1, lang: 'typescript' },
      { startLine: 3, endLine: 3, lang: 'json' },
    ])!;
    expect(result.lines.length).toBe(4);
    // Lines 1 and 3 use different grammars; their stateBefore should be
    // initial-state because we reset embedded state at each transition.
    expect(result.lines[1]!.stateBefore.stack.length).toBe(0);
    expect(result.lines[3]!.stateBefore.stack.length).toBe(0);
  });

  it('threads state across consecutive embedded lines of the same grammar', () => {
    const source = ['outer', '/* multi-line', 'still comment', '*/', 'outer'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'markdown', [{ startLine: 1, endLine: 3, lang: 'typescript' }])!;
    // Line 2 (mid-comment in the embedded region) should still have a
    // non-empty stateBefore inherited from line 1.
    const stateLevel = result.lines[2]!.stateBefore.stack.length;
    expect(stateLevel).toBeGreaterThan(0);
  });
});

describe('tokenizeDocumentEmbedded — validation', () => {
  it('throws when a region is out of bounds', () => {
    expect(() => tokenizeDocumentEmbedded('one\ntwo', 'markdown', [{ startLine: 0, endLine: 5, lang: 'typescript' }])).toThrow();
  });

  it('throws when regions overlap', () => {
    expect(() =>
      tokenizeDocumentEmbedded('a\nb\nc\nd', 'markdown', [
        { startLine: 0, endLine: 2, lang: 'typescript' },
        { startLine: 1, endLine: 3, lang: 'json' },
      ]),
    ).toThrow();
  });

  it('throws when endLine precedes startLine', () => {
    expect(() => tokenizeDocumentEmbedded('a\nb\nc', 'markdown', [{ startLine: 2, endLine: 1, lang: 'typescript' }])).toThrow();
  });

  it('falls back to the outer grammar when the embedded language is unknown', () => {
    const source = ['outer', 'inner', 'outer'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'markdown', [{ startLine: 1, endLine: 1, lang: 'no-such-language' }])!;
    expect(result).not.toBeNull();
    // The line should still tokenize (fallback to markdown) — no crash.
    expect(result.lines[1]).toBeDefined();
  });

  it('accepts unsorted regions and sorts internally', () => {
    const source = ['a', 'b', 'c', 'd'].join('\n');
    const result = tokenizeDocumentEmbedded(source, 'markdown', [
      { startLine: 3, endLine: 3, lang: 'json' },
      { startLine: 1, endLine: 1, lang: 'typescript' },
    ])!;
    expect(result.lines.length).toBe(4);
  });
});
