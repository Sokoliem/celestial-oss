import type { CellGrid } from '@celestial/core/nebula';
import { visualWidth } from '@celestial/core/corona';

export function gridToPlainLines(grid: CellGrid): string[] {
  const lines: string[] = [];
  for (let rowIndex = 0; rowIndex < grid.height; rowIndex++) {
    let line = '';
    const row = grid.cells[rowIndex];
    if (row) {
      for (let col = 0; col < grid.width; col++) {
        const char = row[col]?.char ?? ' ';
        line += char;
        if (char !== ' ') col += Math.max(0, visualWidth(char) - 1);
      }
    }
    lines.push(line.trimEnd());
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
