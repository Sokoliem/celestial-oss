/**
 * Corona — Surface tokens (Phase 0 P0-11 + addendum).
 *
 * Centralizes z-stack ordering, scrollbar / track / caret / range / toggle /
 * rail / selection-prefix / checkbox glyphs, and the annotation-highlight
 * palette into corona. Consumers (constellation primitives, wrapper handrolls
 * being migrated, downstream apps) read these tokens instead of embedding
 * the values inline.
 *
 * All additions are pure constants — no API changes to existing tokens.
 *
 * Promotion ledger:
 *   - `surfaceZTokens` ............. P0-11 (PRD §7.2.2)
 *   - `scrollbarGlyphs` ............ P0-11
 *   - `annotationHighlightTokens` .. P0-11 (DomainTokenFamily over the colour
 *     palette; cycled by index)
 *   - `trackGlyphs` ................ Phase −1 addendum WRAP-028
 *   - `caretGlyph` ................. Phase −1 addendum WRAP-028 / WRAP-032
 *   - `rangeIndicatorGlyphs` ....... Phase −1 addendum WRAP-028
 *   - `toggleTrackGlyphs` .......... Phase −1 addendum WRAP-028 / WRAP-032
 *   - `railGlyph` .................. Phase −1 addendum WRAP-029
 *   - `selectionPrefixGlyphs` ...... Phase −1 addendum WRAP-031
 *   - `checkboxGlyphs` ............. Phase −1 addendum WRAP-032
 */

import type { Color } from './color.js';
import { color } from './color.js';
import { type DomainTokenContract, defineDomainTokens } from './domain-tokens.js';
import type { GlyphToken } from './glyphs.js';
import type { SemanticTheme } from './theme.js';

// ─── Z-stack ─────────────────────────────────────────────────────────────────

/**
 * Canonical z-stack ordering for surfaces. Higher number paints on top.
 *
 * Ordering rationale:
 *  - backdrop (10)  — dim shroud behind a modal/drawer
 *  - overlay  (20)  — modal/drawer/popover body
 *  - menu     (30)  — context menus float above their owning surface
 *  - tooltip  (40)  — hover tooltips above menus
 *  - toast    (50)  — toast stack above non-blocking UI
 *  - panic    (60)  — emergency surfaces (eg. crash dialog) win every contest
 *
 * Values are intentionally spaced by 10 so that consumers can insert a
 * one-off layer between two canonical levels without re-numbering.
 */
export type SurfaceZKind = 'backdrop' | 'overlay' | 'menu' | 'tooltip' | 'toast' | 'panic';

export const surfaceZTokens: Readonly<Record<SurfaceZKind, number>> = Object.freeze({
  backdrop: 10,
  overlay: 20,
  menu: 30,
  tooltip: 40,
  toast: 50,
  panic: 60,
});

/** Lookup with explicit fallback to `overlay` when a kind is unknown. */
export function resolveSurfaceZ(kind: SurfaceZKind | string | undefined): number {
  if (!kind) return surfaceZTokens.overlay;
  if (kind in surfaceZTokens) return surfaceZTokens[kind as SurfaceZKind];
  return surfaceZTokens.overlay;
}

// ─── Scrollbar glyphs ────────────────────────────────────────────────────────

/**
 * Canonical scrollbar glyph palette. Used by `constellation/scrollbar` and
 * any wrapper-side scrollbar adapter migrating off `wrapper-scrollbar.ts`.
 */
export interface ScrollbarGlyphs {
  readonly track: string;
  readonly thumbIdle: string;
  readonly thumbHover: string;
  readonly thumbActive: string;
}

export const scrollbarGlyphs: ScrollbarGlyphs = Object.freeze({
  track: '░',
  thumbIdle: '▒',
  thumbHover: '▓',
  thumbActive: '█',
});

// ─── Track / caret / range / toggle glyphs (Phase −1 addendum) ──────────────

/**
 * Filled / empty cells for slider, range, color, and progress tracks
 * rendered inside field-adapters or wrapper widgets. Symmetric with
 * `scrollbarGlyphs.thumbActive / track` but exposed as a separate token
 * because the consumption pattern is different (no idle/hover variants).
 */
export interface TrackGlyphs {
  readonly filled: string;
  readonly empty: string;
}

export const trackGlyphs: TrackGlyphs = Object.freeze({
  filled: '█',
  empty: '░',
});

/** Caret indicator (text-input cursor, edit-mode marker). */
export const caretGlyph = '▌';

/**
 * Range indicators for two-handle range inputs. `low` marks the lower handle
 * direction; `high` marks the upper handle direction.
 */
export interface RangeIndicatorGlyphs {
  readonly low: string;
  readonly high: string;
}

export const rangeIndicatorGlyphs: RangeIndicatorGlyphs = Object.freeze({
  low: '◄',
  high: '►',
});

/**
 * Toggle-track glyphs (the `[●━━━]` / `[━━━○]` template used by toggle
 * field-adapters). Values are template strings; consumers render them
 * literally.
 */
export interface ToggleTrackGlyphs {
  readonly on: string;
  readonly off: string;
}

export const toggleTrackGlyphs: ToggleTrackGlyphs = Object.freeze({
  on: '[●━━━]',
  off: '[━━━○]',
});

/** Vertical accent rail glyph used by chips and sidebar list rows. */
export const railGlyph = '▌';

/**
 * Selection-state prefix glyphs (selected / active / muted) used by
 * studios and quick-action surfaces to render keyboard-cursor state in a
 * single column.
 */
export interface SelectionPrefixGlyphs {
  readonly selected: string;
  readonly active: string;
  readonly muted: string;
}

export const selectionPrefixGlyphs: SelectionPrefixGlyphs = Object.freeze({
  selected: '▸',
  active: '●',
  muted: '·',
});

/**
 * Checkbox/radio string templates used inside string content (eg. studio
 * property panels that compose labels via `\`[✓] Option A\``). Distinct
 * from the `ThemeGlyphs.checked / unchecked` entries which are unicode
 * code-points consumed by adapter views — these are full templated cells.
 */
export interface CheckboxGlyphs {
  readonly checked: string;
  readonly unchecked: string;
}

export const checkboxGlyphs: CheckboxGlyphs = Object.freeze({
  checked: '[✓]',
  unchecked: '[ ]',
});

// ─── Glyph-token fallbacks for terminal capability resolution ───────────────

/**
 * `GlyphToken` (full/wide/basic/none) variants of the surface glyphs above —
 * used by callers that need to honor `atlas` unicode-level detection. The
 * canonical exports above remain string constants for the common case where
 * the renderer is fixed to `wide` or higher.
 */
export const surfaceGlyphTokens: Readonly<{
  rail: GlyphToken;
  caret: GlyphToken;
  rangeLow: GlyphToken;
  rangeHigh: GlyphToken;
  trackFilled: GlyphToken;
  trackEmpty: GlyphToken;
  scrollbarTrack: GlyphToken;
  scrollbarThumbIdle: GlyphToken;
  scrollbarThumbHover: GlyphToken;
  scrollbarThumbActive: GlyphToken;
  selectionSelected: GlyphToken;
  selectionActive: GlyphToken;
  selectionMuted: GlyphToken;
}> = Object.freeze({
  rail: { full: '▌', wide: '▌', basic: '|', none: '|' },
  caret: { full: '▌', wide: '▌', basic: '_', none: '_' },
  rangeLow: { full: '◄', wide: '◄', basic: '<', none: '<' },
  rangeHigh: { full: '►', wide: '►', basic: '>', none: '>' },
  trackFilled: { full: '█', wide: '█', basic: '#', none: '#' },
  trackEmpty: { full: '░', wide: '░', basic: '.', none: '.' },
  scrollbarTrack: { full: '░', wide: '░', basic: '.', none: '.' },
  scrollbarThumbIdle: { full: '▒', wide: '▒', basic: ':', none: ':' },
  scrollbarThumbHover: { full: '▓', wide: '▓', basic: '#', none: '#' },
  scrollbarThumbActive: { full: '█', wide: '█', basic: '#', none: '#' },
  selectionSelected: { full: '▸', wide: '▸', basic: '>', none: '>' },
  selectionActive: { full: '●', wide: '●', basic: '*', none: '*' },
  selectionMuted: { full: '·', wide: '·', basic: '.', none: '.' },
});

// ─── Annotation-highlight palette (P0-11) ───────────────────────────────────

/**
 * A single swatch in the annotation-highlight palette. `bg` is the chip
 * background; `fg` is the readable foreground; `label` is the operator-facing
 * name (kept short).
 */
export interface AnnotationHighlightSwatch {
  readonly bg: Color;
  readonly fg: Color;
  readonly label: string;
}

/**
 * The annotation-highlight palette: a cycle of 8 colour pairs to assign to
 * adjacent annotations so they remain visually distinct. Consumers cycle by
 * index — `palette[index % palette.length]`.
 *
 * Colour choices: low-saturation pastel backgrounds with dark foregrounds so
 * the same swatch reads on light and dark terminals. The palette is exposed
 * both as a static cycle (`annotationHighlightSwatches`) and as a corona
 * `DomainTokenContract` keyed `slot1..slot8` so apps can theme it.
 */
export const annotationHighlightSwatches: readonly AnnotationHighlightSwatch[] = Object.freeze([
  Object.freeze({ bg: color.rgb(254, 226, 226), fg: color.rgb(127, 29, 29), label: 'rose' }),
  Object.freeze({ bg: color.rgb(255, 237, 213), fg: color.rgb(124, 45, 18), label: 'sand' }),
  Object.freeze({ bg: color.rgb(254, 249, 195), fg: color.rgb(113, 63, 18), label: 'sun' }),
  Object.freeze({ bg: color.rgb(220, 252, 231), fg: color.rgb(20, 83, 45), label: 'leaf' }),
  Object.freeze({ bg: color.rgb(207, 250, 254), fg: color.rgb(14, 78, 110), label: 'sky' }),
  Object.freeze({ bg: color.rgb(219, 234, 254), fg: color.rgb(30, 58, 138), label: 'tide' }),
  Object.freeze({ bg: color.rgb(237, 233, 254), fg: color.rgb(59, 7, 100), label: 'lilac' }),
  Object.freeze({ bg: color.rgb(252, 231, 243), fg: color.rgb(131, 24, 67), label: 'fig' }),
]) as readonly AnnotationHighlightSwatch[];

export type AnnotationHighlightSlot =
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'slot6'
  | 'slot7'
  | 'slot8';

/**
 * Resolve a swatch by index, cycling on overflow. Index may be any
 * non-negative integer (callers typically pass a stable annotation id hash).
 */
export function resolveAnnotationHighlight(index: number): AnnotationHighlightSwatch {
  const safe = Math.max(0, Math.floor(index));
  const swatch = annotationHighlightSwatches[safe % annotationHighlightSwatches.length];
  return swatch!;
}

/**
 * Domain-token contract exposing the annotation palette as theme-aware bg+fg
 * pairs. Apps can override individual slots via `resolveDomainTokens(
 * annotationHighlightTokens, theme, { slot1: { bg, fg, label: 'rose' } })`.
 */
export interface AnnotationHighlightTokenValues {
  readonly slot1: AnnotationHighlightSwatch;
  readonly slot2: AnnotationHighlightSwatch;
  readonly slot3: AnnotationHighlightSwatch;
  readonly slot4: AnnotationHighlightSwatch;
  readonly slot5: AnnotationHighlightSwatch;
  readonly slot6: AnnotationHighlightSwatch;
  readonly slot7: AnnotationHighlightSwatch;
  readonly slot8: AnnotationHighlightSwatch;
}

export const annotationHighlightTokens: DomainTokenContract<AnnotationHighlightTokenValues> = defineDomainTokens({
  slot1: (_t: SemanticTheme) => annotationHighlightSwatches[0]!,
  slot2: (_t: SemanticTheme) => annotationHighlightSwatches[1]!,
  slot3: (_t: SemanticTheme) => annotationHighlightSwatches[2]!,
  slot4: (_t: SemanticTheme) => annotationHighlightSwatches[3]!,
  slot5: (_t: SemanticTheme) => annotationHighlightSwatches[4]!,
  slot6: (_t: SemanticTheme) => annotationHighlightSwatches[5]!,
  slot7: (_t: SemanticTheme) => annotationHighlightSwatches[6]!,
  slot8: (_t: SemanticTheme) => annotationHighlightSwatches[7]!,
});
