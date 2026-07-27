import type { PointerCursor } from '@celestial/nebula';

export interface HitRegion<M> {
  x: number;
  y: number;
  width: number;
  height: number;
  onClick?: M;
  onHover?: {
    enter?: M;
    exit?: M;
  };
  cursor?: PointerCursor;
}

export class HitMap<M> {
  private regions: HitRegion<M>[] = [];

  register(region: HitRegion<M>): void {
    this.regions.push(region);
  }

  hitTest(x: number, y: number): HitRegion<M> | null {
    // Iterate in reverse order: last registered = highest priority (z-order)
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i]!;
      if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
        return r;
      }
    }
    return null;
  }

  clear(): void {
    this.regions = [];
  }

  getAll(): HitRegion<M>[] {
    return [...this.regions];
  }
}
