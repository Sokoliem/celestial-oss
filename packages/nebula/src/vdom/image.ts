/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { CellGrid } from './cells.js';
import type { ImageNode } from './nodes.js';
import { parseAnsiLine, writeRenderedCell } from './paint.js';
import { visualWidth } from './visual-width.js';

export function renderImage(node: ImageNode, grid: CellGrid, x: number, y: number, availW: number, availH: number): void {
  if (node.raw) {
    // Raw blob path: mark cells as opaque placeholders, store content for verbatim emission
    const blobId = node.layoutId ?? `img_${x}_${y}`;

    // Fill the region with placeholder cells tagged with the blob ID
    for (let r = 0; r < Math.min(node.height, availH); r++) {
      for (let c = 0; c < Math.min(node.width, availW); c++) {
        const row = grid.cells[y + r];
        if (row) {
          row[x + c] = { char: ' ', style: {}, opaqueId: blobId };
        }
      }
    }

    // Store the raw blob content for the diff engine
    if (!grid.rawBlobs) grid.rawBlobs = new Map();
    grid.rawBlobs.set(blobId, {
      content: node.content,
      row: y,
      col: x,
      width: Math.min(node.width, availW),
      height: Math.min(node.height, availH),
    });
    return;
  }

  // Existing character-by-character path for half-block/braille
  const lines = node.content.split('\n');
  const maxLines = Math.min(lines.length, availH);

  for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
    const parsed = parseAnsiLine(lines[lineIdx]!, {});
    let colOffset = 0;
    for (let charIdx = 0; charIdx < parsed.length; charIdx++) {
      if (colOffset >= availW) break;
      const cell = parsed[charIdx]!;
      const w = Math.max(visualWidth(cell.char), 1);
      if (colOffset + w > availW) break;
      colOffset += writeRenderedCell(grid, y + lineIdx, x + colOffset, cell.char, cell.style, false);
    }
  }
}
