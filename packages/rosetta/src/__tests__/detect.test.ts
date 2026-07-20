import { describe, expect, it } from 'vitest';
import { detectDirection, getCharBidiType, isLtrChar, isRtlChar } from '../detect.js';

describe('isRtlChar', () => {
  it('identifies Arabic characters as RTL', () => {
    // Arabic letter Alef: U+0627
    expect(isRtlChar(0x0627)).toBe(true);
    // Arabic letter Ba: U+0628
    expect(isRtlChar(0x0628)).toBe(true);
  });

  it('identifies Hebrew characters as RTL', () => {
    // Hebrew letter Alef: U+05D0
    expect(isRtlChar(0x05d0)).toBe(true);
    // Hebrew letter Bet: U+05D1
    expect(isRtlChar(0x05d1)).toBe(true);
  });

  it('identifies Syriac characters as RTL', () => {
    expect(isRtlChar(0x0710)).toBe(true);
  });

  it('identifies Thaana characters as RTL', () => {
    expect(isRtlChar(0x0780)).toBe(true);
  });

  it('rejects Latin characters', () => {
    expect(isRtlChar(0x0041)).toBe(false); // 'A'
    expect(isRtlChar(0x007a)).toBe(false); // 'z'
  });

  it('rejects digits', () => {
    expect(isRtlChar(0x0030)).toBe(false); // '0'
  });
});

describe('isLtrChar', () => {
  it('identifies Latin letters as LTR', () => {
    expect(isLtrChar(0x0041)).toBe(true); // 'A'
    expect(isLtrChar(0x007a)).toBe(true); // 'z'
  });

  it('identifies Greek letters as LTR', () => {
    expect(isLtrChar(0x0391)).toBe(true); // Alpha
  });

  it('identifies Cyrillic letters as LTR', () => {
    expect(isLtrChar(0x0410)).toBe(true); // A (Cyrillic)
  });

  it('identifies CJK as LTR', () => {
    expect(isLtrChar(0x4e00)).toBe(true); // First CJK ideograph
  });

  it('rejects Arabic characters', () => {
    expect(isLtrChar(0x0627)).toBe(false);
  });

  it('rejects digits', () => {
    expect(isLtrChar(0x0030)).toBe(false); // '0'
  });
});

describe('getCharBidiType', () => {
  it('classifies Latin letters as L', () => {
    expect(getCharBidiType(0x0041)).toBe('L'); // 'A'
  });

  it('classifies Hebrew letters as R', () => {
    expect(getCharBidiType(0x05d0)).toBe('R'); // Alef
  });

  it('classifies Arabic letters as AL', () => {
    expect(getCharBidiType(0x0627)).toBe('AL'); // Arabic Alef
  });

  it('classifies ASCII digits as EN', () => {
    expect(getCharBidiType(0x0030)).toBe('EN'); // '0'
    expect(getCharBidiType(0x0039)).toBe('EN'); // '9'
  });

  it('classifies Arabic-Indic digits as AN', () => {
    expect(getCharBidiType(0x0660)).toBe('AN');
    expect(getCharBidiType(0x0669)).toBe('AN');
  });

  it('classifies space as WS', () => {
    expect(getCharBidiType(0x0020)).toBe('WS');
  });

  it('classifies newline as B', () => {
    expect(getCharBidiType(0x000a)).toBe('B');
  });

  it('classifies tab as S', () => {
    expect(getCharBidiType(0x0009)).toBe('S');
  });

  it('classifies explicit embedding markers', () => {
    expect(getCharBidiType(0x202a)).toBe('LRE');
    expect(getCharBidiType(0x202b)).toBe('RLE');
    expect(getCharBidiType(0x202c)).toBe('PDF');
    expect(getCharBidiType(0x2066)).toBe('LRI');
    expect(getCharBidiType(0x2067)).toBe('RLI');
    expect(getCharBidiType(0x2068)).toBe('FSI');
    expect(getCharBidiType(0x2069)).toBe('PDI');
  });

  it('classifies combining marks as NSM', () => {
    expect(getCharBidiType(0x0300)).toBe('NSM'); // Combining grave accent
    expect(getCharBidiType(0x0591)).toBe('NSM'); // Hebrew accent
  });

  it('classifies comma as CS', () => {
    expect(getCharBidiType(0x002c)).toBe('CS');
  });

  it('classifies plus/minus as ES', () => {
    expect(getCharBidiType(0x002b)).toBe('ES'); // +
    expect(getCharBidiType(0x002d)).toBe('ES'); // -
  });

  it('classifies currency symbols as ET', () => {
    expect(getCharBidiType(0x0024)).toBe('ET'); // $
    expect(getCharBidiType(0x00a3)).toBe('ET'); // Pound
  });
});

describe('detectDirection', () => {
  it('detects LTR for English text', () => {
    expect(detectDirection('Hello, world!')).toBe('ltr');
  });

  it('detects RTL for Arabic text', () => {
    expect(detectDirection('مرحبا بالعالم')).toBe('rtl');
  });

  it('detects RTL for Hebrew text', () => {
    expect(detectDirection('שלום עולם')).toBe('rtl');
  });

  it('detects LTR for text starting with English then Arabic', () => {
    expect(detectDirection('Hello مرحبا')).toBe('ltr');
  });

  it('detects RTL for text starting with Arabic then English', () => {
    expect(detectDirection('مرحبا Hello')).toBe('rtl');
  });

  it('detects LTR for neutral-only text (numbers, spaces, punctuation)', () => {
    expect(detectDirection('12345')).toBe('ltr');
    expect(detectDirection('...')).toBe('ltr');
    expect(detectDirection('   ')).toBe('ltr');
  });

  it('detects LTR for empty string', () => {
    expect(detectDirection('')).toBe('ltr');
  });

  it('detects RTL when first strong char is preceded by whitespace', () => {
    expect(detectDirection('   شلوم')).toBe('rtl');
  });

  it('detects LTR when first strong char is preceded by digits', () => {
    expect(detectDirection('123 Hello')).toBe('ltr');
  });

  it('detects direction through parentheses to find first strong char', () => {
    expect(detectDirection('(مرحبا)')).toBe('rtl');
    expect(detectDirection('(Hello)')).toBe('ltr');
  });

  it('handles mixed scripts with numbers between', () => {
    expect(detectDirection('123 مرحبا 456 Hello')).toBe('rtl');
  });
});
