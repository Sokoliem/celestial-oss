import { describe, expect, it } from 'vitest';
import { applySingleLineKey, clampCursor, deleteBackward, graphemeIndexAtCell, graphemes, insertSingleLinePaste, replaceSelection } from '../editable-text.js';

const key = (keyName: string, char?: string, modifiers: Partial<{ alt: boolean; ctrl: boolean; shift: boolean }> = {}) => ({
  key: keyName,
  char,
  alt: modifiers.alt ?? false,
  ctrl: modifiers.ctrl ?? false,
  shift: modifiers.shift ?? false,
});

describe('editable text', () => {
  it('treats combining and emoji ZWJ sequences as one cursor stop', () => {
    expect(graphemes('e\u0301👩‍💻')).toEqual(['e\u0301', '👩‍💻']);
    expect(deleteBackward({ value: 'e\u0301👩‍💻', cursor: 2 })).toEqual({ value: 'e\u0301', cursor: 1 });
  });

  it('resegments after inserting a combining mark', () => {
    const result = applySingleLineKey({ value: 'e', cursor: 1 }, key('\u0301', '\u0301'));
    expect(result.state).toEqual({ value: 'e\u0301', cursor: 1 });
  });

  it('replaces a grapheme selection without clipping the final value', () => {
    expect(replaceSelection({ value: 'A界🙂Z', cursor: 3, selectionAnchor: 1 }, 'ok')).toEqual({ value: 'AokZ', cursor: 3 });
  });

  it('normalizes multiline paste for a single-line field', () => {
    expect(insertSingleLinePaste({ value: 'ab', cursor: 1 }, '界\r\n🙂')).toEqual({ value: 'a界 🙂b', cursor: 4 });
  });

  it('maps wide terminal cells to grapheme cursor positions', () => {
    expect(graphemeIndexAtCell('A界B', 0)).toBe(0);
    expect(graphemeIndexAtCell('A界B', 1)).toBe(1);
    expect(graphemeIndexAtCell('A界B', 2)).toBe(2);
    expect(graphemeIndexAtCell('A界B', 3)).toBe(2);
  });

  it('normalizes non-finite cursor and terminal-cell offsets', () => {
    expect(clampCursor('abc', Number.NaN)).toBe(0);
    expect(clampCursor('abc', Number.POSITIVE_INFINITY)).toBe(0);
    expect(replaceSelection({ value: 'abc', cursor: Number.NaN, selectionAnchor: Number.POSITIVE_INFINITY }, 'x')).toEqual({ value: 'xabc', cursor: 1 });
    expect(graphemeIndexAtCell('A界B', Number.NaN)).toBe(0);
  });
});
