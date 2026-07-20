import { describe, expect, it } from 'vitest';
import { graphemeLength, graphemeSlice, measureGraphemeWidth, measureTextWidth, segmentGraphemes, sliceTextByWidth, truncateText } from '../grapheme.js';

describe('segmentGraphemes', () => {
  it('segments ASCII text into individual characters', () => {
    expect(segmentGraphemes('Hello')).toEqual(['H', 'e', 'l', 'l', 'o']);
  });

  it('returns empty array for empty string', () => {
    expect(segmentGraphemes('')).toEqual([]);
  });

  it('handles basic emoji as single grapheme clusters', () => {
    const result = segmentGraphemes('😀😎');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('😀');
    expect(result[1]).toBe('😎');
  });

  it('handles family emoji ZWJ sequence as a single grapheme', () => {
    // Family: Man, Woman, Girl, Boy joined with ZWJ
    const family = '👨‍👩‍👧‍👦';
    const result = segmentGraphemes(family);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(family);
  });

  it('handles combining marks as part of base character', () => {
    // e + combining acute accent = é (two code points, one grapheme)
    const text = 'e\u0301';
    const result = segmentGraphemes(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('e\u0301');
  });

  it('handles Korean jamo', () => {
    // 한 = single precomposed Hangul syllable (1 grapheme)
    const result = segmentGraphemes('한');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('한');
  });

  it('handles flag emoji (regional indicator pairs)', () => {
    // US flag: Regional Indicator U + Regional Indicator S
    const flag = '🇺🇸';
    const result = segmentGraphemes(flag);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(flag);
  });

  it('handles mixed ASCII and emoji', () => {
    const result = segmentGraphemes('Hi 👋!');
    expect(result).toHaveLength(5); // H, i, space, wave, !
    expect(result[3]).toBe('👋');
  });
});

describe('graphemeLength', () => {
  it('returns 0 for empty string', () => {
    expect(graphemeLength('')).toBe(0);
  });

  it('returns correct length for ASCII', () => {
    expect(graphemeLength('Hello')).toBe(5);
  });

  it('counts emoji as 1 grapheme each', () => {
    expect(graphemeLength('😀😎')).toBe(2);
  });

  it('counts ZWJ sequence as 1 grapheme', () => {
    expect(graphemeLength('👨‍👩‍👧‍👦')).toBe(1);
  });

  it('counts base + combining mark as 1 grapheme', () => {
    expect(graphemeLength('e\u0301')).toBe(1);
  });

  it('counts flag as 1 grapheme', () => {
    expect(graphemeLength('🇺🇸')).toBe(1);
  });
});

describe('graphemeSlice', () => {
  it('slices ASCII text normally', () => {
    expect(graphemeSlice('Hello', 0, 3)).toBe('Hel');
  });

  it('slices from start to end by default', () => {
    expect(graphemeSlice('Hello', 2)).toBe('llo');
  });

  it('handles empty string', () => {
    expect(graphemeSlice('', 0, 1)).toBe('');
  });

  it('slices around emoji correctly', () => {
    const text = 'A😀B😎C';
    // Graphemes: A, 😀, B, 😎, C
    expect(graphemeSlice(text, 1, 2)).toBe('😀');
    expect(graphemeSlice(text, 0, 3)).toBe('A😀B');
  });

  it('slices preserving ZWJ sequences', () => {
    const text = 'X👨‍👩‍👧‍👦Y';
    // Graphemes: X, family, Y
    expect(graphemeSlice(text, 1, 2)).toBe('👨‍👩‍👧‍👦');
  });

  it('slices preserving combining marks', () => {
    const text = 'ae\u0301b'; // a, é, b
    expect(graphemeSlice(text, 1, 2)).toBe('e\u0301');
  });
});

describe('measureGraphemeWidth', () => {
  it('measures ASCII graphemes as one cell', () => {
    expect(measureGraphemeWidth('A')).toBe(1);
  });

  it('measures wide graphemes as two cells', () => {
    expect(measureGraphemeWidth('界')).toBe(2);
  });

  it('collapses ZWJ emoji sequences to a single glyph width', () => {
    expect(measureGraphemeWidth('👨‍👩‍👧‍👦')).toBe(2);
  });
});

describe('measureTextWidth', () => {
  it('measures mixed-width strings by grapheme cluster', () => {
    expect(measureTextWidth('Hi界')).toBe(4);
  });

  it('treats flag emoji as a single wide glyph', () => {
    expect(measureTextWidth('A🇺🇸B')).toBe(4);
  });
});

describe('sliceTextByWidth', () => {
  it('slices by terminal width rather than code units', () => {
    expect(sliceTextByWidth('AB界C', 4)).toBe('AB界');
  });

  it('does not split grapheme clusters', () => {
    expect(sliceTextByWidth('A👨‍👩‍👧‍👦B', 3)).toBe('A👨‍👩‍👧‍👦');
  });
});

describe('truncateText', () => {
  it('returns the original text when it already fits', () => {
    expect(truncateText('Hello', 5)).toBe('Hello');
  });

  it('truncates using a grapheme-aware ellipsis', () => {
    expect(truncateText('AB界CD', 5)).toBe('AB界…');
  });

  it('trims the ellipsis itself when the budget is tiny', () => {
    expect(truncateText('Hello', 1)).toBe('…');
  });
});
