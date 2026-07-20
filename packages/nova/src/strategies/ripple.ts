import { fadeChar } from '../fade.js';
import { clampUnit } from '../validation.js';
import { padCells, renderCells, safeContent, type TerminalCell, visibleLength } from './text.js';

const RESET = '\x1b[0m';
const FEATHER = 2;

export interface RippleOrigin {
  x?: number;
  y?: number;
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function ripple(oldContent: string, newContent: string, progress: number, originX: number = 0.5, originY: number = 0.5): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);

  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  let maxWidth = 0;
  for (let row = 0; row < lineCount; row++) {
    maxWidth = Math.max(maxWidth, visibleLength(oldLines[row] ?? ''), visibleLength(newLines[row] ?? ''));
  }

  if (maxWidth === 0) {
    return safeNewContent;
  }

  const cx = clampUnit(originX, 'originX') * (maxWidth - 1);
  const cy = clampUnit(originY, 'originY') * (lineCount - 1);
  const maxDistance = Math.max(
    distance(cx, cy, 0, 0),
    distance(cx, cy, maxWidth - 1, 0),
    distance(cx, cy, 0, lineCount - 1),
    distance(cx, cy, maxWidth - 1, lineCount - 1),
  );
  const revealRadius = p * (maxDistance + FEATHER);

  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldPadded = padCells(oldLines[row] ?? '', maxWidth);
    const newPadded = padCells(newLines[row] ?? '', maxWidth);
    const selected: TerminalCell[] = [];
    const opacity: number[] = [];
    for (let col = 0; col < maxWidth; col++) {
      const currentDistance = distance(cx, cy, col, row);
      const delta = revealRadius - currentDistance;

      if (delta >= FEATHER) {
        selected.push(newPadded[col]!);
        opacity.push(1);
      } else if (delta <= 0) {
        selected.push(oldPadded[col]!);
        opacity.push(1);
      } else {
        const blend = delta / FEATHER;
        if (blend >= 0.5) {
          selected.push(newPadded[col]!);
          opacity.push(blend);
        } else {
          selected.push(oldPadded[col]!);
          opacity.push(1 - blend);
        }
      }
    }

    resultLines.push(`${renderCells(selected, (text, column) => fadeChar(text, opacity[column] ?? 1))}${RESET}`);
  }

  return resultLines.join('\n');
}
