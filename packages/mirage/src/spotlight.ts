import { type Color, color as coronaColor, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { colorToHSL } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { positionedGraphemes, RESET, stripAnsi } from './utils.js';
import { clamp, finiteNumber, nonNegativeNumber } from './validation.js';

export interface SpotlightOpts extends MotionEffectOpts {
  center: number;
  radius: number;
  color?: Color;
  dimLevel?: number;
  tick?: number;
}

export function spotlight(text: string, opts: SpotlightOpts): string {
  const visible = stripAnsi(text);
  const glyphs = positionedGraphemes(visible);
  if (glyphs.length === 0) return '';

  const highlight = opts.color ?? defaultHighlightColor;
  const [h, s, l] = colorToHSL(highlight);
  const dimLevel = clamp(opts.dimLevel, 0, 1, 0.3);
  const tick = opts.tick == null ? undefined : motionTick({ ...opts, tick: opts.tick });
  const pulse = tick === undefined ? 1 : 1 + Math.sin(tick * 0.15) * 0.08;
  const radius = nonNegativeNumber(opts.radius, 0) * pulse;
  const center = finiteNumber(opts.center, 0);

  let result = '';

  for (const glyph of glyphs) {
    if (glyph.value === '\n') {
      result += '\n';
      continue;
    }

    const glyphCenter = glyph.column + (glyph.width - 1) / 2;
    const distance = Math.abs(glyphCenter - center);
    let strength = dimLevel;

    if (radius === 0) {
      strength = glyphCenter === center ? 1 : dimLevel;
    } else if (distance <= radius) {
      const ratio = distance / radius;
      const falloff = 0.5 * (1 + Math.cos(Math.PI * ratio));
      strength = dimLevel + (1 - dimLevel) * falloff;
    }

    const lit = coronaColor.hsl(h, s, clamp(l * strength, 0, 100, 0));
    result += lit.fg() + glyph.value;
  }

  return result + RESET;
}
