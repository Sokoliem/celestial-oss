/**
 * Virtual List / Windowed Rendering
 *
 * Renders only the visible slice of a large list, using spacer nodes
 * above and below to maintain correct total height for scrolling.
 */

import type { ColumnNode, EmptyNode, ScrollNode, VNode } from './vdom.js';

export interface VirtualListOptions<T> {
  items: readonly T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => VNode;
  height: number;
  overscan?: number; // extra items to render above/below visible area (default: 2)
  scrollOffset?: number; // vertical scroll offset in rows (default: 0)
}

/**
 * Create a virtual list that only renders items within the visible window.
 *
 * Returns a ScrollNode wrapping a ColumnNode containing:
 *   1. A spacer EmptyNode for virtual space above
 *   2. The rendered visible items
 *   3. A spacer EmptyNode for virtual space below
 */
export function virtualList<T>(opts: VirtualListOptions<T>): ScrollNode {
  const { items, itemHeight, renderItem, height, overscan = 2, scrollOffset = 0 } = opts;

  const totalItems = items.length;

  if (totalItems === 0) {
    const col: ColumnNode = { kind: 'column', children: [] };
    return { kind: 'scroll', child: col, offset: scrollOffset, height };
  }

  // Calculate visible range based on scroll offset
  const rawStart = Math.floor(scrollOffset / itemHeight);
  const visibleCount = Math.ceil(height / itemHeight);
  const rawEnd = rawStart + visibleCount; // exclusive

  // Apply overscan and clamp to valid indices
  const startIdx = Math.max(0, rawStart - overscan);
  const endIdx = Math.min(totalItems, rawEnd + overscan); // exclusive

  // Build spacers — only include when height > 0 to avoid the layout
  // engine's default height of 1 for zero-height EmptyNodes
  const aboveHeight = startIdx * itemHeight;
  const belowHeight = (totalItems - endIdx) * itemHeight;

  const children: VNode[] = [];

  if (aboveHeight > 0) {
    children.push({ kind: 'empty', height: aboveHeight } satisfies EmptyNode);
  }

  // Render only the visible slice
  for (let i = startIdx; i < endIdx; i++) {
    children.push(renderItem(items[i]!, i));
  }

  if (belowHeight > 0) {
    children.push({ kind: 'empty', height: belowHeight } satisfies EmptyNode);
  }

  const col: ColumnNode = { kind: 'column', children };

  return { kind: 'scroll', child: col, offset: scrollOffset, height };
}
