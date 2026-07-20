import { describe, expect, it } from 'vitest';
import { resolveGlyph } from '../glyphs.js';
import { defaultTheme } from '../theme.js';
import { defaultProgressBarTokens } from '../tokens/progress-bar.js';

describe('defaultProgressBarTokens', () => {
  it('wide level uses block characters', () => {
    expect(resolveGlyph(defaultProgressBarTokens.filled, 'wide')).toBe('█');
    expect(resolveGlyph(defaultProgressBarTokens.empty, 'wide')).toBe('░');
  });

  it('basic level downgrades to ASCII #/-', () => {
    expect(resolveGlyph(defaultProgressBarTokens.filled, 'basic')).toBe('#');
    expect(resolveGlyph(defaultProgressBarTokens.empty, 'basic')).toBe('-');
  });

  it('none level downgrades to pure ASCII =/-', () => {
    expect(resolveGlyph(defaultProgressBarTokens.filled, 'none')).toBe('=');
    expect(resolveGlyph(defaultProgressBarTokens.empty, 'none')).toBe('-');
  });

  it('brackets default to [/]', () => {
    expect(defaultProgressBarTokens.brackets?.open).toBe('[');
    expect(defaultProgressBarTokens.brackets?.close).toBe(']');
  });

  it('filledColor resolves to accent against default theme', () => {
    const c = defaultProgressBarTokens.filledColor(defaultTheme);
    expect(c).toBeDefined();
    expect(c).toBe(defaultTheme.colors.tones.accent);
  });

  it('emptyColor resolves to muted against default theme', () => {
    const c = defaultProgressBarTokens.emptyColor(defaultTheme);
    expect(c).toBe(defaultTheme.colors.muted);
  });
});
