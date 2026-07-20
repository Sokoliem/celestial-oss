/**
 * Mirage-effect tokens — design-system review Phase 2.3 + 2.4 (B3, B4).
 *
 * `stencilGlyph` — full-block character used as the default mirage stencil
 * background. The full-block character is universal across terminals, so the
 * fallback chain collapses to the same glyph at every unicode level. Defined
 * here (corona) rather than mirage so multi-effect consumers can share a
 * single token vocabulary.
 *
 * `highlightColor` — semantic highlight color used by mirage's eased,
 * effects, spotlight, and underline-wave effects. Defaults to the existing
 * white literal so visible rendering is unchanged at the default theme; the
 * token lets themes override the highlight semantic in one place.
 *
 * Consumers:
 *   - `packages/mirage/src/stencil.ts` (stencilGlyph)
 *   - `packages/mirage/src/eased.ts` (highlightColor)
 *   - `packages/mirage/src/effects.ts` (highlightColor)
 *   - `packages/mirage/src/spotlight.ts` (highlightColor)
 *   - `packages/mirage/src/underline-wave.ts` (highlightColor)
 *
 * @experimental — Stability per ADR 0003. Will graduate once a second
 * consumer (beyond mirage) adopts these tokens.
 */

import { type Color, color as coronaColor } from '../color.js';
import type { GlyphToken } from '../glyphs.js';

/**
 * Stencil glyph for mirage's filled-background effects. Full-block (█) is
 * universal across modern terminals, so the fallback chain renders the same
 * glyph at every unicode level.
 */
export const stencilGlyph: GlyphToken = {
  full: '█',
  wide: '█',
  basic: '█',
  none: '#',
};

/**
 * Default highlight color for mirage effects. Pure white at RGB(255,255,255)
 * preserves prior visible rendering; themes override by re-defining the token.
 */
export const highlightColor: Color = coronaColor.rgb(255, 255, 255);
