import { type Color, color } from '../color.js';
import type {
  ColorScale,
  ElevationLevel,
  ElevationToken,
  InteractionState,
  MotionDuration,
  MotionEasing,
  MotionSpring,
  OverlayTokens,
  StateToken,
  ThemeColors,
  ThemeElevation,
  ThemeInput,
  ThemeMotion,
  ThemeStates,
  ThemeTypography,
  Tone,
  TypographyToken,
} from './types.js';

export function isLightThemeColor(value: Color): boolean {
  return color.luminance(value) > 0.6;
}

export function emphasizeSurface(surface: Color, amount: number): Color {
  const target = isLightThemeColor(surface) ? color.hex('#000000') : color.hex('#ffffff');
  return color.mix(surface, target, amount);
}

export function computeTypography(colors: ThemeColors): ThemeTypography {
  return {
    heading: { color: colors.text, bold: true },
    title: { color: colors.text, bold: true },
    subtitle: { color: colors.textSoft },
    body: { color: colors.text },
    // Captions frequently carry keyboard instructions and other essential
    // help. Keep them visually secondary through color, never terminal dim.
    caption: { color: colors.muted },
    overline: { color: colors.muted, bold: true },
    code: { color: colors.text },
    label: { color: colors.muted, bold: true },
    link: { color: colors.tones.accent, underline: true },
    error: { color: colors.tones.danger },
    warning: { color: colors.tones.warning },
    success: { color: colors.tones.success },
  };
}

export function computeStates(colors: ThemeColors, scales: Record<Tone, ColorScale>): ThemeStates {
  const hoverBg = emphasizeSurface(colors.surface, 0.12);
  const activeBg = emphasizeSurface(colors.surface, 0.2);
  const readonlyBg = emphasizeSurface(colors.surface, 0.04);
  return {
    hover: { fg: colors.text, bg: hoverBg },
    focus: { fg: colors.text, border: scales.accent[400], bold: true },
    active: { fg: colors.text, bg: activeBg },
    disabled: { fg: colors.muted, dim: true },
    selected: { fg: colors.text, bg: hoverBg, bold: true },
    error: { fg: scales.danger[400], border: scales.danger[400] },
    loading: { fg: colors.muted, dim: true },
    readonly: { fg: colors.textSoft, bg: readonlyBg },
  };
}

export function computeElevation(colors: ThemeColors): ThemeElevation {
  const floatingSurface = emphasizeSurface(colors.surfaceRaised, isLightThemeColor(colors.surfaceRaised) ? 0.04 : 0.06);
  const modalSurface = emphasizeSurface(colors.surfaceRaised, isLightThemeColor(colors.surfaceRaised) ? 0.1 : 0.12);

  return {
    flat: { elevation: 0, surface: colors.surface, border: colors.border, borderStyle: 'none' },
    raised: { elevation: 1, surface: colors.surfaceRaised, border: colors.border, borderStyle: 'single' },
    floating: { elevation: 4, surface: floatingSurface, border: colors.borderHover, borderStyle: 'rounded', effects: { glass: true, opacity: 0.95 } },
    overlay: { elevation: 8, surface: colors.backdrop, border: colors.borderActive, borderStyle: 'rounded', effects: { glass: true, opacity: 0.9 } },
    modal: { elevation: 16, surface: modalSurface, border: colors.borderActive, borderStyle: 'double', effects: { glass: true, opacity: 0.85 } },
  };
}

export function mergeTypography(defaults: ThemeTypography, overrides?: Partial<Record<keyof ThemeTypography, Partial<TypographyToken>>>): ThemeTypography {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof ThemeTypography)[]) {
    if (overrides[key]) {
      result[key] = { ...defaults[key], ...overrides[key] } as TypographyToken;
    }
  }
  return result;
}

export function mergeStates(defaults: ThemeStates, overrides?: Partial<Record<InteractionState, Partial<StateToken>>>): ThemeStates {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as InteractionState[]) {
    if (overrides[key]) {
      result[key] = { ...defaults[key], ...overrides[key] } as StateToken;
    }
  }
  return result;
}

export function mergeElevation(defaults: ThemeElevation, overrides?: Partial<Record<ElevationLevel, Partial<ElevationToken>>>): ThemeElevation {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as ElevationLevel[]) {
    if (overrides[key]) {
      result[key] = { ...defaults[key], ...overrides[key] } as ElevationToken;
    }
  }
  return result;
}

export function mergeMotion(
  defaults: ThemeMotion,
  overrides?: Partial<{
    duration: Partial<MotionDuration>;
    easing: Partial<MotionEasing>;
    spring: Partial<MotionSpring>;
    reduceMotion: boolean;
  }>,
): ThemeMotion {
  if (!overrides) return defaults;
  return {
    duration: { ...defaults.duration, ...overrides.duration },
    easing: { ...defaults.easing, ...overrides.easing },
    spring: { ...defaults.spring, ...overrides.spring },
    reduceMotion: overrides.reduceMotion ?? defaults.reduceMotion,
  };
}

export function mergeOverlay(defaults: OverlayTokens, overrides?: ThemeInput['overlay']): OverlayTokens {
  if (!overrides) return defaults;
  return {
    backdropDim: overrides.backdropDim ?? defaults.backdropDim,
    inset: {
      header: {
        left: overrides.inset?.header?.left ?? defaults.inset.header.left,
        right: overrides.inset?.header?.right ?? defaults.inset.header.right,
      },
      body: {
        left: overrides.inset?.body?.left ?? defaults.inset.body.left,
        right: overrides.inset?.body?.right ?? defaults.inset.body.right,
      },
      footer: {
        left: overrides.inset?.footer?.left ?? defaults.inset.footer.left,
        right: overrides.inset?.footer?.right ?? defaults.inset.footer.right,
      },
    },
  };
}
