import { describe, expect, it } from 'vitest';
import { resolveGlyph } from '../glyphs.js';
import { popoverGlyphs } from '../tokens/popover.js';

describe('popoverGlyphs', () => {
  it('exposes a centerCaret with a complete fallback chain', () => {
    expect(popoverGlyphs.centerCaret).toMatchObject({ wide: '◆' });
    expect(popoverGlyphs.centerCaret.basic).toBeTruthy();
    expect(popoverGlyphs.centerCaret.none).toBeTruthy();
  });

  it('resolves at each unicode level without throwing', () => {
    for (const level of ['full', 'wide', 'basic', 'none'] as const) {
      expect(typeof resolveGlyph(popoverGlyphs.centerCaret, level)).toBe('string');
    }
  });

  it('keeps the existing wide-level rendering for visual continuity', () => {
    expect(resolveGlyph(popoverGlyphs.centerCaret, 'wide')).toBe('◆');
  });
});
