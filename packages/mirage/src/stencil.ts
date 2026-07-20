import { type Color, gradient as coronaGradient, resolveGlyph, stencilGlyph } from '@celestial/corona';
import { segmentGraphemes } from '@celestial/rosetta';
import { graphemeCellWidth, graphemes, RESET, stripAnsi } from './utils.js';

const DEFAULT_STENCIL_GLYPH = resolveGlyph(stencilGlyph, 'wide');

export interface StencilOpts {
  fill: Color | Color[];
  bgChar?: string;
}

function resolveFillSampler(fill: Color | Color[]): (row: number, col: number, width: number, height: number) => Color {
  if (!Array.isArray(fill)) {
    return () => fill;
  }

  if (fill.length === 0) {
    throw new Error('stencil requires at least one fill color');
  }

  if (fill.length === 1) {
    return () => fill[0]!;
  }

  const gradient = coronaGradient(fill);
  return (row, col, width, height) => {
    const colRatio = width <= 1 ? 0 : col / (width - 1);
    const rowRatio = height <= 1 ? 0 : row / (height - 1);
    return gradient.sample((colRatio + rowRatio) / 2);
  };
}

export function stencil(text: string, opts: StencilOpts): string {
  if (text === '') return '';

  const plain = stripAnsi(text);
  const lines = plain.split('\n');
  const occupiedLines = lines.map((line) =>
    segmentGraphemes(line).flatMap((grapheme) => Array(Math.max(1, graphemeCellWidth(grapheme))).fill(grapheme !== ' ')),
  );
  const width = Math.max(...occupiedLines.map((line) => line.length));
  const height = lines.length;
  const requestedGlyph = graphemes(stripAnsi(opts.bgChar ?? DEFAULT_STENCIL_GLYPH)).find((glyph) => graphemeCellWidth(glyph) > 0);
  const bgChar = requestedGlyph && graphemeCellWidth(requestedGlyph) === 1 ? requestedGlyph : DEFAULT_STENCIL_GLYPH;
  const sampleFill = resolveFillSampler(opts.fill);

  return lines
    .map((_line, row) => {
      let result = '';

      for (let col = 0; col < width; col++) {
        if (occupiedLines[row]?.[col]) {
          result += ' ';
          continue;
        }

        result += sampleFill(row, col, width, height).fg() + bgChar;
      }

      return result + RESET;
    })
    .join('\n');
}
