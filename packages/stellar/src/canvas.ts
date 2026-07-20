/**
 * Terminal Canvas — sub-cell pixel rendering via Unicode characters.
 *
 * Supports two rendering modes:
 * - Braille (default): 2×4 dots per cell using U+2800-U+28FF. Highest resolution
 *   but visible gaps between rows.
 * - Sextant: 2×3 blocks per cell using U+1FB00-U+1FB3B. Gap-free solid fills
 *   with slightly lower vertical resolution.
 */
import type { Color } from '@celestial/corona';
import type { VNode } from '@celestial/nebula';
import { column, text as textNode } from '@celestial/nebula';
import { type CanvasMode, type CellCodec, getCodec } from './codec.js';
import { ColorMap } from './color-map.js';
import { drawCircle, drawCircleCorrect, drawLine, drawRect, drawText, fillCircle, fillCircleCorrect, fillRect } from './draw.js';
import { type CanvasModeOrAuto, type ModeCapabilities, resolveCanvasMode } from './resolve-mode.js';

export type { CanvasMode } from './codec.js';
export type { CanvasModeOrAuto, ModeCapabilities } from './resolve-mode.js';

export interface BrailleCanvas {
  readonly width: number;
  readonly height: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /**
   * Width/height ratio of a single sub-pixel for this codec.
   * 1.0 means square pixels; <1 means pixels are wider than tall.
   */
  readonly pixelAspect: number;
  set(px: number, py: number): void;
  clear(px: number, py: number): void;
  toggle(px: number, py: number): void;
  get(px: number, py: number): boolean;
  line(x1: number, y1: number, x2: number, y2: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  circle(cx: number, cy: number, r: number): void;
  fillCircle(cx: number, cy: number, r: number): void;
  /** Draw a circle outline corrected for pixel aspect ratio so it appears circular on screen. */
  circleCorrect(cx: number, cy: number, r: number): void;
  /** Fill a circle corrected for pixel aspect ratio so it appears circular on screen. */
  fillCircleCorrect(cx: number, cy: number, r: number): void;
  text(x: number, y: number, str: string): void;
  setColor(color: Color): void;
  setBackground(color: Color): void;
  render(): string;
  toVNode(): VNode;
  reset(): void;
  /** Read the bitmask for a terminal cell. Used by export pipeline. */
  getCellBitmask(row: number, col: number): number;
  /** Read the color for a terminal cell. Used by export pipeline. */
  getCellColor(row: number, col: number): import('./color-map.js').CellColor | undefined;
  /** Get the cell codec for sub-pixel introspection. */
  getCodec(): CellCodec;
}

class CanvasImpl implements BrailleCanvas {
  readonly width: number;
  readonly height: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly pixelAspect: number;

  private readonly cells: Uint8Array;
  private readonly colorMap: ColorMap;
  private readonly codec: CellCodec;
  private currentFg: Color | undefined;
  private currentBg: Color | undefined;

  constructor(width: number, height: number, mode: CanvasMode) {
    this.codec = getCodec(mode);
    this.width = width;
    this.height = height;
    this.pixelWidth = width * this.codec.subCols;
    this.pixelHeight = height * this.codec.subRows;
    this.pixelAspect = this.codec.pixelAspect;
    this.cells = new Uint8Array(width * height);
    this.colorMap = new ColorMap(width);
  }

  private inBounds(px: number, py: number): boolean {
    return px >= 0 && px < this.pixelWidth && py >= 0 && py < this.pixelHeight;
  }

  private cellIndex(px: number, py: number): { col: number; row: number; dx: number; dy: number } {
    const col = Math.floor(px / this.codec.subCols);
    const row = Math.floor(py / this.codec.subRows);
    const dx = px % this.codec.subCols;
    const dy = py % this.codec.subRows;
    return { col, row, dx, dy };
  }

  set(px: number, py: number): void {
    if (!this.inBounds(px, py)) return;
    const { col, row, dx, dy } = this.cellIndex(px, py);
    const idx = row * this.width + col;
    this.cells[idx]! |= this.codec.dotBit(dy, dx);

    if (this.currentFg || this.currentBg) {
      const existing = this.colorMap.get(row, col);
      this.colorMap.set(row, col, {
        fg: this.currentFg ?? existing?.fg,
        bg: this.currentBg ?? existing?.bg,
      });
    }
  }

  clear(px: number, py: number): void {
    if (!this.inBounds(px, py)) return;
    const { col, row, dx, dy } = this.cellIndex(px, py);
    const idx = row * this.width + col;
    this.cells[idx]! &= ~this.codec.dotBit(dy, dx);
  }

  toggle(px: number, py: number): void {
    if (!this.inBounds(px, py)) return;
    const { col, row, dx, dy } = this.cellIndex(px, py);
    const idx = row * this.width + col;
    this.cells[idx]! ^= this.codec.dotBit(dy, dx);
  }

  get(px: number, py: number): boolean {
    if (!this.inBounds(px, py)) return false;
    const { col, row, dx, dy } = this.cellIndex(px, py);
    const idx = row * this.width + col;
    return (this.cells[idx]! & this.codec.dotBit(dy, dx)) !== 0;
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    drawLine(this, x1, y1, x2, y2);
  }

  rect(x: number, y: number, w: number, h: number): void {
    drawRect(this, x, y, w, h);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    fillRect(this, x, y, w, h);
  }

  circle(cx: number, cy: number, r: number): void {
    drawCircle(this, cx, cy, r);
  }

  fillCircle(cx: number, cy: number, r: number): void {
    fillCircle(this, cx, cy, r);
  }

  circleCorrect(cx: number, cy: number, r: number): void {
    drawCircleCorrect(this, cx, cy, r, this.pixelAspect);
  }

  fillCircleCorrect(cx: number, cy: number, r: number): void {
    fillCircleCorrect(this, cx, cy, r, this.pixelAspect);
  }

  text(x: number, y: number, str: string): void {
    drawText(this, x, y, str);
  }

  setColor(color: Color): void {
    this.currentFg = color;
  }

  setBackground(color: Color): void {
    this.currentBg = color;
  }

  render(): string {
    const RESET = '\x1b[0m';
    const lines: string[] = [];

    for (let row = 0; row < this.height; row++) {
      let line = '';
      let lastFg: string | undefined;
      let lastBg: string | undefined;

      for (let col = 0; col < this.width; col++) {
        const idx = row * this.width + col;
        const bitmask = this.cells[idx]!;
        const ch = this.codec.toChar(bitmask);
        const cellColor = this.colorMap.get(row, col);

        const fgSeq = cellColor?.fg?.fg();
        const bgSeq = cellColor?.bg?.bg();

        let prefix = '';
        if (fgSeq !== lastFg) {
          prefix += fgSeq ?? '\x1b[39m';
          lastFg = fgSeq;
        }
        if (bgSeq !== lastBg) {
          prefix += bgSeq ?? '\x1b[49m';
          lastBg = bgSeq;
        }

        line += prefix + ch;
      }

      if (lastFg || lastBg) {
        line += RESET;
      }

      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Convert to a Nebula VNode. Multi-line output is automatically split
   * into a column() of text() nodes for correct row() composition.
   */
  toVNode(): VNode {
    const content = this.render();
    if (!content.includes('\n')) return textNode(content);
    return column(...content.split('\n').map((line) => textNode(line)));
  }

  reset(): void {
    this.cells.fill(0);
    this.colorMap.reset();
    this.currentFg = undefined;
    this.currentBg = undefined;
  }

  getCellBitmask(row: number, col: number): number {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return 0;
    return this.cells[row * this.width + col]!;
  }

  getCellColor(row: number, col: number): import('./color-map.js').CellColor | undefined {
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return undefined;
    return this.colorMap.get(row, col);
  }

  getCodec(): CellCodec {
    return this.codec;
  }
}

export function canvas(width: number, height: number, mode?: CanvasModeOrAuto, caps?: ModeCapabilities): BrailleCanvas {
  const resolved = mode === undefined ? 'braille' : resolveCanvasMode(mode, caps);
  return new CanvasImpl(width, height, resolved);
}
