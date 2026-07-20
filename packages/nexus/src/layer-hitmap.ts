/**
 * Layer-Aware Hit Testing — extends CellHitMap with explicit layer awareness.
 *
 * Each registered region belongs to a layer. Hit testing respects layer order:
 * the topmost layer's regions win. Within a layer, last-registered wins
 * (same as CellHitMap).
 */

import type { ElementRegion } from './cell-hitmap.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LayeredRegion extends ElementRegion {
  layerId: string;
}

export interface LayerHitMap {
  register(region: LayeredRegion): void;
  hitTest(x: number, y: number): LayeredRegion | undefined;
  hitTestInLayer(x: number, y: number, layerId: string): LayeredRegion | undefined;
  hitTestAll(x: number, y: number): LayeredRegion[];
  getLayerRegions(layerId: string): LayeredRegion[];
  clear(): void;
  clearLayer(layerId: string): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLayerHitMap(width: number, height: number): LayerHitMap {
  // Per-layer grids: Map<layerId, (string | null)[][]>
  const layerGrids = new Map<string, (string | null)[][]>();
  // All regions keyed by ID
  const regions = new Map<string, LayeredRegion>();
  // Layer insertion order — later = higher z-order
  const layerOrder: string[] = [];

  function ensureLayer(layerId: string): (string | null)[][] {
    let grid = layerGrids.get(layerId);
    if (!grid) {
      grid = [];
      for (let r = 0; r < height; r++) {
        const row: (string | null)[] = [];
        for (let c = 0; c < width; c++) {
          row.push(null);
        }
        grid.push(row);
      }
      layerGrids.set(layerId, grid);
      layerOrder.push(layerId);
    }
    return grid;
  }

  function paintRegion(grid: (string | null)[][], region: LayeredRegion): void {
    const xStart = Math.max(0, region.x);
    const yStart = Math.max(0, region.y);
    const xEnd = Math.min(width, region.x + region.width);
    const yEnd = Math.min(height, region.y + region.height);

    for (let r = yStart; r < yEnd; r++) {
      for (let c = xStart; c < xEnd; c++) {
        grid[r]![c] = region.id;
      }
    }
  }

  return {
    register(region: LayeredRegion): void {
      regions.set(region.id, region);
      const grid = ensureLayer(region.layerId);
      paintRegion(grid, region);
    },

    hitTest(x: number, y: number): LayeredRegion | undefined {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        return undefined;
      }

      // Walk layers from topmost (last) to bottommost (first)
      for (let i = layerOrder.length - 1; i >= 0; i--) {
        const layerId = layerOrder[i]!;
        const grid = layerGrids.get(layerId)!;
        const id = grid[y]![x];
        if (id != null) {
          return regions.get(id);
        }
      }

      return undefined;
    },

    hitTestInLayer(x: number, y: number, layerId: string): LayeredRegion | undefined {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        return undefined;
      }

      const grid = layerGrids.get(layerId);
      if (!grid) return undefined;

      const id = grid[y]![x];
      if (id == null) return undefined;
      return regions.get(id);
    },

    hitTestAll(x: number, y: number): LayeredRegion[] {
      if (x < 0 || x >= width || y < 0 || y >= height) {
        return [];
      }

      const result: LayeredRegion[] = [];
      // Walk layers from topmost to bottommost
      for (let i = layerOrder.length - 1; i >= 0; i--) {
        const layerId = layerOrder[i]!;
        // Collect all regions in this layer that contain the point
        for (const region of regions.values()) {
          if (region.layerId === layerId && x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) {
            result.push(region);
          }
        }
      }

      return result;
    },

    getLayerRegions(layerId: string): LayeredRegion[] {
      const result: LayeredRegion[] = [];
      for (const region of regions.values()) {
        if (region.layerId === layerId) {
          result.push(region);
        }
      }
      return result;
    },

    clear(): void {
      layerGrids.clear();
      regions.clear();
      layerOrder.length = 0;
    },

    clearLayer(layerId: string): void {
      const grid = layerGrids.get(layerId);
      if (!grid) return;

      // Remove regions belonging to this layer
      const toRemove: string[] = [];
      for (const [id, region] of regions) {
        if (region.layerId === layerId) {
          toRemove.push(id);
        }
      }
      for (const id of toRemove) {
        regions.delete(id);
      }

      // Clear the layer's grid
      layerGrids.delete(layerId);
      const idx = layerOrder.indexOf(layerId);
      if (idx >= 0) {
        layerOrder.splice(idx, 1);
      }
    },
  };
}
