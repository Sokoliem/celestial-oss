/**
 * Hit Region Collection
 *
 * Walks a LayoutPlan tree and collects all EventNode/HoverNode entries
 * with their computed rects, producing a list suitable for building
 * a CellHitMap for O(1) mouse hit testing.
 */

import type { EventHandlers, LayoutEntry, LayoutPlan, LayoutRect, RegionMetadata } from './vdom.js';

export interface HitRegionInfo {
  readonly id: string;
  readonly handlers: EventHandlers;
  readonly rect: LayoutRect;
  readonly zIndex: number;
  readonly isHover: boolean;
  readonly eventPath: readonly string[];
  /** Optional metadata from event/hover/region nodes. Surfaced for inspection UIs and tooltips. */
  readonly metadata?: RegionMetadata;
}

/** Walk a LayoutPlan and collect all EventNode/HoverNode hit regions */
export function collectHitRegions(plan: LayoutPlan): HitRegionInfo[] {
  const regions: HitRegionInfo[] = [];
  collectFromEntry(plan.root, regions, 0, 0, 0, null, []);

  // Also collect from overlays (with their z-index for priority)
  if (plan.overlays) {
    for (const overlay of plan.overlays) {
      if (overlay.entry.node.kind === 'overlay' && overlay.entry.node.pointerEvents === 'none') {
        continue;
      }
      collectFromEntry(overlay.entry, regions, overlay.zIndex, 0, 0, null, []);
    }
  }

  // Sort by zIndex ascending (base regions first, overlay regions last)
  regions.sort((a, b) => a.zIndex - b.zIndex);

  return regions;
}

function collectFromEntry(
  entry: LayoutEntry,
  acc: HitRegionInfo[],
  zIndex: number,
  offsetX = 0,
  offsetY = 0,
  clipRect: LayoutRect | null = null,
  eventPath: readonly string[] = [],
): void {
  const { node } = entry;
  const rect = {
    x: entry.rect.x + offsetX,
    y: entry.rect.y + offsetY,
    width: entry.rect.width,
    height: entry.rect.height,
  };

  switch (node.kind) {
    case 'event': {
      const nextEventPath = [...eventPath, node.id];
      pushHitRegion(
        acc,
        {
          id: node.id,
          handlers: node.handlers,
          rect,
          zIndex,
          isHover: false,
          eventPath: nextEventPath,
          metadata: node.metadata,
        },
        clipRect,
      );
      // Also walk children (EventNode might wrap other EventNodes)
      for (const child of entry.children) {
        collectFromEntry(child, acc, zIndex, offsetX, offsetY, clipRect, nextEventPath);
      }
      break;
    }

    case 'hover':
      pushHitRegion(
        acc,
        {
          id: node.id,
          handlers: {},
          rect,
          zIndex,
          isHover: true,
          eventPath,
          metadata: node.metadata,
        },
        clipRect,
      );
      for (const child of entry.children) {
        collectFromEntry(child, acc, zIndex, offsetX, offsetY, clipRect, eventPath);
      }
      break;

    case 'scroll': {
      const nextClipRect = clipRect ? intersectRects(rect, clipRect) : rect;
      if (!nextClipRect) {
        break;
      }

      for (const child of entry.children) {
        collectFromEntry(child, acc, zIndex, rect.x, rect.y - node.offset, nextClipRect, eventPath);
      }
      break;
    }

    case 'overlay':
      // In-flow overlay entries (children:[]) are skipped.
      // Collected overlays are handled separately via plan.overlays.
      for (const child of entry.children) {
        collectFromEntry(child, acc, zIndex, offsetX, offsetY, clipRect, eventPath);
      }
      break;

    default:
      // Recurse into all children for containers (row, column, box, scroll, etc.)
      for (const child of entry.children) {
        collectFromEntry(child, acc, zIndex, offsetX, offsetY, clipRect, eventPath);
      }
      break;
  }
}

function pushHitRegion(acc: HitRegionInfo[], region: HitRegionInfo, clipRect: LayoutRect | null): void {
  const clippedRect = clipRect ? intersectRects(region.rect, clipRect) : region.rect;
  if (!clippedRect) {
    return;
  }

  acc.push({
    ...region,
    rect: clippedRect,
  });
}

function intersectRects(left: LayoutRect, right: LayoutRect): LayoutRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.min(left.x + left.width, right.x + right.width) - x;
  const height = Math.min(left.y + left.height, right.y + right.height) - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}
