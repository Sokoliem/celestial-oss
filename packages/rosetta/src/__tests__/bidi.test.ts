import { describe, expect, it } from 'vitest';
import { reorderBidi, toBidiVisual, wrapBidi } from '../bidi.js';

/** Helper: reverse a string by code points (for checking RTL visual order). */
function reverseStr(s: string): string {
  return [...s].reverse().join('');
}

describe('reorderBidi', () => {
  it('returns empty array for empty string', () => {
    expect(reorderBidi('')).toEqual([]);
  });

  it('returns a single LTR run for pure English text', () => {
    const runs = reorderBidi('Hello');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe('Hello');
    expect(runs[0]!.level).toBe(0);
  });

  it('returns a single RTL run for pure Arabic text with reversed visual order', () => {
    const runs = reorderBidi('مرحبا');
    expect(runs).toHaveLength(1);
    // RTL run: characters are reversed for visual display
    expect(runs[0]!.text).toBe(reverseStr('مرحبا'));
    expect(runs[0]!.level % 2).toBe(1); // odd = RTL
  });

  it('returns a single RTL run for pure Hebrew text with reversed visual order', () => {
    const runs = reorderBidi('שלום');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.text).toBe(reverseStr('שלום'));
    expect(runs[0]!.level % 2).toBe(1);
  });

  it('handles mixed LTR and RTL text producing multiple runs', () => {
    const runs = reorderBidi('Hello مرحبا World');
    // Should produce multiple runs with different levels
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const allText = runs.map((r) => r.text).join('');
    // All original characters should be present
    expect(allText.length).toBe('Hello مرحبا World'.length);
  });

  it('preserves numbers within RTL text', () => {
    const runs = reorderBidi('סעיף 3.1');
    const allText = runs.map((r) => r.text).join('');
    // Numbers should be present in visual output
    expect(allText).toContain('3.1');
    // Hebrew characters are reversed in visual order
    expect(allText).toContain(reverseStr('סעיף'));
  });

  it('handles explicit base direction override to LTR', () => {
    const runs = reorderBidi('مرحبا', 'ltr');
    expect(runs.length).toBeGreaterThanOrEqual(1);
    // Arabic text should still be in a RTL run even with LTR base
    const arabicRun = runs.find((r) => r.text === reverseStr('مرحبا'));
    expect(arabicRun).toBeDefined();
    expect(arabicRun!.level % 2).toBe(1);
  });

  it('handles explicit base direction override to RTL', () => {
    const runs = reorderBidi('Hello', 'rtl');
    expect(runs.length).toBeGreaterThanOrEqual(1);
    // English text in RTL context gets even level
    const englishRun = runs.find((r) => r.text.includes('Hello'));
    expect(englishRun).toBeDefined();
    expect(englishRun!.level % 2).toBe(0);
  });

  it('assigns correct run positions', () => {
    const runs = reorderBidi('ABC');
    expect(runs[0]!.start).toBe(0);
    expect(runs[0]!.end).toBe(2);
  });
});

describe('toBidiVisual', () => {
  it('returns empty string for empty input', () => {
    expect(toBidiVisual('')).toBe('');
  });

  it('preserves LTR text unchanged', () => {
    expect(toBidiVisual('Hello World')).toBe('Hello World');
  });

  it('reverses pure RTL text to visual order', () => {
    const visual = toBidiVisual('שלום');
    // The bidi algorithm reverses RTL characters for LTR rendering
    expect(visual).toBe(reverseStr('שלום'));
  });

  it('handles mixed text with numbers', () => {
    const visual = toBidiVisual('Hello 123 World');
    expect(visual).toBe('Hello 123 World');
  });

  it('handles RTL text with embedded LTR', () => {
    const text = 'שלום Hello שלום';
    const visual = toBidiVisual(text);
    // The visual output should contain all characters
    expect(visual.length).toBe(text.length);
    // LTR segment preserved in visual order
    expect(visual).toContain('Hello');
  });

  it('handles parentheses in RTL context', () => {
    const text = '(שלום)';
    const visual = toBidiVisual(text);
    // All characters present
    expect(visual.length).toBe(text.length);
    expect(visual).toContain('(');
    expect(visual).toContain(')');
  });

  it('handles multiple RTL scripts together', () => {
    const text = 'שלום مرحبا';
    const visual = toBidiVisual(text);
    // Characters are reversed, all present
    expect(visual.length).toBe(text.length);
  });

  it('handles numbers between RTL segments', () => {
    const text = 'מחיר: 42 שקל';
    const visual = toBidiVisual(text);
    expect(visual).toContain('42');
    expect(visual.length).toBe(text.length);
  });

  it('handles LTR base direction with RTL content', () => {
    const text = 'The word שלום means peace';
    const visual = toBidiVisual(text, 'ltr');
    expect(visual).toContain('The word');
    // Hebrew reversed in visual order
    expect(visual).toContain(reverseStr('שלום'));
    expect(visual).toContain('means peace');
  });

  it('respects auto direction detection', () => {
    const ltrVisual = toBidiVisual('Hello World', 'auto');
    expect(ltrVisual).toBe('Hello World');
  });

  it('handles text with only neutral characters', () => {
    expect(toBidiVisual('123 456')).toBe('123 456');
  });

  it('handles single character inputs', () => {
    expect(toBidiVisual('A')).toBe('A');
    expect(toBidiVisual('א')).toBe('א');
  });

  it('handles LRE/RLE embedding markers', () => {
    // U+202A = LRE, U+202C = PDF
    const text = 'Hello \u202Aworld\u202C';
    const visual = toBidiVisual(text);
    // Should handle without crashing
    expect(visual).toBeTruthy();
  });

  it('handles LRI/RLI isolate markers', () => {
    // U+2067 = RLI, U+2069 = PDI
    const text = 'Hello \u2067שלום\u2069 world';
    const visual = toBidiVisual(text);
    expect(visual).toBeTruthy();
    expect(visual.length).toBe(text.length);
  });

  it('handles deeply mixed nested text', () => {
    const text = 'English שלום Hello مرحبا World';
    const visual = toBidiVisual(text, 'ltr');
    // LTR segments preserved
    expect(visual).toContain('English');
    expect(visual).toContain('World');
    expect(visual).toContain('Hello');
  });

  it('handles Arabic-Indic digits within RTL text', () => {
    // Arabic-Indic digit 5: U+0665
    const text = 'مبلغ ٥٠٠ ريال';
    const visual = toBidiVisual(text);
    expect(visual).toBeTruthy();
    expect(visual.length).toBe(text.length);
  });

  it('handles Latin punctuation adjacent to RTL text', () => {
    const text = 'שלום, עולם!';
    const visual = toBidiVisual(text);
    // All characters present after reordering
    expect(visual.length).toBe(text.length);
    expect(visual).toContain(',');
    expect(visual).toContain('!');
  });

  it('produces consistent output for repeated calls', () => {
    const text = 'Hello שלום World';
    const v1 = toBidiVisual(text);
    const v2 = toBidiVisual(text);
    expect(v1).toBe(v2);
  });

  it('handles empty runs gracefully', () => {
    const visual = toBidiVisual('   ');
    expect(visual).toBe('   ');
  });
});

describe('wrapBidi', () => {
  it('wraps logical LTR text on whitespace boundaries', () => {
    expect(wrapBidi('alpha beta gamma', 8)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('preserves empty lines', () => {
    expect(wrapBidi('top\n\nbottom', 10)).toEqual(['top', '', 'bottom']);
  });

  it('returns no lines for non-positive widths', () => {
    expect(wrapBidi('text', 0)).toEqual([]);
  });
});
