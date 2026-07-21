import { normalizeThemeContrast, reduceMotion } from '../a11y.js';
import { type Color, color } from '../color.js';
import { generateScales } from './color-scales.js';
import { computeElevation, computeStates, computeTypography } from './derived.js';
import { attachThemeMetadata } from './input.js';
import type { OverlayTokens, SemanticTheme, Size, ThemeColors, ThemeGlyphs, ThemeMotion, Tone } from './types.js';

/**
 * Default semantic theme colors use `color.adaptive()` so all values
 * automatically adapt to dark vs light terminal backgrounds.
 */
export const DEFAULT_COLORS: ThemeColors = {
  text: color.adaptive('#dbe4ff', '#0f172a'),
  textSoft: color.adaptive('#b0bec5', '#475569'),
  muted: color.adaptive('#94a3b8', '#64748b'),

  bg: color.adaptive('#0a0f14', '#f8f6f3'),
  surface: color.adaptive('#0f172a', '#ffffff'),
  surfaceAlt: color.adaptive('#131d2e', '#f0eee9'),
  surfaceRaised: color.adaptive('#1a2538', '#e8e5e0'),
  backdrop: color.adaptive('#060a0f', '#d8d5d0'),
  inverse: color.adaptive('#0f172a', '#ffffff'),

  border: color.adaptive('#334155', '#cbd5e1'),
  borderHover: color.adaptive('#475569', '#64748b'),
  borderActive: color.adaptive('#60a5fa', '#1d4ed8'),
  divider: color.adaptive('#334155', '#cbd5e1'),

  highlight: color.adaptive('#60a5fa', '#1d4ed8'),
  interactive: color.adaptive('#60a5fa', '#1d4ed8'),
  focusRing: color.adaptive('#60a5fa', '#1d4ed8'),
  trackFill: color.adaptive('#60a5fa', '#1d4ed8'),
  cursor: color.adaptive('#60a5fa', '#1d4ed8'),
  linkColor: color.adaptive('#60a5fa', '#1d4ed8'),
  placeholder: color.adaptive('#94a3b8', '#64748b'),

  tones: {
    neutral: color.adaptive('#a5b4fc', '#1e293b'),
    accent: color.adaptive('#60a5fa', '#1d4ed8'),
    info: color.adaptive('#38bdf8', '#0369a1'),
    success: color.adaptive('#34d399', '#047857'),
    warning: color.adaptive('#fbbf24', '#b45309'),
    danger: color.adaptive('#f87171', '#b91c1c'),
  },
};

export const DEFAULT_GLYPHS: ThemeGlyphs = {
  divider: '─',
  bullet: '•',
  keycapLeft: '[',
  keycapRight: ']',
  tagPrefix: '#',
  selected: '▸',
  unselected: '○',
  menuArrow: '▾',
  checked: '◉',
  unchecked: '○',
  radioOn: '◉',
  radioOff: '○',
  pipe: '│',
  ellipsis: '…',
  pointer: '▸',
  doubleArrowH: '⇄',
  doubleArrowV: '⇅',
  cornerTL: '╭',
  cornerTR: '╮',
  cornerBL: '╰',
  cornerBR: '╯',
};

export const DEFAULT_SPACING: Record<Size, number> = { none: 0, xs: 1, sm: 1, md: 2, lg: 3, xl: 4, '2xl': 12 };

export const DEFAULT_SCALES = generateScales(DEFAULT_COLORS.tones);

/**
 * Default overlay chrome tokens. `backdropDim: 0.7` preserves the historic
 * wrapper backdrop dim factor; all section insets default to a one-cell
 * horizontal pad.
 */
export const DEFAULT_OVERLAY: OverlayTokens = {
  backdropDim: 0.7,
  inset: {
    header: { left: 1, right: 1 },
    body: { left: 1, right: 1 },
    footer: { left: 1, right: 1 },
  },
};

export const DEFAULT_MOTION: ThemeMotion = {
  duration: {
    instant: 0,
    fast: 100,
    normal: 200,
    slow: 400,
    glacial: 800,
    backdrop: 240,
  },
  easing: {
    default: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    entrance: (t: number) => 1 - (1 - t) ** 3,
    exit: (t: number) => t ** 3,
    emphasis: (t: number) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    },
  },
  spring: {
    default: { stiffness: 400, damping: 25 },
    responsive: { stiffness: 500, damping: 30 },
    gentle: { stiffness: 120, damping: 14 },
    bouncy: { stiffness: 300, damping: 10 },
  },
  reduceMotion: reduceMotion(),
};

export const DARK_TEXT_FALLBACK = color.hex('#dbe4ff');
export const DARK_MUTED_FALLBACK = color.hex('#94a3b8');
export const DARK_BORDER_FALLBACK = color.hex('#334155');
export const DARK_INVERSE_FALLBACK = color.hex('#ffffff');

export const LIGHT_TEXT_FALLBACK = color.hex('#0f172a');
export const LIGHT_MUTED_FALLBACK = color.hex('#64748b');
export const LIGHT_BORDER_FALLBACK = color.hex('#cbd5e1');
export const LIGHT_INVERSE_FALLBACK = color.hex('#0f172a');

export const DARK_TONE_FALLBACKS: Record<Tone, Color> = {
  neutral: color.hex('#a5b4fc'),
  accent: color.hex('#60a5fa'),
  info: color.hex('#38bdf8'),
  success: color.hex('#34d399'),
  warning: color.hex('#fbbf24'),
  danger: color.hex('#f87171'),
};

export const LIGHT_TONE_FALLBACKS: Record<Tone, Color> = {
  neutral: color.hex('#1e293b'),
  accent: color.hex('#1d4ed8'),
  info: color.hex('#0369a1'),
  success: color.hex('#047857'),
  warning: color.hex('#b45309'),
  danger: color.hex('#b91c1c'),
};

export const defaultTheme: SemanticTheme = attachThemeMetadata(
  normalizeThemeContrast({
    colors: DEFAULT_COLORS,
    spacing: DEFAULT_SPACING,
    glyphs: DEFAULT_GLYPHS,
    unicodeLevel: 'wide',
    scales: DEFAULT_SCALES,
    typography: computeTypography(DEFAULT_COLORS),
    states: computeStates(DEFAULT_COLORS, DEFAULT_SCALES),
    elevation: computeElevation(DEFAULT_COLORS),
    motion: DEFAULT_MOTION,
    overlay: DEFAULT_OVERLAY,
  }),
  {},
);
