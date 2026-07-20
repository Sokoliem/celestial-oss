/**
 * True crossfade transition using simultaneous overlap.
 *
 * Both old and new content are visible simultaneously at complementary
 * opacities: old at `1 - progress`, new at `progress`. At progress 0.5
 * both layers are at 50% brightness — no black flash.
 *
 * Character-level merge: at each position, the layer with higher opacity
 * is shown at its weighted brightness. For different-length content, the
 * shorter is padded to match.
 *
 * When old and new content are identical, returns content as-is.
 */

import { fadeChar } from '../fade.js';
import { clampUnit } from '../validation.js';
import { cellIsBlank, padCells, renderCells, safeContent, type TerminalCell, visibleLength } from './text.js';

const RESET = '\x1b[0m';

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function crossfade(oldContent: string, newContent: string, progress: number): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  // Fast path: identical content needs no transition
  if (safeOldContent === safeNewContent) {
    return safeOldContent;
  }

  const p = clampUnit(progress);

  // Boundary fast paths — return raw content at endpoints
  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const oldOpacity = 1.0 - p;
  const newOpacity = p;

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[i] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine));
    const oldPadded = padCells(oldLine, width);
    const newPadded = padCells(newLine, width);
    const selected: TerminalCell[] = [];
    const opacity: number[] = [];
    for (let col = 0; col < width; col++) {
      const oldCell = oldPadded[col]!;
      const newCell = newPadded[col]!;

      if (cellIsBlank(oldCell) && cellIsBlank(newCell)) {
        selected.push(oldCell);
        opacity.push(1);
      } else if (newOpacity >= oldOpacity) {
        selected.push(newCell);
        opacity.push(newOpacity);
      } else {
        selected.push(oldCell);
        opacity.push(oldOpacity);
      }
    }

    resultLines.push(`${renderCells(selected, (text, column) => (text === ' ' ? text : fadeChar(text, opacity[column] ?? 1)))}${RESET}`);
  }

  return resultLines.join('\n');
}
