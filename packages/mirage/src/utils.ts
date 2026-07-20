import { measureTextWidth, segmentGraphemes } from '@celestial/rosetta';

// eslint-disable-next-line no-control-regex
export const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
export const RESET = '\x1b[0m';

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

/** Split terminal text without breaking combining sequences or emoji. */
export function graphemes(text: string): string[] {
  return segmentGraphemes(text);
}

/** Measure terminal columns rather than UTF-16 code units. */
export function visualWidth(text: string): number {
  return measureTextWidth(stripAnsi(text));
}

export interface Token {
  type: 'ansi' | 'char';
  value: string;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  const regex = new RegExp(ANSI_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      for (const ch of segmentGraphemes(text.slice(lastIndex, match.index))) {
        tokens.push({ type: 'char', value: ch });
      }
    }
    tokens.push({ type: 'ansi', value: match[0] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    for (const ch of segmentGraphemes(text.slice(lastIndex))) {
      tokens.push({ type: 'char', value: ch });
    }
  }

  return tokens;
}
