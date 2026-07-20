import { fadeChar } from '../fade.js';
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';
const FEATHER = 2;

export interface RippleOrigin {
  x?: number;
  y?: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function ripple(oldContent: string, newContent: string, progress: number, originX: number = 0.5, originY: number = 0.5): string {
  const p = clamp(progress);

  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  let maxWidth = 0;
  for (let row = 0; row < lineCount; row++) {
    maxWidth = Math.max(maxWidth, visibleLength(oldLines[row] ?? ''), visibleLength(newLines[row] ?? ''));
  }

  if (maxWidth === 0) {
    return newContent;
  }

  const cx = clamp(originX) * (maxWidth - 1);
  const cy = clamp(originY) * (lineCount - 1);
  const maxDistance = Math.max(
    distance(cx, cy, 0, 0),
    distance(cx, cy, maxWidth - 1, 0),
    distance(cx, cy, 0, lineCount - 1),
    distance(cx, cy, maxWidth - 1, lineCount - 1),
  );
  const revealRadius = p * (maxDistance + FEATHER);

  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldPadded = padGraphemes(oldLines[row] ?? '', maxWidth);
    const newPadded = padGraphemes(newLines[row] ?? '', maxWidth);

    let line = '';
    for (let col = 0; col < maxWidth; col++) {
      const oldChar = oldPadded[col] ?? ' ';
      const newChar = newPadded[col] ?? ' ';
      const currentDistance = distance(cx, cy, col, row);
      const delta = revealRadius - currentDistance;

      if (delta >= FEATHER) {
        line += fadeChar(newChar, 1);
      } else if (delta <= 0) {
        line += fadeChar(oldChar, 1);
      } else {
        const blend = delta / FEATHER;
        if (blend >= 0.5) {
          line += fadeChar(newChar, blend);
        } else {
          line += fadeChar(oldChar, 1 - blend);
        }
      }
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
