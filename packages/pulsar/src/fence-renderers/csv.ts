/**
 * CSV smart fence renderer (B9)
 *
 * Renders CSV as an aligned text table. Uses the first row as headers.
 * Falls back to plain text for invalid/malformed CSV.
 */

import type { FenceRenderContext } from '../types.js';

function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  return lines.map((line) => {
    const cells: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  });
}

export function csvFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  const rows = parseCSV(token.content);
  if (rows.length === 0) return null;

  const { theme } = ctx;
  const colCount = Math.max(...rows.map((r) => r.length));

  // Compute column widths
  const widths: number[] = Array(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      widths[c] = Math.max(widths[c] ?? 0, row[c]!.length);
    }
  }

  // Build table lines
  const lines: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]!;
    const padded = cells.map((cell, c) => cell.padEnd(widths[c] ?? 0, ' '));
    const line = '  ' + padded.join(' │ ');
    lines.push(r === 0 ? theme.tableHeader(line) : theme.tableCell(line));
    if (r === 0) {
      lines.push('  ' + widths.map((w) => '─'.repeat(w)).join('─┼─'));
    }
  }

  return theme.codeBlockFrame(lines.join('\n'), 'csv', ctx.width);
}

(csvFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
