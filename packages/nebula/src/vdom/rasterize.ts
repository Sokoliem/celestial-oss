/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { CellGrid } from './cells.js';
import { createGrid } from './cells.js';
import { renderImage } from './image.js';
import type { LayoutEntry, LayoutPlan, LayoutRect } from './layout-types.js';
import { measure } from './measure.js';
import type { BoxNode, ScrollNode } from './nodes.js';
import { renderText, renderTextTransparent, setCell } from './paint.js';
import { createPlanningRenderContext } from './planning-context.js';
import type { ResolvedStyleAttrs } from './style.js';

// --- Rasterization (Phase 2 of two-phase layout) ---

/**
 * Rasterize an entry into a grid with a coordinate offset.
 * Used by overflow:hidden to translate absolute positions into sub-grid local space.
 */
function rasterizeEntryWithOffset(entry: LayoutEntry, grid: CellGrid, offsetX: number, offsetY: number, transparent: boolean): void {
  const translated = translateEntry(entry, offsetX, offsetY);
  if (transparent) {
    rasterizeEntryTransparent(translated, grid);
  } else {
    rasterizeEntry(translated, grid);
  }
}

/** Recursively translate all rects in a LayoutEntry tree by (dx, dy) */
function translateEntry(entry: LayoutEntry, dx: number, dy: number): LayoutEntry {
  const translatedChildren =
    entry.node.kind === 'scroll' ? entry.children.map((child) => translateEntry(child, 0, 0)) : entry.children.map((child) => translateEntry(child, dx, dy));

  return {
    ...entry,
    rect: {
      x: entry.rect.x + dx,
      y: entry.rect.y + dy,
      width: entry.rect.width,
      height: entry.rect.height,
    },
    children: translatedChildren,
  };
}

function snapLayoutRectToGrid(rect: LayoutRect): LayoutRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function cloneEntryToGrid(entry: LayoutEntry, newIndex: Map<string, LayoutEntry>): LayoutEntry {
  const clonedChildren = entry.children.map((child) => cloneEntryToGrid(child, newIndex));
  const cloned: LayoutEntry = {
    ...entry,
    rect: snapLayoutRectToGrid(entry.rect),
    children: clonedChildren,
  };
  if ('layoutId' in entry.node && entry.node.layoutId) {
    newIndex.set(entry.id, cloned);
  }
  return cloned;
}

export function snapLayoutPlanToGrid(plan: LayoutPlan): LayoutPlan {
  const index = new Map<string, LayoutEntry>();
  const root = cloneEntryToGrid(plan.root, index);
  return {
    ...plan,
    root,
    index,
    overlays: plan.overlays.map((overlay) => ({
      ...overlay,
      entry: cloneEntryToGrid(overlay.entry, index),
    })),
  };
}

/** Paint a LayoutPlan into a CellGrid */
export function rasterize(plan: LayoutPlan): CellGrid {
  const grid = createGrid(plan.width, plan.height);
  rasterizeEntry(plan.root, grid);

  // Rasterize overlays in z-order (ascending = bottom to top)
  if (plan.overlays) {
    for (const overlay of plan.overlays) {
      if (overlay.transparent) {
        rasterizeEntryTransparent(overlay.entry, grid);
      } else {
        rasterizeEntry(overlay.entry, grid);
      }
    }
  }

  return grid;
}

function rasterizeEntry(entry: LayoutEntry, grid: CellGrid): void {
  const { node, rect } = entry;

  switch (node.kind) {
    case 'text':
      renderText(node, entry.resolvedStyle ?? {}, grid, rect.x, rect.y, rect.width, rect.height);
      break;
    case 'box':
      // Render box border at the entry's position
      rasterizeBox(node, entry, grid);
      break;
    case 'scroll':
      // Render scroll viewport — child is in virtual space
      rasterizeScroll(node, entry, grid);
      break;
    case 'row':
    case 'column':
    case 'focus':
    case 'component':
    case 'event':
    case 'hover':
    case 'flex':
    case 'memo':
    case 'suspense':
    case 'localState':
    case 'lazy':
    case 'tabGroup':
      // Container/pass-through nodes: just rasterize children
      for (const child of entry.children) {
        rasterizeEntry(child, grid);
      }
      break;
    case 'image':
      renderImage(node, grid, rect.x, rect.y, rect.width, rect.height);
      break;
    case 'empty':
      // Nothing to render
      break;
    case 'overlay':
    case 'portal':
      // In-flow overlay/portal entries have children:[] (no-op during main pass).
      // Collected overlay entries have children:[content] (painted during overlay pass).
      for (const child of entry.children) {
        rasterizeEntry(child, grid);
      }
      break;
  }
}

/** Transparent variant: skips writing cells where char=' ' and no bg */
function rasterizeEntryTransparent(entry: LayoutEntry, grid: CellGrid): void {
  const { node, rect } = entry;

  switch (node.kind) {
    case 'text':
      renderTextTransparent(node, entry.resolvedStyle ?? {}, grid, rect.x, rect.y, rect.width, rect.height);
      break;
    case 'box':
      // Border renders opaquely, children transparently
      rasterizeBox(node, entry, grid, true);
      break;
    case 'row':
    case 'column':
    case 'focus':
    case 'component':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'portal':
    case 'flex':
    case 'memo':
    case 'suspense':
    case 'localState':
    case 'lazy':
    case 'tabGroup':
      for (const child of entry.children) {
        rasterizeEntryTransparent(child, grid);
      }
      break;
    case 'image':
      renderImage(node, grid, rect.x, rect.y, rect.width, rect.height);
      break;
    case 'scroll':
      // Scroll viewports render opaquely even in transparent overlays
      rasterizeScroll(node, entry, grid);
      break;
    case 'empty':
      break;
  }
}

function setCellTransparent(grid: CellGrid, row: number, col: number, char: string, style: ResolvedStyleAttrs): void {
  if (row >= 0 && row < grid.height && col >= 0 && col < grid.width) {
    // Skip "empty" overlay cells — allow base content to show through
    if (char === ' ' && !style.bg) return;
    grid.cells[row]![col] = { char, style };
  }
}

function rasterizeBox(node: BoxNode, entry: LayoutEntry, grid: CellGrid, transparent = false): void {
  const { x, y, width: availW, height: availH } = entry.rect;
  const b = node.border;
  const style = entry.resolvedStyle ?? {};
  const borderStyle: ResolvedStyleAttrs =
    style.borderFg || style.borderFgRgb
      ? {
          ...style,
          fg: style.borderFg ?? style.fg,
          fgRgb: style.borderFgRgb ?? style.fgRgb,
        }
      : style;
  const hasBg = style.bg !== undefined || style.bgRgb !== undefined;

  if (b) {
    // Top border
    setCell(grid, y, x, b.topLeft, borderStyle);
    for (let c = 1; c < availW - 1; c++) {
      setCell(grid, y, x + c, b.top, borderStyle);
    }
    setCell(grid, y, x + availW - 1, b.topRight, borderStyle);

    // Side borders
    for (let r = 1; r < availH - 1; r++) {
      setCell(grid, y + r, x, b.left, borderStyle);
      setCell(grid, y + r, x + availW - 1, b.right, borderStyle);
    }

    // Bottom border
    setCell(grid, y + availH - 1, x, b.bottomLeft, borderStyle);
    for (let c = 1; c < availW - 1; c++) {
      setCell(grid, y + availH - 1, x + c, b.bottom, borderStyle);
    }
    setCell(grid, y + availH - 1, x + availW - 1, b.bottomRight, borderStyle);
  }

  // Hidden and scroll overflow rasterize children into a sub-grid first,
  // then copy only the visible interior back into the parent grid.
  if (node.overflow === 'hidden' || node.overflow === 'scroll') {
    const borderOffset = b ? 1 : 0;
    const innerW = availW - borderOffset * 2;
    const innerH = availH - borderOffset * 2;
    const scrollOffset = node.overflow === 'scroll' ? Math.max(0, node.scrollOffset ?? 0) : 0;

    if (innerW > 0 && innerH > 0) {
      const contentHeight = entry.children.reduce((max, child) => Math.max(max, child.rect.y + child.rect.height - (y + borderOffset)), 0);
      const subGrid = createGrid(innerW, Math.max(innerH, contentHeight));

      // Pre-fill sub-grid with background color so children inherit it
      if (hasBg) {
        const bgStyle: ResolvedStyleAttrs = { bg: style.bg, bgRgb: style.bgRgb };
        for (let r = 0; r < subGrid.height; r++) {
          for (let c = 0; c < innerW; c++) {
            subGrid.cells[r]![c] = { char: ' ', style: bgStyle };
          }
        }
      }

      // Rasterize children into the sub-grid.
      // Children were planned with absolute coordinates starting at (x+borderOffset, y+borderOffset).
      // We need to translate them into the sub-grid's local coordinate space (starting at 0,0).
      for (const child of entry.children) {
        rasterizeEntryWithOffset(child, subGrid, -(x + borderOffset), -(y + borderOffset), transparent);
      }

      // Merge box bg into child cells that don't have their own bg
      if (hasBg) {
        const bgStyle: ResolvedStyleAttrs = { bg: style.bg, bgRgb: style.bgRgb };
        for (let r = 0; r < subGrid.height; r++) {
          for (let c = 0; c < innerW; c++) {
            const srcCell = subGrid.cells[r]![c]!;
            if (!srcCell.style.bg) {
              subGrid.cells[r]![c] = { char: srcCell.char, style: { ...srcCell.style, ...bgStyle }, href: srcCell.href };
            }
          }
        }
      }

      // Copy the visible window of the sub-grid into the main grid.
      for (let r = 0; r < innerH; r++) {
        const srcRow = r + scrollOffset;
        if (srcRow < 0 || srcRow >= subGrid.height) {
          continue;
        }
        for (let c = 0; c < innerW; c++) {
          const srcCell = subGrid.cells[srcRow]![c]!;
          if (transparent) {
            setCellTransparent(grid, y + borderOffset + r, x + borderOffset + c, srcCell.char, srcCell.style);
          } else {
            setCell(grid, y + borderOffset + r, x + borderOffset + c, srcCell.char, srcCell.style);
          }
        }
      }
    }
  } else {
    if (hasBg) {
      const borderOffset = b ? 1 : 0;
      const innerX = x + borderOffset;
      const innerY = y + borderOffset;
      const innerW = availW - borderOffset * 2;
      const innerH = availH - borderOffset * 2;
      const bgStyle: ResolvedStyleAttrs = { bg: style.bg, bgRgb: style.bgRgb };
      for (let r = 0; r < innerH; r++) {
        for (let c = 0; c < innerW; c++) {
          const gr = innerY + r;
          const gc = innerX + c;
          if (transparent) {
            setCellTransparent(grid, gr, gc, ' ', bgStyle);
          } else {
            setCell(grid, gr, gc, ' ', bgStyle);
          }
        }
      }
    }

    // Default visible overflow — rasterize children directly into the grid
    for (const child of entry.children) {
      if (transparent) {
        rasterizeEntryTransparent(child, grid);
      } else {
        rasterizeEntry(child, grid);
      }
    }

    // Merge box bg into child cells that don't have their own bg
    if (hasBg) {
      const borderOffset = b ? 1 : 0;
      const innerX = x + borderOffset;
      const innerY = y + borderOffset;
      const innerW = availW - borderOffset * 2;
      const innerH = availH - borderOffset * 2;
      for (let r = 0; r < innerH; r++) {
        for (let c = 0; c < innerW; c++) {
          const gr = innerY + r;
          const gc = innerX + c;
          if (gr >= 0 && gr < grid.height && gc >= 0 && gc < grid.width) {
            const cell = grid.cells[gr]![gc]!;
            if (!cell.style.bg) {
              grid.cells[gr]![gc] = { char: cell.char, style: { ...cell.style, bg: style.bg, bgRgb: style.bgRgb }, href: cell.href };
            }
          }
        }
      }
    }
  }
}

function rasterizeScroll(node: ScrollNode, entry: LayoutEntry, grid: CellGrid): void {
  const { x, y, width: availW } = entry.rect;

  // Use the child entry's planned rect height instead of re-measuring.
  // This ensures the virtual grid matches what planScroll computed.
  const childEntry = entry.children[0];
  const virtualHeight = childEntry ? childEntry.rect.height : measure(node.child, availW, createPlanningRenderContext(availW, node.height)).height;
  const virtualGrid = createGrid(availW, virtualHeight);
  if (childEntry) {
    rasterizeEntry(childEntry, virtualGrid);
  }

  // Copy visible portion from virtual grid to output grid
  for (let r = 0; r < node.height; r++) {
    const srcRow = r + node.offset;
    if (srcRow >= 0 && srcRow < virtualGrid.height) {
      for (let c = 0; c < availW; c++) {
        const srcCell = virtualGrid.cells[srcRow]![c]!;
        setCell(grid, y + r, x + c, srcCell.char, srcCell.style);
      }
    }
  }
}
