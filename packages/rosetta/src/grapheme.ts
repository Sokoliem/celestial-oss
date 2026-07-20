/**
 * @celestial/rosetta — Grapheme cluster segmentation.
 *
 * Provides utilities for splitting text into user-perceived characters
 * (grapheme clusters), which is essential for correct cursor movement,
 * text slicing, and width calculation in terminal UIs.
 *
 * Uses Intl.Segmenter (Node 16+) with a regex-based fallback for
 * environments without it.
 */

import { graphemeCellWidth } from '@celestial/corona';

// ── Segmenter availability ──────────────────────────────────────────────

const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
const SEGMENT_CACHE_LIMIT = 500;
const segmentCache = new Map<string, readonly string[]>();
let cachedSegmenter: Intl.Segmenter | null = null;

// ── Fallback: regex-based grapheme splitting ────────────────────────────

/**
 * Simplified grapheme cluster regex that handles the most common cases:
 * - Emoji ZWJ sequences (e.g., family emoji)
 * - Emoji with variation selectors and skin tone modifiers
 * - Regional indicator pairs (flags)
 * - Base character + combining marks
 * - Surrogate pairs
 * - Plain ASCII characters
 */
const GRAPHEME_RE =
  // Regional indicator pairs (flags)
  /\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF]|[\uD800-\uDBFF][\uDC00-\uDFFF](?:\u200D[\uD800-\uDBFF][\uDC00-\uDFFF]|\uFE0F|\uD83C[\uDFFB-\uDFFF])*|[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF][\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u20D0-\u20F0\uFE20-\uFE2F]*|./g;

function segmentFallback(text: string): string[] {
  return text.match(GRAPHEME_RE) ?? [];
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Split text into an array of grapheme clusters (user-perceived characters).
 *
 * @param text - The string to segment
 * @returns Array of grapheme cluster strings
 */
export function segmentGraphemes(text: string): string[] {
  if (text.length === 0) return [];

  const cached = segmentCache.get(text);
  if (cached) return [...cached];

  if (hasSegmenter) {
    cachedSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const result = Array.from(cachedSegmenter.segment(text), (s) => s.segment);
    rememberSegments(text, result);
    return result;
  }

  const result = segmentFallback(text);
  rememberSegments(text, result);
  return result;
}

function rememberSegments(text: string, segments: readonly string[]): void {
  if (segmentCache.size >= SEGMENT_CACHE_LIMIT) {
    const first = segmentCache.keys().next().value;
    if (first !== undefined) segmentCache.delete(first);
  }
  segmentCache.set(text, [...segments]);
}

/**
 * Count the number of grapheme clusters in a string.
 * This gives the "user-perceived length" rather than the code unit or
 * code point length.
 *
 * @param text - The string to measure
 * @returns The number of grapheme clusters
 */
export function graphemeLength(text: string): number {
  if (text.length === 0) return 0;

  if (hasSegmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const _ of segmenter.segment(text)) {
      count++;
    }
    return count;
  }

  return segmentFallback(text).length;
}

/**
 * Slice a string by grapheme cluster indices.
 * Works like `String.prototype.slice` but operates on grapheme clusters
 * instead of code units.
 *
 * @param text  - The string to slice
 * @param start - Start grapheme index (inclusive)
 * @param end   - End grapheme index (exclusive), defaults to end of string
 * @returns The sliced substring
 */
export function graphemeSlice(text: string, start: number, end?: number): string {
  const graphemes = segmentGraphemes(text);
  return graphemes.slice(start, end).join('');
}

/**
 * Measure the display width of a single grapheme cluster.
 * Zero-width joins and combining marks are collapsed into the base glyph width.
 *
 * @param grapheme - A single grapheme cluster
 * @returns The terminal cell width for that grapheme
 */
export function measureGraphemeWidth(grapheme: string): number {
  return graphemeCellWidth(grapheme);
}

/**
 * Measure the display width of a string in terminal cells.
 *
 * @param text - Text to measure
 * @returns Terminal cell width
 */
export function measureTextWidth(text: string): number {
  return segmentGraphemes(text).reduce((total, grapheme) => total + measureGraphemeWidth(grapheme), 0);
}

/**
 * Slice a string so that its rendered width does not exceed `maxWidth`.
 *
 * @param text - Text to slice
 * @param maxWidth - Maximum terminal cell width
 * @returns The longest leading substring that fits within the width budget
 */
export function sliceTextByWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0 || text.length === 0) {
    return '';
  }

  let width = 0;
  const output: string[] = [];

  for (const grapheme of segmentGraphemes(text)) {
    const graphemeWidth = measureGraphemeWidth(grapheme);
    if (width + graphemeWidth > maxWidth) {
      break;
    }

    width += graphemeWidth;
    output.push(grapheme);
  }

  return output.join('');
}

/**
 * Truncate text to a display width budget using a grapheme-aware ellipsis.
 *
 * @param text - Text to truncate
 * @param maxWidth - Maximum terminal cell width
 * @param ellipsis - Truncation marker, defaults to the Unicode ellipsis
 * @returns Text that fits within `maxWidth`
 */
export function truncateText(text: string, maxWidth: number, ellipsis = '…'): string {
  if (maxWidth <= 0) {
    return '';
  }

  if (measureTextWidth(text) <= maxWidth) {
    return text;
  }

  const ellipsisWidth = measureTextWidth(ellipsis);
  if (ellipsisWidth >= maxWidth) {
    return sliceTextByWidth(ellipsis, maxWidth);
  }

  return `${sliceTextByWidth(text, maxWidth - ellipsisWidth)}${ellipsis}`;
}
