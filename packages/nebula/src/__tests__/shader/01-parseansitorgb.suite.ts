// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { parseAnsiToRgb, type ShaderUniforms } from '../../shader.js';
import type { Cell, CellGrid, LayoutEntry, LayoutPlan, LayoutRect } from '../../vdom.js';

function _makeGrid(width: number, height: number, fill?: Cell): CellGrid {
  const defaultCell: Cell = fill ?? { char: ' ', style: {} };
  const cells: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      row.push({ ...defaultCell, style: { ...defaultCell.style } });
    }
    cells.push(row);
  }
  return { cells, width, height };
}

function _makeTrivialPlan(width: number, height: number): LayoutPlan {
  const rect: LayoutRect = { x: 0, y: 0, width, height };
  const root: LayoutEntry = {
    id: 'root',
    node: { kind: 'empty' },
    rect,
    children: [],
  };
  return { root, index: new Map([['root', root]]), width, height, overlays: [] };
}

function _makeUniforms(plan: LayoutPlan, overrides?: Partial<ShaderUniforms>): ShaderUniforms {
  return {
    time: 0,
    tick: 0,
    cols: plan.width,
    rows: plan.height,
    plan,
    custom: {},
    ...overrides,
  };
}

// ─── ANSI Parsing ───────────────────────────────────────────────────────────

describe('parseAnsiToRgb', () => {
  it('parses truecolor FG', () => {
    expect(parseAnsiToRgb('\x1b[38;2;255;128;0m')).toEqual([255, 128, 0]);
  });

  it('parses truecolor BG', () => {
    expect(parseAnsiToRgb('\x1b[48;2;0;128;255m')).toEqual([0, 128, 255]);
  });

  it('parses 256-color', () => {
    // 256-color code 196 = rgb(255, 0, 0) in the 6x6x6 cube
    const result = parseAnsiToRgb('\x1b[38;5;196m');
    expect(result).not.toBeNull();
    // 196 is in the 6x6x6 cube: index 196-16=180, r=180/36=5, g=(180%36)/6=0, b=180%6=0
    // r=5 → 55+5*40=255, g=0 → 0, b=0 → 0
    expect(result).toEqual([255, 0, 0]);
  });

  it('parses ANSI 16 FG (red = 31)', () => {
    expect(parseAnsiToRgb('\x1b[31m')).toEqual([128, 0, 0]);
  });

  it('parses ANSI 16 bright FG (bright red = 91)', () => {
    expect(parseAnsiToRgb('\x1b[91m')).toEqual([255, 0, 0]);
  });

  it('parses ANSI 16 BG codes (green = 42)', () => {
    expect(parseAnsiToRgb('\x1b[42m')).toEqual([0, 128, 0]);
  });

  it('returns null for undefined', () => {
    expect(parseAnsiToRgb(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAnsiToRgb('')).toBeNull();
  });

  it('returns null for reset FG (\\x1b[39m)', () => {
    expect(parseAnsiToRgb('\x1b[39m')).toBeNull();
  });

  it('returns null for reset BG (\\x1b[49m)', () => {
    expect(parseAnsiToRgb('\x1b[49m')).toBeNull();
  });

  it('parses 256-color from ANSI 16 range (code 0-15)', () => {
    // 256-color code 1 = ANSI red = [128,0,0]
    expect(parseAnsiToRgb('\x1b[38;5;1m')).toEqual([128, 0, 0]);
  });

  it('parses 256-color grayscale range', () => {
    // Code 232 = grayscale start = 8 + 0*10 = 8
    expect(parseAnsiToRgb('\x1b[38;5;232m')).toEqual([8, 8, 8]);
    // Code 255 = grayscale end = 8 + 23*10 = 238
    expect(parseAnsiToRgb('\x1b[38;5;255m')).toEqual([238, 238, 238]);
  });

  it('parses bright BG codes (100-107)', () => {
    // 100 = bright black bg → index 8
    expect(parseAnsiToRgb('\x1b[100m')).toEqual([128, 128, 128]);
  });
});
