/**
 * Terminal snapshot utilities for Telescope.
 *
 * Renders VNode trees to normalized plain text for snapshot testing.
 */

import type { CellGrid, VNode } from '@celestial/core/nebula';
import { stripAnsi, visualWidth } from '@celestial/core/corona';
import { gridToPlainLines } from './internal/grid-text.js';
import { renderGrid } from './internal/render-grid.js';

type SnapshotCell = NonNullable<CellGrid['cells'][number][number]>;

export interface SnapshotOptions {
  /** Width of the virtual terminal */
  width?: number;
  /** Height of the virtual terminal */
  height?: number;
  /** Preserve ANSI color/style escapes instead of stripping them */
  preserveColors?: boolean;
}

/**
 * Render a VNode to a snapshot-friendly string.
 * Trailing whitespace on each line is trimmed and trailing empty lines removed.
 */
export function renderToSnapshot(vnode: VNode, options?: SnapshotOptions): string {
  const rendered = renderGrid(vnode, options);
  if (!rendered) return '';
  return options?.preserveColors ? gridToAnsiText(rendered.grid) : gridToPlainLines(rendered.grid).join('\n');
}

/**
 * Normalize a raw string for snapshot comparison.
 * Strips ANSI sequences, trims trailing whitespace, removes trailing blank lines.
 */
export function normalizeSnapshot(input: string, options?: Pick<SnapshotOptions, 'preserveColors'>): string {
  const stripped = options?.preserveColors ? stripNonColorAnsi(input) : stripAnsi(input);
  const lines = stripped.split('\n').map((line) => (options?.preserveColors ? trimAnsiLineEnd(line) : line.trimEnd()));

  // Remove trailing empty lines
  while (lines.length > 0 && stripAnsi(lines[lines.length - 1] ?? '') === '') {
    lines.pop();
  }

  return lines.join('\n');
}

// ── Internal helpers ────────────────────────────────────────────────────

function gridToAnsiText(grid: CellGrid): string {
  const lines: string[] = [];

  for (let r = 0; r < grid.height; r++) {
    let line = '';
    let lastStyleKey = '';
    const row = grid.cells[r];

    if (row) {
      let lastContentIndex = row.length - 1;
      while (lastContentIndex >= 0 && (!row[lastContentIndex] || row[lastContentIndex]!.char === ' ')) {
        lastContentIndex--;
      }

      for (let c = 0; c <= lastContentIndex; c++) {
        const cell = row[c];
        const style = cell?.style;
        const styleKey = JSON.stringify(style ?? {});
        if (styleKey !== lastStyleKey) {
          line += styleToAnsi(style);
          lastStyleKey = styleKey;
        }
        line += cell ? cell.char : ' ';
        if (cell?.char && cell.char !== ' ') c += Math.max(0, visualWidth(cell.char) - 1);
      }
    }

    if (line.includes('\x1b[') && !line.endsWith('\x1b[0m')) {
      line += '\x1b[0m';
    }

    lines.push(line.trimEnd());
  }

  while (lines.length > 0 && stripAnsi(lines[lines.length - 1] ?? '') === '') {
    lines.pop();
  }

  return lines.join('\n');
}

function styleToAnsi(style: SnapshotCell['style'] | undefined): string {
  if (!style) return '';

  let ansi = '\x1b[0m';
  if (style.fg) ansi += style.fg;
  if (style.bg) ansi += style.bg;
  if (style.bold) ansi += '\x1b[1m';
  if (style.dim) ansi += '\x1b[2m';
  if (style.italic) ansi += '\x1b[3m';
  if (style.underline) ansi += '\x1b[4m';
  if (style.strikethrough) ansi += '\x1b[9m';
  return ansi;
}

function stripNonColorAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;?]*[A-IK-Za-ik-z]/g, (match) => (match.endsWith('m') ? match : ''))
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][AB012]/g, '');
}

function trimAnsiLineEnd(line: string): string {
  return line.replace(/(?:\x1b\[[0-9;]*m)*\s+(\x1b\[[0-9;]*m)*$/g, '$1');
}
