/**
 * Subcell outline — single-column subcell density bar.
 *
 * Renders a vertical "outline" or minimap column where each terminal cell
 * encodes the aggregate density of a window of source lines using
 * subcell graphics (octant when supported, sextant by default, braille
 * or quarter as deeper fallbacks). Same primitive used for diff
 * minimaps (parallax), markdown outlines (pulsar), and code-structure
 * overviews (spectrum).
 *
 * The host supplies a per-line density and gets back a renderable column
 * plus a row → source-line index map for wiring hover-peek and
 * click-to-scroll.
 *
 * Mode selection:
 *   - `mode: 'auto'` (default) — picks octant if `caps.unicodeOctant` is
 *     true, otherwise sextant (the primary fallback). See
 *     `resolveCanvasMode` for the full chain.
 *   - Any explicit `CanvasMode` ('braille' | 'sextant' | 'octant' | …)
 *     bypasses the resolver and is rendered as-is.
 *
 * Naming: the primitive was originally exported as `sextantOutline`.
 * That name is kept as a back-compat alias for one minor cycle and
 * may be removed thereafter; new callers should use `subcellOutline`.
 */
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { canvas } from './canvas.js';
import type { CanvasModeOrAuto, ModeCapabilities } from './resolve-mode.js';
import { clamp, nonNegativeInteger } from './validation.js';

// ── Types ────────────────────────────────────────────────────────────────

/** Reducer used when collapsing many source lines into a single cell row. */
export type DensityReducer = 'mean' | 'max' | 'sum';

export interface SubcellOutlineOpts {
  /**
   * Per-source-line density values. Length is the source-line count.
   * Normalized 0..1; values <0 are clamped to 0, >1 to 1.
   */
  readonly density: readonly number[];
  /**
   * Optional second channel — same length as `density`. When present, the
   * outline splits its 2 sub-columns: primary on the left, secondary on
   * the right. Useful for diff add/remove visualisation.
   */
  readonly secondaryDensity?: readonly number[];
  /** Number of terminal cell rows in the rendered column. */
  readonly height: number;
  /**
   * Subcell mode. Default `'auto'` — resolves to `'octant'` on terminals
   * with Unicode 16 octant glyph coverage, `'sextant'` everywhere else.
   */
  readonly mode?: CanvasModeOrAuto;
  /**
   * Capability snapshot used when `mode === 'auto'`. Hosts that have an
   * `@celestial/atlas` capability object can adapt it via
   * `{ unicodeOctant: hasUnicodeOctants(caps), unicodeSextant: hasUnicodeSextants(caps) }`.
   * Optional — when omitted, `'auto'` falls back to sextant.
   */
  readonly caps?: ModeCapabilities;
  /** Reducer used to aggregate source-line densities per cell row. Default `'max'`. */
  readonly reducer?: DensityReducer;
  /** Foreground color for the primary channel. Optional. */
  readonly color?: Color;
  /** Foreground color for the secondary channel. Optional. */
  readonly secondaryColor?: Color;
  /**
   * Threshold below which a row is considered empty (no pixels set).
   * Default `0` — any positive density paints at least one pixel.
   */
  readonly threshold?: number;
}

export interface SubcellOutlineRow {
  /** Aggregate primary density used for this row, after the reducer. */
  readonly primary: number;
  /** Aggregate secondary density (`undefined` if no secondary channel). */
  readonly secondary?: number;
  /** Inclusive start index into the source-line array. */
  readonly lineStart: number;
  /** Exclusive end index into the source-line array. */
  readonly lineEnd: number;
}

export interface SubcellOutlineResult {
  /** Rendered VNode (single column). */
  toVNode(): VNode;
  /** Same content as a styled string with embedded newlines. */
  toString(): string;
  /**
   * Per-row aggregates plus the source-line range each row represents.
   * Hosts use this to map a hovered terminal row → source-line window
   * for wiring hover-peek panels.
   */
  readonly rows: readonly SubcellOutlineRow[];
}

// ── Implementation ───────────────────────────────────────────────────────

/**
 * Render a subcell-density outline.
 *
 * The result has terminal-cell height = `opts.height` and width = 1
 * cell. Each cell row is computed by mapping its slice of `density`
 * through `reducer`, normalising, and lighting the proportional number
 * of subcells from the bottom up (so taller bars look heavier).
 *
 * When `secondaryDensity` is supplied the column splits into a 2-channel
 * stack: primary occupies the left sub-column, secondary the right.
 */
export function subcellOutline(opts: SubcellOutlineOpts): SubcellOutlineResult {
  const { density, secondaryDensity, mode = 'auto', caps, color, secondaryColor } = opts;
  const height = Math.min(100_000, nonNegativeInteger(opts.height, 0));
  const reducer: DensityReducer = opts.reducer === 'mean' || opts.reducer === 'sum' ? opts.reducer : 'max';
  const threshold = clamp(opts.threshold, 0, 1, 0);

  if (height <= 0) {
    return { toVNode: () => canvas(0, 0, mode, caps).toVNode(), toString: () => '', rows: [] };
  }

  if (secondaryDensity && secondaryDensity.length !== density.length) {
    throw new RangeError(`subcellOutline: secondaryDensity.length (${secondaryDensity.length}) must equal density.length (${density.length})`);
  }

  const rows = aggregateRows(density, secondaryDensity, height, reducer);
  const c = canvas(1, height, mode, caps);
  const subRows = c.pixelHeight / height; // 3 for sextant, 4 for octant/braille
  const subCols = c.pixelWidth; // always 2 for sextant/octant/braille/quarter

  for (let r = 0; r < height; r++) {
    const row = rows[r]!;
    const cellTopY = r * subRows;
    paintRow(c, cellTopY, subRows, subCols, row.primary, row.secondary, threshold, color, secondaryColor);
  }

  return {
    toVNode: () => c.toVNode(),
    toString: () => c.render(),
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
  };
}

/**
 * Back-compat alias for `subcellOutline`. The primitive's first export
 * shipped under this name; new callers should prefer `subcellOutline`.
 *
 * @deprecated Use `subcellOutline` — this alias may be removed in a
 * future minor.
 */
export const sextantOutline = subcellOutline;

// ── Aggregation ──────────────────────────────────────────────────────────

function aggregateRows(density: readonly number[], secondary: readonly number[] | undefined, height: number, reducer: DensityReducer): SubcellOutlineRow[] {
  const total = density.length;
  const rows: SubcellOutlineRow[] = new Array(height);

  if (total === 0) {
    for (let r = 0; r < height; r++) {
      rows[r] = { primary: 0, secondary: secondary ? 0 : undefined, lineStart: 0, lineEnd: 0 };
    }
    return rows;
  }

  for (let r = 0; r < height; r++) {
    const lineStart = Math.floor((r * total) / height);
    const lineEnd = Math.max(lineStart + 1, Math.floor(((r + 1) * total) / height));
    rows[r] = {
      primary: reduce(density, lineStart, lineEnd, reducer),
      secondary: secondary ? reduce(secondary, lineStart, lineEnd, reducer) : undefined,
      lineStart,
      lineEnd,
    };
  }
  return rows;
}

function reduce(arr: readonly number[], start: number, end: number, kind: DensityReducer): number {
  let sum = 0;
  let max = -Infinity;
  let count = 0;
  for (let i = start; i < end; i++) {
    const v = clamp01(arr[i] ?? 0);
    sum += v;
    if (v > max) max = v;
    count++;
  }
  if (count === 0) return 0;
  switch (kind) {
    case 'mean':
      return sum / count;
    case 'max':
      return max === -Infinity ? 0 : max;
    case 'sum':
      return clamp01(sum);
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

// ── Painting ─────────────────────────────────────────────────────────────

/**
 * Paint a single cell row. Without `secondary`, both sub-columns are
 * lit by `primary`. With `secondary`, the left sub-column shows
 * `primary` and the right shows `secondary` (each independently scaled
 * to subRows resolution).
 */
function paintRow(
  c: ReturnType<typeof canvas>,
  topY: number,
  subRows: number,
  subCols: number,
  primary: number,
  secondary: number | undefined,
  threshold: number,
  primaryColor: Color | undefined,
  secondaryColor: Color | undefined,
): void {
  if (secondary === undefined) {
    if (primary <= threshold) return;
    const dotsToSet = Math.max(1, Math.round(primary * subRows));
    if (primaryColor) c.setColor(primaryColor);
    for (let i = 0; i < dotsToSet; i++) {
      const y = topY + (subRows - 1 - i);
      for (let x = 0; x < subCols; x++) c.set(x, y);
    }
    return;
  }

  // Two-channel: left col = primary, right col = secondary.
  if (primary > threshold) {
    if (primaryColor) c.setColor(primaryColor);
    const dots = Math.max(1, Math.round(primary * subRows));
    for (let i = 0; i < dots; i++) c.set(0, topY + (subRows - 1 - i));
  }
  if (secondary > threshold) {
    if (secondaryColor) c.setColor(secondaryColor);
    const dots = Math.max(1, Math.round(secondary * subRows));
    const rightCol = subCols - 1;
    for (let i = 0; i < dots; i++) c.set(rightCol, topY + (subRows - 1 - i));
  }
}
