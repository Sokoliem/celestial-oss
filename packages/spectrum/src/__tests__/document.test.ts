import { describe, expect, it } from 'vitest';
import { findMatchingBracket, getFoldingRanges, retokenizeDocument, tokenizeDocument } from '../document.js';

describe('tokenizeDocument', () => {
  it('captures tokenizer state before and after each line', () => {
    const document = tokenizeDocument('/* start\nend */\nconst x = 1;', 'typescript');
    expect(document).not.toBeNull();
    expect(document!.lines).toHaveLength(3);
    expect(document!.lines[0]!.stateBefore.stack).toEqual([]);
    expect(document!.lines[0]!.stateAfter.stack).toEqual(['blockComment']);
    expect(document!.lines[1]!.stateBefore.stack).toEqual(['blockComment']);
    expect(document!.lines[1]!.stateAfter.stack).toEqual([]);
  });
});

describe('retokenizeDocument', () => {
  it('reuses unchanged suffix lines when state converges immediately', () => {
    const previous = tokenizeDocument('const a = 1;\nconst b = 2;\nconst c = 3;', 'typescript');
    expect(previous).not.toBeNull();

    const next = retokenizeDocument(previous!, {
      startLine: 1,
      deleteCount: 1,
      insertLines: ['const b = 42;'],
    });

    expect(next.lines[0]).toBe(previous!.lines[0]);
    expect(next.lines[1]).not.toBe(previous!.lines[1]);
    expect(next.lines[2]).toBe(previous!.lines[2]);
  });

  it('continues retokenizing until downstream state matches again', () => {
    const previous = tokenizeDocument('/* start\nmiddle\nend */\nconst x = 1;', 'typescript');
    expect(previous).not.toBeNull();

    const next = retokenizeDocument(previous!, {
      startLine: 1,
      deleteCount: 1,
      insertLines: ['middle */'],
    });

    expect(next.lines[2]).not.toBe(previous!.lines[2]);
    expect(next.lines[3]).toBe(previous!.lines[3]);
    expect(next.lines[2]!.stateBefore.stack).toEqual([]);
  });
});

describe('findMatchingBracket', () => {
  it('finds matching brackets and ignores brackets inside strings', () => {
    const source = "const value = { items: ['(', { ok: true }] };";
    const document = tokenizeDocument(source, 'typescript');
    expect(document).not.toBeNull();

    const openColumn = source.indexOf('{');
    const match = findMatchingBracket(document!, { line: 0, column: openColumn });

    expect(match).not.toBeNull();
    expect(match!.open).toEqual({ line: 0, column: openColumn });
    expect(match!.close.column).toBe(source.lastIndexOf('}'));
  });
});

describe('getFoldingRanges', () => {
  it('detects bracket-based folding ranges', () => {
    const document = tokenizeDocument('function demo() {\n  if (ready) {\n    return true;\n  }\n}', 'typescript');
    expect(document).not.toBeNull();

    const ranges = getFoldingRanges(document!);
    expect(ranges).toContainEqual({ startLine: 0, endLine: 4, kind: 'bracket' });
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3, kind: 'bracket' });
  });

  it('detects indentation-based folding ranges', () => {
    const document = tokenizeDocument('if ready:\n  if nested:\n    pass\n  return\nprint("done")', 'python');
    expect(document).not.toBeNull();

    const ranges = getFoldingRanges(document!);
    expect(ranges).toContainEqual({ startLine: 0, endLine: 3, kind: 'indent' });
    expect(ranges).toContainEqual({ startLine: 1, endLine: 2, kind: 'indent' });
  });
});
