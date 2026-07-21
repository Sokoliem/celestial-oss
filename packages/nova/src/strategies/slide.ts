/**
 * Slide transition — moves old content out while new content enters.
 *
 * Horizontal (left/right): content slides along each line.
 * Vertical (up/down): content slides along the line axis.
 *
 * ANSI-aware: slicing respects escape sequences so they are never
 * cut in the middle. The final frame (progress=1) returns raw newContent.
 */

import { clampUnit } from '../validation.js';
import { padStyledCells, renderCells, safeContent, visibleLength } from './text.js';

/** Measure visual width (excluding ANSI codes) */
function visualWidth(str: string): number {
  return visibleLength(str);
}

export function slide(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right' | 'up' | 'down'): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);

  if (p === 0) return safeOldContent;
  if (p === 1) return safeNewContent;

  if (direction === 'left' || direction === 'right') {
    return slideHorizontal(safeOldContent, safeNewContent, p, direction);
  }
  return slideVertical(safeOldContent, safeNewContent, p, direction);
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

function slideHorizontal(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right'): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);

  const lineCount = Math.max(oldLines.length, newLines.length);
  const width = Math.max(maxVisualWidth(oldLines), maxVisualWidth(newLines));
  if (width === 0) return newContent;
  const offset = Math.round(progress * width);

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldPadded = padStyledCells(oldLines[i] ?? '', width);
    const newPadded = padStyledCells(newLines[i] ?? '', width);

    if (direction === 'left') {
      // Virtual canvas: [old][new], viewport slides right by offset
      // Show: old chars [offset..width) then new chars [0..offset)
      const leftPart = renderCells(oldPadded.slice(offset, width));
      const rightPart = renderCells(newPadded.slice(0, offset));
      resultLines.push(leftPart + rightPart);
    } else {
      // Virtual canvas: [new][old], viewport slides left by offset
      // Show: new chars [width-offset..width) then old chars [0..width-offset)
      const leftPart = renderCells(newPadded.slice(width - offset, width));
      const rightPart = renderCells(oldPadded.slice(0, width - offset));
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
