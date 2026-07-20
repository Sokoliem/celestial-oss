/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import { segmentGraphemes } from '@celestial/rosetta';

/** Strip ANSI escape sequences (SGR and OSC) */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

/**
 * Determine the terminal display width of a single Unicode code point.
 * Implements UAX #11 (East Asian Width) and related Unicode properties.
 *
 * Returns:
 *   0 for combining marks, control chars, zero-width chars, variation selectors
 *   2 for CJK ideographs, fullwidth forms, wide emoji, etc.
 *   1 for everything else (Latin, Cyrillic, most symbols)
 */
export function charWidth(cp: number): number {
  // C0/C1 control characters (except for regular space and DEL)
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return 0;

  // Soft hyphen
  if (cp === 0x00ad) return 0;

  // Combining Diacritical Marks
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  // Combining Diacritical Marks Extended
  if (cp >= 0x1ab0 && cp <= 0x1aff) return 0;
  // Combining Diacritical Marks Supplement
  if (cp >= 0x1dc0 && cp <= 0x1dff) return 0;
  // Combining Diacritical Marks for Symbols
  if (cp >= 0x20d0 && cp <= 0x20ff) return 0;
  // Combining Half Marks
  if (cp >= 0xfe20 && cp <= 0xfe2f) return 0;

  // Zero-width characters
  if (cp === 0x200b) return 0; // zero-width space
  if (cp === 0x200c) return 0; // zero-width non-joiner
  if (cp === 0x200d) return 0; // zero-width joiner
  if (cp === 0x2060) return 0; // word joiner
  if (cp === 0xfeff) return 0; // zero-width no-break space (BOM)

  // Variation selectors
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // VS1-VS16
  if (cp >= 0xe0100 && cp <= 0xe01ef) return 0; // VS17-VS256

  // Hangul Jamo (Korean combining)
  if (cp >= 0x1160 && cp <= 0x11ff) return 0; // Hangul Jungseong + Jongseong

  // Emoji modifiers (skin tone) — zero-width, modify previous emoji
  if (cp >= 0x1f3fb && cp <= 0x1f3ff) return 0;

  // Tags block (used in tag sequences like flag emoji)
  if (cp >= 0xe0001 && cp <= 0xe007f) return 0;

  // --- Wide / Fullwidth characters (2 cells) ---

  // CJK Radicals Supplement, Kangxi Radicals
  if (cp >= 0x2e80 && cp <= 0x2fdf) return 2;
  // CJK Symbols and Punctuation, Hiragana, Katakana
  if (cp >= 0x3000 && cp <= 0x303e) return 2;
  if (cp >= 0x3041 && cp <= 0x3096) return 2; // Hiragana
  if (cp >= 0x3099 && cp <= 0x309f) return 2; // Hiragana (rest)
  if (cp >= 0x30a0 && cp <= 0x30ff) return 2; // Katakana
  if (cp >= 0x3105 && cp <= 0x312f) return 2; // Bopomofo
  if (cp >= 0x3131 && cp <= 0x318e) return 2; // Hangul Compatibility Jamo
  if (cp >= 0x3190 && cp <= 0x31bf) return 2; // Kanbun, Bopomofo Extended
  if (cp >= 0x31f0 && cp <= 0x31ff) return 2; // Katakana Phonetic Extensions
  if (cp >= 0x3200 && cp <= 0x32ff) return 2; // Enclosed CJK Letters and Months
  if (cp >= 0x3300 && cp <= 0x33ff) return 2; // CJK Compatibility
  if (cp >= 0x3400 && cp <= 0x4dbf) return 2; // CJK Unified Ideographs Extension A
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2; // CJK Unified Ideographs
  if (cp >= 0xa000 && cp <= 0xa48f) return 2; // Yi Syllables
  if (cp >= 0xa490 && cp <= 0xa4cf) return 2; // Yi Radicals
  if (cp >= 0xac00 && cp <= 0xd7a3) return 2; // Hangul Syllables
  if (cp >= 0xf900 && cp <= 0xfaff) return 2; // CJK Compatibility Ideographs

  // Fullwidth Forms
  if (cp >= 0xff01 && cp <= 0xff60) return 2;
  if (cp >= 0xffe0 && cp <= 0xffe6) return 2;

  // CJK Unified Ideographs Extension B and beyond (supplementary planes)
  if (cp >= 0x1f000 && cp <= 0x1f02f) return 2; // Mahjong Tiles
  if (cp >= 0x1f030 && cp <= 0x1f09f) return 2; // Domino Tiles
  if (cp >= 0x1f0a0 && cp <= 0x1f0ff) return 2; // Playing Cards
  if (cp >= 0x1f100 && cp <= 0x1f1ff) return 2; // Enclosed Alphanumeric Supplement
  if (cp >= 0x1f200 && cp <= 0x1f2ff) return 2; // Enclosed Ideographic Supplement
  if (cp >= 0x1f300 && cp <= 0x1f5ff) return 2; // Misc Symbols and Pictographs
  if (cp >= 0x1f600 && cp <= 0x1f64f) return 2; // Emoticons
  if (cp >= 0x1f680 && cp <= 0x1f6ff) return 2; // Transport and Map
  if (cp >= 0x1f700 && cp <= 0x1f77f) return 2; // Alchemical Symbols
  if (cp >= 0x1f780 && cp <= 0x1f7ff) return 2; // Geometric Shapes Extended
  if (cp >= 0x1f800 && cp <= 0x1f8ff) return 2; // Supplemental Arrows-C
  if (cp >= 0x1f900 && cp <= 0x1f9ff) return 2; // Supplemental Symbols and Pictographs
  if (cp >= 0x1fa00 && cp <= 0x1fa6f) return 2; // Chess Symbols
  if (cp >= 0x1fa70 && cp <= 0x1faff) return 2; // Symbols and Pictographs Extended-A
  if (cp >= 0x20000 && cp <= 0x2ffff) return 2; // CJK Extension B/C/D/E/F + CJK Compat Supplement
  if (cp >= 0x30000 && cp <= 0x3ffff) return 2; // CJK Extension G/H/I

  // Miscellaneous wide symbols commonly rendered as 2-cell
  // Dingbats and Miscellaneous Symbols that are commonly emoji-width
  if (cp >= 0x2600 && cp <= 0x26ff) return 1; // Misc symbols — most are ambiguous, default narrow
  if (cp >= 0x2700 && cp <= 0x27bf) return 1; // Dingbats — ambiguous, default narrow

  return 1;
}

/**
 * Check if a code point is "emoji-capable" — i.e. it can be promoted
 * to emoji presentation (width 2) when followed by VS16 (U+FE0F).
 */
function isEmojiCapable(cp: number): boolean {
  // Common text characters that gain emoji presentation with VS16
  // This covers the most common cases per Unicode Emoji specification
  if (cp >= 0x2600 && cp <= 0x26ff) return true; // Misc Symbols
  if (cp >= 0x2700 && cp <= 0x27bf) return true; // Dingbats
  if (cp >= 0x2300 && cp <= 0x23ff) return true; // Misc Technical
  if (cp >= 0x2b00 && cp <= 0x2bff) return true; // Misc Symbols and Arrows
  // Number/letter keycaps, etc.
  if (cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39)) return true;
  // Other common emoji-capable characters
  if (cp === 0x200d) return true; // ZWJ (technically not, but harmless)
  if (cp === 0x00a9 || cp === 0x00ae) return true; // (C), (R)
  if (cp === 0x203c || cp === 0x2049) return true; // !!, !?
  if (cp >= 0x2190 && cp <= 0x21ff) return true; // Arrows
  return false;
}

const VISUAL_WIDTH_CACHE = new Map<string, number>();

/** Measure one user-perceived character without summing joined emoji parts. */
function graphemeWidth(grapheme: string): number {
  let width = 0;
  let previousCodePoint = 0;
  let previousWidth = 0;

  for (const character of grapheme) {
    const codePoint = character.codePointAt(0)!;

    // VS16 promotes emoji-capable text glyphs (for example, heart) to two
    // cells. ZWJ sequences and combining clusters otherwise occupy the width
    // of their widest rendered member, not the sum of their code points.
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

/** Measure visual width of a string in terminal cells */
export function visualWidth(str: string): number {
  const clean = stripAnsi(str);
  const cached = VISUAL_WIDTH_CACHE.get(clean);
  if (cached !== undefined) {
    return cached;
  }

  const width = segmentGraphemes(clean).reduce((total, grapheme) => total + graphemeWidth(grapheme), 0);
  VISUAL_WIDTH_CACHE.set(clean, width);
  return width;
}

/**
 * Slice a string by visual column width, returning the portion that fits
 * within `maxCols` terminal cells and the remainder.
 * Properly handles multi-byte characters and wide characters.
 */
export function sliceByWidth(str: string, maxCols: number): [fit: string, rest: string] {
  if (maxCols <= 0 || str.length === 0) return ['', str];

  // Styled VNodes keep ANSI outside text content. Retain the legacy path for
  // raw ANSI strings so escape sequences are preserved byte-for-byte.
  if (str.includes('\x1b')) return sliceAnsiTextByWidth(str, maxCols);

  let cols = 0;
  let i = 0;
  for (const grapheme of segmentGraphemes(str)) {
    const w = graphemeWidth(grapheme);
    if (cols + w > maxCols) break;
    cols += w;
    i += grapheme.length;
  }
  return [str.slice(0, i), str.slice(i)];
}

function sliceAnsiTextByWidth(str: string, maxCols: number): [fit: string, rest: string] {
  let cols = 0;
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
    const segment = str.slice(index, end);
    for (const grapheme of segmentGraphemes(segment)) {
      const width = graphemeWidth(grapheme);
      if (cols + width > maxCols) {
        return acceptedVisibleText ? [str.slice(0, acceptedIndex), str.slice(acceptedIndex)] : ['', str];
      }
      cols += width;
      index += grapheme.length;
      acceptedIndex = index;
      acceptedVisibleText = true;
    }
  }

  return [str, ''];
}

function readAnsiSequence(str: string, index: number): string | undefined {
  const remaining = str.slice(index);
  return remaining.match(/^\x1b\[[0-9;]*m/)?.[0] ?? remaining.match(/^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/)?.[0];
}

function appendWrappedToken(lines: string[], token: string, maxWidth: number): string {
  let remaining = token;
  while (visualWidth(remaining) > maxWidth) {
    const [fit, rest] = sliceByWidth(remaining, maxWidth);
    if (fit === '') break;
    lines.push(fit);
    remaining = rest;
  }
  return remaining;
}

/** Word-wrap a single line of text to fit within maxWidth columns */
export function wrapLine(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [];
  if (visualWidth(line) <= maxWidth) return [line];

  const words = line.split(/(\s+)/); // keep whitespace as separate tokens
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word === '') continue;
    const lineWithWord = currentLine + word;
    if (visualWidth(lineWithWord) <= maxWidth) {
      currentLine = lineWithWord;
    } else if (currentLine === '' || currentLine.trim() === '') {
      // Word is wider than maxWidth — break mid-word using visual width
      currentLine = appendWrappedToken(lines, word, maxWidth);
    } else {
      lines.push(currentLine);
      // If this token is whitespace, skip it at start of new line
      if (/^\s+$/.test(word)) {
        currentLine = '';
      } else {
        // A long word still needs splitting after a populated line. Leaving it
        // oversized here deferred clipping to the painter and dropped its tail.
        currentLine = appendWrappedToken(lines, word, maxWidth);
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/** Wrap text content respecting existing newlines and maxWidth */
export function wrapText(content: string, maxWidth: number): string[] {
  const rawLines = content.split('\n');
  const result: string[] = [];
  for (const rawLine of rawLines) {
    const wrapped = wrapLine(rawLine, maxWidth);
    result.push(...wrapped);
  }
  return result.length > 0 ? result : [''];
}
