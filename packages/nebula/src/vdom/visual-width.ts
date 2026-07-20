import { cellWidth, charWidth, sliceCells, wrapCells } from '@celestial/corona';

export { charWidth };

/** Measure visual width through Corona's canonical terminal-cell engine. */
export function visualWidth(text: string): number {
  return cellWidth(text);
}

/** Slice without dividing a grapheme or terminal control sequence. */
export function sliceByWidth(text: string, maxCols: number): [fit: string, rest: string] {
  return sliceCells(text, maxCols);
}

/** Wrap one terminal line at word boundaries while preserving ANSI state. */
export function wrapLine(line: string, maxWidth: number): string[] {
  return wrapCells(line, maxWidth, { dropOverflowWhitespace: true });
}

/** Wrap text while respecting existing newlines and terminal cell width. */
export function wrapText(content: string, maxWidth: number): string[] {
  return wrapCells(content, maxWidth, { dropOverflowWhitespace: true });
}
