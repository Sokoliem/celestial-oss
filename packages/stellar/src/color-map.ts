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
  private readonly width: number;

  constructor(width: number) {
    if (!Number.isSafeInteger(width)) throw new TypeError('color map width must be a safe integer');
    if (width < 0) throw new RangeError('color map width must be >= 0');
    this.width = width;
  }

  private key(row: number, col: number): number | undefined {
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col) || row < 0 || col < 0 || col >= this.width) return undefined;
    const key = row * this.width + col;
    return Number.isSafeInteger(key) ? key : undefined;
  }

  get(row: number, col: number): CellColor | undefined {
    const key = this.key(row, col);
    const value = key === undefined ? undefined : this.map.get(key);
    return value ? { ...value } : undefined;
  }

  set(row: number, col: number, cellColor: CellColor): void {
    const key = this.key(row, col);
    if (key !== undefined) this.map.set(key, { ...cellColor });
  }

  reset(): void {
    this.map.clear();
  }
}
