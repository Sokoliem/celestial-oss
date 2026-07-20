import { type Color, color as coronaColor } from '@celestial/corona';

/**
 * Convert a Color to HSL values.
 * Returns [h, s, l] where h is 0-360, s is 0-100, l is 0-100.
 */
export function colorToHSL(c: Color): [number, number, number] {
  const rgb = c.rgb;
  if (!rgb) {
    // Colors without rgb (e.g. reset) are treated as black
    return [0, 0, 0];
  }

  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }

    if (h < 0) {
      h += 360;
    }
  }

  return [h, s * 100, l * 100];
}

/**
 * Interpolate between two OKLAB values.
 * ratio is clamped to 0-1.
 */
export function interpolateOKLAB(l1: number, a1: number, b1: number, l2: number, a2: number, b2: number, ratio: number): [number, number, number] {
  ratio = Math.max(0, Math.min(1, ratio));
  return [l1 + (l2 - l1) * ratio, a1 + (a2 - a1) * ratio, b1 + (b2 - b1) * ratio];
}

/**
 * Interpolate between two OKLCH values, taking the shortest hue path.
 * ratio is clamped to 0-1.
 */
export function interpolateOKLCH(l1: number, c1: number, h1: number, l2: number, c2: number, h2: number, ratio: number): [number, number, number] {
  ratio = Math.max(0, Math.min(1, ratio));

  // Shortest path for hue interpolation
  let dh = h2 - h1;
  if (dh > 180) {
    dh -= 360;
  } else if (dh < -180) {
    dh += 360;
  }

  let h = h1 + dh * ratio;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;

  return [l1 + (l2 - l1) * ratio, c1 + (c2 - c1) * ratio, h];
}

/**
 * Interpolate between two Colors, returning a new Color.
 * Uses OKLAB linear interpolation for perceptually uniform results.
 *
 * Delegates to `color.lerp` from @celestial/corona.
 */
export function interpolateColor(from: Color, to: Color, ratio: number): Color {
  return coronaColor.lerp(from, to, ratio);
}
