/**
 * Corona Gradient System
 *
 * First-class gradient type with OKLAB-space color interpolation for
 * perceptually uniform color stops. Compatible with the rest of the
 * corona color ecosystem.
 */

import type { Color } from './color.js';
import { color as colorNs } from './color.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single color stop at a normalized position (0–1) within a gradient. */
export interface GradientStop {
  /** Normalized position within the gradient. 0 = start, 1 = end. */
  at: number;
  /** Color at this stop. */
  color: Color;
}

/**
 * An immutable gradient that can be sampled at any position (0–1).
 *
 * Colors between stops are interpolated in OKLAB space for perceptually
 * uniform transitions — avoiding the muddy sRGB midpoints common in
 * other gradient implementations.
 */
export interface Gradient {
  /** The normalized color stops (sorted by position). */
  readonly stops: readonly GradientStop[];
  /**
   * Sample the gradient at position t (0–1).
   *
   * t < 0 clamps to the first stop; t > 1 clamps to the last stop.
   */
  sample(t: number): Color;
}

// ── Implementation ───────────────────────────────────────────────────────────

class GradientImpl implements Gradient {
  readonly stops: readonly GradientStop[];

  constructor(stops: GradientStop[]) {
    // Sort stops by position and freeze
    this.stops = Object.freeze([...stops].sort((a, b) => a.at - b.at));
  }

  sample(t: number): Color {
    const clamped = Math.max(0, Math.min(1, t));
    const { stops } = this;

    if (stops.length === 0) return colorNs.white;
    if (stops.length === 1) return stops[0]!.color;

    // At or before first stop
    if (clamped <= stops[0]!.at) return stops[0]!.color;
    // At or after last stop
    if (clamped >= stops[stops.length - 1]!.at) return stops[stops.length - 1]!.color;

    // Find the bounding stops
    let lower = stops[0]!;
    let upper = stops[stops.length - 1]!;

    for (let i = 0; i < stops.length - 1; i++) {
      if (clamped >= stops[i]!.at && clamped <= stops[i + 1]!.at) {
        lower = stops[i]!;
        upper = stops[i + 1]!;
        break;
      }
    }

    if (lower.at === upper.at) return lower.color;

    const localT = (clamped - lower.at) / (upper.at - lower.at);
    return colorNs.lerp(lower.color, upper.color, localT);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a gradient from an array of color stops or a shorthand array of colors.
 *
 * Accepts two forms:
 *
 * **Explicit stops** (with position):
 * ```ts
 * gradient([
 *   { at: 0,   color: color.blue },
 *   { at: 0.5, color: color.yellow },
 *   { at: 1,   color: color.red },
 * ])
 * ```
 *
 * **Implicit stops** (evenly spaced colors):
 * ```ts
 * gradient([color.blue, color.yellow, color.red])
 * ```
 *
 * The returned `Gradient` can be sampled at any position (0–1) using OKLAB
 * interpolation for perceptually uniform color transitions.
 */
export function gradient(stops: GradientStop[] | Color[]): Gradient {
  if (stops.length === 0) {
    return new GradientImpl([]);
  }

  // Detect whether stops are Color objects or GradientStop objects.
  // GradientStop has an `at` number property; Color has `fg`/`bg` methods.
  const isColorArray = typeof (stops[0] as Color).fg === 'function';

  if (isColorArray) {
    const colors = stops as Color[];
    if (colors.length === 1) {
      return new GradientImpl([{ at: 0, color: colors[0]! }]);
    }
    const normalized: GradientStop[] = colors.map((c, i) => ({
      at: i / (colors.length - 1),
      color: c,
    }));
    return new GradientImpl(normalized);
  }

  return new GradientImpl(stops as GradientStop[]);
}
