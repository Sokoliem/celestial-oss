import type { Color } from '@celestial/corona';
import { gradient as coronaGradient } from '@celestial/corona';
import { interpolateColor } from './interpolate.js';
import { type MotionEffectOpts, motionTick } from './motion.js';
import { graphemeCellWidth, positionedGraphemes, RESET, stripAnsi, tokenize, visualWidth } from './utils.js';
import { finiteNumber, wrap } from './validation.js';

function cellRatio(column: number, glyphWidth: number, totalWidth: number): number {
  if (totalWidth <= glyphWidth) return 0;
  return (column + (glyphWidth - 1) / 2) / (totalWidth - 1);
}

export interface BgGradientOpts {
  from?: Color;
  to?: Color;
  colors?: Color[];
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  fg?: Color;
}

export interface BgPulseOpts extends MotionEffectOpts {
  from: Color;
  to: Color;
  tick: number;
  speed?: number;
  fg?: Color;
}

export interface AnimatedBgGradientOpts extends MotionEffectOpts {
  colors: Color[];
  tick: number;
  speed?: number;
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  fg?: Color;
}

function resolveStops(opts: { from?: Color; to?: Color; colors?: Color[] }): Color[] {
  if (opts.colors && opts.colors.length >= 2) {
    return opts.colors;
  }
  if (opts.from && opts.to) {
    return [opts.from, opts.to];
  }
  throw new Error('bgGradient requires either from+to or colors with at least 2 entries');
}

function applyBgChar(ch: string, bgColor: Color, fgColor?: Color): string {
  let s = bgColor.bg();
  if (fgColor) s += fgColor.fg();
  s += ch;
  return s;
}

function horizontalBgGradient(text: string, stops: Color[], fg?: Color): string {
  const grad = coronaGradient(stops);
  const tokens = tokenize(text);
  const width = visualWidth(text);

  if (width === 0) return '';

  let column = 0;
  let result = '';

  for (const token of tokens) {
    if (token.type === 'ansi') {
      result += token.value;
    } else {
      if (token.value === '\n') {
        result += '\n';
        continue;
      }
      const glyphWidth = graphemeCellWidth(token.value);
      const ratio = cellRatio(column, glyphWidth, width);
      const c = grad.sample(ratio);
      result += applyBgChar(token.value, c, fg);
      column += glyphWidth;
    }
  }

  result += RESET;
  return result;
}

function verticalBgGradient(text: string, stops: Color[], fg?: Color): string {
  const grad = coronaGradient(stops);
  const lines = text.split('\n');
  const lineCount = lines.length;

  return lines
    .map((line, j) => {
      const ratio = lineCount === 1 ? 0 : j / (lineCount - 1);
      const c = grad.sample(ratio);
      const stripped = stripAnsi(line);
      if (stripped.length === 0) return line;
      return applyBgChar(stripped, c, fg);
    })
    .join('\n');
}

function diagonalBgGradient(text: string, stops: Color[], fg?: Color): string {
  const grad = coronaGradient(stops);
  const lines = text.split('\n');
  const lineCount = lines.length;

  const cols = Math.max(...lines.map((line) => visualWidth(line)));
  if (cols === 0) return '';

  return lines
    .map((line, j) => {
      const tokens = tokenize(line);
      if (visualWidth(line) === 0) return line;

      let column = 0;
      let result = '';

      for (const token of tokens) {
        if (token.type === 'ansi') {
          result += token.value;
        } else {
          const glyphWidth = graphemeCellWidth(token.value);
          const colRatio = cellRatio(column, glyphWidth, cols);
          const rowRatio = lineCount === 1 ? 0 : j / (lineCount - 1);
          const ratio = (colRatio + rowRatio) / 2;
          const c = grad.sample(ratio);
          result += applyBgChar(token.value, c, fg);
          column += glyphWidth;
        }
      }

      result += RESET;
      return result;
    })
    .join('\n');
}

export function bgGradient(text: string, opts: BgGradientOpts): string {
  if (text === '') return '';

  const stops = resolveStops(opts);
  const direction = opts.direction ?? 'horizontal';
  const fg = opts.fg;

  switch (direction) {
    case 'horizontal':
      return horizontalBgGradient(text, stops, fg);
    case 'vertical':
      return verticalBgGradient(text, stops, fg);
    case 'diagonal':
      return diagonalBgGradient(text, stops, fg);
  }
}

export function bgPulse(text: string, opts: BgPulseOpts): string {
  const visible = stripAnsi(text);
  if (visible.length === 0) return '';

  const speed = finiteNumber(opts.speed, 1);
  const ratio = (Math.sin(motionTick(opts) * speed * 0.2) + 1) / 2;
  const bgColor = interpolateColor(opts.from, opts.to, ratio);

  let result = '';
  result += bgColor.bg();
  if (opts.fg) result += opts.fg.fg();
  result += visible;
  result += RESET;
  return result;
}

function shiftedInterpolate(stops: Color[], ratio: number, offset: number): Color {
  const segments = stops.length - 1;
  const shifted = wrap(ratio + offset, 1);
  const scaledRatio = shifted * segments;
  const segmentIndex = Math.min(Math.floor(scaledRatio), segments - 1);
  const localRatio = scaledRatio - segmentIndex;
  return interpolateColor(stops[segmentIndex]!, stops[segmentIndex + 1]!, localRatio);
}

export function animatedBgGradient(text: string, opts: AnimatedBgGradientOpts): string {
  if (text === '') return '';

  const colors = opts.colors;
  if (!colors || colors.length < 2) {
    throw new Error('animatedBgGradient requires at least 2 colors');
  }

  const speed = finiteNumber(opts.speed, 1);
  const direction = opts.direction ?? 'horizontal';
  const fg = opts.fg;
  const offset = wrap(motionTick(opts) * speed * 0.01, 1);

  if (direction === 'vertical') {
    const lines = text.split('\n');
    const lineCount = lines.length;

    return lines
      .map((line, j) => {
        const stripped = stripAnsi(line);
        if (stripped.length === 0) return line;
        const ratio = lineCount === 1 ? 0 : j / (lineCount - 1);
        const c = shiftedInterpolate(colors, ratio, offset);
        return applyBgChar(stripped, c, fg) + RESET;
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
          const c = shiftedInterpolate(colors, ratio, offset);
          lineResult += applyBgChar(glyph.value, c, fg);
        }
        lineResult += RESET;
        return lineResult;
      })
      .join('\n');
  }

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
    const c = shiftedInterpolate(colors, ratio, offset);
    result += applyBgChar(glyph.value, c, fg);
  }

  result += RESET;
  return result;
}
