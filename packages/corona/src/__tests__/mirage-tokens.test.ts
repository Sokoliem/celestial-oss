import { describe, expect, it } from 'vitest';
import { resolveGlyph } from '../glyphs.js';
import { highlightColor, stencilGlyph } from '../tokens/mirage.js';

describe('stencilGlyph', () => {
  it('renders the universal full-block character at every unicode level', () => {
    expect(resolveGlyph(stencilGlyph, 'full')).toBe('█');
    expect(resolveGlyph(stencilGlyph, 'wide')).toBe('█');
    expect(resolveGlyph(stencilGlyph, 'basic')).toBe('█');
  });

  it('falls back to an ASCII glyph on terminals without unicode', () => {
    expect(resolveGlyph(stencilGlyph, 'none')).toBe('#');
  });
});

describe('highlightColor', () => {
  it('exposes a corona Color that callers can apply via .fg()', () => {
    expect(typeof highlightColor.fg).toBe('function');
    expect(typeof highlightColor.bg).toBe('function');
  });

  it('preserves the legacy white default for visual continuity (B4)', () => {
    expect(highlightColor.fg()).toMatch(/255/);
  });
});
