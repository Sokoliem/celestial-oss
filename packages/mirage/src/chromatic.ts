import { type Color, color as coronaColor } from '@celestial/corona';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { positionedGraphemes, RESET, stripAnsi, visualWidth } from './utils.js';
import { clamp, finiteNumber, positiveInteger } from './validation.js';

export interface ChromaticTextOpts extends MotionEffectOpts {
  color: Color;
  offset?: number;
  tick?: number;
  speed?: number;
  intensity?: number;
}

export function chromaticText(text: string, opts: ChromaticTextOpts): string {
  const visible = stripAnsi(text);
  if (visualWidth(visible) === 0) return '';

  const rgb = opts.color.rgb;
  if (!rgb) return visible;

  const [r, g, b] = rgb;
  const intensity = clamp(opts.intensity, 0, 1, 0.5);
  const baseOffset = positiveInteger(opts.offset, 1);
  const speed = finiteNumber(opts.speed, 1);

  const tick = opts.tick == null ? undefined : motionTick({ ...opts, tick: opts.tick });
  const animOffset = tick != null ? baseOffset + Math.sin(tick * speed * 0.1) * 1.5 : baseOffset;
  const off = positiveInteger(animOffset, baseOffset);

  return visible
    .split('\n')
    .map((line) => renderChromaticLine(line, r, g, b, intensity, off))
    .join('\n');
}

function renderChromaticLine(line: string, r: number, g: number, b: number, intensity: number, off: number): string {
  const glyphs = positionedGraphemes(line);
  const width = visualWidth(line);
  if (width === 0) return '';
  const totalWidth = width + off * 2;

  const rChannel = new Float32Array(totalWidth);
  const gChannel = new Float32Array(totalWidth);
  const bChannel = new Float32Array(totalWidth);
  const charGrid = new Map<number, { value: string; width: number }>();

  for (const glyph of glyphs) {
    const rPos = glyph.column;
    const gPos = glyph.column + off;
    const bPos = glyph.column + off * 2;

    if (rPos < totalWidth) rChannel[rPos] = (rChannel[rPos] ?? 0) + r * intensity;
    if (gPos < totalWidth) gChannel[gPos] = (gChannel[gPos] ?? 0) + g * intensity;
    if (bPos < totalWidth) bChannel[bPos] = (bChannel[bPos] ?? 0) + b * intensity;

    if (gPos < totalWidth) charGrid.set(gPos, glyph);
  }

  let result = '';
  let column = 0;
  while (column < totalWidth) {
    const cr = clamp(Math.round(rChannel[column]!), 0, 255, 0);
    const cg = clamp(Math.round(gChannel[column]!), 0, 255, 0);
    const cb = clamp(Math.round(bChannel[column]!), 0, 255, 0);

    const glyph = charGrid.get(column);
    const ch = glyph?.value ?? ' ';

    if (cr === 0 && cg === 0 && cb === 0) {
      result += ch;
      column += glyph?.width ?? 1;
      continue;
    }

    const bgColor = coronaColor.rgb(cr, cg, cb);

    if (glyph) {
      const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      const fgColor =
        lum > 128
          ? coronaColor.rgb(0, 0, 0)
          : coronaColor.rgb(
              clamp(r > 0 ? Math.round(r * 0.3) : 40, 0, 255, 40),
              clamp(g > 0 ? Math.round(g * 0.3) : 40, 0, 255, 40),
              clamp(b > 0 ? Math.round(b * 0.3) : 40, 0, 255, 40),
            );
      result += bgColor.bg() + fgColor.fg() + ch;
    } else {
      result += bgColor.bg() + ' ';
    }
    column += glyph?.width ?? 1;
  }

  result += RESET;
  return result;
}
