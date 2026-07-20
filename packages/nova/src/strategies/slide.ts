/**
 * Slide transition — moves old content out while new content enters.
 *
 * Horizontal (left/right): content slides along each line.
 * Vertical (up/down): content slides along the line axis.
 *
 * ANSI-aware: slicing respects escape sequences so they are never
 * cut in the middle. The final frame (progress=1) returns raw newContent.
 */

import { segmentGraphemes } from '@celestial/rosetta';
import { visibleLength } from './text.js';

/** Measure visual width (excluding ANSI codes) */
function visualWidth(str: string): number {
  return visibleLength(str);
}

/**
 * ANSI-aware substring. Returns the visual characters from `start` to
 * `end` (exclusive) while preserving any ANSI escape codes that apply
 * to those characters.
 */
function ansiSlice(str: string, start: number, end: number): string {
  const tokens: Array<{ type: 'ansi' | 'grapheme'; value: string }> = [];
  const pattern = /\x1b\[[0-9;]*m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(str)) !== null) {
    for (const grapheme of segmentGraphemes(str.slice(lastIndex, match.index))) {
      tokens.push({ type: 'grapheme', value: grapheme });
    }
    tokens.push({ type: 'ansi', value: match[0] });
    lastIndex = pattern.lastIndex;
  }
  for (const grapheme of segmentGraphemes(str.slice(lastIndex))) {
    tokens.push({ type: 'grapheme', value: grapheme });
  }

  let result = '';
  let visPos = 0;
  // Track the last ANSI code seen before the slice starts so we open
  // with the correct style.
  let pendingAnsi = '';

  for (const token of tokens) {
    if (token.type === 'ansi') {
      if (visPos >= start && visPos < end) {
        result += token.value;
      } else if (visPos < start) {
        pendingAnsi += token.value;
      }
      continue;
    }

    if (visPos >= start && visPos < end) {
      if (pendingAnsi) {
        result = pendingAnsi + result;
        pendingAnsi = '';
      }
      result += token.value;
    }
    visPos++;
    if (visPos >= end) break;
  }

  return result;
}

export function slide(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right' | 'up' | 'down'): string {
  const p = Math.max(0, Math.min(1, progress));

  if (p === 0) return oldContent;
  if (p === 1) return newContent;

  if (direction === 'left' || direction === 'right') {
    return slideHorizontal(oldContent, newContent, p, direction);
  }
  return slideVertical(oldContent, newContent, p, direction);
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

function maxVisualWidth(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    const w = visualWidth(line);
    if (w > max) max = w;
  }
  return max;
}

/**
 * Pad a string with spaces to reach a target visual width.
 * ANSI codes don't count toward the visual width.
 */
function padToWidth(str: string, targetWidth: number): string {
  const vw = visualWidth(str);
  if (vw >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - vw);
}

function slideHorizontal(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right'): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const lineCount = Math.max(oldLines.length, newLines.length);
  const width = Math.max(maxVisualWidth(oldLines), maxVisualWidth(newLines));
  if (width === 0) return newContent;
  const offset = Math.round(progress * width);

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    // Pad both lines to the common width so the virtual canvas is uniform
    const oldPadded = padToWidth(oldLines[i] ?? '', width);
    const newPadded = padToWidth(newLines[i] ?? '', width);

    if (direction === 'left') {
      // Virtual canvas: [old][new], viewport slides right by offset
      // Show: old chars [offset..width) then new chars [0..offset)
      const leftPart = ansiSlice(oldPadded, offset, width);
      const rightPart = ansiSlice(newPadded, 0, offset);
      resultLines.push(leftPart + rightPart);
    } else {
      // Virtual canvas: [new][old], viewport slides left by offset
      // Show: new chars [width-offset..width) then old chars [0..width-offset)
      const leftPart = ansiSlice(newPadded, width - offset, width);
      const rightPart = ansiSlice(oldPadded, 0, width - offset);
      resultLines.push(leftPart + rightPart);
    }
  }

  return resultLines.join('\n');
}

function slideVertical(oldContent: string, newContent: string, progress: number, direction: 'up' | 'down'): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const totalHeight = Math.max(oldLines.length, newLines.length);

  // Pad both to the same height
  while (oldLines.length < totalHeight) oldLines.push('');
  while (newLines.length < totalHeight) newLines.push('');

  const offset = Math.round(progress * totalHeight);
  const resultLines: string[] = [];

  if (direction === 'up') {
    // Old content slides up, new enters from bottom
    for (let i = 0; i < totalHeight; i++) {
      const srcIndex = i + offset;
      if (srcIndex < totalHeight) {
        resultLines.push(oldLines[srcIndex]!);
      } else {
        resultLines.push(newLines[srcIndex - totalHeight]!);
      }
    }
  } else {
    // direction === 'down'
    for (let i = 0; i < totalHeight; i++) {
      const srcIndex = i - offset;
      if (srcIndex < 0) {
        resultLines.push(newLines[totalHeight + srcIndex]!);
      } else {
        resultLines.push(oldLines[srcIndex]!);
      }
    }
  }

  return resultLines.join('\n');
}
