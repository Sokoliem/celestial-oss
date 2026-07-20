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
import { clampUnit, finiteNumber } from '../validation.js';
import { padCells, renderCells, safeContent, type TerminalCell, visibleLength } from './text.js';

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
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);

  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const s = finiteNumber(seed ?? 42, 'seed');

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldLine = oldLines[row] ?? '';
    const newLine = newLines[row] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine));
    const oldPadded = padCells(oldLine, width);
    const newPadded = padCells(newLine, width);
    const selected: TerminalCell[] = [];
    const opacity: number[] = [];
    for (let col = 0; col < width; col++) {
      const threshold = positionThreshold(row, col, s);

      if (p >= threshold) {
        // This position has flipped to new content.
        // Apply a brief brightness pulse near the flip point for sparkle.
        const distFromFlip = Math.abs(p - threshold);
        if (distFromFlip < 0.05) {
          // Sparkle: briefly brighter at the moment of flip
          selected.push(newPadded[col]!);
          opacity.push(Math.min(1, 0.6 + distFromFlip * 8));
        } else {
          selected.push(newPadded[col]!);
          opacity.push(1);
        }
      } else {
        selected.push(oldPadded[col]!);
        opacity.push(1);
      }
    }

    resultLines.push(`${renderCells(selected, (text, column) => fadeChar(text, opacity[column] ?? 1))}${RESET}`);
  }

  return resultLines.join('\n');
}
