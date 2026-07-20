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
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function crossfade(oldContent: string, newContent: string, progress: number): string {
  // Fast path: identical content needs no transition
  if (oldContent === newContent) {
    return oldContent;
  }

  const p = Math.max(0, Math.min(1, progress));

  // Boundary fast paths — return raw content at endpoints
  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  const oldOpacity = 1.0 - p;
  const newOpacity = p;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[i] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine));
    const oldPadded = padGraphemes(oldLine, width);
    const newPadded = padGraphemes(newLine, width);

    let line = '';
    for (let col = 0; col < width; col++) {
      const oldCh = oldPadded[col] ?? ' ';
      const newCh = newPadded[col] ?? ' ';

      if (oldCh === ' ' && newCh === ' ') {
        line += ' ';
      } else if (newOpacity >= oldOpacity) {
        // New layer dominates — show new char at new opacity
        line += fadeChar(newCh, newOpacity);
      } else {
        // Old layer dominates — show old char at old opacity
        line += fadeChar(oldCh, oldOpacity);
      }
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
