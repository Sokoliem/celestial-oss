import { type Color, color as coronaColor, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { colorToHSL } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemes, RESET, stripAnsi } from './utils.js';

export interface SpotlightOpts extends MotionEffectOpts {
  center: number;
  radius: number;
  color?: Color;
  dimLevel?: number;
  tick?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function spotlight(text: string, opts: SpotlightOpts): string {
  const visible = stripAnsi(text);
  const chars = graphemes(visible);
  if (chars.length === 0) return '';

  const highlight = opts.color ?? defaultHighlightColor;
  const [h, s, l] = colorToHSL(highlight);
  const dimLevel = clamp(opts.dimLevel ?? 0.3, 0, 1);
  const tick = opts.tick == null ? undefined : motionTick({ ...opts, tick: opts.tick });
  const pulse = tick === undefined ? 1 : 1 + Math.sin(tick * 0.15) * 0.08;
  const radius = Math.max(0, opts.radius * pulse);

  let visibleIndex = 0;
  let result = '';

  for (const char of chars) {
    if (char === '\n') {
      result += '\n';
      continue;
    }

    const distance = Math.abs(visibleIndex - opts.center);
    let strength = dimLevel;

    if (radius === 0) {
      strength = visibleIndex === opts.center ? 1 : dimLevel;
    } else if (distance <= radius) {
      const ratio = distance / radius;
      const falloff = 0.5 * (1 + Math.cos(Math.PI * ratio));
      strength = dimLevel + (1 - dimLevel) * falloff;
    }

    const lit = coronaColor.hsl(h, s, clamp(l * strength, 0, 100));
    result += lit.fg() + char;
    visibleIndex++;
  }

  return result + RESET;
}
