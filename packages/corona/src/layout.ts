/**
 * Corona Layout Primitives
 *
 * Functions for composing terminal output spatially.
 */

import { sliceByVisualWidth, visualWidth } from './utils.js';

/** Join two blocks of text horizontally */
export function joinH(left: string, right: string, gap: number = 0): string {
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
    result.push(paddedLeft + ' '.repeat(gap) + paddedRight);
  }

  // Trim trailing lines that are whitespace-only
  while (result.length > 0 && result[result.length - 1]!.trim() === '') {
    result.pop();
  }

  return result.join('\n');
}

/** Join two blocks of text vertically */
export function joinV(top: string, bottom: string, gap: number = 0): string {
  const parts = [top];
  for (let i = 0; i < gap; i++) parts.push('');
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
  const lines = content.split('\n');

  // Horizontal alignment
  const aligned = lines.map((line) => {
    const w = visualWidth(line);
    if (w >= width) return line;
    const gap = width - w;
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
  const emptyLine = ' '.repeat(width);
  const vGap = height - aligned.length;
  if (vGap <= 0) return aligned.slice(0, height).join('\n');

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
  const widths = colWidths ?? Array.from({ length: numCols }, (_, col) => Math.max(...rows.map((r) => visualWidth(r[col] ?? ''))));

  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const w = widths[i] ?? visualWidth(cell);
          const pad = Math.max(0, w - visualWidth(cell));
          return cell + ' '.repeat(pad);
        })
        .join('  '),
    )
    .join('\n');
}

// ─── Auto column sizing ─────────────────────────────────────────────────────

export interface ColumnSizing {
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
  const { minColWidth = 2, padding = 1, separatorWidth = 1 } = options;
  const numCols = headers.length;

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
  const availableContent = maxWidth - overhead;

  const totalNatural = naturalWidths.reduce((s, w) => s + w, 0);

  // If everything fits, use natural widths
  if (totalNatural <= availableContent) {
    return {
      naturalWidths,
      finalWidths: [...naturalWidths],
      totalWidth: totalNatural + overhead,
    };
  }

  // Phase 2: proportionally shrink
  const finalWidths = naturalWidths.map((w) => Math.max(minColWidth, Math.floor((w / totalNatural) * availableContent)));

  // Distribute remaining space to largest columns
  const assigned = finalWidths.reduce((s, w) => s + w, 0);
  let remaining = availableContent - assigned;

  while (remaining > 0) {
    // Find column with the largest natural width that isn't already at natural
    let bestIdx = -1;
    let bestNatural = -1;
    for (let i = 0; i < numCols; i++) {
      if (finalWidths[i]! < naturalWidths[i]! && naturalWidths[i]! > bestNatural) {
        bestIdx = i;
        bestNatural = naturalWidths[i]!;
      }
    }
    if (bestIdx === -1) break;
    finalWidths[bestIdx]!++;
    remaining--;
  }

  const totalWidth = finalWidths.reduce((s, w) => s + w, 0) + overhead;
  return { naturalWidths, finalWidths, totalWidth };
}

/** Word-wrap text to a max width, preserving ANSI codes */
export function wrap(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text;

  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (visualWidth(line) <= maxWidth) {
      result.push(line);
      continue;
    }

    // Simple word-wrap (splits on spaces)
    const words = line.split(' ');
    let current = '';
    for (const word of words) {
      // If the word itself exceeds maxWidth, break it into chunks
      // while preserving ANSI escape sequences
      if (visualWidth(word) > maxWidth) {
        if (current) {
          result.push(current);
          current = '';
        }
        let remaining = word;
        while (visualWidth(remaining) > maxWidth) {
          const [chunk, rest] = sliceByVisualWidth(remaining, maxWidth);
          if (chunk.length === 0) break;
          result.push(chunk);
          remaining = rest;
        }
        if (remaining) result.push(remaining);
        continue;
      }

      if (current === '') {
        current = word;
      } else if (visualWidth(current) + 1 + visualWidth(word) <= maxWidth) {
        current += ' ' + word;
      } else {
        result.push(current);
        current = word;
      }
    }
    if (current) result.push(current);
  }

  return result.join('\n');
}
