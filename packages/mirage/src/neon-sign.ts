import { type Color, color as coronaColor } from '@celestial/corona';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { RESET, stripAnsi } from './utils.js';
import { finiteNumber, positiveInteger } from './validation.js';

export interface NeonSignOpts extends MotionEffectOpts {
  color: Color;
  tick: number;
  speed?: number;
  intensity?: number;
}

export function neonSign(text: string, opts: NeonSignOpts): string {
  const visible = stripAnsi(text);
  if (visible.length === 0) return '';

  const rgb = opts.color.rgb;
  if (!rgb) return visible;

  const [r, g, b] = rgb;
  const speed = finiteNumber(opts.speed, 0.8);
  const layers = positiveInteger(opts.intensity, 3);

  const breatheRatio = (Math.sin(motionTick(opts) * speed * 0.15) + 1) / 2;
  const brightness = 0.35 + breatheRatio * 0.65;

  const dimR = Math.round(r * brightness * 0.15);
  const dimG = Math.round(g * brightness * 0.15);
  const dimB = Math.round(b * brightness * 0.15);

  const midR = Math.round(r * brightness * 0.4);
  const midG = Math.round(g * brightness * 0.4);
  const midB = Math.round(b * brightness * 0.4);

  const brightR = Math.round(r * brightness);
  const brightG = Math.round(g * brightness);
  const brightB = Math.round(b * brightness);

  let result = '';

  for (let d = layers; d >= 1; d--) {
    const falloff = 1 - d / (layers + 1);
    const lr = Math.round(dimR * falloff);
    const lg = Math.round(dimG * falloff);
    const lb = Math.round(dimB * falloff);
    if (lr > 0 || lg > 0 || lb > 0) {
      const c = coronaColor.rgb(lr, lg, lb);
      result += c.bg() + ' ';
    } else {
      result += ' ';
    }
  }

  for (let d = layers - 1; d >= 0; d--) {
    const falloff = d / (layers + 1);
    const lr = Math.round(midR * (1 - falloff));
    const lg = Math.round(midG * (1 - falloff));
    const lb = Math.round(midB * (1 - falloff));
    if (lr > 0 || lg > 0 || lb > 0) {
      const c = coronaColor.rgb(lr, lg, lb);
      result += c.bg();
    }
  }

  const bgC = coronaColor.rgb(midR, midG, midB);
  const fgC = coronaColor.rgb(brightR, brightG, brightB);
  result += bgC.bg() + fgC.fg() + visible;

  for (let d = 0; d < layers; d++) {
    const falloff = d / (layers + 1);
    const lr = Math.round(midR * (1 - falloff));
    const lg = Math.round(midG * (1 - falloff));
    const lb = Math.round(midB * (1 - falloff));
    if (lr > 0 || lg > 0 || lb > 0) {
      const c = coronaColor.rgb(lr, lg, lb);
      result += c.bg() + ' ';
    } else {
      result += ' ';
    }
  }

  for (let d = 1; d <= layers; d++) {
    const falloff = 1 - d / (layers + 1);
    const lr = Math.round(dimR * falloff);
    const lg = Math.round(dimG * falloff);
    const lb = Math.round(dimB * falloff);
    if (lr > 0 || lg > 0 || lb > 0) {
      const c = coronaColor.rgb(lr, lg, lb);
      result += c.bg() + ' ';
    } else {
      result += ' ';
    }
  }

  result += RESET;
  return result;
}
