import { fadeChar } from '../fade.js';
import { padGraphemes, visibleLength } from './text.js';

const RESET = '\x1b[0m';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function typewriterReveal(oldContent: string, newContent: string, progress: number, cursor: string = '▌'): string {
  const p = clamp(progress);

  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  let width = 0;
  for (let row = 0; row < lineCount; row++) {
    width = Math.max(width, visibleLength(oldLines[row] ?? ''), visibleLength(newLines[row] ?? ''));
  }

  const totalCells = width * lineCount;
  if (totalCells === 0) {
    return oldContent;
  }

  const revealCount = Math.floor(p * totalCells);
  const cursorIndex = revealCount < totalCells ? revealCount : -1;
  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldPadded = padGraphemes(oldLines[row] ?? '', width);
    const newPadded = padGraphemes(newLines[row] ?? '', width);
    let line = '';

    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (index < revealCount) {
        line += newPadded[col] ?? ' ';
        continue;
      }

      if (index === cursorIndex) {
        line += cursor;
        continue;
      }

      line += fadeChar(oldPadded[col] ?? ' ', 0.35);
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
