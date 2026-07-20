/**
 * Corona Table Border System
 *
 * Extended border character sets for table grid rendering with
 * internal junctions, separators, and 18 pre-defined styles
 * inspired by tennis (https://github.com/gurgeous/tennis).
 */

import type { Color } from './color.js';
import { truncate } from './style.js';
import { visualWidth } from './utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TableBorderChars {
  // Outer corners
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  // Outer edges
  top: string;
  bottom: string;
  left: string;
  right: string;
  // Internal separators
  horizontal: string;
  vertical: string;
  // T-junctions (outer edge meets internal line)
  tTop: string; // ┬  top edge, column separator going down
  tBottom: string; // ┴  bottom edge, column separator going up
  tLeft: string; // ├  left edge, row separator going right
  tRight: string; // ┤  right edge, row separator going left
  // Cross junction
  cross: string; // ┼  internal intersection
  // Optional: header separator can differ from row separator
  headerHorizontal?: string;
  headerCross?: string;
  headerTLeft?: string;
  headerTRight?: string;
}

export interface TableBorderStyle {
  readonly chars: TableBorderChars;
  /** Whether to render the outer frame (top/bottom/side borders) */
  readonly frame: boolean;
  /** Whether to render vertical separators between columns */
  readonly columnSeparators: boolean;
  /** Whether to render horizontal separator after header */
  readonly headerSeparator: boolean;
  /** Whether to render horizontal separators between rows */
  readonly rowSeparators: boolean;
}

// ─── Style creation helper ──────────────────────────────────────────────────

function createTableBorder(
  chars: TableBorderChars,
  options?: { frame?: boolean; columnSeparators?: boolean; headerSeparator?: boolean; rowSeparators?: boolean },
): TableBorderStyle {
  return {
    chars,
    frame: options?.frame ?? true,
    columnSeparators: options?.columnSeparators ?? true,
    headerSeparator: options?.headerSeparator ?? true,
    rowSeparators: options?.rowSeparators ?? false,
  };
}

// ─── 18 Pre-defined Table Border Styles ─────────────────────────────────────

const SPACE_CHARS: TableBorderChars = {
  topLeft: ' ',
  topRight: ' ',
  bottomLeft: ' ',
  bottomRight: ' ',
  top: ' ',
  bottom: ' ',
  left: ' ',
  right: ' ',
  horizontal: ' ',
  vertical: ' ',
  tTop: ' ',
  tBottom: ' ',
  tLeft: ' ',
  tRight: ' ',
  cross: ' ',
};

export const tableBorder = {
  /** ╭─┬─╮ │ │ ├─┼─┤ ╰─┴─╯ — Rounded corners with light lines */
  rounded: createTableBorder({
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** ┌─┬─┐ │ │ ├─┼─┤ └─┴─┘ — Square/light corners */
  square: createTableBorder({
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** Same as square — alias for tennis compatibility */
  light: createTableBorder({
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** Same as square — tennis "single" is identical to light */
  single: createTableBorder({
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** Same as square but with thinner lines */
  thin: createTableBorder({
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** ╔═╦═╗ ║ ║ ╠═╬═╣ ╚═╩═╝ — Double-line borders */
  double: createTableBorder({
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    top: '═',
    bottom: '═',
    left: '║',
    right: '║',
    horizontal: '═',
    vertical: '║',
    tTop: '╦',
    tBottom: '╩',
    tLeft: '╠',
    tRight: '╣',
    cross: '╬',
  }),

  /** ┏━┳━┓ ┃ ┃ ┣━╋━┫ ┗━┻━┛ — Heavy/thick lines */
  heavy: createTableBorder({
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    top: '━',
    bottom: '━',
    left: '┃',
    right: '┃',
    horizontal: '━',
    vertical: '┃',
    tTop: '┳',
    tBottom: '┻',
    tLeft: '┣',
    tRight: '┫',
    cross: '╋',
  }),

  /** No outer border, ─ header separator, spaces between columns */
  compact: createTableBorder(
    {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      top: ' ',
      bottom: ' ',
      left: ' ',
      right: ' ',
      horizontal: '─',
      vertical: ' ',
      tTop: ' ',
      tBottom: ' ',
      tLeft: '─',
      tRight: '─',
      cross: '─',
    },
    { frame: false, columnSeparators: false },
  ),

  /** No outer border, ═ header separator */
  compact_double: createTableBorder(
    {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      top: ' ',
      bottom: ' ',
      left: ' ',
      right: ' ',
      horizontal: '═',
      vertical: ' ',
      tTop: ' ',
      tBottom: ' ',
      tLeft: '═',
      tRight: '═',
      cross: '═',
    },
    { frame: false, columnSeparators: false },
  ),

  /** .'+|— ASCII with rounded feel */
  ascii_rounded: createTableBorder({
    topLeft: '.',
    topRight: '.',
    bottomLeft: "'",
    bottomRight: "'",
    top: '-',
    bottom: '-',
    left: '|',
    right: '|',
    horizontal: '-',
    vertical: '|',
    tTop: '-',
    tBottom: '-',
    tLeft: '|',
    tRight: '|',
    cross: '+',
  }),

  /** +--+ Basic ASCII table */
  basic: createTableBorder({
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    top: '-',
    bottom: '-',
    left: '|',
    right: '|',
    horizontal: '-',
    vertical: '|',
    tTop: '+',
    tBottom: '+',
    tLeft: '+',
    tRight: '+',
    cross: '+',
  }),

  /** basic but no row/col separators, minimal */
  basic_compact: createTableBorder(
    {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      top: '-',
      bottom: '-',
      left: '|',
      right: '|',
      horizontal: '-',
      vertical: ' ',
      tTop: '-',
      tBottom: '-',
      tLeft: '+',
      tRight: '+',
      cross: '-',
    },
    { columnSeparators: false },
  ),

  /** | col | col | — Markdown pipe table */
  markdown: createTableBorder(
    {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      top: ' ',
      bottom: ' ',
      left: '|',
      right: '|',
      horizontal: '-',
      vertical: '|',
      tTop: ' ',
      tBottom: ' ',
      tLeft: '|',
      tRight: '|',
      cross: '|',
    },
    { frame: false },
  ),

  /** psql-style — no outer, + junctions */
  psql: createTableBorder(
    {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      top: ' ',
      bottom: ' ',
      left: ' ',
      right: ' ',
      horizontal: '-',
      vertical: '|',
      tTop: ' ',
      tBottom: ' ',
      tLeft: '-',
      tRight: '-',
      cross: '+',
    },
    { frame: false },
  ),

  /** ·:. Dots style */
  dots: createTableBorder({
    topLeft: '.',
    topRight: '.',
    bottomLeft: ':',
    bottomRight: ':',
    top: '.',
    bottom: ':',
    left: ':',
    right: ':',
    horizontal: '.',
    vertical: ':',
    tTop: '.',
    tBottom: ':',
    tLeft: ':',
    tRight: ':',
    cross: ':',
  }),

  /** ┍━┑ — Reinforced: mixed heavy/light corner joins */
  reinforced: createTableBorder({
    topLeft: '┍',
    topRight: '┑',
    bottomLeft: '┕',
    bottomRight: '┙',
    top: '━',
    bottom: '━',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┯',
    tBottom: '┷',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
    headerHorizontal: '━',
    headerCross: '┿',
    headerTLeft: '┝',
    headerTRight: '┥',
  }),

  /** = reStructuredText table style */
  restructured: createTableBorder(
    {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      top: '=',
      bottom: '=',
      left: ' ',
      right: ' ',
      horizontal: '=',
      vertical: ' ',
      tTop: ' ',
      tBottom: ' ',
      tLeft: '=',
      tRight: '=',
      cross: ' ',
    },
    { frame: false, columnSeparators: false },
  ),

  /** ♥ corners — whimsical hearts */
  with_love: createTableBorder({
    topLeft: '♥',
    topRight: '♥',
    bottomLeft: '♥',
    bottomRight: '♥',
    top: '─',
    bottom: '─',
    left: '│',
    right: '│',
    horizontal: '─',
    vertical: '│',
    tTop: '┬',
    tBottom: '┴',
    tLeft: '├',
    tRight: '┤',
    cross: '┼',
  }),

  /** No visible borders at all */
  none: createTableBorder(
    {
      ...SPACE_CHARS,
    },
    { frame: false, columnSeparators: false, headerSeparator: false },
  ),
} as const;

/** Get a table border style by name */
export function getTableBorder(name: string): TableBorderStyle | undefined {
  return (tableBorder as Record<string, TableBorderStyle>)[name];
}

/** List all available table border style names */
export function listTableBorders(): string[] {
  return Object.keys(tableBorder);
}

// ─── Table grid rendering ───────────────────────────────────────────────────

function applyColor(s: string, c: Color | undefined): string {
  if (!c) return s;
  return `${c.fg()}${s}\x1b[39m`;
}

export interface RenderTableOptions {
  /** Column widths (content width, not including padding) */
  colWidths: number[];
  /** Column alignments */
  colAligns?: Array<'left' | 'center' | 'right'>;
  /** Padding inside each cell (default: 1) */
  padding?: number;
  /** Border color */
  borderColor?: Color;
  /** Header text colors — cycles across columns */
  headerColors?: Color[];
  /** Row text color */
  rowColor?: Color;
  /** Zebra stripe background color (applied to odd rows) */
  zebraBg?: Color;
  /** Zebra stripe text color */
  zebraFg?: Color;
  /** Title displayed above the table */
  title?: string;
  /** Title color */
  titleColor?: Color;
  /** Show row numbers */
  rowNumbers?: boolean;
}

/**
 * Pad and align a cell value within a given width.
 */
function padAligned(content: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  const vw = visualWidth(content);
  if (vw >= width) return truncate(content, width);
  const gap = width - vw;
  switch (align) {
    case 'right':
      return ' '.repeat(gap) + content;
    case 'center': {
      const left = Math.floor(gap / 2);
      return ' '.repeat(left) + content + ' '.repeat(gap - left);
    }
    default:
      return content + ' '.repeat(gap);
  }
}

/**
 * Render a full table grid as a string.
 */
export function renderTableGrid(style: TableBorderStyle, headers: string[], rows: string[][], options: RenderTableOptions): string {
  const { colWidths, padding = 1, borderColor: bc } = options;
  const colAligns = options.colAligns ?? headers.map(() => 'left' as const);
  const c = style.chars;
  const pad = ' '.repeat(padding);
  const lines: string[] = [];

  // Prepend row number column if requested
  let effectiveHeaders = headers;
  let effectiveRows = rows;
  let effectiveWidths = colWidths;
  let effectiveAligns = colAligns;

  if (options.rowNumbers) {
    const rnWidth = Math.max(1, String(rows.length).length);
    effectiveHeaders = ['#', ...headers];
    effectiveRows = rows.map((row, i) => [String(i + 1), ...row]);
    effectiveWidths = [rnWidth, ...colWidths];
    effectiveAligns = ['right' as const, ...colAligns];
  }

  const cols = effectiveWidths.length;

  // Helper: build a horizontal rule line
  function hRule(left: string, mid: string, right: string, dash: string): string {
    const segments = effectiveWidths.map((w) => dash.repeat(w + padding * 2));
    if (style.columnSeparators) {
      return applyColor(left + segments.join(mid) + right, bc);
    }
    return applyColor(left + segments.join(dash.repeat(1)) + right, bc);
  }

  // Helper: build a data row
  function dataRow(cells: string[], cellColors?: Array<Color | undefined>, bgColor?: Color): string {
    const parts: string[] = [];
    if (style.frame) {
      parts.push(applyColor(c.left, bc));
    }
    for (let i = 0; i < cols; i++) {
      const content = cells[i] ?? '';
      const aligned = padAligned(content, effectiveWidths[i]!, effectiveAligns[i]);
      const cellColor = cellColors?.[i];
      let cellContent = pad + (cellColor ? applyColor(aligned, cellColor) : aligned) + pad;
      if (bgColor && !cellColor) {
        cellContent = `${bgColor.bg()}${cellContent}\x1b[49m`;
      }
      parts.push(cellContent);
      if (i < cols - 1 && style.columnSeparators) {
        parts.push(applyColor(c.vertical, bc));
      }
    }
    if (style.frame) {
      parts.push(applyColor(c.right, bc));
    }
    return parts.join('');
  }

  // ─── Title ───────────────────────────────────────────────────────
  if (options.title) {
    const titleText = options.titleColor ? applyColor(options.title, options.titleColor) : options.title;
    lines.push(titleText);
  }

  // ─── Top border ──────────────────────────────────────────────────
  if (style.frame) {
    lines.push(hRule(c.topLeft, c.tTop, c.topRight, c.top));
  }

  // ─── Header row ──────────────────────────────────────────────────
  const headerCellColors = options.headerColors ? effectiveHeaders.map((_, i) => options.headerColors![i % options.headerColors!.length]) : undefined;
  lines.push(dataRow(effectiveHeaders, headerCellColors));

  // ─── Header separator ────────────────────────────────────────────
  if (style.headerSeparator) {
    const hDash = c.headerHorizontal ?? c.horizontal;
    const hCross = c.headerCross ?? c.cross;
    const hLeft = c.headerTLeft ?? (style.frame ? c.tLeft : '');
    const hRight = c.headerTRight ?? (style.frame ? c.tRight : '');
    if (style.frame) {
      lines.push(hRule(hLeft, hCross, hRight, hDash));
    } else {
      // No frame: just the dashes
      const segments = effectiveWidths.map((w) => hDash.repeat(w + padding * 2));
      if (style.columnSeparators) {
        lines.push(applyColor(segments.join(hCross), bc));
      } else {
        lines.push(applyColor(segments.join(hDash), bc));
      }
    }
  }

  // ─── Data rows ───────────────────────────────────────────────────
  for (let ri = 0; ri < effectiveRows.length; ri++) {
    const row = effectiveRows[ri]!;
    const isZebra = options.zebraBg && ri % 2 === 1;
    const rowFg = isZebra && options.zebraFg ? options.zebraFg : options.rowColor;
    const cellColors = row.map(() => rowFg);
    lines.push(dataRow(row, cellColors, isZebra ? options.zebraBg : undefined));

    // Row separators (if enabled, between rows only)
    if (style.rowSeparators && ri < effectiveRows.length - 1) {
      if (style.frame) {
        lines.push(hRule(c.tLeft, c.cross, c.tRight, c.horizontal));
      } else {
        const segments = effectiveWidths.map((w) => c.horizontal.repeat(w + padding * 2));
        lines.push(applyColor(segments.join(c.cross), bc));
      }
    }
  }

  // ─── Bottom border ───────────────────────────────────────────────
  if (style.frame) {
    lines.push(hRule(c.bottomLeft, c.tBottom, c.bottomRight, c.bottom));
  }

  return lines.join('\n');
}
