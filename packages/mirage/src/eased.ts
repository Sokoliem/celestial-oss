import type { EasingFn } from '@celestial/aurora';
import { easing as easingLib } from '@celestial/aurora';
import { type Color, color as coronaColor, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { colorToHSL, interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { positionedGraphemes, RESET, stripAnsi, visualWidth } from './utils.js';
import { clamp, easedProgress, finiteNumber, positiveNumber, wrap } from './validation.js';

function cellRatio(column: number, glyphWidth: number, totalWidth: number): number {
  if (totalWidth <= glyphWidth) return 0;
  return (column + (glyphWidth - 1) / 2) / (totalWidth - 1);
}

export interface EasedShimmerOpts extends MotionEffectOpts {
  tick: number;
  speed?: number;
  color?: Color;
  baseColor?: Color;
  width?: number;
  cycleTicks?: number;
  easing?: EasingFn;
}

export interface EasedBreatheOpts extends MotionEffectOpts {
  from: Color;
  to: Color;
  tick: number;
  speed?: number;
  cycleTicks?: number;
  easing?: EasingFn;
}

export interface EasedColorCycleOpts extends MotionEffectOpts {
  tick: number;
  speed?: number;
  saturation?: number;
  lightness?: number;
  easing?: EasingFn;
}

export interface AnimatedGradientOpts extends MotionEffectOpts {
  colors: Color[];
  tick: number;
  speed?: number;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
}

/**
 * Shimmer effect with eased band position.
 *
 * The band position is computed by applying an easing function to the
 * linear progress through each cycle, producing smoother or bouncier
 * sweeps depending on the chosen easing.
 */
export function easedShimmer(text: string, opts: EasedShimmerOpts): string {
  const visible = stripAnsi(text);
  const glyphs = positionedGraphemes(visible);
  const visibleLen = visualWidth(visible);
  if (visibleLen === 0) return '';

  const speed = finiteNumber(opts.speed, 1);
  const cycleTicks = positiveNumber(opts.cycleTicks, 60);
  const easeFn = opts.easing ?? easingLib.easeInOut;
  const highlightColor = opts.color ?? defaultHighlightColor;
  const width = positiveNumber(opts.width, 3);
  const halfWidth = width / 2;

  const [hh, sh, lh] = colorToHSL(highlightColor);

  let baseH = 0;
  let baseS = 0;
  let baseLightness = 30;
  if (opts.baseColor) {
    const [bh, bs, bl] = colorToHSL(opts.baseColor);
    baseH = bh;
    baseS = bs;
    baseLightness = bl;
  }

  // Compute eased position along the text
  const t = wrap(motionTick(opts) * speed, cycleTicks) / cycleTicks;
  const easedT = easedProgress(easeFn, t);
  const pos = easedT * visibleLen;

  let result = '';
  for (const glyph of glyphs) {
    if (glyph.value === '\n') {
      result += '\n';
      continue;
    }
    const center = glyph.column + (glyph.width - 1) / 2;
    const dist = Math.abs(center - pos);
    const wrappedDist = Math.min(dist, visibleLen - dist);

    if (wrappedDist <= halfWidth) {
      const blend = 1 - wrappedDist / halfWidth;
      const l = baseLightness + (lh - baseLightness) * blend;
      const s = baseS + (sh - baseS) * blend;
      const h = hh;
      const c = coronaColor.hsl(h, s, l);
      result += c.fg() + glyph.value;
    } else {
      const c = coronaColor.hsl(baseH, baseS, baseLightness);
      result += c.fg() + glyph.value;
    }
  }

  result += RESET;
  return result;
}

/**
 * Breathe effect with eased interpolation.
 *
 * Instead of a raw sine wave, this uses a ping-pong pattern with an
 * easing function applied, giving more control over the feel of the
 * oscillation between the two colors.
 */
export function easedBreathe(text: string, opts: EasedBreatheOpts): string {
  const visible = stripAnsi(text);
  if (visible.length === 0) return '';

  const speed = finiteNumber(opts.speed, 1);
  const cycleTicks = positiveNumber(opts.cycleTicks, 120);
  const easeFn = opts.easing ?? easingLib.easeInOut;

  // Compute linear progress through cycle
  const t = wrap(motionTick(opts) * speed, cycleTicks) / cycleTicks;
  // Ping-pong: ramp up in first half, ramp down in second half
  const pp = t < 0.5 ? t * 2 : (1 - t) * 2;
  const easedPP = easedProgress(easeFn, pp);

  const c = interpolateColor(opts.from, opts.to, easedPP);
  return c.fg() + visible + RESET;
}

/**
 * Color cycle effect with eased per-character hue distribution.
 *
 * Applies an easing function to each character's position ratio, creating
 * non-linear hue distributions (e.g., hues cluster at ends with easeIn,
 * or spread evenly with linear).
 */
export function easedColorCycle(text: string, opts: EasedColorCycleOpts): string {
  const visible = stripAnsi(text);
  const glyphs = positionedGraphemes(visible);
  const width = visualWidth(visible);
  if (width === 0) return '';

  const speed = finiteNumber(opts.speed, 1);
  const saturation = clamp(opts.saturation, 0, 100, 80);
  const lightness = clamp(opts.lightness, 0, 100, 60);
  const easeFn = opts.easing ?? easingLib.easeInOut;
  const tick = motionTick(opts);

  let result = '';
  for (const glyph of glyphs) {
    if (glyph.value === '\n') {
      result += '\n';
      continue;
    }
    const charT = cellRatio(glyph.column, glyph.width, width);
    const easedCharT = easedProgress(easeFn, charT);
    const hue = wrap(easedCharT * 360 + tick * speed * 10, 360);
    const c = coronaColor.hsl(hue, saturation, lightness);
    result += c.fg() + glyph.value;
  }

  result += RESET;
  return result;
}

/**
 * Animated gradient that scrolls color stops over time.
 *
 * Shifts the color stop positions by an offset derived from tick and speed,
 * creating a smoothly scrolling gradient effect across the text.
 */
export function animatedGradient(text: string, opts: AnimatedGradientOpts): string {
  if (text === '') return '';

  const colors = opts.colors;
  if (!colors || colors.length < 2) {
    throw new Error('animatedGradient requires at least 2 colors');
  }

  const speed = finiteNumber(opts.speed, 1);
  const direction = opts.direction ?? 'horizontal';
  const offset = wrap(motionTick(opts) * speed * 0.01, 1);

  // Create a shifted color lookup: for a given ratio (0-1), sample the
  // gradient at (ratio + offset) mod 1 to create the scrolling effect.
  function shiftedInterpolate(stops: Color[], ratio: number): Color {
    const segments = stops.length - 1;
    const shifted = wrap(ratio + offset, 1);
    const scaledRatio = shifted * segments;
    const segmentIndex = Math.min(Math.floor(scaledRatio), segments - 1);
    const localRatio = scaledRatio - segmentIndex;
    return interpolateColor(stops[segmentIndex]!, stops[segmentIndex + 1]!, localRatio);
  }

  if (direction === 'vertical') {
    const lines = text.split('\n');
    const lineCount = lines.length;

    return lines
      .map((line, j) => {
        const stripped = stripAnsi(line);
        if (stripped.length === 0) return line;
        const ratio = lineCount === 1 ? 0 : j / (lineCount - 1);
        const c = shiftedInterpolate(colors, ratio);
        return c.fg() + stripped + RESET;
      })
      .join('\n');
  }

  if (direction === 'diagonal') {
    const lines = text.split('\n');
    const lineCount = lines.length;
    const cols = Math.max(...lines.map((line) => visualWidth(line)));
    if (cols === 0) return '';

    return lines
      .map((line, j) => {
        const stripped = stripAnsi(line);
        if (stripped.length === 0) return line;

        const glyphs = positionedGraphemes(stripped);
        let lineResult = '';
        for (const glyph of glyphs) {
          const colRatio = cellRatio(glyph.column, glyph.width, cols);
          const rowRatio = lineCount === 1 ? 0 : j / (lineCount - 1);
          const ratio = (colRatio + rowRatio) / 2;
          const c = shiftedInterpolate(colors, ratio);
          lineResult += c.fg() + glyph.value;
        }
        lineResult += RESET;
        return lineResult;
      })
      .join('\n');
  }

  // Default: horizontal
  const visible = stripAnsi(text);
  const glyphs = positionedGraphemes(visible);
  const width = visualWidth(visible);
  if (width === 0) return '';

  let result = '';
  for (const glyph of glyphs) {
    if (glyph.value === '\n') {
      result += '\n';
      continue;
    }
    const ratio = cellRatio(glyph.column, glyph.width, width);
    const c = shiftedInterpolate(colors, ratio);
    result += c.fg() + glyph.value;
  }

  result += RESET;
  return result;
}
