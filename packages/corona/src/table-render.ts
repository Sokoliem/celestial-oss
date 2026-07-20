/**
 * Corona Static Table Renderer
 *
 * Produces a complete ANSI-styled string for table output, suitable for
 * console.log() or piping through a pager. This is the tennis-equivalent
 * output path for non-interactive rendering.
 */

import { alignmentForType, type CellType, detectColumnType, formatCell } from './format.js';
import { autoSizeColumns } from './layout.js';
import { getTableBorder, renderTableGrid, type TableBorderStyle, tableBorder } from './table-border.js';
import { autoTableTheme, type TableTheme } from './table-theme.js';
import { detectBackground, supportsColor, terminalWidth } from './terminal.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RenderStaticTableOptions {
  /** Header labels */
  headers: string[];
  /** Data rows (string values) */
  rows: string[][];
  /** Border style name or TableBorderStyle object (default: 'rounded') */
  border?: string | TableBorderStyle;
  /** Theme mode (default: 'auto') */
  theme?: 'auto' | 'dark' | 'light';
  /** Custom table theme (overrides theme mode) */
  tableTheme?: TableTheme;
  /** Enable zebra striping (default: false) */
  zebra?: boolean;
  /** Show row numbers (default: false) */
  rowNumbers?: boolean;
  /** Table title */
  title?: string;
  /** Auto-detect and format numeric values (default: true) */
  formatNumbers?: boolean;
  /** Decimal places for float formatting (default: 3) */
  digits?: number;
  /** Maximum table width — defaults to terminal width */
  maxWidth?: number;
  /** Disable all color output */
  noColor?: boolean;
  /** Placeholder for empty cells (default: '—') */
  emptyPlaceholder?: string;
  /** Explicit column alignments (overrides auto-detection) */
  colAligns?: Array<'left' | 'center' | 'right'>;
  /** Explicit column widths (overrides auto-sizing) */
  colWidths?: number[];
  /** Cell padding per side (default: 1) */
  padding?: number;
}

// ─── Renderer ───────────────────────────────────────────────────────────────

/**
 * Render a static table as an ANSI-styled string.
 *
 * This is the primary non-interactive output function, equivalent to what
 * tennis produces. Handles:
 * - Auto type detection and number formatting
 * - Auto column sizing to fit terminal width
 * - Cycling header colors
 * - Zebra striping
 * - 18 border styles
 * - Dark/light theme auto-detection
 */
export function renderStaticTable(options: RenderStaticTableOptions): string {
  const {
    headers,
    rows,
    zebra = false,
    rowNumbers = false,
    title,
    formatNumbers = true,
    digits = 3,
    noColor = false,
    emptyPlaceholder = '—',
    padding = 1,
  } = options;

  // Resolve border style
  let borderStyle: TableBorderStyle;
  if (typeof options.border === 'string') {
    borderStyle = getTableBorder(options.border) ?? tableBorder.rounded;
  } else if (options.border) {
    borderStyle = options.border;
  } else {
    borderStyle = tableBorder.rounded;
  }

  // Resolve theme
  const colorEnabled = !noColor && supportsColor();
  let tableTheme: TableTheme | undefined;
  if (colorEnabled) {
    if (options.tableTheme) {
      tableTheme = options.tableTheme;
    } else {
      const mode = options.theme ?? 'auto';
      const bg = mode === 'auto' ? detectBackground() : mode === 'dark' ? 'dark' : 'light';
      tableTheme = autoTableTheme(bg);
    }
  }

  // Detect column types and format cells
  const numCols = headers.length;
  const columnTypes: CellType[] = [];
  const formattedRows: string[][] = [];

  if (formatNumbers) {
    for (let col = 0; col < numCols; col++) {
      const colValues = rows.map((r) => r[col] ?? '');
      columnTypes.push(detectColumnType(colValues));
    }

    for (const row of rows) {
      const formatted: string[] = [];
      for (let col = 0; col < numCols; col++) {
        const value = row[col] ?? '';
        formatted.push(formatCell(value, columnTypes[col]!, { digits, placeholder: emptyPlaceholder }));
      }
      formattedRows.push(formatted);
    }
  } else {
    for (let col = 0; col < numCols; col++) {
      columnTypes.push('string');
    }
    for (const row of rows) {
      formattedRows.push(row.map((cell) => (cell.trim() === '' ? emptyPlaceholder : cell)));
    }
  }

  // Resolve column alignments
  const colAligns = options.colAligns ?? columnTypes.map(alignmentForType);

  // Resolve column widths
  const maxWidth = options.maxWidth ?? terminalWidth();
  let colWidths: number[];

  if (options.colWidths) {
    colWidths = options.colWidths;
  } else {
    const sizing = autoSizeColumns(headers, formattedRows, maxWidth, {
      padding,
      separatorWidth: borderStyle.columnSeparators ? 1 : 0,
    });
    colWidths = sizing.finalWidths;
  }

  // Render the grid
  return renderTableGrid(borderStyle, headers, formattedRows, {
    colWidths,
    colAligns,
    padding,
    borderColor: tableTheme?.chrome,
    headerColors: tableTheme?.headerColors,
    rowColor: tableTheme?.field,
    zebraBg: zebra ? tableTheme?.zebraBg : undefined,
    zebraFg: zebra ? tableTheme?.zebraFg : undefined,
    title,
    titleColor: tableTheme?.title,
    rowNumbers,
  });
}
