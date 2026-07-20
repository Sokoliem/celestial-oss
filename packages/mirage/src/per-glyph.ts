/**
 * Per-glyph easing for mirage.
 *
 * Applies an aurora tween to each cell's color or intensity over a region,
 * with configurable stagger between cells. This creates wave-like animation
 * where each character starts its own animation `index * stagger` ms after
 * the previous one.
 *
 * Integrates with aurora easing functions (imported, not re-implemented).
 */

import type { EasingFn } from '@celestial/aurora';
import { easing as auroraEasing } from '@celestial/aurora';
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { mapTextContent } from './compose.js';
import { interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemes, RESET, stripAnsi } from './utils.js';

// ---------------------------------------------------------------------------
// ease convenience re-export
// ---------------------------------------------------------------------------

/**
 * Re-exported aurora easing functions for use with `perGlyph`.
 *
 * @example
 *   perGlyph({ ease: ease.sine, ... })
 */
export const ease = {
  linear: auroraEasing.linear,
  sine: auroraEasing.easeInOutSine,
  easeIn: auroraEasing.easeIn,
  easeOut: auroraEasing.easeOut,
  easeInOut: auroraEasing.easeInOut,
  bounce: auroraEasing.bounce,
  elastic: auroraEasing.elastic,
  back: auroraEasing.easeInOutBack,
  expo: auroraEasing.easeInOutExpo,
  circ: auroraEasing.easeInOutCirc,
} as const;

// ---------------------------------------------------------------------------
// PerGlyphOpts
// ---------------------------------------------------------------------------

export type PerGlyphProperty = 'color' | 'intensity' | 'offset';

export interface PerGlyphOpts extends MotionEffectOpts {
  /**
   * Which visual property to animate per cell.
   *
   * - `'color'` — interpolates foreground color from `from` to `to`.
   * - `'intensity'` — scales the lightness of the `from` color from 0 to full.
   *   `to` is used as the bright target; `from` as the dim base.
   * - `'offset'` — horizontally shifts the character by a sub-cell amount.
   *   Falls back to color animation when the renderer does not support offset.
   *
   * Default: `'color'`.
   */
  property?: PerGlyphProperty;

  /** Starting color for the interpolation. Required for `color` and `intensity`. */
  from: Color;

  /** Ending color for the interpolation (for `color`). Also used as the bright
   * target for `intensity`. Required. */
  to: Color;

  /** Aurora easing function applied to each cell's local progress. Default: `ease.sine`. */
  ease?: EasingFn;

  /** Delay in ms between each successive cell's animation start. Default: 30ms. */
  stagger?: number;

  /** Duration of each individual cell's animation in ms. Default: 800ms. */
  duration?: number;

  /**
   * Current time in milliseconds (monotonic, same epoch as `performance.now`).
   * Required — drives the per-cell animation progress.
   */
  nowMs: number;
}

// ---------------------------------------------------------------------------
// perGlyph()
// ---------------------------------------------------------------------------

/**
 * Apply per-cell eased animation to every visible character in a VNode tree.
 *
 * Each character starts its animation `index * stagger` ms after the previous
 * one. Progress for each cell is computed as:
 *
 *   localProgress = clamp((nowMs - cellStartMs) / duration, 0, 1)
 *   easedProgress = easeFn(localProgress)
 *
 * The result is a `(node: VNode) => VNode` function compatible with `compose()`.
 *
 * @example
 *   const wave = perGlyph({
 *     property: 'color',
 *     from: color.rgb(68, 68, 68),
 *     to: color.rgb(255, 255, 255),
 *     ease: ease.sine,
 *     stagger: 30,
 *     duration: 800,
 *     nowMs: performance.now(),
 *   });
 *   const node = wave(textNode);
 */
export function perGlyph(opts: PerGlyphOpts): (node: VNode) => VNode {
  const property = opts.property ?? 'color';
  const easeFn = opts.ease ?? ease.sine;
  const stagger = opts.stagger ?? 30;
  const duration = opts.duration ?? 800;
  const nowMs = motionTick({ ...opts, tick: opts.nowMs }, Number.POSITIVE_INFINITY);

  // We use a shared index counter that increments as we encounter glyphs.
  // Since mapTextContent visits TextNodes in document order, this produces
  // consistent left-to-right stagger across multi-line / nested trees.
  let glyphIndex = 0;

  function transformContent(content: string): string {
    const visible = stripAnsi(content);
    const chars = graphemes(visible);
    if (chars.length === 0) return content;

    let result = '';

    for (let i = 0; i < chars.length; i++) {
      const cellIndex = glyphIndex++;
      const cellStartMs = cellIndex * stagger;
      const rawProgress = Math.max(0, Math.min(1, (nowMs - cellStartMs) / Math.max(1, duration)));
      const easedProgress = easeFn(rawProgress);

      const ch = chars[i]!;

      switch (property) {
        case 'color': {
          const c = interpolateColor(opts.from, opts.to, easedProgress);
          result += c.fg() + ch;
          break;
        }
        case 'intensity': {
          // Interpolate from dim base (from) toward bright target (to) by easedProgress.
          const c = interpolateColor(opts.from, opts.to, easedProgress);
          result += c.fg() + ch;
          break;
        }
        case 'offset': {
          // Sub-cell horizontal offset is not supported by all renderers.
          // We fall back to the same color interpolation as 'color'.
          const c = interpolateColor(opts.from, opts.to, easedProgress);
          result += c.fg() + ch;
          break;
        }
      }
    }

    return result + RESET;
  }

  return (node: VNode): VNode => {
    glyphIndex = 0; // reset for each call so the same perGlyph instance is reusable
    return mapTextContent(node, transformContent);
  };
}

// ---------------------------------------------------------------------------
// Convenience stagger math helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Compute the eased progress for a single cell given timing parameters.
 *
 * @param cellIndex    Zero-based cell position.
 * @param nowMs        Current monotonic time in ms.
 * @param stagger      Delay between cells in ms.
 * @param duration     Animation duration per cell in ms.
 * @param easeFn       Easing function.
 * @returns            Eased progress in [0, 1].
 */
export function cellProgress(cellIndex: number, nowMs: number, stagger: number, duration: number, easeFn: EasingFn = ease.sine): number {
  const cellStartMs = cellIndex * stagger;
  const rawProgress = Math.max(0, Math.min(1, (nowMs - cellStartMs) / Math.max(1, duration)));
  return easeFn(rawProgress);
}
