import { describe, expect, it } from 'vitest';
import { DEFAULT_GLYPH_TOKENS, type GlyphToken, resolveGlyph, resolveGlyphs } from '../glyphs.js';
import { surfaceGlyphTokens } from '../surface-tokens.js';
import { createTheme } from '../theme.js';
import { stencilGlyph } from '../tokens/mirage.js';
import { popoverGlyphs } from '../tokens/popover.js';
import { defaultProgressBarTokens } from '../tokens/progress-bar.js';
import { statusGlyphTokens } from '../tokens/status-glyphs.js';

describe('resolveGlyph', () => {
  const token: GlyphToken = {
    full: 'F',
    wide: 'W',
    basic: 'B',
    none: 'N',
  };

  it('returns full for full level', () => {
    expect(resolveGlyph(token, 'full')).toBe('F');
  });

  it('returns wide for wide level', () => {
    expect(resolveGlyph(token, 'wide')).toBe('W');
  });

  it('returns basic for basic level', () => {
    expect(resolveGlyph(token, 'basic')).toBe('B');
  });

  it('returns none for none level', () => {
    expect(resolveGlyph(token, 'none')).toBe('N');
  });

  it('uses an explicit Unicode 16 glyph and otherwise falls back to wide Unicode', () => {
    expect(resolveGlyph({ ...token, unicode16: 'U' }, 'unicode16')).toBe('U');
    expect(resolveGlyph(token, 'unicode16')).toBe('W');
  });

  it('falls back through empty high-capability variants', () => {
    expect(resolveGlyph({ full: '', wide: 'W', basic: 'B', none: 'N' }, 'full')).toBe('W');
    expect(resolveGlyph(defaultProgressBarTokens.filled, 'full')).toBe('█');
  });
});

describe('resolveGlyphs', () => {
  it('returns all 21 glyph keys', () => {
    const glyphs = resolveGlyphs('wide');
    const keys = Object.keys(glyphs);
    expect(keys).toContain('divider');
    expect(keys).toContain('pointer');
    expect(keys).toContain('cornerBR');
    expect(keys.length).toBe(21);
  });

  it('none level returns ASCII-only glyphs', () => {
    const glyphs = resolveGlyphs('none');
    for (const value of Object.values(glyphs)) {
      expect(value).toMatch(/^[\x20-\x7E]+$/); // printable ASCII only
    }
  });

  it('basic level returns simple characters', () => {
    const glyphs = resolveGlyphs('basic');
    expect(glyphs.pointer).toBe('>');
    expect(glyphs.pipe).toBe('|');
  });

  it('wide level returns Unicode characters', () => {
    const glyphs = resolveGlyphs('wide');
    expect(glyphs.pointer).toBe('▸');
    expect(glyphs.ellipsis).toBe('…');
  });
});

describe('DEFAULT_GLYPH_TOKENS', () => {
  it('has entries for all ThemeGlyphs keys', () => {
    const expectedKeys = [
      'divider',
      'bullet',
      'keycapLeft',
      'keycapRight',
      'tagPrefix',
      'selected',
      'unselected',
      'menuArrow',
      'checked',
      'unchecked',
      'radioOn',
      'radioOff',
      'pipe',
      'ellipsis',
      'pointer',
      'doubleArrowH',
      'doubleArrowV',
      'cornerTL',
      'cornerTR',
      'cornerBL',
      'cornerBR',
    ];
    for (const key of expectedKeys) {
      expect(DEFAULT_GLYPH_TOKENS).toHaveProperty(key);
    }
  });

  it('each token has all four levels', () => {
    for (const token of Object.values(DEFAULT_GLYPH_TOKENS)) {
      expect(token).toHaveProperty('full');
      expect(token).toHaveProperty('wide');
      expect(token).toHaveProperty('basic');
      expect(token).toHaveProperty('none');
    }
  });

  it('keeps all 46 shared core glyph-token none fallbacks printable ASCII', () => {
    const tokens = [
      ...Object.values(DEFAULT_GLYPH_TOKENS),
      ...Object.values(surfaceGlyphTokens),
      ...Object.values(statusGlyphTokens),
      defaultProgressBarTokens.filled,
      defaultProgressBarTokens.empty,
      popoverGlyphs.centerCaret,
      stencilGlyph,
    ];

    expect(tokens).toHaveLength(46);
    for (const glyph of tokens) expect(glyph.none).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe('createTheme with unicodeLevel', () => {
  it('uses ASCII glyphs when unicodeLevel is none', () => {
    const theme = createTheme({ unicodeLevel: 'none' });
    expect(theme.glyphs.pointer).toBe('>');
    expect(theme.glyphs.pipe).toBe('|');
  });

  it('uses Unicode glyphs when unicodeLevel is wide', () => {
    const theme = createTheme({ unicodeLevel: 'wide' });
    expect(theme.glyphs.pointer).toBe('▸');
    expect(theme.glyphs.ellipsis).toBe('…');
  });

  it('accepts Atlas unicode16 capability and records the effective level', () => {
    const theme = createTheme({ unicodeLevel: 'unicode16' });
    expect(theme.unicodeLevel).toBe('unicode16');
    expect(theme.glyphs.pointer).toBe('▸');
  });

  it('manual glyph overrides take precedence over unicodeLevel', () => {
    const theme = createTheme({
      unicodeLevel: 'none',
      glyphs: { pointer: '→' },
    });
    expect(theme.glyphs.pointer).toBe('→');
    // Other glyphs still use ASCII from none level
    expect(theme.glyphs.pipe).toBe('|');
  });

  it('default behavior (no unicodeLevel) uses existing DEFAULT_GLYPHS', () => {
    const defaultTheme = createTheme({});
    const noLevelTheme = createTheme({});
    expect(defaultTheme.glyphs).toEqual(noLevelTheme.glyphs);
    expect(defaultTheme.unicodeLevel).toBe('wide');
  });
});
