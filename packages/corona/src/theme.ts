/**
 * Corona Theme System
 *
 * This facade preserves the historical `./theme.js` import path while the
 * implementation lives in cohesive modules under `./theme/`.
 */

export { theme } from './theme/bag.js';
export { generateScale } from './theme/color-scales.js';
export { applyVariant, createTheme, extendTheme } from './theme/create.js';
export { defaultTheme } from './theme/defaults.js';
export { interpolateTheme } from './theme/interpolation.js';
export { resolveScale, resolveSpacing, resolveToneColor, spacingGap, spacingScale } from './theme/resolvers.js';
export { DEFAULT_RESPONSIVE_TYPOGRAPHY, toResponsiveTypography, typographyStyle } from './theme/responsive-typography.js';
export type {
  ColorScale,
  ElevationBorderStyle,
  ElevationLevel,
  ElevationToken,
  InteractionState,
  MotionDuration,
  MotionEasing,
  MotionEasingFn,
  MotionSpring,
  MotionSpringPreset,
  OverlayInsetTokens,
  OverlaySectionInset,
  OverlayTokens,
  ResponsiveTypographyToken,
  ScaleStep,
  SemanticTheme,
  Size,
  StateToken,
  Theme,
  ThemeColors,
  ThemeContrastPolicy,
  ThemeElevation,
  ThemeGlyphs,
  ThemeInput,
  ThemeMotion,
  ThemeStates,
  ThemeTypography,
  ThemeVariant,
  Tone,
  TypographyToken,
} from './theme/types.js';
export { SCALE_STEPS } from './theme/types.js';
export { darkVariant, defineThemeVariant, highContrastVariant, lightVariant } from './theme/variants.js';
