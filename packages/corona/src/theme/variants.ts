import { color } from '../color.js';
import type { ThemeInput, ThemeVariant } from './types.js';

/** Define a named theme variant from partial overrides. */
export function defineThemeVariant(name: string, input: ThemeInput): ThemeVariant {
  return { name, input };
}

/** Dark mode variant: forces dark colors regardless of terminal detection. */
export const darkVariant: ThemeVariant = defineThemeVariant('dark', {
  colors: {
    text: color.hex('#dbe4ff'),
    textSoft: color.hex('#b0bec5'),
    muted: color.hex('#94a3b8'),

    bg: color.hex('#0a0f14'),
    surface: color.hex('#0f172a'),
    surfaceAlt: color.hex('#131d2e'),
    surfaceRaised: color.hex('#1a2538'),
    backdrop: color.hex('#060a0f'),
    inverse: color.hex('#ffffff'),

    border: color.hex('#334155'),
    borderHover: color.hex('#475569'),
    borderActive: color.hex('#60a5fa'),
    divider: color.hex('#334155'),

    tones: {
      neutral: color.hex('#a5b4fc'),
      accent: color.hex('#60a5fa'),
      info: color.hex('#38bdf8'),
      success: color.hex('#34d399'),
      warning: color.hex('#fbbf24'),
      danger: color.hex('#f87171'),
    },
  },
  typography: {
    caption: { dim: true },
    code: { bold: true },
  },
  states: {
    selected: { bold: true },
  },
});

/** Light mode variant: forces light colors regardless of terminal detection. */
export const lightVariant: ThemeVariant = defineThemeVariant('light', {
  colors: {
    text: color.hex('#0f172a'),
    textSoft: color.hex('#475569'),
    muted: color.hex('#57647a'),
    placeholder: color.hex('#57647a'),

    bg: color.hex('#f8f6f3'),
    surface: color.hex('#ffffff'),
    surfaceAlt: color.hex('#f0eee9'),
    surfaceRaised: color.hex('#e8e5e0'),
    backdrop: color.hex('#d8d5d0'),
    inverse: color.hex('#0f172a'),

    border: color.hex('#cbd5e1'),
    borderHover: color.hex('#64748b'),
    borderActive: color.hex('#1d4ed8'),
    divider: color.hex('#e2e8f0'),

    tones: {
      neutral: color.hex('#1e293b'),
      accent: color.hex('#1d4ed8'),
      info: color.hex('#0369a1'),
      success: color.hex('#047857'),
      warning: color.hex('#b45309'),
      danger: color.hex('#b91c1c'),
    },
  },
  typography: {
    heading: { bold: true },
    caption: { dim: true },
    label: { bold: true },
  },
  states: {
    focus: { bold: true },
    disabled: { dim: true },
  },
});

/** High contrast variant: maximum readability, WCAG AAA compliant. */
export const highContrastVariant: ThemeVariant = defineThemeVariant('high-contrast', {
  colors: {
    text: color.hex('#ffffff'),
    textSoft: color.hex('#d4d4d8'),
    muted: color.hex('#a1a1aa'),

    bg: color.hex('#000000'),
    surface: color.hex('#000000'),
    surfaceAlt: color.hex('#0a0a0a'),
    surfaceRaised: color.hex('#1a1a1a'),
    backdrop: color.hex('#000000'),
    inverse: color.hex('#000000'),

    border: color.hex('#a1a1aa'),
    borderHover: color.hex('#d4d4d8'),
    borderActive: color.hex('#93c5fd'),
    divider: color.hex('#a1a1aa'),

    tones: {
      neutral: color.hex('#e4e4e7'),
      accent: color.hex('#93c5fd'),
      info: color.hex('#7dd3fc'),
      success: color.hex('#6ee7b7'),
      warning: color.hex('#fcd34d'),
      danger: color.hex('#fca5a5'),
    },
  },
  typography: {
    heading: { bold: true, underline: true },
    title: { bold: true, underline: true },
    caption: { dim: false },
    label: { bold: true },
    link: { underline: true, bold: true },
  },
  states: {
    focus: { bold: true, underline: true },
    disabled: { dim: false },
    selected: { bold: true, underline: true },
  },
});
