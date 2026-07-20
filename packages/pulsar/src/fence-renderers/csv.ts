/** CSV smart fence renderer with quoted-field parsing and cell-width layout. */

import { measureTextWidth, padCellText, truncateCellText } from '@celestial/rosetta';
import type { FenceRenderContext } from '../types.js';

const MAX_CSV_ROWS = 100_000;
const MAX_CSV_COLUMNS = 10_000;

function parseCSV(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = (): boolean => {
    if (row.length >= MAX_CSV_COLUMNS) return false;
    row.push(cell.trim());
    cell = '';
    return true;
  };
  const pushRow = (): boolean => {
    if (!pushCell()) return false;
    if (row.some((value) => value.length > 0)) {
      if (rows.length >= MAX_CSV_ROWS) return false;
      rows.push(row);
    }
    row = [];
    return true;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      if (!pushCell()) return null;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      if (inQuotes) cell += ' ';
      else if (!pushRow()) return null;
    } else {
      cell += char;
    }
  }

  if (inQuotes) return null;
  if (cell.length > 0 || row.length > 0) {
    if (!pushRow()) return null;
  }
  return rows;
}

function fitWidths(natural: readonly number[], budget: number): number[] {
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= budget) return [...natural];
  const widths = natural.map((width) => Math.max(1, Math.floor((width / Math.max(1, total)) * budget)));
  let used = widths.reduce((sum, width) => sum + width, 0);

  while (used > budget) {
    const index = widths.reduce((best, width, candidate) => (width > (widths[best] ?? 0) ? candidate : best), 0);
    if ((widths[index] ?? 1) <= 1) break;
    widths[index] = (widths[index] ?? 1) - 1;
    used--;
  }
  for (let index = 0; used < budget; index = (index + 1) % widths.length) {
    widths[index] = (widths[index] ?? 0) + 1;
    used++;
  }
  return widths;
}

export function csvFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  const rows = parseCSV(token.content);
  if (!rows || rows.length === 0) return null;

  let colCount = 0;
  for (const row of rows) colCount = Math.max(colCount, row.length);
  if (colCount === 0) return null;

  const { theme } = ctx;
  const contentBudget = Math.max(1, ctx.width - 2);
  const overhead = Math.max(0, colCount - 1) * 3;
  const headers = rows[0]!;

  if (colCount + overhead > contentBudget) {
    const body = rows.length > 1 ? rows.slice(1) : [headers];
    const lines = body.flatMap((row) =>
      Array.from({ length: colCount }, (_, column) => {
        const label = rows.length > 1 ? (headers[column] || `Column ${column + 1}`) : `Column ${column + 1}`;
        const value = row[column] ?? '';
        return theme.tableCell('  ' + truncateCellText(`${label}: ${value}`, contentBudget));
      }),
    );
    return theme.codeBlockFrame(lines.join('\n'), 'csv', ctx.width);
  }

  const natural = Array<number>(colCount).fill(1);
  for (const row of rows) {
    for (let column = 0; column < colCount; column++) {
      natural[column] = Math.max(natural[column] ?? 1, measureTextWidth(row[column] ?? ''));
    }
  }
  const widths = fitWidths(natural, contentBudget - overhead);
  const lines: string[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const cells = Array.from({ length: colCount }, (_, column) => padCellText(row[column] ?? '', widths[column] ?? 1));
    const line = '  ' + cells.join(` ${theme.tableBorder} `);
    lines.push(rowIndex === 0 ? theme.tableHeader(line) : theme.tableCell(line));
    if (rowIndex === 0) {
      lines.push('  ' + widths.map((width) => '─'.repeat(width)).join('─┼─'));
    }
  }

  return theme.codeBlockFrame(lines.join('\n'), 'csv', ctx.width);
}

(csvFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
