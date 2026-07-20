/**
 * Progress bar tokens — glyph and color contract for a horizontal bar.
 *
 * Used by `progressBarView` in constellation. Centralizing here lets themes
 * override the fill/empty glyphs (and bracket characters) without touching
 * individual builders.
 */

import type { Color } from '../color.js';
import type { GlyphToken } from '../glyphs.js';
import type { SemanticTheme } from '../theme.js';

export interface ProgressBarTokens {
  readonly filled: GlyphToken;
  readonly empty: GlyphToken;
  readonly filledColor: (t: SemanticTheme) => Color;
  readonly emptyColor: (t: SemanticTheme) => Color;
  readonly brackets?: { open: string; close: string };
}

export const defaultProgressBarTokens: ProgressBarTokens = {
  filled: { full: '', wide: '█', basic: '#', none: '=' },
  empty: { full: '', wide: '░', basic: '-', none: '-' },
  filledColor: (t) => t.colors.tones.accent,
  emptyColor: (t) => t.colors.muted,
  brackets: { open: '[', close: ']' },
};
