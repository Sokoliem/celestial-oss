import type { EasingFn } from '@celestial/aurora';
import { easing as easingLib } from '@celestial/aurora';
import { type Color, color as coronaColor, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { colorToHSL, interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemes, RESET, stripAnsi } from './utils.js';

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
  const chars = graphemes(visible);
  const visibleLen = chars.length;
  if (visibleLen === 0) return '';

  const speed = opts.speed ?? 1;
  const cycleTicks = opts.cycleTicks ?? 60;
  const easeFn = opts.easing ?? easingLib.easeInOut;
  const highlightColor = opts.color ?? defaultHighlightColor;
  const width = opts.width ?? 3;
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
  const t = ((motionTick(opts) * speed) % cycleTicks) / cycleTicks;
  const easedT = easeFn(t);
  const pos = easedT * visibleLen;

  let result = '';
  for (let i = 0; i < visibleLen; i++) {
    const dist = Math.abs(i - pos);
    const wrappedDist = Math.min(dist, visibleLen - dist);

    if (wrappedDist <= halfWidth) {
      const blend = 1 - wrappedDist / halfWidth;
      const l = baseLightness + (lh - baseLightness) * blend;
      const s = baseS + (sh - baseS) * blend;
      const h = hh;
      const c = coronaColor.hsl(h, s, l);
      result += c.fg() + chars[i];
    } else {
      const c = coronaColor.hsl(baseH, baseS, baseLightness);
      result += c.fg() + chars[i];
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

  const speed = opts.speed ?? 1;
  const cycleTicks = opts.cycleTicks ?? 120;
  const easeFn = opts.easing ?? easingLib.easeInOut;

  // Compute linear progress through cycle
  const t = ((motionTick(opts) * speed) % cycleTicks) / cycleTicks;
  // Ping-pong: ramp up in first half, ramp down in second half
  const pp = t < 0.5 ? t * 2 : (1 - t) * 2;
  const easedPP = easeFn(pp);

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
  const chars = graphemes(visible);
  if (chars.length === 0) return '';

  const speed = opts.speed ?? 1;
  const saturation = opts.saturation ?? 80;
  const lightness = opts.lightness ?? 60;
  const easeFn = opts.easing ?? easingLib.easeInOut;
  const n = chars.length;

  let result = '';
  for (let i = 0; i < n; i++) {
    const charT = n === 1 ? 0 : i / (n - 1);
    const easedCharT = easeFn(charT);
    const hue = (easedCharT * 360 + motionTick(opts) * speed * 10) % 360;
    const c = coronaColor.hsl(hue, saturation, lightness);
    result += c.fg() + chars[i];
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

  const speed = opts.speed ?? 1;
  const direction = opts.direction ?? 'horizontal';
  const offset = (motionTick(opts) * speed * 0.01) % 1;

  // Create a shifted color lookup: for a given ratio (0-1), sample the
  // gradient at (ratio + offset) mod 1 to create the scrolling effect.
  function shiftedInterpolate(stops: Color[], ratio: number): Color {
    const segments = stops.length - 1;
    const shifted = (ratio + offset) % 1;
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
    const cols = Math.max(...lines.map((l) => graphemes(stripAnsi(l)).length));
    if (cols === 0) return '';

    return lines
      .map((line, j) => {
        const stripped = stripAnsi(line);
        if (stripped.length === 0) return line;

        const chars = graphemes(stripped);
        let lineResult = '';
        for (let i = 0; i < chars.length; i++) {
          const colRatio = cols === 1 ? 0 : i / (cols - 1);
          const rowRatio = lineCount === 1 ? 0 : j / (lineCount - 1);
          const ratio = (colRatio + rowRatio) / 2;
          const c = shiftedInterpolate(colors, ratio);
          lineResult += c.fg() + chars[i];
        }
        lineResult += RESET;
        return lineResult;
      })
      .join('\n');
  }

  // Default: horizontal
  const visible = stripAnsi(text);
  const chars = graphemes(visible);
  const charCount = chars.length;
  if (charCount === 0) return '';

  let result = '';
  for (let i = 0; i < charCount; i++) {
    const ratio = charCount === 1 ? 0 : i / (charCount - 1);
    const c = shiftedInterpolate(colors, ratio);
    result += c.fg() + chars[i];
  }

  result += RESET;
  return result;
}
