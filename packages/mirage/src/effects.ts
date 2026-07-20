import { type Color, color as coronaColor, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { colorToHSL, interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemes, RESET, stripAnsi } from './utils.js';

export interface ShimmerOpts extends MotionEffectOpts {
  tick: number;
  speed?: number;
  color?: Color;
  /** Dim base color. When provided, its HSL lightness is used as the base instead of the default dim value. */
  baseColor?: Color;
  width?: number;
}

export interface GlowOpts {
  color: Color;
  intensity?: number;
}

export interface BreatheOpts extends MotionEffectOpts {
  from: Color;
  to: Color;
  tick: number;
  speed?: number;
}

export interface ColorCycleOpts extends MotionEffectOpts {
  tick: number;
  speed?: number;
  saturation?: number;
  lightness?: number;
}

/**
 * Apply a sweeping shimmer/loading effect to text.
 * Note: This replaces any existing ANSI colors in the text
 * with the shimmer gradient. Use baseColor to control the
 * dim state color.
 *
 * Each visible character's lightness is boosted based on distance from
 * the current band position, which advances with tick.
 */
export function shimmer(text: string, opts: ShimmerOpts): string {
  const visible = stripAnsi(text);
  const chars = graphemes(visible);
  const visibleLen = chars.length;
  if (visibleLen === 0) return '';

  const speed = opts.speed ?? 1;
  const highlightColor = opts.color ?? defaultHighlightColor;
  const width = opts.width ?? 3;
  const halfWidth = width / 2;

  const [hh, sh, lh] = colorToHSL(highlightColor);

  // Determine base color HSL: use provided baseColor, or default dim version of highlight
  let baseH = 0;
  let baseS = 0;
  let baseLightness = 30; // default dim base
  if (opts.baseColor) {
    const [bh, bs, bl] = colorToHSL(opts.baseColor);
    baseH = bh;
    baseS = bs;
    baseLightness = bl;
  }

  const pos = (motionTick(opts) * speed) % visibleLen;

  let result = '';
  for (let i = 0; i < visibleLen; i++) {
    const dist = Math.abs(i - pos);
    // Wrap-around distance
    const wrappedDist = Math.min(dist, visibleLen - dist);

    if (wrappedDist <= halfWidth) {
      // Within the shimmer band: blend toward highlight
      const blend = 1 - wrappedDist / halfWidth;
      // Increase lightness toward the highlight color's lightness
      const l = baseLightness + (lh - baseLightness) * blend;
      const s = baseS + (sh - baseS) * blend;
      const h = hh;
      const c = coronaColor.hsl(h, s, l);
      result += c.fg() + chars[i];
    } else {
      // Outside the band: dim base color
      const c = coronaColor.hsl(baseH, baseS, baseLightness);
      result += c.fg() + chars[i];
    }
  }

  result += RESET;
  return result;
}

/**
 * Glow effect: pads the text with spaces on each side, colored with
 * decreasing intensity of the glow color.
 */
export function glow(text: string, opts: GlowOpts): string {
  const intensity = opts.intensity ?? 2;
  const [h, s, l] = colorToHSL(opts.color);

  let result = '';

  // Left padding: decreasing intensity from outer to inner (background color on spaces)
  for (let d = intensity; d >= 1; d--) {
    const fadedL = l * (1 - d / (intensity + 1));
    const c = coronaColor.hsl(h, s, fadedL);
    result += c.bg() + ' ';
  }

  // The text itself gets full glow color (foreground + background)
  const fullColor = coronaColor.hsl(h, s, l);
  const bgColor = coronaColor.hsl(h, s, l * 0.3);
  const visible = stripAnsi(text);
  result += bgColor.bg() + fullColor.fg() + visible;

  // Right padding: decreasing intensity from inner to outer (background color on spaces)
  for (let d = 1; d <= intensity; d++) {
    const fadedL = l * (1 - d / (intensity + 1));
    const c = coronaColor.hsl(h, s, fadedL);
    result += c.bg() + ' ';
  }

  result += RESET;
  return result;
}

/**
 * Breathe effect: smoothly oscillates between two colors using a sine wave.
 * Applies a single color to the entire text.
 */
export function breathe(text: string, opts: BreatheOpts): string {
  const visible = stripAnsi(text);
  if (visible.length === 0) return '';

  const speed = opts.speed ?? 1;
  const ratio = (Math.sin(motionTick(opts) * speed * 0.2) + 1) / 2;
  const c = interpolateColor(opts.from, opts.to, ratio);

  return c.fg() + visible + RESET;
}

/**
 * Color cycle effect: each character gets a hue that shifts with position
 * and time, creating a moving rainbow.
 */
export function colorCycle(text: string, opts: ColorCycleOpts): string {
  const visible = stripAnsi(text);
  const chars = graphemes(visible);
  if (chars.length === 0) return '';

  const speed = opts.speed ?? 1;
  const saturation = opts.saturation ?? 80;
  const lightness = opts.lightness ?? 60;

  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const hue = (motionTick(opts) * speed * 10 + i * 15) % 360;
    const c = coronaColor.hsl(hue, saturation, lightness);
    result += c.fg() + chars[i];
  }

  result += RESET;
  return result;
}
