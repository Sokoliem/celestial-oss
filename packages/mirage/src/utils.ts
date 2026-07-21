import { cellWidth, graphemeCellWidth, sanitizeTerminalText, stripAnsi as stripTerminalFormatting, tokenizeTerminalText } from '@celestial/corona';
import { segmentGraphemes } from '@celestial/rosetta';

// Retained for compatibility. Internal parsing uses Corona's complete terminal
// tokenizer so OSC, DCS, CSI, and C0/C1 controls cannot leak through effects.
// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[[0-9:;]*m/g;
export const RESET = '\x1b[0m';

/** Keep safe SGR styling while dropping hyperlinks and active terminal controls. */
export function safeText(str: string): string {
  return sanitizeTerminalText(str, { allowSgr: true, allowHyperlinks: false, controlPolicy: 'strip' });
}

export function stripAnsi(str: string): string {
  return stripTerminalFormatting(safeText(str));
}

/** Split terminal text without breaking combining sequences or emoji. */
export function graphemes(text: string): string[] {
  return segmentGraphemes(text);
}

/** Measure terminal columns rather than UTF-16 code units. */
export function visualWidth(text: string): number {
  return cellWidth(stripAnsi(text));
}

export interface PositionedGrapheme {
  readonly value: string;
  readonly column: number;
  readonly width: number;
}

/** Address visible glyphs by terminal cells without splitting wide glyphs. */
export function positionedGraphemes(text: string): PositionedGrapheme[] {
  const result: PositionedGrapheme[] = [];
  let column = 0;
  for (const value of graphemes(stripAnsi(text))) {
    if (value === '\n') {
      result.push({ value, column, width: 0 });
      continue;
    }
    const width = graphemeCellWidth(value);
    result.push({ value, column, width });
    column += width;
  }
  return result;
}

export interface Token {
  type: 'ansi' | 'char';
  value: string;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const token of tokenizeTerminalText(safeText(text))) {
    if (token.kind === 'sgr') {
      tokens.push({ type: 'ansi', value: token.value });
    } else if (token.kind === 'text') {
      for (const ch of segmentGraphemes(token.value)) {
        tokens.push({ type: 'char', value: ch });
      }
    }
  }
  return tokens;
}

export { graphemeCellWidth };
