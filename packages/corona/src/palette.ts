/**
 * Palette Generation from Seed Color
 *
 * Generates multi-scale color palettes from a single seed color using
 * color harmony rules applied in OKLCH space.
 */

import type { Color } from './color.js';
import { color as colorNs } from './color.js';
import { type ColorScale, generateScale } from './theme.js';

export type PaletteMode = 'analogous' | 'complementary' | 'triadic' | 'split-complementary' | 'monochromatic';

export interface Palette {
  /** Primary color scale (from the seed) */
  readonly primary: ColorScale;
  /** Secondary color scale (harmony-derived) */
  readonly secondary: ColorScale;
  /** Tertiary color scale (harmony-derived, same as primary for complementary) */
  readonly tertiary: ColorScale;
  /** Raw harmony base colors before scale generation */
  readonly colors: readonly Color[];
}

/**
 * Generate a full palette (three ColorScales) from a seed color and harmony mode.
 */
export function generatePalette(seed: Color, mode: PaletteMode): Palette {
  const colors = getHarmonyColors(seed, mode);
  return {
    primary: generateScale(colors[0]!),
    secondary: generateScale(colors[1] ?? colors[0]!),
    tertiary: generateScale(colors[2] ?? colors[1] ?? colors[0]!),
    colors: Object.freeze([...colors]),
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function getHarmonyColors(seed: Color, mode: PaletteMode): Color[] {
  switch (mode) {
    case 'analogous':
      return colorNs.analogous(seed, 3, 30);

    case 'complementary':
      return [seed, colorNs.complement(seed)];

    case 'triadic':
      return [...colorNs.triad(seed)];

    case 'split-complementary': {
      const comp = colorNs.complement(seed);
      const splits = colorNs.analogous(comp, 2, 30);
      return [seed, splits[0]!, splits[1]!];
    }

    case 'monochromatic': {
      const lch = seed.oklch;
      if (!lch) return [seed, seed, seed];
      const [l, c, h] = lch;
      const lighter = colorNs.oklch(Math.min(1, l + 0.15), c, h);
      const darker = colorNs.oklch(Math.max(0, l - 0.15), c, h);
      return [seed, lighter, darker];
    }
  }
}
