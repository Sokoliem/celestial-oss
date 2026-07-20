/**
 * Popover glyph tokens — design-system review Phase 2.1 (B1).
 *
 * The popover surface uses caret glyphs along its anchor-facing edge. Side
 * carets (top/bottom/left/right) delegate to anchored-overlay's `caretFor()`,
 * which is itself token-driven. The popover-specific caret is the `center`
 * variant — a diamond/star glyph rendered when the popover is positioned at
 * the center (no anchor side to point at).
 *
 * Consumer: `packages/constellation/src/popover.ts`.
 *
 * @experimental — Stability per ADR 0003. Will graduate once a second
 * consumer (beacon / quasar / community popover variant) adopts the token.
 */

import type { GlyphToken } from '../glyphs.js';

/**
 * Popover caret glyph tokens. Side carets are covered by anchored-overlay's
 * `caretFor()`; this token covers the popover-only `center` caret.
 */
export interface PopoverGlyphTokens {
  /** Caret rendered when the popover is positioned at center (no anchor side). */
  centerCaret: GlyphToken;
}

/**
 * Default popover glyph tokens.
 *
 * `centerCaret` defaults to a filled diamond at the wide level, with an ASCII
 * star fallback for terminals without unicode geometric shapes.
 */
export const popoverGlyphs: PopoverGlyphTokens = {
  centerCaret: { full: '', wide: '◆', basic: '*', none: '*' },
};
