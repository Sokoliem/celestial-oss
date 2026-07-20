/**
 * Zoom / iris transition — radial reveal from a configurable origin.
 *
 * Reveals new content expanding outward from an origin point in
 * concentric character-rings (using Chebyshev distance). The old
 * content is visible in the shrinking border.
 *
 * Supports two modes:
 *   'in'  — new content zooms in from center (default)
 *   'out' — old content zooms out to center, revealing new content from edges
 *
 * The feather zone provides a smooth brightness gradient at the
 * reveal boundary rather than a hard cut.
 *
 * At progress 0: returns oldContent unchanged.
 * At progress 1: returns newContent unchanged.
 */

import { fadeChar } from '../fade.js';
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';
const FEATHER = 2; // characters of soft edge at reveal boundary

export interface ZoomOrigin {
  /** Normalized x position (0 = left, 0.5 = center, 1 = right). Default: 0.5 */
  x?: number;
  /** Normalized y position (0 = top, 0.5 = center, 1 = bottom). Default: 0.5 */
  y?: number;
}

export type ZoomMode = 'in' | 'out';

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function zoom(oldContent: string, newContent: string, progress: number, mode: ZoomMode = 'in', origin?: ZoomOrigin): string {
  const p = Math.max(0, Math.min(1, progress));

  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  const originX = origin?.x ?? 0.5;
  const originY = origin?.y ?? 0.5;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  // Compute max line width across both contents
  let maxWidth = 0;
  for (let i = 0; i < lineCount; i++) {
    const ow = visibleLength(oldLines[i] ?? '');
    const nw = visibleLength(newLines[i] ?? '');
    if (ow > maxWidth) maxWidth = ow;
    if (nw > maxWidth) maxWidth = nw;
  }

  // Origin in absolute character coordinates
  const cx = originX * (maxWidth - 1);
  const cy = originY * (lineCount - 1);

  // Maximum Euclidean distance from origin to any corner
  const maxRadius = Math.sqrt(Math.pow(Math.max(cx, maxWidth - 1 - cx), 2) + Math.pow(Math.max(cy, lineCount - 1 - cy), 2));

  // Reveal radius: how far from origin we've revealed
  const revealRadius = p * (maxRadius + FEATHER);

  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldLine = oldLines[row] ?? '';
    const newLine = newLines[row] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine), maxWidth);
    const oldPadded = padGraphemes(oldLine, width);
    const newPadded = padGraphemes(newLine, width);

    let line = '';
    for (let col = 0; col < width; col++) {
      // Euclidean distance from origin for smooth circular reveal
      const dist = Math.sqrt((col - cx) ** 2 + (row - cy) ** 2);

      const oldCh = oldPadded[col] ?? ' ';
      const newCh = newPadded[col] ?? ' ';

      let showNew: boolean;
      let featherBlend: number;

      if (mode === 'in') {
        // Zoom in: reveal new from origin outward
        const revealDist = dist - revealRadius;
        if (revealDist < -FEATHER) {
          showNew = true;
          featherBlend = 1;
        } else if (revealDist > 0) {
          showNew = false;
          featherBlend = 0;
        } else {
          // In feather zone
          featherBlend = 1 - (revealDist + FEATHER) / FEATHER;
          showNew = featherBlend >= 0.5;
        }
      } else {
        // Zoom out: old collapses toward origin, new revealed from edges
        // Invert: far positions reveal first, origin reveals last
        const invertedDist = maxRadius - dist;
        const revealDist = invertedDist - revealRadius;
        if (revealDist < -FEATHER) {
          showNew = true;
          featherBlend = 1;
        } else if (revealDist > 0) {
          showNew = false;
          featherBlend = 0;
        } else {
          featherBlend = 1 - (revealDist + FEATHER) / FEATHER;
          showNew = featherBlend >= 0.5;
        }
      }

      if (showNew) {
        line += fadeChar(newCh, Math.max(0.3, featherBlend));
      } else {
        line += fadeChar(oldCh, Math.max(0.3, 1 - featherBlend));
      }
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
