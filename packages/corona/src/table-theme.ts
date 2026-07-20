/**
 * Corona Table Theme
 *
 * Table-specific theme system with cycling header colors, zebra striping,
 * and auto dark/light mode. Inspired by tennis's color design.
 */

import { type Color, color } from './color.js';
import type { BackgroundMode } from './terminal.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TableTheme {
  /** Border/chrome color */
  chrome: Color;
  /** Default text color for data cells */
  field: Color;
  /** Title text color */
  title: Color;
  /** Cycling header colors (rotated across columns) */
  headerColors: Color[];
  /** Zebra stripe text color (odd rows) */
  zebraFg?: Color;
  /** Zebra stripe background color (odd rows) */
  zebraBg?: Color;
}

// ─── Dark theme ─────────────────────────────────────────────────────────────

/** Tennis-inspired dark theme with vibrant header colors */
export const darkTableTheme: TableTheme = {
  chrome: color.hex('#6b7280'),
  field: color.hex('#e5e7eb'),
  title: color.hex('#60a5fa'),
  headerColors: [
    color.hex('#ff6188'), // red
    color.hex('#fc9867'), // orange
    color.hex('#ffd866'), // yellow
    color.hex('#a9dc76'), // green
    color.hex('#78dce8'), // cyan
    color.hex('#ab9df2'), // purple
  ],
  zebraFg: color.white,
  zebraBg: color.hex('#1f2937'),
};

// ─── Light theme ────────────────────────────────────────────────────────────

/** Tennis-inspired light theme with slightly muted header colors */
export const lightTableTheme: TableTheme = {
  chrome: color.hex('#6b7280'),
  field: color.hex('#1f2937'),
  title: color.hex('#2563eb'),
  headerColors: [
    color.hex('#ee4066'), // red
    color.hex('#da7645'), // orange
    color.hex('#ddb644'), // yellow
    color.hex('#87ba54'), // green
    color.hex('#56bac6'), // cyan
    color.hex('#897bd0'), // purple
  ],
  zebraFg: color.black,
  zebraBg: color.hex('#f3f4f6'),
};

// ─── Auto theme selection ───────────────────────────────────────────────────

/**
 * Select the appropriate table theme based on terminal background.
 * Defaults to dark when background is unknown (most common terminal default).
 */
export function autoTableTheme(bg: BackgroundMode = 'unknown'): TableTheme {
  return bg === 'light' ? lightTableTheme : darkTableTheme;
}

/**
 * Create a custom table theme by merging overrides onto a base theme.
 */
export function createTableTheme(base: TableTheme, overrides: Partial<TableTheme>): TableTheme {
  return { ...base, ...overrides };
}
