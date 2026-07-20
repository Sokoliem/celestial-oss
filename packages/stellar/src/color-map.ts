/**
 * Per-cell foreground/background color tracking using a sparse Map.
 */
import type { Color } from '@celestial/corona';

export interface CellColor {
  fg?: Color;
  bg?: Color;
}

export class ColorMap {
  private readonly map = new Map<number, CellColor>();

  constructor(private readonly width: number) {}

  private key(row: number, col: number): number {
    return row * this.width + col;
  }

  get(row: number, col: number): CellColor | undefined {
    return this.map.get(this.key(row, col));
  }

  set(row: number, col: number, cellColor: CellColor): void {
    this.map.set(this.key(row, col), cellColor);
  }

  reset(): void {
    this.map.clear();
  }
}
