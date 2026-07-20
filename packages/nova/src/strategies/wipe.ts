/**
 * Wipe transition with feathered edge — reveals new content by sweeping
 * in a direction with a smooth opacity gradient at the wipe boundary.
 *
 * Instead of a hard cut between old and new content, a 3-character
 * feather zone blends opacity smoothly at the transition edge.
 */

import { fadeChar } from '../fade.js';
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';
const FEATHER_WIDTH = 3; // characters of soft edge

export function wipe(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right' | 'up' | 'down'): string {
  const p = Math.max(0, Math.min(1, progress));

  if (p === 0) return oldContent;
  if (p === 1) return newContent;

  if (direction === 'up' || direction === 'down') {
    return wipeVertical(oldContent, newContent, p, direction);
  }
  return wipeHorizontal(oldContent, newContent, p, direction);
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

function maxLineWidth(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    const width = visibleLength(line);
    if (width > max) max = width;
  }
  return max;
}

function wipeVertical(oldContent: string, newContent: string, progress: number, direction: 'up' | 'down'): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const totalLines = Math.max(oldLines.length, newLines.length);

  while (oldLines.length < totalLines) oldLines.push('');
  while (newLines.length < totalLines) newLines.push('');

  const wipePos = progress * totalLines;
  const resultLines: string[] = new Array(totalLines);

  for (let i = 0; i < totalLines; i++) {
    // For 'down', wipe position advances from top (line 0) downward
    // For 'up', wipe position advances from bottom (line totalLines-1) upward
    const effectiveIdx = direction === 'down' ? i : totalLines - 1 - i;
    const dist = wipePos - effectiveIdx;
    // lineIdx === i since we always render to the correct output position

    const width = Math.max(visibleLength(oldLines[i]!), visibleLength(newLines[i]!));
    const oldPadded = padGraphemes(oldLines[i]!, width);
    const newPadded = padGraphemes(newLines[i]!, width);

    if (dist >= 1) {
      // Fully revealed — new content unmodified
      resultLines[i] = newPadded.join('') + RESET;
    } else if (dist <= -1) {
      // Not yet reached — old content unmodified
      resultLines[i] = oldPadded.join('') + RESET;
    } else {
      // Feather zone: blend old fading out, new fading in
      const blend = Math.max(0, Math.min(1, (dist + 1) / 2));
      const oldOpacity = 1 - blend;
      const newOpacity = blend;
      if (newOpacity > 0.5) {
        let line = '';
        for (const ch of newPadded) {
          line += fadeChar(ch, newOpacity);
        }
        resultLines[i] = line + RESET;
      } else {
        let line = '';
        for (const ch of oldPadded) {
          line += fadeChar(ch, oldOpacity);
        }
        resultLines[i] = line + RESET;
      }
    }
  }

  return resultLines.join('\n');
}

function wipeHorizontal(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right'): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);
  const width = Math.max(maxLineWidth(oldLines), maxLineWidth(newLines));
  const wipeCol = progress * width;

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldPadded = padGraphemes(oldLines[i] ?? '', width);
    const newPadded = padGraphemes(newLines[i] ?? '', width);
    let line = '';

    for (let col = 0; col < width; col++) {
      const effectiveCol = direction === 'right' ? col : width - 1 - col;
      const dist = wipeCol - effectiveCol;

      const oldCh = oldPadded[effectiveCol] ?? ' ';
      const newCh = newPadded[effectiveCol] ?? ' ';

      if (dist > FEATHER_WIDTH) {
        // Fully revealed — new character
        line += fadeChar(newCh, 1);
      } else if (dist < 0) {
        // Not yet reached — old character
        line += fadeChar(oldCh, 1);
      } else {
        // Feather zone — blend
        const blend = dist / FEATHER_WIDTH;
        if (blend > 0.5) {
          line += fadeChar(newCh, blend);
        } else {
          line += fadeChar(oldCh, 1 - blend);
        }
      }
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
