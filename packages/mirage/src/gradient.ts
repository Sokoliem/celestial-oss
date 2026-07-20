import type { Color } from '@celestial/corona';
import { gradient as coronaGradient } from '@celestial/corona';
import { graphemeCellWidth, RESET, stripAnsi, tokenize, visualWidth } from './utils.js';

function cellRatio(column: number, glyphWidth: number, totalWidth: number): number {
  if (totalWidth <= glyphWidth) return 0;
  return (column + (glyphWidth - 1) / 2) / (totalWidth - 1);
}

export interface GradientOpts {
  from?: Color;
  to?: Color;
  colors?: Color[];
  direction?: 'horizontal' | 'vertical' | 'diagonal';
}

function resolveStops(opts: GradientOpts): Color[] {
  if (opts.colors && opts.colors.length >= 2) {
    return opts.colors;
  }
  if (opts.from && opts.to) {
    return [opts.from, opts.to];
  }
  throw new Error('gradient requires either from+to or colors with at least 2 entries');
}

/**
 * Apply a horizontal gradient to text.
 */
function horizontalGradient(text: string, stops: Color[]): string {
  const grad = coronaGradient(stops);
  const tokens = tokenize(text);
  const width = visualWidth(text);

  if (width === 0) return '';

  let column = 0;
  let result = '';

  for (const token of tokens) {
    if (token.type === 'ansi') {
      // Pass through existing ANSI codes (they'll be overridden by our fg)
      result += token.value;
    } else {
      if (token.value === '\n') {
        result += '\n';
        continue;
      }
      const glyphWidth = graphemeCellWidth(token.value);
      const ratio = cellRatio(column, glyphWidth, width);
      const c = grad.sample(ratio);
      result += c.fg() + token.value;
      column += glyphWidth;
    }
  }

  result += RESET;
  return result;
}

/**
 * Apply a vertical gradient to text (one color per line).
 */
function verticalGradient(text: string, stops: Color[]): string {
  const grad = coronaGradient(stops);
  const lines = text.split('\n');
  const lineCount = lines.length;

  return lines
    .map((line, j) => {
      const ratio = lineCount === 1 ? 0 : j / (lineCount - 1);
      const c = grad.sample(ratio);
      const stripped = stripAnsi(line);
      if (stripped.length === 0) return line;
      return c.fg() + stripped + RESET;
    })
    .join('\n');
}

/**
 * Apply a diagonal gradient to text.
 */
function diagonalGradient(text: string, stops: Color[]): string {
  const grad = coronaGradient(stops);
  const lines = text.split('\n');
  const lineCount = lines.length;

  // Find max columns across all lines
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
          result += c.fg() + token.value;
          column += glyphWidth;
        }
      }

      result += RESET;
      return result;
    })
    .join('\n');
}

/**
 * Apply a gradient to text.
 *
 * Supports horizontal (default), vertical, and diagonal directions.
 * Accepts either from+to for a 2-color gradient, or colors[] for multi-stop.
 */
export function gradient(text: string, opts: GradientOpts): string {
  if (text === '') return '';

  const stops = resolveStops(opts);
  const direction = opts.direction ?? 'horizontal';

  switch (direction) {
    case 'horizontal':
      return horizontalGradient(text, stops);
    case 'vertical':
      return verticalGradient(text, stops);
    case 'diagonal':
      return diagonalGradient(text, stops);
  }
}
