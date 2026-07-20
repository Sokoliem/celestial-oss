/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { Cell, CellGrid } from './cells.js';
import type { ResolvedStyleAttrs, StyleAttrs } from './style.js';

// --- Diff Engine ---

export type CellUpdate =
  | { kind?: undefined; row: number; col: number; char: string; style: ResolvedStyleAttrs; href?: string }
  | { kind: 'raw-blob'; row: number; col: number; blob: string };

const EMPTY_CELL: Cell = { char: ' ', style: {} };

/** Diff two cell grids and return only the changed cells */
export function diff(oldGrid: CellGrid, newGrid: CellGrid): CellUpdate[] {
  const updates: CellUpdate[] = [];

  // --- Raw blob diff ---
  const newBlobs = newGrid.rawBlobs ?? new Map();
  const oldBlobs = oldGrid.rawBlobs ?? new Map();

  for (const [id, newBlob] of newBlobs) {
    const oldBlob = oldBlobs.get(id);
    if (!oldBlob || oldBlob.content !== newBlob.content) {
      updates.push({
        kind: 'raw-blob',
        row: newBlob.row,
        col: newBlob.col,
        blob: newBlob.content,
      });
    }
  }

  // --- Cell-by-cell diff (with opaque skip) ---
  const height = Math.max(oldGrid.height, newGrid.height);
  const width = Math.max(oldGrid.width, newGrid.width);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const oldCell = oldGrid.cells[r]?.[c] ?? EMPTY_CELL;
      const newCell = newGrid.cells[r]?.[c] ?? EMPTY_CELL;

      // Skip opaque placeholder cells — they belong to a raw blob region
      if (newCell.opaqueId) continue;

      if (!cellsEqual(oldCell, newCell)) {
        const update: CellUpdate = { row: r, col: c, char: newCell.char, style: newCell.style };
        if (newCell.href) (update as { href?: string }).href = newCell.href;
        updates.push(update);
      }
    }
  }

  return updates;
}

function cellsEqual(a: Cell, b: Cell): boolean {
  return a.char === b.char && a.href === b.href && styleEqual(a.style, b.style);
}

function styleEqual(a: StyleAttrs, b: StyleAttrs): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    (a.bold ?? false) === (b.bold ?? false) &&
    (a.dim ?? false) === (b.dim ?? false) &&
    (a.italic ?? false) === (b.italic ?? false) &&
    (a.underline ?? false) === (b.underline ?? false) &&
    (a.strikethrough ?? false) === (b.strikethrough ?? false)
  );
}

/**
 * Extract raw blob updates that must be written directly to stdout
 * as separate write() calls (not concatenated into the ANSI string).
 * Kitty/iTerm2/Sixel APC sequences get corrupted when mixed into
 * a single string with ANSI cursor/style sequences.
 */
export function extractRawBlobs(updates: CellUpdate[]): Array<{ row: number; col: number; blob: string }> {
  return updates.filter((u): u is { kind: 'raw-blob'; row: number; col: number; blob: string } => u.kind === 'raw-blob');
}

/** Render cell updates as ANSI escape sequences */
export function renderUpdates(updates: CellUpdate[]): string {
  if (updates.length === 0) return '';

  let output = '';
  let activeStyle = '';
  let activeHref: string | undefined;

  for (const update of updates) {
    if (update.kind === 'raw-blob') {
    } else {
      // Always position cursor explicitly for correct Unicode rendering
      output += `\x1b[${update.row + 1};${update.col + 1}H`;

      // Only emit style changes when style differs from the active one —
      // avoids excessive \x1b[0m resets between braille/Unicode chars
      // which can cause rendering issues on some terminals.
      const newStyle = styleToAnsi(update.style);
      if (newStyle !== activeStyle) {
        if (activeStyle) output += '\x1b[0m';
        output += newStyle;
        activeStyle = newStyle;
      }

      // Handle OSC 8 hyperlink state transitions
      const href = update.href;
      if (href !== activeHref) {
        if (activeHref) {
          // Close previous hyperlink
          output += '\x1b]8;;\x1b\\';
        }
        if (href) {
          // Open new hyperlink
          output += `\x1b]8;;${href}\x1b\\`;
        }
        activeHref = href;
      }

      output += update.char;
    }
  }

  // Close any active hyperlink
  if (activeHref) output += '\x1b]8;;\x1b\\';

  // Final reset if any style is active
  if (activeStyle) output += '\x1b[0m';

  return output;
}

function styleToAnsi(style: StyleAttrs): string {
  let result = '';
  if (style.fg) result += style.fg;
  if (style.bg) result += style.bg;
  if (style.bold) result += '\x1b[1m';
  if (style.dim) result += '\x1b[2m';
  if (style.italic) result += '\x1b[3m';
  if (style.underline) result += '\x1b[4m';
  if (style.strikethrough) result += '\x1b[9m';
  return result;
}
