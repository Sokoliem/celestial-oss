/**
 * Corona Shared Utilities
 *
 * Canonical implementations of stripAnsi and visualWidth used across
 * style.ts, layout.ts, and border.ts. Having a single source of truth
 * prevents divergent ANSI-stripping behavior.
 */

import { charWidth } from './unicode-width.js';

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;

function segmentGraphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (entry) => entry.segment) : Array.from(text);
}

function isEmojiCapable(codePoint: number): boolean {
  return (
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2b00 && codePoint <= 0x2bff) ||
    codePoint === 0x23 ||
    codePoint === 0x2a ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0x00a9 ||
    codePoint === 0x00ae ||
    codePoint === 0x203c ||
    codePoint === 0x2049 ||
    (codePoint >= 0x2190 && codePoint <= 0x21ff)
  );
}

function graphemeWidth(grapheme: string): number {
  let width = 0;
  let previousCodePoint = 0;
  let previousWidth = 0;

  for (const character of grapheme) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0xfe0f && previousWidth === 1 && isEmojiCapable(previousCodePoint)) {
      width = Math.max(width, 2);
      continue;
    }
    const measured = charWidth(codePoint);
    width = Math.max(width, measured);
    previousCodePoint = codePoint;
    previousWidth = measured;
  }

  return width;
}

/** Strip ANSI escape sequences (all CSI sequences, all OSC sequences) */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // All OSC sequences
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); // All CSI sequences
}

/** Measure visual width of string (ignoring ANSI codes) */
export function visualWidth(str: string): number {
  return segmentGraphemes(stripAnsi(str)).reduce((total, grapheme) => total + graphemeWidth(grapheme), 0);
}

/** Slice styled or plain text without dividing a user-perceived character. */
export function sliceByVisualWidth(str: string, maxWidth: number): [fit: string, rest: string] {
  if (maxWidth <= 0 || str.length === 0) return ['', str];

  let width = 0;
  let index = 0;
  let acceptedIndex = 0;
  let acceptedVisibleText = false;

  while (index < str.length) {
    const ansi = readAnsiSequence(str, index);
    if (ansi !== undefined) {
      index += ansi.length;
      if (acceptedVisibleText) acceptedIndex = index;
      continue;
    }

    const nextEscape = str.indexOf('\x1b', index);
    const end = nextEscape === -1 ? str.length : nextEscape;
    for (const grapheme of segmentGraphemes(str.slice(index, end))) {
      const measured = graphemeWidth(grapheme);
      if (width + measured > maxWidth) {
        return acceptedVisibleText ? [str.slice(0, acceptedIndex), str.slice(acceptedIndex)] : ['', str];
      }
      width += measured;
      index += grapheme.length;
      acceptedIndex = index;
      acceptedVisibleText = true;
    }
  }

  return [str, ''];
}

function readAnsiSequence(str: string, index: number): string | undefined {
  const remaining = str.slice(index);
  return remaining.match(/^\x1b\[[0-9;]*[A-Za-z]/)?.[0] ?? remaining.match(/^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/)?.[0];
}
