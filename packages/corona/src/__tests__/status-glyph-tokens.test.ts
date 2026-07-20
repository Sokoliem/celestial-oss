import { describe, expect, it } from 'vitest';
import { resolveGlyph } from '../glyphs.js';
import { statusGlyphTokens } from '../tokens/status-glyphs.js';

describe('statusGlyphTokens', () => {
  it('exposes all eight status kinds', () => {
    expect(Object.keys(statusGlyphTokens).sort()).toEqual(['danger', 'info', 'neutral', 'offline', 'pending', 'queued', 'success', 'warning']);
  });

  it('success wide is ✓', () => {
    expect(resolveGlyph(statusGlyphTokens.success, 'wide')).toBe('✓');
  });

  it('success basic is +', () => {
    expect(resolveGlyph(statusGlyphTokens.success, 'basic')).toBe('+');
  });

  it('success none is OK', () => {
    expect(resolveGlyph(statusGlyphTokens.success, 'none')).toBe('OK');
  });

  it('danger wide is ✕', () => {
    expect(resolveGlyph(statusGlyphTokens.danger, 'wide')).toBe('✕');
  });

  it('warning wide is ⚠', () => {
    expect(resolveGlyph(statusGlyphTokens.warning, 'wide')).toBe('⚠');
  });

  it('info wide is ⓘ', () => {
    expect(resolveGlyph(statusGlyphTokens.info, 'wide')).toBe('ⓘ');
  });

  it('every kind has a non-empty none fallback (ASCII safety)', () => {
    for (const kind of Object.keys(statusGlyphTokens) as Array<keyof typeof statusGlyphTokens>) {
      expect(statusGlyphTokens[kind].none.length).toBeGreaterThan(0);
    }
  });

  it('none fallbacks are pure ASCII', () => {
    for (const kind of Object.keys(statusGlyphTokens) as Array<keyof typeof statusGlyphTokens>) {
      const s = statusGlyphTokens[kind].none;
      for (const ch of s) {
        expect(ch.charCodeAt(0)).toBeLessThan(128);
      }
    }
  });

  it('basic fallbacks are pure ASCII', () => {
    for (const kind of Object.keys(statusGlyphTokens) as Array<keyof typeof statusGlyphTokens>) {
      const s = statusGlyphTokens[kind].basic;
      for (const ch of s) {
        expect(ch.charCodeAt(0)).toBeLessThan(128);
      }
    }
  });
});
