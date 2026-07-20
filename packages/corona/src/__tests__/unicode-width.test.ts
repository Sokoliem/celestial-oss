import { describe, expect, it } from 'vitest';
import { charWidth } from '../unicode-width.js';
import { visualWidth } from '../utils.js';

describe('charWidth', () => {
  it('returns 1 for ASCII characters', () => {
    expect(charWidth('A'.codePointAt(0)!)).toBe(1);
    expect(charWidth('z'.codePointAt(0)!)).toBe(1);
    expect(charWidth(' '.codePointAt(0)!)).toBe(1);
    expect(charWidth('~'.codePointAt(0)!)).toBe(1);
  });

  it('returns 2 for CJK Unified Ideographs (U+4E00-U+9FFF)', () => {
    // 你 = U+4F60
    expect(charWidth(0x4f60)).toBe(2);
    // 好 = U+597D
    expect(charWidth(0x597d)).toBe(2);
    // 世 = U+4E16
    expect(charWidth(0x4e16)).toBe(2);
    // 界 = U+754C
    expect(charWidth(0x754c)).toBe(2);
  });

  it('returns 2 for Hangul Jamo (U+1100-U+115F)', () => {
    expect(charWidth(0x1100)).toBe(2);
    expect(charWidth(0x115f)).toBe(2);
  });

  it('returns 2 for Hangul Syllables (U+AC00-U+D7AF)', () => {
    // 한 = U+D55C
    expect(charWidth(0xd55c)).toBe(2);
    expect(charWidth(0xac00)).toBe(2);
  });

  it('returns 2 for Hiragana (U+3041-U+3096)', () => {
    // あ = U+3042
    expect(charWidth(0x3042)).toBe(2);
  });

  it('returns 2 for Katakana (U+30A0-U+30FF)', () => {
    // ア = U+30A2
    expect(charWidth(0x30a2)).toBe(2);
  });

  it('returns 2 for Fullwidth Latin (U+FF01-U+FF60)', () => {
    // Ａ = U+FF21
    expect(charWidth(0xff21)).toBe(2);
    // ！= U+FF01
    expect(charWidth(0xff01)).toBe(2);
  });

  it('returns 2 for Fullwidth Signs (U+FFE0-U+FFE6)', () => {
    // ￥ = U+FFE5
    expect(charWidth(0xffe5)).toBe(2);
  });

  it('returns 2 for CJK Unified Extension B+ (U+20000-U+2FFFD)', () => {
    expect(charWidth(0x20000)).toBe(2);
    expect(charWidth(0x2a6df)).toBe(2);
  });

  it('returns 2 for CJK Extension G+ (U+30000-U+3FFFD)', () => {
    expect(charWidth(0x30000)).toBe(2);
  });

  it('returns 2 for CJK misc (U+2E80-U+303E)', () => {
    // CJK radical
    expect(charWidth(0x2e80)).toBe(2);
    // Ideographic space mark
    expect(charWidth(0x3003)).toBe(2);
  });

  it('returns 2 for CJK Compatibility Ideographs (U+F900-U+FAFF)', () => {
    expect(charWidth(0xf900)).toBe(2);
  });

  it('returns 2 for CJK Compatibility Forms (U+FE30-U+FE6F)', () => {
    expect(charWidth(0xfe30)).toBe(2);
  });

  it('returns 0 for Combining Diacritical Marks (U+0300-U+036F)', () => {
    // Combining acute accent
    expect(charWidth(0x0301)).toBe(0);
    expect(charWidth(0x0300)).toBe(0);
    expect(charWidth(0x036f)).toBe(0);
  });

  it('returns 0 for Cyrillic combining marks (U+0483-U+0489)', () => {
    expect(charWidth(0x0483)).toBe(0);
    expect(charWidth(0x0489)).toBe(0);
  });

  it('returns 0 for Hebrew combining marks (U+0591-U+05BD)', () => {
    expect(charWidth(0x0591)).toBe(0);
    expect(charWidth(0x05bd)).toBe(0);
  });

  it('returns 0 for Zero-Width characters (U+200B-U+200F)', () => {
    // Zero-width space
    expect(charWidth(0x200b)).toBe(0);
    // Zero-width joiner
    expect(charWidth(0x200d)).toBe(0);
    // Right-to-left mark
    expect(charWidth(0x200f)).toBe(0);
  });

  it('returns 0 for Variation Selectors (U+FE00-U+FE0F)', () => {
    expect(charWidth(0xfe00)).toBe(0);
    expect(charWidth(0xfe0f)).toBe(0);
  });

  it('returns 0 for Combining Half Marks (U+FE20-U+FE2F)', () => {
    expect(charWidth(0xfe20)).toBe(0);
    expect(charWidth(0xfe2f)).toBe(0);
  });

  it('returns 0 for Supplemental Variation Selectors (U+E0100-U+E01EF)', () => {
    expect(charWidth(0xe0100)).toBe(0);
    expect(charWidth(0xe01ef)).toBe(0);
  });

  it('returns 1 for standard Latin, Cyrillic, Greek', () => {
    // Cyrillic Д = U+0414
    expect(charWidth(0x0414)).toBe(1);
    // Greek Ω = U+03A9
    expect(charWidth(0x03a9)).toBe(1);
    // Latin é = U+00E9 (precomposed)
    expect(charWidth(0x00e9)).toBe(1);
  });

  // Regression: Unicode UAX #11 classifies these media-control / asterisk
  // glyphs as Wide, but Claude Code's TUI (and many Node TUI libraries)
  // treat them as 1-col. Treating them as Wide caused a 1-col cursor
  // drift on every CUF skip in CC-driven PTYs, producing ghost-text
  // corruption that resolved on resize. Pin them at 1 col so the
  // emulator's cursor tracking matches CC's.
  it('returns 1 for media-control symbols U+23F8-U+23FA (Pause, Stop, Record)', () => {
    expect(charWidth(0x23f8)).toBe(1);
    expect(charWidth(0x23f9)).toBe(1);
    expect(charWidth(0x23fa)).toBe(1);
  });

  it('returns 1 for U+2733 (Eight Spoked Asterisk) and U+2734 (Eight Pointed Black Star)', () => {
    expect(charWidth(0x2733)).toBe(1);
    expect(charWidth(0x2734)).toBe(1);
  });
});

describe('visualWidth with Unicode', () => {
  it('returns correct width for ASCII text', () => {
    expect(visualWidth('hello')).toBe(5);
    expect(visualWidth('abc')).toBe(3);
  });

  it('returns correct width for CJK characters', () => {
    // 你好世界 = 4 characters, each width 2 = 8
    expect(visualWidth('你好世界')).toBe(8);
  });

  it('returns correct width for mixed CJK + ASCII', () => {
    // "Hello世界" = 5 (Hello) + 2*2 (世界) = 9
    expect(visualWidth('Hello世界')).toBe(9);
  });

  it('returns correct width for emoji', () => {
    // Most emoji are in supplementary planes and should be width 2
    // 🎉 = U+1F389
    expect(visualWidth('🎉')).toBe(2);
  });

  it('returns correct width for combining marks', () => {
    // "e" + combining acute accent = visual width 1
    expect(visualWidth('e\u0301')).toBe(1);
  });

  it('returns correct width for zero-width characters', () => {
    expect(visualWidth('\u200B')).toBe(0);
    expect(visualWidth('\u200D')).toBe(0);
  });

  it('returns correct width for Fullwidth forms', () => {
    // Ａ (fullwidth A) = width 2
    expect(visualWidth('\uFF21')).toBe(2);
    // ＡＢ = width 4
    expect(visualWidth('\uFF21\uFF22')).toBe(4);
  });

  it('returns 0 for empty string', () => {
    expect(visualWidth('')).toBe(0);
  });

  it('measures ANSI-styled CJK text correctly', () => {
    // \x1b[31m你好\x1b[0m should be width 4
    expect(visualWidth('\x1b[31m你好\x1b[0m')).toBe(4);
  });

  it('handles Hangul syllables correctly', () => {
    // 한글 = 2 characters, each width 2 = 4
    expect(visualWidth('한글')).toBe(4);
  });

  it('handles mixed content: ASCII + emoji + CJK', () => {
    // "Hi🎉世界" = 2 (Hi) + 2 (🎉) + 4 (世界) = 8
    expect(visualWidth('Hi🎉世界')).toBe(8);
  });

  it('handles Katakana correctly', () => {
    // アイウ = 3 chars, each width 2 = 6
    expect(visualWidth('アイウ')).toBe(6);
  });

  it('handles text with variation selectors correctly', () => {
    // text character + variation selector = width should only count the base char
    expect(visualWidth('A\uFE0F')).toBe(1);
  });

  it('handles supplementary CJK (Extension B+)', () => {
    // U+20000 = 𠀀 (CJK Extension B)
    expect(visualWidth('\u{20000}')).toBe(2);
  });
});
