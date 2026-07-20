import { type Color, color as coronaColor } from '@celestial/corona';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemes, RESET, stripAnsi } from './utils.js';

export interface ChromaticTextOpts extends MotionEffectOpts {
  color: Color;
  offset?: number;
  tick?: number;
  speed?: number;
  intensity?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function chromaticText(text: string, opts: ChromaticTextOpts): string {
  const visible = stripAnsi(text);
  const chars = graphemes(visible);
  if (chars.length === 0) return '';

  const rgb = opts.color.rgb;
  if (!rgb) return visible;

  const [r, g, b] = rgb;
  const intensity = clamp(opts.intensity ?? 0.5, 0, 1);
  const baseOffset = Math.max(1, opts.offset ?? 1);
  const speed = opts.speed ?? 1;

  const tick = opts.tick == null ? undefined : motionTick({ ...opts, tick: opts.tick });
  const animOffset = tick != null ? baseOffset + Math.sin(tick * speed * 0.1) * 1.5 : baseOffset;
  const off = Math.max(1, Math.round(animOffset));

  const len = chars.length;
  const totalWidth = len + off * 2;

  const rChannel = new Float32Array(totalWidth);
  const gChannel = new Float32Array(totalWidth);
  const bChannel = new Float32Array(totalWidth);
  const charGrid: (string | null)[] = new Array(totalWidth).fill(null);

  for (let i = 0; i < len; i++) {
    const rPos = i;
    const gPos = i + off;
    const bPos = i + off * 2;

    if (rPos < totalWidth) rChannel[rPos] = (rChannel[rPos] ?? 0) + r * intensity;
    if (gPos < totalWidth) gChannel[gPos] = (gChannel[gPos] ?? 0) + g * intensity;
    if (bPos < totalWidth) bChannel[bPos] = (bChannel[bPos] ?? 0) + b * intensity;

    if (gPos < totalWidth) charGrid[gPos] = chars[i]!;
  }

  let result = '';
  for (let i = 0; i < totalWidth; i++) {
    const cr = clamp(Math.round((rChannel[i]! / 255) * 255), 0, 255);
    const cg = clamp(Math.round((gChannel[i]! / 255) * 255), 0, 255);
    const cb = clamp(Math.round((bChannel[i]! / 255) * 255), 0, 255);

    const ch = charGrid[i] ?? ' ';

    if (cr === 0 && cg === 0 && cb === 0) {
      result += ch;
      continue;
    }

    const bgColor = coronaColor.rgb(cr, cg, cb);

    if (charGrid[i]) {
      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      const fgColor =
        lum > 128
          ? coronaColor.rgb(0, 0, 0)
          : coronaColor.rgb(
              clamp(r > 0 ? Math.round(r * 0.3) : 40, 0, 255),
              clamp(g > 0 ? Math.round(g * 0.3) : 40, 0, 255),
              clamp(b > 0 ? Math.round(b * 0.3) : 40, 0, 255),
            );
      result += bgColor.bg() + fgColor.fg() + ch;
    } else {
      result += bgColor.bg() + ' ';
    }
  }

  result += RESET;
  return result;
}
