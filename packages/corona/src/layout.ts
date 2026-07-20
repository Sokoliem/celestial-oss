/**
 * Corona Layout Primitives
 *
 * Functions for composing terminal output spatially.
 */

import { truncateCells, cellWidth as visualWidth, wrapCells } from './terminal-text.js';

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  if (value < 0) throw new RangeError(`${name} must be >= 0`);
  return Math.floor(value);
}

/** Join two blocks of text horizontally */
export function joinH(left: string, right: string, gap: number = 0): string {
  const safeGap = nonNegativeInteger(gap, 'gap');
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const maxLines = Math.max(leftLines.length, rightLines.length);
  const leftWidth = Math.max(...leftLines.map(visualWidth));
  const rightWidth = Math.max(...rightLines.map(visualWidth));

  const result: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const l = leftLines[i] ?? '';
    const r = rightLines[i] ?? '';
    const paddedLeft = l + ' '.repeat(Math.max(0, leftWidth - visualWidth(l)));
    const paddedRight = r + ' '.repeat(Math.max(0, rightWidth - visualWidth(r)));
    result.push(paddedLeft + ' '.repeat(safeGap) + paddedRight);
  }

  // Trim trailing lines that are whitespace-only
  while (result.length > 0 && result[result.length - 1]!.trim() === '') {
    result.pop();
  }

  return result.join('\n');
}

/** Join two blocks of text vertically */
export function joinV(top: string, bottom: string, gap: number = 0): string {
  const safeGap = nonNegativeInteger(gap, 'gap');
  const parts = [top];
  for (let i = 0; i < safeGap; i++) parts.push('');
  parts.push(bottom);
  return parts.join('\n');
}

/** Place content within a box of fixed size with alignment */
export function place(
  content: string,
  width: number,
  height: number,
  hAlign: 'left' | 'center' | 'right' = 'left',
  vAlign: 'top' | 'middle' | 'bottom' = 'top',
): string {
  const safeWidth = nonNegativeInteger(width, 'width');
  const safeHeight = nonNegativeInteger(height, 'height');
  if (safeHeight === 0) return '';
  const lines = content.split('\n').map((line) => truncateCells(line, safeWidth, ''));

  // Horizontal alignment
  const aligned = lines.map((line) => {
    const w = visualWidth(line);
    if (w >= safeWidth) return line;
    const gap = safeWidth - w;
    switch (hAlign) {
      case 'center': {
        const left = Math.floor(gap / 2);
        return ' '.repeat(left) + line + ' '.repeat(gap - left);
      }
      case 'right':
        return ' '.repeat(gap) + line;
      default:
        return line + ' '.repeat(gap);
    }
  });

  // Vertical alignment
  const emptyLine = ' '.repeat(safeWidth);
  const vGap = safeHeight - aligned.length;
  if (vGap <= 0) return aligned.slice(0, safeHeight).join('\n');

  switch (vAlign) {
    case 'middle': {
      const top = Math.floor(vGap / 2);
      const bottom = vGap - top;
      return [...Array.from({ length: top }, () => emptyLine), ...aligned, ...Array.from({ length: bottom }, () => emptyLine)].join('\n');
    }
    case 'bottom':
      return [...Array.from({ length: vGap }, () => emptyLine), ...aligned].join('\n');
    default:
      return [...aligned, ...Array.from({ length: vGap }, () => emptyLine)].join('\n');
  }
}

/** Render data as a columnar table */
export function table(rows: string[][], colWidths?: number[]): string {
  if (rows.length === 0) return '';

  const numCols = Math.max(...rows.map((r) => r.length));
  const widths =
    colWidths?.map((width, index) => nonNegativeInteger(width, `colWidths[${index}]`)) ??
    Array.from({ length: numCols }, (_, col) => Math.max(...rows.map((r) => visualWidth(r[col] ?? ''))));

  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const w = widths[i] ?? visualWidth(cell);
          const clipped = truncateCells(cell, w, '');
          const pad = Math.max(0, w - visualWidth(clipped));
          return clipped + ' '.repeat(pad);
        })
        .join('  '),
    )
    .join('\n');
}

// ─── Auto column sizing ─────────────────────────────────────────────────────

export interface ColumnSizing {
  /** Table layout when columns fit; stacked key/value layout otherwise. */
  mode: 'table' | 'stacked';
  /** Natural width of each column (max across header + all cells) */
  naturalWidths: number[];
  /** Final widths after fitting to maxWidth constraint */
  finalWidths: number[];
  /** Total table width including padding and separators */
  totalWidth: number;
}

export interface AutoSizeOptions {
  /** Minimum column width (default: 2) */
  minColWidth?: number;
  /** Padding per side of each cell (default: 1) */
  padding?: number;
  /** Width of column separator (default: 1 for │) */
  separatorWidth?: number;
}

/**
 * Auto-size columns using a two-phase algorithm:
 *
 * Phase 1: Measure natural width of each column (max of header + all cells).
 * Phase 2: If total exceeds maxWidth, proportionally shrink columns.
 *   - Columns are shrunk proportional to their natural width.
 *   - A lower bound (minColWidth) prevents columns from becoming unusably small.
 *   - Any leftover space from columns at the minimum is redistributed.
 */
export function autoSizeColumns(headers: string[], rows: string[][], maxWidth: number, options: AutoSizeOptions = {}): ColumnSizing {
  const safeMaxWidth = nonNegativeInteger(maxWidth, 'maxWidth');
  const minColWidth = nonNegativeInteger(options.minColWidth ?? 2, 'minColWidth');
  const padding = nonNegativeInteger(options.padding ?? 1, 'padding');
  const separatorWidth = nonNegativeInteger(options.separatorWidth ?? 1, 'separatorWidth');
  const numCols = headers.length;

  if (numCols === 0) return { mode: 'table', naturalWidths: [], finalWidths: [], totalWidth: 0 };

  // Phase 1: measure natural widths
  const naturalWidths = headers.map((h, col) => {
    let max = visualWidth(h);
    for (const row of rows) {
      const cell = row[col] ?? '';
      max = Math.max(max, visualWidth(cell));
    }
    return max;
  });

  // Calculate overhead: padding on each side of each cell + separators between columns
  const overhead = numCols * padding * 2 + (numCols - 1) * separatorWidth;
  const availableContent = safeMaxWidth - overhead;

  const totalNatural = naturalWidths.reduce((s, w) => s + w, 0);

  if (availableContent < minColWidth * numCols) {
    return {
      mode: 'stacked',
      naturalWidths,
      finalWidths: Array.from({ length: numCols }, () => 0),
      totalWidth: safeMaxWidth,
    };
  }

  // If everything fits, use natural widths
  if (totalNatural <= availableContent) {
    return {
      mode: 'table',
      naturalWidths,
      finalWidths: [...naturalWidths],
      totalWidth: totalNatural + overhead,
    };
  }

  // Phase 2: proportionally shrink
  const finalWidths = Array.from({ length: numCols }, () => minColWidth);
  let remaining = availableContent - minColWidth * numCols;

  while (remaining > 0) {
    // Grow the column with the largest remaining natural-width deficit.
    let bestIdx = -1;
    let bestDeficit = 0;
    for (let i = 0; i < numCols; i++) {
      const deficit = naturalWidths[i]! - finalWidths[i]!;
      if (deficit > bestDeficit) {
        bestIdx = i;
        bestDeficit = deficit;
      }
    }
    if (bestIdx === -1) break;
    finalWidths[bestIdx]!++;
    remaining--;
  }

  const totalWidth = finalWidths.reduce((s, w) => s + w, 0) + overhead;
  return { mode: 'table', naturalWidths, finalWidths, totalWidth };
}

/** Word-wrap text to a max width, preserving ANSI codes */
export function wrap(text: string, maxWidth: number): string {
  return wrapCells(text, nonNegativeInteger(maxWidth, 'maxWidth'), { trimBreakWhitespace: true }).join('\n');
}
