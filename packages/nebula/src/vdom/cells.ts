/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { ResolvedStyleAttrs } from './style.js';

// --- Cell representation ---

export interface Cell {
  char: string;
  style: ResolvedStyleAttrs;
  href?: string; // OSC 8 hyperlink URL
  opaqueId?: string; // If set, cell is a placeholder for a raw blob region
}

export interface CellGrid {
  cells: Cell[][]; // [row][col]
  width: number;
  height: number;
  rawBlobs?: Map<string, { content: string; row: number; col: number; width: number; height: number }>;
}

// --- Layout Engine ---

export function emptyCell(): Cell {
  return { char: ' ', style: {} };
}

export function createGrid(width: number, height: number): CellGrid {
  const cells: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      row.push(emptyCell());
    }
    cells.push(row);
  }
  return { cells, width, height };
}
