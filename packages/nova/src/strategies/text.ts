import { cellWidth, graphemeCellWidth, sanitizeTerminalText, sliceCells, stripAnsi as stripTerminalFormatting, tokenizeTerminalText } from '@celestial/corona';
import { segmentGraphemes } from '@celestial/rosetta';

const RESET = '\x1b[0m';

interface CellGlyph {
  readonly text: string;
  readonly plain: string;
  readonly width: number;
}

export interface TerminalCell {
  readonly glyph: CellGlyph;
  readonly offset: number;
}

export function safeContent(content: string): string {
  return sanitizeTerminalText(content, { allowSgr: true, allowHyperlinks: false, controlPolicy: 'strip' });
}

export function plainGraphemes(content: string): string[] {
  return segmentGraphemes(stripTerminalFormatting(safeContent(content)));
}

export function visibleLength(content: string): number {
  return cellWidth(stripTerminalFormatting(safeContent(content)));
}

function normalizeWidth(width: number): number {
  if (!Number.isFinite(width)) throw new TypeError('width must be a finite number');
  return Math.max(0, Math.floor(width));
}

function appendGlyph(cells: TerminalCell[], text: string, plain: string, width: number, limit: number): void {
  if (width <= 0 || cells.length + width > limit) return;
  const glyph: CellGlyph = { text, plain, width };
  for (let offset = 0; offset < width; offset++) cells.push({ glyph, offset });
}

function padCellArray(cells: TerminalCell[], width: number): TerminalCell[] {
  while (cells.length < width) appendGlyph(cells, ' ', ' ', 1, width);
  return cells;
}

/** Convert plain content into addressable terminal cells without splitting wide glyphs. */
export function padCells(content: string, width: number): TerminalCell[] {
  const targetWidth = normalizeWidth(width);
  const cells: TerminalCell[] = [];
  for (const grapheme of plainGraphemes(content)) {
    appendGlyph(cells, grapheme, grapheme, graphemeCellWidth(grapheme), targetWidth);
  }
  return padCellArray(cells, targetWidth);
}

/** Preserve safe SGR styling while making each rendered glyph self-contained. */
export function padStyledCells(content: string, width: number): TerminalCell[] {
  const targetWidth = normalizeWidth(width);
  const cells: TerminalCell[] = [];
  let activeSgr = '';

  for (const token of tokenizeTerminalText(safeContent(content))) {
    if (token.kind === 'sgr') {
      const resetsStyle = token.parameters === '' || token.parameters.split(';').includes('0');
      activeSgr = resetsStyle ? token.value : `${activeSgr}${token.value}`;
      continue;
    }
    if (token.kind !== 'text') continue;
    for (const grapheme of segmentGraphemes(token.value)) {
      const styled = activeSgr ? `${activeSgr}${grapheme}${RESET}` : grapheme;
      appendGlyph(cells, styled, grapheme, graphemeCellWidth(grapheme), targetWidth);
    }
  }

  return padCellArray(cells, targetWidth);
}

export function cellIsBlank(cell: TerminalCell | undefined): boolean {
  return cell?.glyph.plain === ' ';
}

/** Render selected cells, replacing torn wide glyphs with spaces instead of half-glyphs. */
export function renderCells(cells: readonly TerminalCell[], transform: (text: string, column: number) => string = (text) => text): string {
  let output = '';
  let column = 0;

  while (column < cells.length) {
    const cell = cells[column];
    if (!cell || cell.offset !== 0) {
      output += ' ';
      column += 1;
      continue;
    }

    const { glyph } = cell;
    let intact = true;
    for (let offset = 1; offset < glyph.width; offset++) {
      const continuation = cells[column + offset];
      if (!continuation || continuation.glyph !== glyph || continuation.offset !== offset) {
        intact = false;
        break;
      }
    }

    if (!intact) {
      output += ' ';
      column += 1;
      continue;
    }

    const transformed = transform(glyph.text, column);
    const transformedWidth = cellWidth(transformed);
    if (transformedWidth <= glyph.width) {
      output += transformed + ' '.repeat(glyph.width - transformedWidth);
    } else {
      const clipped = sliceCells(transformed, glyph.width, { trusted: true })[0];
      output += clipped + ' '.repeat(Math.max(0, glyph.width - cellWidth(clipped)));
    }
    column += glyph.width;
  }

  return output;
}

export function padPlain(content: string, width: number): string {
  return renderCells(padCells(content, width));
}

export function slicePlain(content: string, start: number, end?: number): string {
  const safeStart = normalizeWidth(start);
  const safeEnd = end === undefined ? visibleLength(content) : Math.max(safeStart, normalizeWidth(end));
  return renderCells(padCells(content, safeEnd).slice(safeStart, safeEnd));
}
