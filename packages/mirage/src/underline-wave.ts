import { type Color, highlightColor as defaultHighlightColor } from '@celestial/corona';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { RESET, safeText, stripAnsi, visualWidth } from './utils.js';
import { clamp, finiteNumber, positiveNumber } from './validation.js';

export interface UnderlineWaveOpts extends MotionEffectOpts {
  tick: number;
  color?: Color;
  amplitude?: number;
  wavelength?: number;
  speed?: number;
}

function waveChar(sample: number, amplitude: number): string {
  if (amplitude <= 0) return '─';
  if (sample > 0.55) return '˜';
  if (sample > 0.1) return '~';
  if (sample > -0.35) return '‿';
  return '⌣';
}

export function underlineWave(text: string, opts: UnderlineWaveOpts): string {
  if (text === '') return '';

  const waveColor = opts.color ?? defaultHighlightColor;
  const amplitude = clamp(opts.amplitude, 0, 1, 1);
  const wavelength = positiveNumber(opts.wavelength, 6);
  const speed = finiteNumber(opts.speed, 1);
  const phaseOffset = motionTick(opts) * speed * 0.25;
  const output: string[] = [];

  for (const line of safeText(text).split('\n')) {
    const visible = stripAnsi(line);
    let underline = '';

    for (let index = 0; index < visualWidth(visible); index++) {
      const phase = phaseOffset + (index / wavelength) * Math.PI * 2;
      underline += waveColor.fg() + waveChar(Math.sin(phase) * amplitude, amplitude);
    }

    output.push(line);
    output.push(underline + RESET);
  }

  return output.join('\n');
}
