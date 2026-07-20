import { fadeChar } from '../fade.js';
import { clampUnit } from '../validation.js';
import { padCells, renderCells, safeContent, type TerminalCell, visibleLength } from './text.js';

const RESET = '\x1b[0m';

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function typewriterReveal(oldContent: string, newContent: string, progress: number, cursor: string = '▌'): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);

  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  let width = 0;
  for (let row = 0; row < lineCount; row++) {
    width = Math.max(width, visibleLength(oldLines[row] ?? ''), visibleLength(newLines[row] ?? ''));
  }

  const totalCells = width * lineCount;
  if (totalCells === 0) {
    return safeOldContent;
  }

  const revealCount = Math.floor(p * totalCells);
  const cursorIndex = revealCount < totalCells ? revealCount : -1;
  const cursorCell = padCells(cursor, 1)[0]!;
  const resultLines: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const oldPadded = padCells(oldLines[row] ?? '', width);
    const newPadded = padCells(newLines[row] ?? '', width);
    const selected: TerminalCell[] = [];
    const faded: boolean[] = [];

    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (index < revealCount) {
        selected.push(newPadded[col]!);
        faded.push(false);
        continue;
      }

      if (index === cursorIndex) {
        selected.push(cursorCell);
        faded.push(false);
        continue;
      }

      selected.push(oldPadded[col]!);
      faded.push(true);
    }

    resultLines.push(`${renderCells(selected, (text, column) => (faded[column] ? fadeChar(text, 0.35) : text))}${RESET}`);
  }

  return resultLines.join('\n');
}
