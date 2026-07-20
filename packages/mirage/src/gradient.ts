import type { Color } from '@celestial/corona';
import { gradient as coronaGradient } from '@celestial/corona';
import { graphemes, RESET, stripAnsi, tokenize } from './utils.js';

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
  const visibleChars = tokens.filter((t) => t.type === 'char');
  const charCount = visibleChars.length;

  if (charCount === 0) return '';

  let visibleIndex = 0;
  let result = '';

  for (const token of tokens) {
    if (token.type === 'ansi') {
      // Pass through existing ANSI codes (they'll be overridden by our fg)
      result += token.value;
    } else {
      const ratio = charCount === 1 ? 0 : visibleIndex / (charCount - 1);
      const c = grad.sample(ratio);
      result += c.fg() + token.value;
      visibleIndex++;
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
  const cols = Math.max(...lines.map((l) => graphemes(stripAnsi(l)).length));
  if (cols === 0) return '';

  return lines
    .map((line, j) => {
      const tokens = tokenize(line);
      const visibleChars = tokens.filter((t) => t.type === 'char');
      const charCountInLine = visibleChars.length;
      if (charCountInLine === 0) return line;

      let visibleIndex = 0;
      let result = '';

      for (const token of tokens) {
        if (token.type === 'ansi') {
          result += token.value;
        } else {
          const colRatio = cols === 1 ? 0 : visibleIndex / (cols - 1);
          const rowRatio = lineCount === 1 ? 0 : j / (lineCount - 1);
          const ratio = (colRatio + rowRatio) / 2;
          const c = grad.sample(ratio);
          result += c.fg() + token.value;
          visibleIndex++;
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
