/**
 * Dissolve transition — random character-level reveal.
 *
 * Creates a film-dissolve / TV-static effect by randomly flipping
 * individual character positions from old content to new content.
 * At each progress step, a deterministic subset of positions show
 * new content while the rest show old. Uses a seeded PRNG for
 * reproducible results across frames.
 *
 * At progress 0: returns oldContent unchanged.
 * At progress 1: returns newContent unchanged.
 * At progress 0.5: ~50% of character positions have flipped.
 */

import { fadeChar } from '../fade.js';
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';

/**
 * Simple deterministic hash for seeding.
 * Maps a position (row, col) to a threshold in [0, 1].
 * Characters flip to new content when progress exceeds their threshold.
 *
 * Uses a golden-ratio-based hash for good distribution without
 * requiring a full PRNG state machine.
 */
function positionThreshold(row: number, col: number, seed: number): number {
  // Golden ratio conjugate for good distribution
  const PHI = 0.6180339887498949;
  const hash = ((row * 7919 + col * 6271 + seed * 1327) * PHI) % 1;
  // Ensure positive
  return hash < 0 ? hash + 1 : hash;
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function dissolve(oldContent: string, newContent: string, progress: number, seed?: number): string {
  const p = Math.max(0, Math.min(1, progress));

  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  const s = seed ?? 42;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldLine = oldLines[row] ?? '';
    const newLine = newLines[row] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine));
    const oldPadded = padGraphemes(oldLine, width);
    const newPadded = padGraphemes(newLine, width);

    let line = '';
    for (let col = 0; col < width; col++) {
      const threshold = positionThreshold(row, col, s);
      const oldCh = oldPadded[col] ?? ' ';
      const newCh = newPadded[col] ?? ' ';

      if (p >= threshold) {
        // This position has flipped to new content.
        // Apply a brief brightness pulse near the flip point for sparkle.
        const distFromFlip = Math.abs(p - threshold);
        if (distFromFlip < 0.05) {
          // Sparkle: briefly brighter at the moment of flip
          line += fadeChar(newCh, Math.min(1, 0.6 + distFromFlip * 8));
        } else {
          line += fadeChar(newCh, 1);
        }
      } else {
        // Still showing old content
        line += fadeChar(oldCh, 1);
      }
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
