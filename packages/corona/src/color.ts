/**
 * Corona Color System
 *
 * Supports ANSI 16, 256, and true color (24-bit) with auto-degradation.
 */

import { detectColorLevel as detectAtlasColorLevel, detectDarkBackground } from '@celestial/atlas';
import type { SemanticTheme } from './theme.js';

export type ColorLevel = 'truecolor' | '256' | '16' | 'none';

export interface Color {
  /** Foreground ANSI escape sequence */
  fg(): string;
  /** Background ANSI escape sequence */
  bg(): string;
  /** Degrade to a lower color level */
  degrade(level: ColorLevel): Color;
  /** Compare by value */
  equals(other: Color): boolean;
  /** Internal RGB representation (if available) */
  readonly rgb: [number, number, number] | null;
  /** OKLAB components [l (0-1), a (-0.4-0.4), b (-0.4-0.4)] */
  readonly oklab: [number, number, number] | null;
  /** OKLCH components [l (0-1), c (0-0.4), h (0-360)] */
  readonly oklch: [number, number, number] | null;
  /** Internal color level */
  readonly level: ColorLevel;
}

// --- Internal color implementations ---

class Ansi16Color implements Color {
  readonly level: ColorLevel = '16';
  readonly rgb: [number, number, number] | null;

  constructor(
    private readonly fgCode: number,
    private readonly bgCode: number,
    rgb?: [number, number, number],
  ) {
    this.rgb = rgb ?? null;
  }

  get oklab(): [number, number, number] | null {
    if (!this.rgb) return null;
    return rgbToOklab(this.rgb[0], this.rgb[1], this.rgb[2]);
  }

  get oklch(): [number, number, number] | null {
    const lab = this.oklab;
    if (!lab) return null;
    return oklabToOklch(lab[0], lab[1], lab[2]);
  }

  fg(): string {
    return `\x1b[${this.fgCode}m`;
  }

  bg(): string {
    return `\x1b[${this.bgCode}m`;
  }

  degrade(level: ColorLevel): Color {
    if (level === 'none') return NO_COLOR;
    return this;
  }

  equals(other: Color): boolean {
    if (this.rgb && other.rgb) {
      return this.rgb[0] === other.rgb[0] && this.rgb[1] === other.rgb[1] && this.rgb[2] === other.rgb[2];
    }
    return this.fg() === other.fg();
  }
}

class Ansi256Color implements Color {
  readonly level: ColorLevel = '256';
  private _rgb: [number, number, number] | null | undefined;
  private _oklab: [number, number, number] | null | undefined;
  private _oklch: [number, number, number] | null | undefined;

  constructor(private readonly code: number) {}

  get rgb(): [number, number, number] | null {
    if (this._rgb === undefined) {
      this._rgb = ansi256ToRgb(this.code);
    }
    return this._rgb;
  }

  get oklab(): [number, number, number] | null {
    if (this._oklab === undefined) {
      const rgb = this.rgb;
      this._oklab = rgb ? rgbToOklab(rgb[0], rgb[1], rgb[2]) : null;
    }
    return this._oklab;
  }

  get oklch(): [number, number, number] | null {
    if (this._oklch === undefined) {
      const lab = this.oklab;
      this._oklch = lab ? oklabToOklch(lab[0], lab[1], lab[2]) : null;
    }
    return this._oklch;
  }

  private _fg?: string;
  private _bg?: string;

  fg(): string {
    return (this._fg ??= `\x1b[38;5;${this.code}m`);
  }

  bg(): string {
    return (this._bg ??= `\x1b[48;5;${this.code}m`);
  }

  degrade(level: ColorLevel): Color {
    if (level === 'none') return NO_COLOR;
    if (level === '16') {
      return ansi256to16(this.code);
    }
    return this;
  }

  equals(other: Color): boolean {
    if (other instanceof Ansi256Color) return this.code === other.code;
    return this.fg() === other.fg();
  }
}

class TrueColor implements Color {
  readonly level: ColorLevel = 'truecolor';
  readonly rgb: [number, number, number];
  private _oklab: [number, number, number] | null | undefined;
  private _oklch: [number, number, number] | null | undefined;

  constructor(r: number, g: number, b: number) {
    this.rgb = [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
  }

  get oklab(): [number, number, number] | null {
    if (this._oklab === undefined) {
      this._oklab = rgbToOklab(this.rgb[0], this.rgb[1], this.rgb[2]);
    }
    return this._oklab;
  }

  get oklch(): [number, number, number] | null {
    if (this._oklch === undefined) {
      const lab = this.oklab;
      this._oklch = lab ? oklabToOklch(lab[0], lab[1], lab[2]) : null;
    }
    return this._oklch;
  }

  private _fg?: string;
  private _bg?: string;

  fg(): string {
    return (this._fg ??= `\x1b[38;2;${this.rgb[0]};${this.rgb[1]};${this.rgb[2]}m`);
  }

  bg(): string {
    return (this._bg ??= `\x1b[48;2;${this.rgb[0]};${this.rgb[1]};${this.rgb[2]}m`);
  }

  degrade(level: ColorLevel): Color {
    if (level === 'none') return NO_COLOR;
    if (level === '256') return rgbToAnsi256(this.rgb[0], this.rgb[1], this.rgb[2]);
    if (level === '16') return rgbToAnsi16(this.rgb[0], this.rgb[1], this.rgb[2]);
    return this;
  }

  equals(other: Color): boolean {
    if (other.rgb) {
      return this.rgb[0] === other.rgb[0] && this.rgb[1] === other.rgb[1] && this.rgb[2] === other.rgb[2];
    }
    return this.fg() === other.fg();
  }
}

class ResetColor implements Color {
  readonly level: ColorLevel = '16';
  readonly rgb = null;
  readonly oklab = null;
  readonly oklch = null;

  fg(): string {
    return '\x1b[39m';
  }
  bg(): string {
    return '\x1b[49m';
  }
  degrade(): Color {
    return this;
  }
  equals(other: Color): boolean {
    return other instanceof ResetColor;
  }
}

class NoColor implements Color {
  readonly level: ColorLevel = 'none';
  readonly rgb = null;
  readonly oklab = null;
  readonly oklch = null;

  fg(): string {
    return '';
  }
  bg(): string {
    return '';
  }
  degrade(): Color {
    return this;
  }
  equals(other: Color): boolean {
    return other instanceof NoColor;
  }
}

const NO_COLOR = new NoColor();

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  // sRGB to Linear
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.pow(l, 1 / 3);
  const m_ = Math.pow(m, 1 / 3);
  const s_ = Math.pow(s, 1 / 3);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720403 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToRgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l_raw = l_ * l_ * l_;
  const m_raw = m_ * m_ * m_;
  const s_raw = s_ * s_ * s_;

  const r = +4.0767416621 * l_raw - 3.3077115913 * m_raw + 0.2309699292 * s_raw;
  const g = -1.2684380046 * l_raw + 2.6097574011 * m_raw - 0.3413193965 * s_raw;
  const b_res = -0.0041960863 * l_raw - 0.7034186147 * m_raw + 1.707614701 * s_raw;

  return [clamp(linearToSrgb(r) * 255, 0, 255), clamp(linearToSrgb(g) * 255, 0, 255), clamp(linearToSrgb(b_res) * 255, 0, 255)];
}

function oklabToOklch(l: number, a: number, b: number): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [l, c, h >= 0 ? h : h + 360];
}

function oklchToOklab(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  return [l, a, b];
}

function srgbToLinear(c: number): number {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// OKLCh convenience helpers (compose existing primitives)

function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const [l, a, ob] = rgbToOklab(r, g, b);
  return oklabToOklch(l, a, ob);
}

function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
  const [la, a, b] = oklchToOklab(l, c, h);
  return oklabToRgb(la, a, b);
}

// WCAG relative luminance helpers

function toLinearChannel(channel: number): number {
  const n = channel / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinearChannel(r) + 0.7152 * toLinearChannel(g) + 0.0722 * toLinearChannel(b);
}

// --- Utilities ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isValidHex(hex: string): boolean {
  const normalized = hex.replace(/^#/, '');
  if (normalized.length === 3) {
    return /^[0-9a-fA-F]{3}$/.test(normalized);
  }
  return normalized.length === 6 && /^[0-9a-fA-F]{6}$/.test(normalized);
}

function parseHex(hex: string): [number, number, number] {
  const originalHex = hex;
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;
  }
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[corona] Invalid hex color: "${originalHex}" — falling back to black\n`);
    }
    return [0, 0, 0];
  }
  const num = parseInt(hex, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function hslToRgb100(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    // Achromatic (grayscale)
    return [0, 0, Math.round(l * 100)];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// Lazy-initialized OKLab palette for perceptual nearest-match
let ANSI_256_OKLAB: Array<[number, number, number]> | null = null;

function getAnsi256OklabPalette(): Array<[number, number, number]> {
  if (ANSI_256_OKLAB) return ANSI_256_OKLAB;
  ANSI_256_OKLAB = [];
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = ansi256ToRgb(i);
    ANSI_256_OKLAB.push(rgbToOklab(r, g, b));
  }
  return ANSI_256_OKLAB;
}

function rgbToAnsi256(r: number, g: number, b: number): Ansi256Color {
  const palette = getAnsi256OklabPalette();
  const [tl, ta, tb] = rgbToOklab(r, g, b);

  let minDist = Infinity;
  let bestCode = 0;
  for (let i = 0; i < 256; i++) {
    const [pl, pa, pb] = palette[i]!;
    const dist = (tl - pl) ** 2 + (ta - pa) ** 2 + (tb - pb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      bestCode = i;
    }
  }
  return new Ansi256Color(bestCode);
}

// ANSI 16 color table for nearest-match (standard colors)
const ANSI_16_RGB: Array<[number, number, number]> = [
  [0, 0, 0], // 0: black
  [128, 0, 0], // 1: red
  [0, 128, 0], // 2: green
  [128, 128, 0], // 3: yellow
  [0, 0, 128], // 4: blue
  [128, 0, 128], // 5: magenta
  [0, 128, 128], // 6: cyan
  [192, 192, 192], // 7: white
  [128, 128, 128], // 8: bright black (gray)
  [255, 0, 0], // 9: bright red
  [0, 255, 0], // 10: bright green
  [255, 255, 0], // 11: bright yellow
  [0, 0, 255], // 12: bright blue
  [255, 0, 255], // 13: bright magenta
  [0, 255, 255], // 14: bright cyan
  [255, 255, 255], // 15: bright white
];

const ANSI_16_FG = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
const ANSI_16_BG = [40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107];

function rgbToAnsi16(r: number, g: number, b: number): Ansi16Color {
  let minDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < ANSI_16_RGB.length; i++) {
    const [cr, cg, cb] = ANSI_16_RGB[i]!;
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }
  return new Ansi16Color(ANSI_16_FG[bestIdx]!, ANSI_16_BG[bestIdx]!, ANSI_16_RGB[bestIdx]!);
}

function ansi256to16(code: number): Ansi16Color {
  // Standard colors 0-15 map directly
  if (code < 16) {
    return new Ansi16Color(ANSI_16_FG[code]!, ANSI_16_BG[code]!, ANSI_16_RGB[code]!);
  }
  // For 16-255, convert to approximate RGB first, then to ANSI 16
  if (code < 232) {
    const idx = code - 16;
    const r = Math.round((Math.floor(idx / 36) / 5) * 255);
    const g = Math.round(((Math.floor(idx / 6) % 6) / 5) * 255);
    const b = Math.round(((idx % 6) / 5) * 255);
    return rgbToAnsi16(r, g, b);
  }
  // Grayscale 232-255
  const gray = Math.round(((code - 232) / 23) * 255);
  return rgbToAnsi16(gray, gray, gray);
}

// --- Detect terminal color support ---

function detectColorLevel(): ColorLevel {
  return detectAtlasColorLevel();
}

function detectDarkMode(): boolean {
  return detectDarkBackground();
}

// --- Color level caching ---

let _cachedColorLevel: ColorLevel | undefined;

/** Reset the cached color level so the next access re-detects from env. */
export function resetColorLevelCache(): void {
  _cachedColorLevel = undefined;
}

// --- ANSI 256 → RGB conversion ---

function ansi256ToRgb(code: number): [number, number, number] {
  // 0-15: standard ANSI 16 colors
  if (code < 16) {
    return ANSI_16_RGB[code]!;
  }
  // 16-231: 6×6×6 color cube
  if (code < 232) {
    const idx = code - 16;
    const ri = Math.floor(idx / 36);
    const gi = Math.floor(idx / 6) % 6;
    const bi = idx % 6;
    const r = ri === 0 ? 0 : 55 + ri * 40;
    const g = gi === 0 ? 0 : 55 + gi * 40;
    const b = bi === 0 ? 0 : 55 + bi * 40;
    return [r, g, b];
  }
  // 232-255: grayscale ramp
  const level = 8 + (code - 232) * 10;
  return [level, level, level];
}

// --- Public API ---

export const color = {
  // ANSI 16 standard colors
  black: new Ansi16Color(30, 40, [0, 0, 0]) as Color,
  red: new Ansi16Color(31, 41, [128, 0, 0]) as Color,
  green: new Ansi16Color(32, 42, [0, 128, 0]) as Color,
  yellow: new Ansi16Color(33, 43, [128, 128, 0]) as Color,
  blue: new Ansi16Color(34, 44, [0, 0, 128]) as Color,
  magenta: new Ansi16Color(35, 45, [128, 0, 128]) as Color,
  cyan: new Ansi16Color(36, 46, [0, 128, 128]) as Color,
  white: new Ansi16Color(37, 47, [192, 192, 192]) as Color,

  // ANSI 16 bright colors
  gray: new Ansi16Color(90, 100, [128, 128, 128]) as Color,
  brightRed: new Ansi16Color(91, 101, [255, 0, 0]) as Color,
  brightGreen: new Ansi16Color(92, 102, [0, 255, 0]) as Color,
  brightYellow: new Ansi16Color(93, 103, [255, 255, 0]) as Color,
  brightBlue: new Ansi16Color(94, 104, [0, 0, 255]) as Color,
  brightMagenta: new Ansi16Color(95, 105, [255, 0, 255]) as Color,
  brightCyan: new Ansi16Color(96, 106, [0, 255, 255]) as Color,
  brightWhite: new Ansi16Color(97, 107, [255, 255, 255]) as Color,

  // Reset
  reset: new ResetColor() as Color,

  // Constructors
  ansi(code: number): Color {
    return new Ansi256Color(clamp(code, 0, 255));
  },

  hex(hex: string): Color {
    const [r, g, b] = parseHex(hex);
    return new TrueColor(r, g, b);
  },

  isValid(hex: string): boolean {
    return isValidHex(hex);
  },

  rgb(r: number, g: number, b: number): Color {
    return new TrueColor(r, g, b);
  },

  hsl(h: number, s: number, l: number): Color {
    const [r, g, b] = hslToRgb100(h, s, l);
    return new TrueColor(r, g, b);
  },

  oklab(l: number, a: number, b: number): Color {
    const [rRes, gRes, bRes] = oklabToRgb(l, a, b);
    return new TrueColor(rRes, gRes, bRes);
  },

  oklch(l: number, c: number, h: number): Color {
    const [labL, labA, labB] = oklchToOklab(l, c, h);
    const [rRes, gRes, bRes] = oklabToRgb(labL, labA, labB);
    return new TrueColor(rRes, gRes, bRes);
  },

  adaptive(darkHex: string, lightHex: string): Color {
    const isDark = detectDarkMode();
    return isDark ? color.hex(darkHex) : color.hex(lightHex);
  },

  /** Current terminal color support level (cached after first access) */
  get level(): ColorLevel {
    if (_cachedColorLevel === undefined) {
      _cachedColorLevel = detectColorLevel();
    }
    return _cachedColorLevel;
  },

  // --- Color arithmetic ---

  /** Convert a Color to HSL components [h (0-360), s (0-100), l (0-100)] */
  toHsl(c: Color): [number, number, number] {
    if (!c.rgb) return [0, 0, 0];
    return rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
  },

  /** Darken a color by reducing lightness. amount: 0-100 (percentage points) */
  darken(c: Color, amount: number): Color {
    if (!c.rgb) return c;
    const [h, s, l] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
    const [r, g, b] = hslToRgb100(h, s, Math.max(0, l - amount));
    return new TrueColor(r, g, b);
  },

  /** Lighten a color by increasing lightness. amount: 0-100 (percentage points) */
  lighten(c: Color, amount: number): Color {
    if (!c.rgb) return c;
    const [h, s, l] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
    const [r, g, b] = hslToRgb100(h, s, Math.min(100, l + amount));
    return new TrueColor(r, g, b);
  },

  /** Increase saturation. amount: 0-100 (percentage points) */
  saturate(c: Color, amount: number): Color {
    if (!c.rgb) return c;
    const [h, s, l] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
    const [r, g, b] = hslToRgb100(h, Math.min(100, s + amount), l);
    return new TrueColor(r, g, b);
  },

  /** Decrease saturation. amount: 0-100 (percentage points) */
  desaturate(c: Color, amount: number): Color {
    if (!c.rgb) return c;
    const [h, s, l] = rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]);
    const [r, g, b] = hslToRgb100(h, Math.max(0, s - amount), l);
    return new TrueColor(r, g, b);
  },

  /** Mix two colors. ratio: 0 = all color1, 1 = all color2, 0.5 = equal mix */
  mix(c1: Color, c2: Color, ratio: number = 0.5): Color {
    if (!c1.rgb && !c2.rgb) return c1;
    const rgb1 = c1.rgb ?? ([0, 0, 0] as [number, number, number]);
    const rgb2 = c2.rgb ?? ([0, 0, 0] as [number, number, number]);
    const t = Math.max(0, Math.min(1, ratio));
    return new TrueColor(
      Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
      Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
      Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t),
    );
  },

  // --- Color harmony ---

  /**
   * Return the complementary color (hue rotated 180° in OKLCh).
   * Falls back to the input color if it has no RGB representation.
   */
  complement(c: Color): Color {
    if (!c.rgb) return c;
    const [l, ch, h] = rgbToOklch(c.rgb[0], c.rgb[1], c.rgb[2]);
    const [r, g, b] = oklchToRgb(l, ch, (h + 180) % 360);
    return new TrueColor(r, g, b);
  },

  /**
   * Return a triadic palette: three colors evenly spaced 120° apart in OKLCh.
   * The first element is the input color; the second and third are the two
   * harmonic partners.
   */
  triad(c: Color): [Color, Color, Color] {
    if (!c.rgb) return [c, c, c];
    const [l, ch, h] = rgbToOklch(c.rgb[0], c.rgb[1], c.rgb[2]);
    const make = (offset: number): Color => {
      const [r, g, b] = oklchToRgb(l, ch, (((h + offset) % 360) + 360) % 360);
      return new TrueColor(r, g, b);
    };
    return [c, make(120), make(240)];
  },

  /**
   * Return an analogous palette of `count` colors (default 3) spaced `angle`
   * degrees apart (default 30°) in OKLCh, centered on the input color.
   */
  analogous(c: Color, count: number = 3, angle: number = 30): Color[] {
    if (!c.rgb) return Array(count).fill(c) as Color[];
    const [l, ch, h] = rgbToOklch(c.rgb[0], c.rgb[1], c.rgb[2]);
    const half = Math.floor(count / 2);
    const colors: Color[] = [];
    for (let i = -half; i <= half; i++) {
      if (colors.length >= count) break;
      const newH = (((h + i * angle) % 360) + 360) % 360;
      const [r, g, b] = oklchToRgb(l, ch, newH);
      colors.push(new TrueColor(r, g, b));
    }
    // If count is even we end up with count+1 entries from the loop above;
    // trim the last one so the result is exactly `count` long.
    return colors.slice(0, count);
  },

  // --- Color utilities ---

  /**
   * Convert a color to its grayscale equivalent using luminance weights
   * (ITU-R BT.601: 0.299R + 0.587G + 0.114B).
   */
  toGrayscale(c: Color): Color {
    if (!c.rgb) return c;
    const gray = Math.round(0.299 * c.rgb[0] + 0.587 * c.rgb[1] + 0.114 * c.rgb[2]);
    return new TrueColor(gray, gray, gray);
  },

  /**
   * Invert a color by subtracting each channel from 255.
   */
  invert(c: Color): Color {
    if (!c.rgb) return c;
    return new TrueColor(255 - c.rgb[0], 255 - c.rgb[1], 255 - c.rgb[2]);
  },

  // --- WCAG accessibility ---

  /**
   * Compute the WCAG 2.1 relative luminance of a color (0 = black, 1 = white).
   * Returns 0 for colors without an RGB representation.
   */
  luminance(c: Color): number {
    if (!c.rgb) return 0;
    return relativeLuminance(c.rgb[0], c.rgb[1], c.rgb[2]);
  },

  /**
   * Compute the WCAG 2.1 contrast ratio between a foreground and background
   * color. Returns a value between 1 (no contrast) and 21 (black on white).
   */
  contrastRatio(fg: Color, bg: Color): number {
    const fgLum = relativeLuminance(fg.rgb?.[0] ?? 0, fg.rgb?.[1] ?? 0, fg.rgb?.[2] ?? 0);
    const bgLum = relativeLuminance(bg.rgb?.[0] ?? 0, bg.rgb?.[1] ?? 0, bg.rgb?.[2] ?? 0);
    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    return (lighter + 0.05) / (darker + 0.05);
  },

  /**
   * Check whether a foreground/background pair meets a WCAG contrast level.
   * - 'AA'  requires ≥ 4.5 : 1 for normal text (≥ 3 : 1 for large text)
   * - 'AAA' requires ≥ 7   : 1 for normal text (≥ 4.5 : 1 for large text)
   *
   * @param fg        Foreground color
   * @param bg        Background color
   * @param level     'AA' (default) or 'AAA'
   * @param largeText Whether the text is large (≥ 18pt or ≥ 14pt bold). Default false.
   */
  isAccessible(fg: Color, bg: Color, level: 'AA' | 'AAA' = 'AA', largeText: boolean = false): boolean {
    const ratio = color.contrastRatio(fg, bg);
    if (level === 'AAA') return ratio >= (largeText ? 4.5 : 7);
    return ratio >= (largeText ? 3 : 4.5);
  },

  /**
   * Interpolate between two colors in OKLAB space (perceptually uniform).
   *
   * t = 0 returns `from`, t = 1 returns `to`.
   * OKLAB interpolation avoids the muddy midpoints produced by sRGB mixing —
   * e.g. red→green gives yellow rather than brown.
   *
   * Colors without an RGB representation fall back to their counterpart.
   */
  lerp(from: Color, to: Color, t: number): Color {
    t = Math.max(0, Math.min(1, t));
    if (t === 0) return from;
    if (t === 1) return to;
    const lab1 = from.oklab ?? ([0, 0, 0] as [number, number, number]);
    const lab2 = to.oklab ?? ([0, 0, 0] as [number, number, number]);
    const l = lab1[0] + (lab2[0] - lab1[0]) * t;
    const a = lab1[1] + (lab2[1] - lab1[1]) * t;
    const b = lab1[2] + (lab2[2] - lab1[2]) * t;
    const [r, g, bv] = oklabToRgb(l, a, b);
    return new TrueColor(r, g, bv);
  },

  /**
   * Interpolate between two colors in OKLCh space, taking the shortest hue path.
   *
   * OKLCh interpolation preserves saturation better than OKLAB for highly
   * chromatic colors. t = 0 returns `from`, t = 1 returns `to`.
   */
  lerpOklch(from: Color, to: Color, t: number): Color {
    t = Math.max(0, Math.min(1, t));
    if (t === 0) return from;
    if (t === 1) return to;
    const lch1 = from.oklch ?? ([0, 0, 0] as [number, number, number]);
    const lch2 = to.oklch ?? ([0, 0, 0] as [number, number, number]);
    const l = lch1[0] + (lch2[0] - lch1[0]) * t;
    const c = lch1[1] + (lch2[1] - lch1[1]) * t;
    // Shortest hue path
    let dh = lch2[2] - lch1[2];
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
    let h = lch1[2] + dh * t;
    if (h < 0) h += 360;
    if (h >= 360) h -= 360;
    const [r, g, b] = oklchToRgb(l, c, h);
    return new TrueColor(r, g, b);
  },

  /**
   * A pre-built interpolator function for use with animation libraries.
   *
   * Interpolates between two Colors in OKLAB space. Pass this as the
   * `interpolate` option to aurora/TweenConfig when animating Color values:
   *
   * ```ts
   * import { color } from '@celestial/corona';
   * tween({ from: startColor, to: endColor, interpolate: color.interpolator })
   * ```
   */
  interpolator(from: Color, to: Color, t: number): Color {
    return color.lerp(from, to, t);
  },

  /**
   * Convert a Color or hex string to an OKLCH tuple [l, c, h].
   * Returns null if the color has no RGB representation.
   */
  toOklch(c: Color | string): [number, number, number] | null {
    if (typeof c === 'string') {
      const rgb = parseHex(c);
      return rgbToOklch(rgb[0], rgb[1], rgb[2]);
    }
    return c.oklch;
  },

  /**
   * Create a Color from an OKLCH tuple [l, c, h].
   * Tuple-based alternative to `color.oklch(l, c, h)`.
   */
  fromOklch(tuple: [number, number, number]): Color {
    const [r, g, b] = oklchToRgb(tuple[0], tuple[1], tuple[2]);
    return new TrueColor(r, g, b);
  },

  /**
   * Adjust a color in OKLCH space by adding relative offsets.
   * Lightness is clamped to [0, 1], chroma to [0, +Inf), hue wraps 0-360.
   * Returns the input unchanged if it has no RGB representation.
   */
  adjustOklch(c: Color, adj: { l?: number; c?: number; h?: number }): Color {
    if (!c.rgb) return c;
    const [l, ch, h] = rgbToOklch(c.rgb[0], c.rgb[1], c.rgb[2]);
    const newL = Math.max(0, Math.min(1, l + (adj.l ?? 0)));
    const newC = Math.max(0, ch + (adj.c ?? 0));
    const newH = (((h + (adj.h ?? 0)) % 360) + 360) % 360;
    const [r, g, b] = oklchToRgb(newL, newC, newH);
    return new TrueColor(r, g, b);
  },

  /** Parse an ANSI escape sequence string back into a Color object */
  fromAnsi(ansi: string): Color | null {
    if (!ansi) return null;

    // Match the parameter string between \x1b[ and m
    const match = ansi.match(/\x1b\[([0-9;]+)m/);
    if (!match) return null;

    const params = match[1]!.split(';').map(Number);

    // Truecolor: 38;2;R;G;B (FG) or 48;2;R;G;B (BG)
    if (params.length === 5 && (params[0] === 38 || params[0] === 48) && params[1] === 2) {
      return new TrueColor(params[2]!, params[3]!, params[4]!);
    }

    // 256-color: 38;5;N (FG) or 48;5;N (BG)
    if (params.length === 3 && (params[0] === 38 || params[0] === 48) && params[1] === 5) {
      const [r, g, b] = ansi256ToRgb(params[2]!);
      return new TrueColor(r, g, b);
    }

    // Single-code sequences
    if (params.length === 1) {
      const code = params[0]!;

      // Reset FG/BG
      if (code === 39 || code === 49) return color.reset;

      // Standard FG: 30-37
      if (code >= 30 && code <= 37) {
        const [r, g, b] = ANSI_16_RGB[code - 30]!;
        return new TrueColor(r, g, b);
      }

      // Bright FG: 90-97
      if (code >= 90 && code <= 97) {
        const [r, g, b] = ANSI_16_RGB[code - 90 + 8]!;
        return new TrueColor(r, g, b);
      }

      // Standard BG: 40-47
      if (code >= 40 && code <= 47) {
        const [r, g, b] = ANSI_16_RGB[code - 40]!;
        return new TrueColor(r, g, b);
      }

      // Bright BG: 100-107
      if (code >= 100 && code <= 107) {
        const [r, g, b] = ANSI_16_RGB[code - 100 + 8]!;
        return new TrueColor(r, g, b);
      }
    }

    return null;
  },
};

// --- Named hue anchors and accent-mix helper ---

/**
 * Perceptually balanced OKLCh anchors used to bias the theme accent toward a
 * named hue. Picked to read clearly on both light and dark surfaces.
 */
export const HUE_ANCHORS = {
  red: color.oklch(0.65, 0.22, 25),
  amber: color.oklch(0.78, 0.18, 80),
  green: color.oklch(0.72, 0.16, 150),
  cyan: color.oklch(0.74, 0.13, 200),
  blue: color.oklch(0.65, 0.18, 250),
  violet: color.oklch(0.65, 0.2, 290),
  pink: color.oklch(0.72, 0.2, 340),
} as const;

export type HueName = keyof typeof HUE_ANCHORS;

/**
 * Mix the theme accent toward a named hue anchor in OKLCh space.
 *
 * Use this instead of `color.mix(theme.accent, color.hex('#…'), ratio)` —
 * the OKLCh anchor stays perceptually balanced on light and dark themes alike.
 * `ratio = 0` returns the theme accent; `ratio = 1` returns the anchor.
 */
export function accentMix(theme: SemanticTheme, hue: HueName, ratio: number = 0.3): Color {
  return color.lerpOklch(theme.colors.tones.accent, HUE_ANCHORS[hue], ratio);
}

/**
 * Format a `Color` as a `#rrggbb` lowercase hex string. Returns `#000000`
 * when the color has no truecolor representation (e.g. ANSI 16/256 with no rgb).
 */
export function colorToHex(c: Color): string {
  const rgb = c.rgb;
  if (!rgb) return '#000000';
  const hex = (n: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return v.toString(16).padStart(2, '0');
  };
  return `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`;
}

/**
 * Structural duck-type check for a corona `Color`. Verifies the value is an
 * object exposing `fg`/`bg` as functions and an `rgb` field that is either
 * `null` (ANSI-only color) or a 3-tuple. Useful for filtering domain-token
 * resolutions that may carry non-Color payloads (e.g. `ActivityDescriptor`).
 */
export function isColorLike(value: unknown): value is Color {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { fg?: unknown; bg?: unknown; rgb?: unknown };
  if (typeof candidate.fg !== 'function' || typeof candidate.bg !== 'function') return false;
  return candidate.rgb === null || (Array.isArray(candidate.rgb) && candidate.rgb.length === 3);
}
