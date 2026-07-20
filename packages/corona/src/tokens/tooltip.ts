/**
 * Tooltip glyph tokens — design-system review Phase 2.2 (B2).
 *
 * The tooltip currently renders the same prefix glyph (`'┌'`) for every
 * variant, which means visually identical default/success/warning/danger/info
 * tooltips — a regression of the variant contract. This token vocabulary
 * provides distinct semantic glyphs per variant.
 *
 * Consumer: `packages/constellation/src/tooltip.ts`.
 *
 * @experimental — Stability per ADR 0003. Will graduate once a second
 * consumer adopts the variant glyphs.
 */

import type { GlyphToken } from '../glyphs.js';

export type TooltipVariantKind = 'default' | 'success' | 'warning' | 'danger' | 'info';

/**
 * Tooltip variant glyph tokens. Each variant resolves to a distinct semantic
 * glyph at the wide unicode level; default keeps the existing top-left corner
 * for visual continuity with prior releases.
 */
export const tooltipVariantGlyphs: Record<TooltipVariantKind, GlyphToken> = {
  default: { full: '┌', wide: '┌', basic: '┌', none: '+' },
  success: { full: '', wide: '✓', basic: '+', none: 'OK' },
  warning: { full: '', wide: '⚠', basic: '!', none: '!' },
  danger: { full: '', wide: '✕', basic: 'X', none: 'X' },
  info: { full: '', wide: 'ⓘ', basic: 'i', none: 'i' },
};
