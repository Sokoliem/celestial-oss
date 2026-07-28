import { color } from '@celestial/corona';
import type { HitRegionInfo } from './hit-regions.js';
import type { CellGrid } from './vdom.js';

function feedbackRegion(regions: readonly HitRegionInfo[], hoveredRegionId: string | null): HitRegionInfo | undefined {
  if (hoveredRegionId === null) return undefined;
  for (let index = regions.length - 1; index >= 0; index--) {
    const region = regions[index]!;
    if (!region.isHover && region.id === hoveredRegionId && region.metadata?.hoverFeedback === 'subtle') return region;
  }
  return undefined;
}

/** Whether entering or leaving this region requires a framework feedback render. */
export function usesAutomaticHoverFeedback(region: HitRegionInfo | null | undefined): boolean {
  return region?.metadata?.hoverFeedback === 'subtle';
}

/**
 * Apply Nebula's theme-independent hover face to a rasterized frame.
 *
 * Only painted text and glyph cells are adjusted; region backgrounds and blank
 * layout cells are never filled. The foreground moves slightly toward the
 * higher-contrast neutral endpoint; weight is only a compatibility fallback
 * when resolved RGB colors are unavailable. Managed semantic faces are left
 * entirely to their paired enter/leave handlers.
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
      if (!cell || cell.opaqueId || cell.char.trim().length === 0) continue;
      const foreground = cell.style.fgRgb;
      const background = cell.style.bgRgb;
      let hoverForeground: { fg: string; fgRgb: [number, number, number] } | undefined;
      if (foreground && background) {
        const current = color.rgb(...foreground);
        const surface = color.rgb(...background);
        const black = color.rgb(0, 0, 0);
        const white = color.rgb(255, 255, 255);
        const target = color.contrastRatio(white, surface) >= color.contrastRatio(black, surface) ? white : black;
        const candidate = color.mix(current, target, 0.16);
        if (candidate.rgb && color.contrastRatio(candidate, surface) >= color.contrastRatio(current, surface)) {
          hoverForeground = { fg: candidate.fg(), fgRgb: candidate.rgb };
        }
      }
      cells[row]![col] = {
        ...cell,
        style: {
          ...cell.style,
          dim: false,
          ...(hoverForeground ?? { bold: true }),
        },
      };
    }
  }

  return {
    ...grid,
    cells,
  };
}
