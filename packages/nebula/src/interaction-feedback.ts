import type { HitRegionInfo } from './hit-regions.js';
import type { CellGrid } from './vdom.js';

function feedbackRegion(regions: readonly HitRegionInfo[], hoveredRegionId: string | null): HitRegionInfo | undefined {
  if (hoveredRegionId === null) return undefined;
  for (let index = regions.length - 1; index >= 0; index--) {
    const region = regions[index]!;
    if (!region.isHover && region.id === hoveredRegionId && region.metadata?.hoverFeedback !== undefined) return region;
  }
  return undefined;
}

/** Whether entering or leaving this region requires a framework feedback render. */
export function usesAutomaticHoverFeedback(region: HitRegionInfo | null | undefined): boolean {
  return region?.metadata?.hoverFeedback !== undefined;
}

/**
 * Apply Nebula's theme-independent hover face to a rasterized frame.
 *
 * Fallback regions use reverse video, preserving the foreground/background
 * contrast ratio instead of inventing a color pair outside the active theme.
 * Managed semantic faces retain their colors and receive the same
 * framework-owned bold/underline receipt, so a missing component paint cannot
 * make hover invisible.
 */
export function applyAutomaticHoverFeedback(
  grid: CellGrid,
  regions: readonly HitRegionInfo[],
  hoveredRegionId: string | null,
): CellGrid {
  const region = feedbackRegion(regions, hoveredRegionId);
  if (!region || region.rect.width <= 0 || region.rect.height <= 0) return grid;

  const cells = grid.cells.map((row) => [...row]);
  const minRow = Math.max(0, region.rect.y);
  const maxRow = Math.min(grid.height, region.rect.y + region.rect.height);
  const minCol = Math.max(0, region.rect.x);
  const maxCol = Math.min(grid.width, region.rect.x + region.rect.width);

  for (let row = minRow; row < maxRow; row++) {
    for (let col = minCol; col < maxCol; col++) {
      const cell = cells[row]?.[col];
      if (!cell || cell.opaqueId) continue;
      cells[row]![col] = {
        ...cell,
        style: {
          ...cell.style,
          bold: true,
          ...(region.metadata?.hoverFeedback === 'reverse' ? { reverse: true } : { underline: true }),
        },
      };
    }
  }

  return {
    ...grid,
    cells,
  };
}
