import type { RGB, ShaderCell, ShaderOutput } from './contracts.js';

/** Standard ANSI 16 color palette as RGB */
const ANSI_16_RGB: Array<[number, number, number]> = [
  [0, 0, 0], // 0 black
  [128, 0, 0], // 1 red
  [0, 128, 0], // 2 green
  [128, 128, 0], // 3 yellow
  [0, 0, 128], // 4 blue
  [128, 0, 128], // 5 magenta
  [0, 128, 128], // 6 cyan
  [192, 192, 192], // 7 white
  [128, 128, 128], // 8 bright black
  [255, 0, 0], // 9 bright red
  [0, 255, 0], // 10 bright green
  [255, 255, 0], // 11 bright yellow
  [0, 0, 255], // 12 bright blue
  [255, 0, 255], // 13 bright magenta
  [0, 255, 255], // 14 bright cyan
  [255, 255, 255], // 15 bright white
];

/** Convert ANSI 256-color code to RGB */
export function ansi256ToRgb(code: number): RGB {
  if (code < 16) {
    return [...ANSI_16_RGB[code]!];
  }
  // 6x6x6 color cube (codes 16-231)
  if (code < 232) {
    const idx = code - 16;
    const bIdx = idx % 6;
    const gIdx = Math.floor(idx / 6) % 6;
    const rIdx = Math.floor(idx / 36);
    const r = rIdx === 0 ? 0 : 55 + rIdx * 40;
    const g = gIdx === 0 ? 0 : 55 + gIdx * 40;
    const b = bIdx === 0 ? 0 : 55 + bIdx * 40;
    return [r, g, b];
  }
  // Grayscale ramp (codes 232-255)
  const gray = 8 + (code - 232) * 10;
  return [gray, gray, gray];
}

// Regex patterns for ANSI escape sequences
const TRUECOLOR_RE = /\x1b\[(?:38|48);2;(\d+);(\d+);(\d+)m/;
const COLOR_256_RE = /\x1b\[(?:38|48);5;(\d+)m/;
const ANSI_16_FG_RE = /\x1b\[(3[0-7]|9[0-7])m/;
const ANSI_16_BG_RE = /\x1b\[(4[0-7]|10[0-7])m/;
const RESET_FG_RE = /\x1b\[39m/;
const RESET_BG_RE = /\x1b\[49m/;

/**
 * Parse an ANSI escape string (from StyleAttrs.fg or .bg) into an RGB tuple.
 * Returns null for undefined, empty, reset, or unrecognized sequences.
 */
export function parseAnsiToRgb(ansi: string | undefined): RGB | null {
  if (!ansi) return null;

  // Check for reset codes first
  if (RESET_FG_RE.test(ansi) || RESET_BG_RE.test(ansi)) return null;

  // Truecolor: \x1b[38;2;R;G;Bm or \x1b[48;2;R;G;Bm
  const trueMatch = TRUECOLOR_RE.exec(ansi);
  if (trueMatch) {
    return [Number(trueMatch[1]), Number(trueMatch[2]), Number(trueMatch[3])];
  }

  // 256-color: \x1b[38;5;Nm or \x1b[48;5;Nm
  const c256Match = COLOR_256_RE.exec(ansi);
  if (c256Match) {
    return ansi256ToRgb(Number(c256Match[1]));
  }

  // ANSI 16 foreground: 30-37 (normal), 90-97 (bright)
  const fgMatch = ANSI_16_FG_RE.exec(ansi);
  if (fgMatch) {
    const code = Number(fgMatch[1]);
    if (code >= 90) {
      // Bright: 90-97 → palette index 8-15
      return ansi256ToRgb(code - 90 + 8);
    }
    // Normal: 30-37 → palette index 0-7
    return ansi256ToRgb(code - 30);
  }

  // ANSI 16 background: 40-47 (normal), 100-107 (bright)
  const bgMatch = ANSI_16_BG_RE.exec(ansi);
  if (bgMatch) {
    const code = Number(bgMatch[1]);
    if (code >= 100) {
      // Bright: 100-107 → palette index 8-15
      return ansi256ToRgb(code - 100 + 8);
    }
    // Normal: 40-47 → palette index 0-7
    return ansi256ToRgb(code - 40);
  }

  return null;
}

/** Encode RGB as truecolor foreground ANSI escape */
export function rgbToFgAnsi(rgb: RGB): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}

/** Encode RGB as truecolor background ANSI escape */
export function rgbToBgAnsi(rgb: RGB): string {
  return `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
}

// ─── Parse Cache ────────────────────────────────────────────────────────────

/** Per-frame parse cache for ANSI → RGB conversions */
export interface ParseCache {
  get(ansi: string | undefined): RGB | null;
  clear(): void;
}

/** Create a per-frame parse cache for ANSI string → RGB lookups */
export function createParseCache(): ParseCache {
  let cache = new Map<string, RGB | null>();

  return {
    get(ansi: string | undefined): RGB | null {
      if (ansi === undefined || ansi === '') return null;
      const cached = cache.get(ansi);
      if (cached !== undefined) return cached;
      const result = parseAnsiToRgb(ansi);
      cache.set(ansi, result);
      return result;
    },
    clear(): void {
      cache = new Map();
    },
  };
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function dimRgb(rgb: RGB, factor: number): RGB {
  return [Math.round(rgb[0] * factor), Math.round(rgb[1] * factor), Math.round(rgb[2] * factor)];
}

export function mixRgb(a: RGB, b: RGB, amount: number): RGB {
  const t = clamp01(amount);
  return [clamp255(a[0] + (b[0] - a[0]) * t), clamp255(a[1] + (b[1] - a[1]) * t), clamp255(a[2] + (b[2] - a[2]) * t)];
}

export function luminance(rgb: RGB): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

export function cellOutput(cell: ShaderCell): ShaderOutput {
  return {
    char: cell.char,
    fg: cell.fg,
    bg: cell.bg,
    bold: cell.bold,
    dim: cell.dim,
    italic: cell.italic,
    underline: cell.underline,
    strikethrough: cell.strikethrough,
  };
}

export function temperatureRgb(temp: number): RGB {
  const kelvin = Math.max(1000, Math.min(40000, temp)) / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (kelvin <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(kelvin) - 161.1195681661;
    blue = kelvin <= 19 ? 0 : 138.5177312231 * Math.log(kelvin - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(kelvin - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(kelvin - 60, -0.0755148492);
    blue = 255;
  }

  return [clamp255(red), clamp255(green), clamp255(blue)];
}

/**
 * Apply a per-channel RGB transform to both fg and bg of a ShaderCell.
 * Passes through null colors unchanged.
 */
export function mapFgBg(cell: ShaderCell, transform: (rgb: RGB) => RGB): ShaderOutput {
  return {
    fg: cell.fg ? transform(cell.fg) : null,
    bg: cell.bg ? transform(cell.bg) : null,
  };
}

// ─── Pseudo-Random Helper ────────────────────────────────────────────────────

/**
 * Seeded LCG pseudo-random number generator.
 * Returns a float in [0, 1) for a given integer seed.
 * Uses Knuth's multiplicative LCG constants for good distribution.
 */
export function pseudoRandom(seed: number): number {
  // LCG parameters from Numerical Recipes
  const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return s / 0x100000000;
}
