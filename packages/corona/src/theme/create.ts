import { type Color, color } from '../color.js';
import { normalizeThemeContrast } from '../a11y.js';
import { resolveGlyphs } from '../glyphs.js';
import { generateScales } from './color-scales.js';
import {
  DARK_BORDER_FALLBACK,
  DARK_INVERSE_FALLBACK,
  DARK_MUTED_FALLBACK,
  DARK_TEXT_FALLBACK,
  DARK_TONE_FALLBACKS,
  DEFAULT_COLORS,
  DEFAULT_GLYPHS,
  DEFAULT_MOTION,
  DEFAULT_OVERLAY,
  DEFAULT_SPACING,
  LIGHT_BORDER_FALLBACK,
  LIGHT_INVERSE_FALLBACK,
  LIGHT_MUTED_FALLBACK,
  LIGHT_TEXT_FALLBACK,
  LIGHT_TONE_FALLBACKS,
} from './defaults.js';
import {
  computeElevation,
  computeStates,
  computeTypography,
  isLightThemeColor,
  mergeElevation,
  mergeMotion,
  mergeOverlay,
  mergeStates,
  mergeTypography,
} from './derived.js';
import { attachThemeMetadata, getStoredThemeInput, mergeThemeInputs, snapshotThemeInput } from './input.js';
import type { ColorScale, SemanticTheme, ThemeColors, ThemeInput, ThemeVariant, Tone } from './types.js';

/**
 * Derive enriched color tokens from base tokens when not explicitly provided.
 * This keeps createTheme() calls with only the original color fields fully
 * populated with the newer semantic ThemeColors shape.
 */
function deriveEnrichedColors(
  base: Partial<Omit<ThemeColors, 'tones'>>,
  explicit: Partial<Omit<ThemeColors, 'tones'>> | undefined,
  tones: Record<Tone, Color>,
): ThemeColors {
  const surface = base.surface ?? DEFAULT_COLORS.surface;
  const explicitSurface = explicit?.surface;
  const surfaceIsLight = isLightThemeColor(surface);
  const text = explicit?.text ?? (explicitSurface ? (surfaceIsLight ? LIGHT_TEXT_FALLBACK : DARK_TEXT_FALLBACK) : (base.text ?? DEFAULT_COLORS.text));
  const muted = explicit?.muted ?? (explicitSurface ? (surfaceIsLight ? LIGHT_MUTED_FALLBACK : DARK_MUTED_FALLBACK) : (base.muted ?? DEFAULT_COLORS.muted));
  const border =
    explicit?.border ?? (explicitSurface ? (surfaceIsLight ? LIGHT_BORDER_FALLBACK : DARK_BORDER_FALLBACK) : (base.border ?? DEFAULT_COLORS.border));
  const inverse =
    explicit?.inverse ?? (explicitSurface ? (surfaceIsLight ? LIGHT_INVERSE_FALLBACK : DARK_INVERSE_FALLBACK) : (base.inverse ?? DEFAULT_COLORS.inverse));
  const borderIsLight = isLightThemeColor(border);

  return {
    text,
    textSoft: explicit?.textSoft ?? color.mix(text, muted, 0.4),
    muted,

    bg: explicit?.bg ?? color.mix(surface, color.hex('#000000'), surfaceIsLight ? 0.04 : 0.15),
    surface,
    surfaceAlt: explicit?.surfaceAlt ?? color.mix(surface, color.hex('#000000'), surfaceIsLight ? 0.06 : 0.05),
    surfaceRaised: explicit?.surfaceRaised ?? color.mix(surface, surfaceIsLight ? color.hex('#000000') : color.hex('#ffffff'), surfaceIsLight ? 0.1 : 0.08),
    backdrop: explicit?.backdrop ?? color.mix(surface, color.hex('#000000'), surfaceIsLight ? 0.18 : 0.3),
    inverse,

    border,
    borderHover: explicit?.borderHover ?? (borderIsLight ? color.mix(border, color.hex('#000000'), 0.25) : color.lighten(border, 15)),
    borderActive: explicit?.borderActive ?? tones.accent,
    divider: explicit?.divider ?? border,

    highlight: explicit?.highlight ?? tones.accent,
    interactive: explicit?.interactive ?? tones.accent,
    focusRing: explicit?.focusRing ?? tones.accent,
    trackFill: explicit?.trackFill ?? tones.accent,
    cursor: explicit?.cursor ?? tones.accent,
    linkColor: explicit?.linkColor ?? tones.accent,
    placeholder: explicit?.placeholder ?? muted,

    tones,
  };
}

/**
 * Create a `SemanticTheme` by deep-merging caller overrides onto `defaultTheme`.
 * Only the fields you specify are replaced; everything else inherits from the
 * default.
 */
export function createTheme(input: ThemeInput = {}): SemanticTheme {
  const fallbackTones = input.colors?.surface ? (isLightThemeColor(input.colors.surface) ? LIGHT_TONE_FALLBACKS : DARK_TONE_FALLBACKS) : DEFAULT_COLORS.tones;
  const tones = {
    ...fallbackTones,
    ...input.colors?.tones,
  };
  // A default construction must be byte-for-byte token-equivalent to
  // `defaultTheme`. Re-deriving already-authored defaults introduces subtle
  // drift (notably raised surfaces and textSoft), which makes components vary
  // depending on whether they received an explicit theme object.
  const colors = input.colors
    ? deriveEnrichedColors({ ...DEFAULT_COLORS, ...input.colors }, input.colors, tones)
    : { ...DEFAULT_COLORS, tones: { ...DEFAULT_COLORS.tones } };
  const scales: Record<Tone, ColorScale> = generateScales(colors.tones);
  const result: SemanticTheme = {
    colors,
    spacing: {
      ...DEFAULT_SPACING,
      ...input.spacing,
    },
    glyphs: {
      ...(input.unicodeLevel ? resolveGlyphs(input.unicodeLevel) : DEFAULT_GLYPHS),
      ...input.glyphs,
    },
    scales,
    typography: mergeTypography(computeTypography(colors), input.typography),
    states: mergeStates(computeStates(colors, scales), input.states),
    elevation: mergeElevation(computeElevation(colors), input.elevation),
    motion: mergeMotion(DEFAULT_MOTION, input.motion),
    overlay: mergeOverlay(DEFAULT_OVERLAY, input.overlay),
    responsiveTypography: input.responsiveTypography ?? undefined,
  };
  const safeTheme =
    input.contrast?.enforce === false
      ? result
      : normalizeThemeContrast(result, {
          minimum: input.contrast?.minimum,
          graphicalMinimum: input.contrast?.graphicalMinimum,
          surfaceMinimum: input.contrast?.surfaceMinimum,
        });
  return attachThemeMetadata(safeTheme, input);
}

/**
 * Extend an existing theme with partial overrides while recomputing derived
 * layers (scales, typography, states, elevation) from the merged result.
 */
export function extendTheme(base: SemanticTheme, overrides: ThemeInput = {}): SemanticTheme {
  const baseInput = getStoredThemeInput(base) ?? snapshotThemeInput(base);
  return createTheme(mergeThemeInputs(baseInput, overrides));
}

/** Apply a variant's overrides onto a base theme, producing a new theme. */
export function applyVariant(base: SemanticTheme, variant: ThemeVariant): SemanticTheme {
  return extendTheme(base, variant.input);
}
