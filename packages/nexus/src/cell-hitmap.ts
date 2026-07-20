/**
 * Event handler tags matching the EventHandlers interface from @celestial/nebula.
 * Defined locally to avoid build-order dependency on nebula's dist.
 */
export interface EventHandlers {
  readonly onClick?: string;
  readonly onRightClick?: string;
  readonly onDoubleClick?: string;
  readonly onMouseEnter?: string;
  readonly onMouseLeave?: string;
  readonly onMouseDown?: string;
  readonly onMouseUp?: string;
  readonly onMouseMove?: string;
  readonly onScroll?: string;
}

export interface ElementRegion {
  id: string;
  handlers: EventHandlers;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * O(1) hit-testing using a grid parallel to the CellGrid.
 *
 * Each cell stores the ID of the topmost element that covers it.
 * A separate Map stores the full ElementRegion metadata keyed by ID.
 */
export class CellHitMap {
  private grid: (string | null)[][];
  private regions: Map<string, ElementRegion>;
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.regions = new Map();
    this.grid = [];
    for (let r = 0; r < height; r++) {
      const row: (string | null)[] = [];
      for (let c = 0; c < width; c++) {
        row.push(null);
      }
      this.grid.push(row);
    }
  }

  register(region: ElementRegion): void {
    // If a region with this id was already registered, clear its previously
    // painted cells so re-registering with smaller bounds or at a new position
    // does not leave stale cells resolving to the new region.
    const existing = this.regions.get(region.id);
    if (existing !== undefined) {
      this.erasePaint(existing);
    }

    this.regions.set(region.id, region);

    // Paint the region's ID into the grid, clipping to bounds.
    // Later registrations overwrite earlier ones (z-order: last on top).
    const xStart = Math.max(0, region.x);
    const yStart = Math.max(0, region.y);
    const xEnd = Math.min(this.width, region.x + region.width);
    const yEnd = Math.min(this.height, region.y + region.height);

    for (let r = yStart; r < yEnd; r++) {
      for (let c = xStart; c < xEnd; c++) {
        this.grid[r]![c] = region.id;
      }
    }
  }

  /**
   * Remove a region by id. Returns true if a region was removed.
   *
   * Cells previously painted by this region become empty. Because the grid
   * stores only the topmost id per cell, regions that were painted earlier and
   * then occluded by the unregistered one do not re-emerge — use
   * `LayerHitMap` if you need that layered-restore semantics.
   */
  unregister(id: string): boolean {
    const region = this.regions.get(id);
    if (region === undefined) return false;
    this.erasePaint(region);
    this.regions.delete(id);
    return true;
  }

  /** Reset the map: drop all regions and clear the grid. */
  clear(): void {
    this.regions.clear();
    for (let r = 0; r < this.height; r++) {
      const row = this.grid[r]!;
      for (let c = 0; c < this.width; c++) {
        row[c] = null;
      }
    }
  }

  /** Look up a registered region by id without performing hit testing. */
  getRegion(id: string): ElementRegion | null {
    return this.regions.get(id) ?? null;
  }

  /** Get all registered regions in registration order. */
  getAll(): ElementRegion[] {
    return Array.from(this.regions.values());
  }

  hitTest(x: number, y: number): ElementRegion | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    const id = this.grid[y]![x];
    if (id == null) return null;
    return this.regions.get(id) ?? null;
  }

  hitTestAll(x: number, y: number): ElementRegion[] {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return [];
    }

    // Collect all regions that contain this point.
    // Return in z-order: topmost (last registered) first.
    const result: ElementRegion[] = [];
    for (const region of this.regions.values()) {
      if (x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) {
        result.push(region);
      }
    }
    // Reverse so last-registered (topmost) is first
    return result.reverse();
  }

  /**
   * Clear the cells previously painted by a region. Only clears cells that
   * still hold this region's id, so we don't accidentally erase paint left by
   * an overlapping region registered on top.
   */
  private erasePaint(region: ElementRegion): void {
    const xStart = Math.max(0, region.x);
    const yStart = Math.max(0, region.y);
    const xEnd = Math.min(this.width, region.x + region.width);
    const yEnd = Math.min(this.height, region.y + region.height);

    for (let r = yStart; r < yEnd; r++) {
      const row = this.grid[r]!;
      for (let c = xStart; c < xEnd; c++) {
        if (row[c] === region.id) row[c] = null;
      }
    }
  }
}
