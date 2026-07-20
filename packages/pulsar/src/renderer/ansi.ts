/**
 * ANSI / OSC 8 control-code utilities for the markdown renderer.
 *
 * The wrap engine needs to understand SGR colour codes and OSC 8 hyperlink
 * sequences as separate kinds so that re-injection across line breaks can
 * keep both styles and link state coherent.
 */

export type ControlCodeKind = 'sgr' | 'osc-open' | 'osc-close' | 'osc-other';

/** Strip ANSI escape sequences from a string. */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

export function classifyControlCode(code: string): ControlCodeKind {
  if (/^\x1b\[[0-9;]*m$/.test(code)) return 'sgr';
  if (/^\x1b]8;;(?:\x07|\x1b\\)$/.test(code)) return 'osc-close';
  if (code.startsWith('\x1b]8;')) return 'osc-open';
  return 'osc-other';
}

export function hyperlinkCloseCode(openCode: string): string {
  return openCode.endsWith('\x1b\\') ? '\x1b]8;;\x1b\\' : '\x1b]8;;\x07';
}

export interface AnsiSpan {
  /** Start index in the original string */
  index: number;
  /** The ANSI escape sequence */
  code: string;
  /** The terminal control sequence kind */
  kind?: ControlCodeKind;
}

export function extractAnsiCodes(text: string): { plain: string; spans: AnsiSpan[] } {
  const spans: AnsiSpan[] = [];
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[[0-9;]*m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
  let match: RegExpExecArray | null;
  let plain = '';
  let lastIndex = 0;

  while ((match = ansiRegex.exec(text)) !== null) {
    plain += text.slice(lastIndex, match.index);
    spans.push({ index: plain.length, code: match[0], kind: classifyControlCode(match[0]) });
    lastIndex = match.index + match[0].length;
  }
  plain += text.slice(lastIndex);

  return { plain, spans };
}

/**
 * Re-inject ANSI codes into a plain-text string based on character positions.
 * Exported for testing purposes (covered by `renderer.test.ts`).
 */
export function injectAnsiCodes(plain: string, spans: AnsiSpan[]): string {
  if (spans.length === 0) return plain;

  let result = '';
  let spanIdx = 0;

  for (let i = 0; i <= plain.length; i++) {
    while (spanIdx < spans.length && spans[spanIdx]!.index === i) {
      result += spans[spanIdx]!.code;
      spanIdx++;
    }
    if (i < plain.length) {
      result += plain[i];
    }
  }

  while (spanIdx < spans.length) {
    result += spans[spanIdx]!.code;
    spanIdx++;
  }

  return result;
}
