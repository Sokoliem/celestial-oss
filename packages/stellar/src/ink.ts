/**
 * Persistent Drawing / Annotation Layer for Stellar
 *
 * The ink layer maintains a cell grid that accumulates marks across frames.
 * It composites with the normal render via Nebula's shader pipeline.
 * Marks persist until explicitly cleared.
 */

import { cellWidth, sanitizeTerminalText, sliceCells, stripAnsi } from '@celestial/corona';
import type { CellShader, NeighborFn, RGB, ShaderCell, ShaderOutput, ShaderUniforms } from '@celestial/nebula';
import { segmentGraphemes } from '@celestial/rosetta';
import { clamp, finiteNumber } from './validation.js';

const MAX_INK_COORDINATE = 1_000_000_000;
const MAX_INK_CELLS = 1_000_000;
const MAX_INK_MARKS = 10_000;

function normalizeCoordinate(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  if (Math.abs(value) > MAX_INK_COORDINATE) throw new RangeError(`${name} exceeds the ink coordinate limit`);
  return Math.round(value);
}

function normalizePoint(value: Point, name: string): Point {
  return { x: normalizeCoordinate(value.x, `${name}.x`), y: normalizeCoordinate(value.y, `${name}.y`) };
}

function normalizeColor(value: RGB, name: string): RGB {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new TypeError(`${name} must be a finite RGB tuple`);
  return value.map((channel) => Math.round(clamp(channel, 0, 255, 0))) as RGB;
}

function normalizeExtent(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  const extent = Math.floor(value);
  if (extent <= 0) throw new RangeError(`${name} must be > 0`);
  if (extent > MAX_INK_CELLS) throw new RangeError(`${name} exceeds the ink extent limit`);
  return extent;
}

function normalizeGlyph(value: string | undefined, fallback: string): string {
  const safe = stripAnsi(sanitizeTerminalText(value ?? fallback, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' }));
  const glyph = segmentGraphemes(safe).find((entry) => cellWidth(entry) === 1);
  return glyph ?? fallback;
}

function normalizeText(value: string): string {
  const safe = stripAnsi(sanitizeTerminalText(value, { allowSgr: false, allowHyperlinks: false, controlPolicy: 'strip' })).replace(/[\r\n]/g, ' ');
  return sliceCells(safe, MAX_INK_CELLS)[0];
}

function markCost(mark: InkMark): number {
  switch (mark.type) {
    case 'pen':
    case 'arrow':
      return Math.max(Math.abs(mark.to.x - mark.from.x), Math.abs(mark.to.y - mark.from.y)) + 1;
    case 'highlight':
      return mark.rect.width * mark.rect.height;
    case 'annotation':
      return segmentGraphemes(mark.text).length;
    case 'rect':
      return mark.fill ? mark.rect.width * mark.rect.height : Math.max(1, 2 * mark.rect.width + 2 * mark.rect.height - 4);
    case 'circle':
      return Math.max(1, mark.radius * 8);
  }
}

function normalizeRect(value: { x: number; y: number; width: number; height: number }, name: string): { x: number; y: number; width: number; height: number } {
  const rect = {
    x: normalizeCoordinate(value.x, `${name}.x`),
    y: normalizeCoordinate(value.y, `${name}.y`),
    width: normalizeExtent(value.width, `${name}.width`),
    height: normalizeExtent(value.height, `${name}.height`),
  };
  if (rect.width > Math.floor(MAX_INK_CELLS / rect.height)) throw new RangeError(`${name} exceeds the ink cell limit`);
  return rect;
}

function normalizeMark(mark: InkMark): InkMark {
  switch (mark.type) {
    case 'pen':
      return {
        type: 'pen',
        from: normalizePoint(mark.from, 'pen.from'),
        to: normalizePoint(mark.to, 'pen.to'),
        color: normalizeColor(mark.color, 'pen.color'),
        ...(mark.char === undefined ? {} : { char: normalizeGlyph(mark.char, '*') }),
      };
    case 'highlight':
      return {
        type: 'highlight',
        rect: normalizeRect(mark.rect, 'highlight.rect'),
        color: normalizeColor(mark.color, 'highlight.color'),
        ...(mark.opacity === undefined ? {} : { opacity: clamp(mark.opacity, 0, 1, 1) }),
      };
    case 'arrow':
      return {
        type: 'arrow',
        from: normalizePoint(mark.from, 'arrow.from'),
        to: normalizePoint(mark.to, 'arrow.to'),
        color: normalizeColor(mark.color, 'arrow.color'),
      };
    case 'annotation':
      return {
        type: 'annotation',
        pos: normalizePoint(mark.pos, 'annotation.pos'),
        text: normalizeText(mark.text),
        color: normalizeColor(mark.color, 'annotation.color'),
      };
    case 'rect':
      return {
        type: 'rect',
        rect: normalizeRect(mark.rect, 'rect.rect'),
        color: normalizeColor(mark.color, 'rect.color'),
        ...(mark.fill === undefined ? {} : { fill: mark.fill }),
      };
    case 'circle': {
      const radius = Math.floor(finiteNumber(mark.radius, Number.NaN));
      if (!Number.isFinite(radius)) throw new TypeError('circle.radius must be finite');
      if (radius < 0) throw new RangeError('circle.radius must be >= 0');
      if (Math.max(1, radius * 8) > MAX_INK_CELLS) throw new RangeError('circle.radius exceeds the ink cell limit');
      return { type: 'circle', center: normalizePoint(mark.center, 'circle.center'), radius, color: normalizeColor(mark.color, 'circle.color') };
    }
  }
}

function normalizeOptions(options?: InkOptions): InkOptions {
  const blend = options?.blend;
  return {
    blend: blend === 'underlay' || blend === 'replace' ? blend : 'overlay',
    opacity: clamp(options?.opacity, 0, 1, 1),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

/** A point in the terminal grid */
export interface Point {
  x: number;
  y: number;
}

/** A drawing mark on the ink layer */
export type InkMark =
  | { type: 'pen'; from: Point; to: Point; color: RGB; char?: string }
  | { type: 'highlight'; rect: { x: number; y: number; width: number; height: number }; color: RGB; opacity?: number }
  | { type: 'arrow'; from: Point; to: Point; color: RGB }
  | { type: 'annotation'; pos: Point; text: string; color: RGB }
  | { type: 'rect'; rect: { x: number; y: number; width: number; height: number }; color: RGB; fill?: boolean }
  | { type: 'circle'; center: Point; radius: number; color: RGB };

/** Blend mode for compositing ink over the main render */
export type BlendMode = 'overlay' | 'underlay' | 'replace';

/** Options for creating an ink layer */
export interface InkOptions {
  /** How ink composites with the main render (default: 'overlay') */
  blend?: BlendMode;
  /** Global opacity for the ink layer 0-1 (default: 1.0) */
  opacity?: number;
}

/** Serialized ink state */
export interface InkState {
  marks: InkMark[];
  options: InkOptions;
}

// Re-export RGB for convenience
export type { RGB } from '@celestial/nebula';

// ── Internal cell type ───────────────────────────────────────────────────────

interface InkCell {
  char?: string;
  fg?: RGB;
  bg?: RGB;
  opacity?: number;
}

// ── Rasterization helpers ────────────────────────────────────────────────────

/**
 * Bresenham's line algorithm — yields each (x,y) along the line.
 * Replicates the same algorithm as draw.ts but works on abstract coordinates
 * instead of a BrailleCanvas.
 */
function* bresenhamLine(x1: number, y1: number, x2: number, y2: number): Generator<Point> {
  let cx = x1;
  let cy = y1;
  const dx = Math.abs(x2 - x1);
  const dy = -Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    yield { x: cx, y: cy };
    if (cx === x2 && cy === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

/**
 * Midpoint circle algorithm — yields each (x,y) on the circle outline.
 * Uses 8-way symmetry, same as draw.ts.
 */
function* midpointCircle(cx: number, cy: number, r: number): Generator<Point> {
  let x = r;
  let y = 0;
  let d = 1 - r;

  while (x >= y) {
    yield { x: cx + x, y: cy + y };
    yield { x: cx - x, y: cy + y };
    yield { x: cx + x, y: cy - y };
    yield { x: cx - x, y: cy - y };
    yield { x: cx + y, y: cy + x };
    yield { x: cx - y, y: cy + x };
    yield { x: cx + y, y: cy - x };
    yield { x: cx - y, y: cy - x };

    y++;
    if (d <= 0) {
      d += 2 * y + 1;
    } else {
      x--;
      d += 2 * (y - x) + 1;
    }
  }
}

/**
 * Determine arrow head character based on direction from→to.
 */
function arrowHeadChar(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Determine primary direction
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx >= ady) {
    // Primarily horizontal
    return dx >= 0 ? '→' : '←';
  } else {
    // Primarily vertical
    return dy >= 0 ? '↓' : '↑';
  }
}

/**
 * Determine line body character based on direction.
 */
function lineBodyChar(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (ady === 0) return '─';
  if (adx === 0) return '│';
  // Diagonal
  if ((dx > 0 && dy > 0) || (dx < 0 && dy < 0)) return '╲';
  return '╱';
}

// ── Rasterize marks to cells ─────────────────────────────────────────────────

function rasterizeMarks(marks: readonly InkMark[]): Map<string, InkCell> {
  const grid = new Map<string, InkCell>();

  function setCell(x: number, y: number, cell: InkCell): void {
    const key = `${x},${y}`;
    const existing = grid.get(key);
    if (existing) {
      // Merge: later values override
      grid.set(key, {
        char: cell.char ?? existing.char,
        fg: cell.fg ?? existing.fg,
        bg: cell.bg ?? existing.bg,
        opacity: cell.opacity ?? existing.opacity,
      });
    } else {
      grid.set(key, { ...cell });
    }
  }

  for (const mark of marks) {
    switch (mark.type) {
      case 'pen': {
        const ch = mark.char ?? '*';
        for (const pt of bresenhamLine(mark.from.x, mark.from.y, mark.to.x, mark.to.y)) {
          setCell(pt.x, pt.y, { char: ch, fg: mark.color });
        }
        break;
      }

      case 'highlight': {
        const { x, y, width, height } = mark.rect;
        for (let py = y; py < y + height; py++) {
          for (let px = x; px < x + width; px++) {
            setCell(px, py, { bg: mark.color, opacity: mark.opacity });
          }
        }
        break;
      }

      case 'arrow': {
        const bodyChar = lineBodyChar(mark.from, mark.to);
        const headChar = arrowHeadChar(mark.from, mark.to);
        const points = [...bresenhamLine(mark.from.x, mark.from.y, mark.to.x, mark.to.y)];

        for (let i = 0; i < points.length; i++) {
          const pt = points[i]!;
          const isHead = i === points.length - 1;
          setCell(pt.x, pt.y, {
            char: isHead ? headChar : bodyChar,
            fg: mark.color,
          });
        }
        break;
      }

      case 'annotation': {
        let offset = 0;
        for (const rawGlyph of segmentGraphemes(mark.text)) {
          const glyph = cellWidth(rawGlyph) === 1 ? rawGlyph : '?';
          setCell(mark.pos.x + offset, mark.pos.y, {
            char: glyph,
            fg: mark.color,
          });
          offset++;
        }
        break;
      }

      case 'rect': {
        const { x, y, width, height } = mark.rect;
        const x2 = x + width - 1;
        const y2 = y + height - 1;

        if (mark.fill) {
          // Fill the entire rectangle
          for (let py = y; py <= y2; py++) {
            for (let px = x; px <= x2; px++) {
              setCell(px, py, { char: ' ', bg: mark.color });
            }
          }
        } else {
          // Outline only — 4 edges via Bresenham
          for (const pt of bresenhamLine(x, y, x2, y)) {
            setCell(pt.x, pt.y, { char: '*', fg: mark.color });
          }
          for (const pt of bresenhamLine(x, y2, x2, y2)) {
            setCell(pt.x, pt.y, { char: '*', fg: mark.color });
          }
          for (const pt of bresenhamLine(x, y, x, y2)) {
            setCell(pt.x, pt.y, { char: '*', fg: mark.color });
          }
          for (const pt of bresenhamLine(x2, y, x2, y2)) {
            setCell(pt.x, pt.y, { char: '*', fg: mark.color });
          }
        }
        break;
      }

      case 'circle': {
        for (const pt of midpointCircle(mark.center.x, mark.center.y, mark.radius)) {
          setCell(pt.x, pt.y, { char: '*', fg: mark.color });
        }
        break;
      }
    }
  }

  return grid;
}

// ── Color mixing helper ──────────────────────────────────────────────────────

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

// ── InkLayer Class ───────────────────────────────────────────────────────────

export class InkLayer {
  private _marks: InkMark[] = [];
  private _options: InkOptions;
  private _grid: Map<string, InkCell> | null = null;
  private _dirty = true;
  private _cost = 0;

  constructor(options?: InkOptions) {
    this._options = normalizeOptions(options);
  }

  /** Add a drawing mark */
  draw(mark: InkMark): void {
    if (this._marks.length >= MAX_INK_MARKS) throw new RangeError(`ink layer supports at most ${MAX_INK_MARKS.toLocaleString('en-US')} marks`);
    const normalized = normalizeMark(mark);
    const cost = markCost(normalized);
    if (cost > MAX_INK_CELLS - this._cost) throw new RangeError(`ink layer exceeds the ${MAX_INK_CELLS.toLocaleString('en-US')} cell complexity limit`);
    this._marks.push(normalized);
    this._cost += cost;
    this._dirty = true;
    this._grid = null;
  }

  /** Remove the last mark (undo) */
  undo(): InkMark | undefined {
    const mark = this._marks.pop();
    if (mark !== undefined) {
      this._cost -= markCost(mark);
      this._dirty = true;
      this._grid = null;
    }
    return mark === undefined ? undefined : normalizeMark(mark);
  }

  /** Clear all marks */
  clear(): void {
    this._marks = [];
    this._cost = 0;
    this._dirty = true;
    this._grid = null;
  }

  /** Get all current marks */
  marks(): readonly InkMark[] {
    return this._marks.map((mark) => normalizeMark(mark));
  }

  /** Get mark count */
  count(): number {
    return this._marks.length;
  }

  /** Rebuild the rasterized grid if dirty */
  private ensureGrid(): Map<string, InkCell> {
    if (this._dirty || this._grid === null) {
      this._grid = rasterizeMarks(this._marks);
      this._dirty = false;
    }
    return this._grid;
  }

  /** Get a CellShader that composites this ink layer onto the render */
  shader(): CellShader {
    return {
      name: 'ink',
      fn: (x: number, y: number, cell: ShaderCell, _uniforms: ShaderUniforms, _neighbors: NeighborFn): ShaderOutput | null => {
        const grid = this.ensureGrid();
        const key = `${x},${y}`;
        const inkCell = grid.get(key);

        if (!inkCell) return null;
        const blend = this._options.blend ?? 'overlay';
        const opacity = clamp((this._options.opacity ?? 1) * (inkCell.opacity ?? 1), 0, 1, 1);

        switch (blend) {
          case 'overlay': {
            const out: ShaderOutput = {};
            let hasChange = false;

            if (inkCell.char !== undefined) {
              out.char = inkCell.char;
              hasChange = true;
            }

            if (inkCell.fg !== undefined) {
              if (opacity < 1.0 && cell.fg) {
                out.fg = mixRgb(cell.fg, inkCell.fg, opacity);
              } else if (opacity < 1.0 && !cell.fg) {
                // Dim toward black if no existing fg
                out.fg = mixRgb([0, 0, 0], inkCell.fg, opacity);
              } else {
                out.fg = inkCell.fg;
              }
              hasChange = true;
            }

            if (inkCell.bg !== undefined) {
              if (opacity < 1.0 && cell.bg) {
                out.bg = mixRgb(cell.bg, inkCell.bg, opacity);
              } else if (opacity < 1.0 && !cell.bg) {
                out.bg = mixRgb([0, 0, 0], inkCell.bg, opacity);
              } else {
                out.bg = inkCell.bg;
              }
              hasChange = true;
            }

            return hasChange ? out : null;
          }

          case 'underlay': {
            const out: ShaderOutput = {};
            let hasChange = false;

            // Only apply ink where render has no content
            if (inkCell.char !== undefined && !cell.fg && !cell.bg) {
              out.char = inkCell.char;
              hasChange = true;
            }

            if (inkCell.fg !== undefined && !cell.fg) {
              out.fg = opacity < 1 ? mixRgb([0, 0, 0], inkCell.fg, opacity) : inkCell.fg;
              hasChange = true;
            }

            if (inkCell.bg !== undefined && !cell.bg) {
              out.bg = opacity < 1 ? mixRgb([0, 0, 0], inkCell.bg, opacity) : inkCell.bg;
              hasChange = true;
            }

            return hasChange ? out : null;
          }

          case 'replace': {
            const out: ShaderOutput = {};
            let hasChange = false;

            if (inkCell.char !== undefined) {
              out.char = inkCell.char;
              hasChange = true;
            }
            if (inkCell.fg !== undefined) {
              out.fg = opacity < 1 ? mixRgb(cell.fg ?? [0, 0, 0], inkCell.fg, opacity) : inkCell.fg;
              hasChange = true;
            }
            if (inkCell.bg !== undefined) {
              out.bg = opacity < 1 ? mixRgb(cell.bg ?? [0, 0, 0], inkCell.bg, opacity) : inkCell.bg;
              hasChange = true;
            }

            return hasChange ? out : null;
          }

          default:
            return null;
        }
      },
    };
  }

  /** Serialize to JSON-compatible object */
  save(): InkState {
    return {
      marks: this._marks.map((mark) => normalizeMark(mark)),
      options: { ...this._options },
    };
  }

  /** Load from serialized state */
  load(state: InkState): void {
    if (!state || !Array.isArray(state.marks)) throw new TypeError('ink state must contain a marks array');
    if (state.marks.length > MAX_INK_MARKS) throw new RangeError(`ink layer supports at most ${MAX_INK_MARKS.toLocaleString('en-US')} marks`);
    const marks: InkMark[] = [];
    let cost = 0;
    for (const mark of state.marks) {
      const normalized = normalizeMark(mark);
      cost += markCost(normalized);
      if (cost > MAX_INK_CELLS) throw new RangeError(`ink layer exceeds the ${MAX_INK_CELLS.toLocaleString('en-US')} cell complexity limit`);
      marks.push(normalized);
    }
    this._marks = marks;
    this._cost = cost;
    this._options = normalizeOptions(state.options);
    this._dirty = true;
    this._grid = null;
  }
}

// ── Convenience Functions ────────────────────────────────────────────────────

/** Create a pen mark */
export function pen(opts: { from: Point; to: Point; color: RGB; char?: string }): InkMark {
  return { type: 'pen', ...opts };
}

/** Create a highlight mark */
export function highlight(opts: { rect: { x: number; y: number; width: number; height: number }; color: RGB; opacity?: number }): InkMark {
  return { type: 'highlight', ...opts };
}

/** Create an arrow mark */
export function arrow(opts: { from: Point; to: Point; color: RGB }): InkMark {
  return { type: 'arrow', ...opts };
}

/** Create an annotation mark */
export function annotation(opts: { pos: Point; text: string; color: RGB }): InkMark {
  return { type: 'annotation', ...opts };
}

/** Create a rectangle mark */
export function rect(opts: { rect: { x: number; y: number; width: number; height: number }; color: RGB; fill?: boolean }): InkMark {
  return { type: 'rect', ...opts };
}

/** Create a circle mark */
export function circle(opts: { center: Point; radius: number; color: RGB }): InkMark {
  return { type: 'circle', ...opts };
}
