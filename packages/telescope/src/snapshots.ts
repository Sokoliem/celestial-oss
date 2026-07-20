/**
 * Terminal snapshot utilities for Telescope.
 *
 * Renders VNode trees to normalized plain text for snapshot testing.
 */

import { type CellGrid, layout, measure, type VNode } from '@celestial/core/nebula';

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
  const size = measure(vnode);
  const width = options?.width ?? size.width;
  const height = options?.height ?? size.height;

  if (width <= 0 || height <= 0) return '';

  const grid: CellGrid = layout(vnode, width, height);
  return options?.preserveColors ? gridToAnsiText(grid) : gridToText(grid);
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

function gridToText(grid: CellGrid): string {
  const lines: string[] = [];
  for (let r = 0; r < grid.height; r++) {
    let line = '';
    const row = grid.cells[r];
    if (row) {
      for (let c = 0; c < grid.width; c++) {
        const cell = row[c];
        line += cell ? cell.char : ' ';
      }
    }
    lines.push(line.trimEnd());
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

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

/** Strip ANSI escape sequences from a string */
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[[?][0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][AB012]/g, '');
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
