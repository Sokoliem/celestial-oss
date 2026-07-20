/**
 * Constellation Theme — thin wrapper around corona's canonical theme system.
 *
 * All theme types, defaults, and resolution functions are re-exported from
 * @celestial/core/corona. Constellation adds only component-specific style helpers
 * (resolveTextStyle, resolveMutedStyle, resolveBorderStyle) and backward-
 * compatible type aliases for the deprecated Constellation* names.
 */

import {
  type Color,
  type ColorScale,
  color,
  resolveSpacing as coronaResolveSpacing,
  resolveToneColor as coronaResolveToneColor,
  createTheme,
  defaultTheme,
  resolveComponentTokens,
  type SemanticTheme,
  type Size,
  type StateToken,
  type Style,
  type StyleProps,
  style,
  type ThemeInput,
  type TokenContract,
  type Tone,
  type TypographyToken,
} from '@celestial/core/corona';
import type { ThemeContext } from '@celestial/core/nebula';

// ─── Backward-compatible type aliases ───────────────────────────────────────

/** @deprecated Use `Tone` from `@celestial/core/corona` */
export type ConstellationTone = Tone;
/** @deprecated Use `Size` from `@celestial/core/corona` */
export type ConstellationSize = Size;
/** @deprecated Use `SemanticTheme` from `@celestial/core/corona` */
export type ConstellationTheme = SemanticTheme;
/** @deprecated Use `ThemeInput` from `@celestial/core/corona` */
export type ConstellationThemeInput = ThemeInput;

export interface ConstellationThemedOptions {
  size?: Size;
  tone?: Tone;
  theme?: ThemeInput;
}

// ─── Re-exports (same API as before) ───────────────────────────────────────

export const defaultConstellationTheme = defaultTheme;

/** @deprecated Use `createTheme` from `@celestial/core/corona` */
export const createConstellationTheme = createTheme;

/** @deprecated Use `createTheme` from `@celestial/core/corona` */
export const resolveConstellationTheme = createTheme;

export function resolveToneColor(themeOrInput: SemanticTheme | ThemeInput | undefined, tone: Tone = 'neutral') {
  return coronaResolveToneColor(themeOrInput, tone);
}

export function resolveSpacing(size: Size = 'md', themeOrInput?: SemanticTheme | ThemeInput): number {
  return coronaResolveSpacing(size, themeOrInput);
}

// ─── Constellation-specific style helpers ───────────────────────────────────

export function resolveTextStyle(themeOrInput: SemanticTheme | ThemeInput | undefined, tone: Tone = 'neutral', overrides: Partial<StyleProps> = {}): Style {
  const theme = createTheme(themeOrInput as ThemeInput | undefined);
  const resolvedTone = tone === 'neutral' ? theme.colors.text : theme.colors.tones[tone];
  return style({ color: resolvedTone, ...overrides });
}

export function resolveMutedStyle(themeOrInput: SemanticTheme | ThemeInput | undefined, overrides: Partial<StyleProps> = {}): Style {
  const theme = createTheme(themeOrInput as ThemeInput | undefined);
  return style({ color: theme.colors.muted, ...overrides });
}

export function resolveBorderStyle(themeOrInput: SemanticTheme | ThemeInput | undefined, tone: Tone = 'neutral', overrides: Partial<StyleProps> = {}): Style {
  const theme = createTheme(themeOrInput as ThemeInput | undefined);
  const borderColor = tone === 'neutral' ? theme.colors.border : theme.colors.tones[tone];
  return style({ color: borderColor, ...overrides });
}

export function clampWidth(width: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(width ?? fallback));
}

// ─── Token resolution bridge ──────────────────────────────────────────────

export type { StateToken, TokenContract, TypographyToken } from '@celestial/core/corona';
export type { ThemeContext } from '@celestial/core/nebula';

/**
 * Resolve a component's token contract against the current theme.
 *
 * Call inside `view()` to enable reactive theme updates — reading
 * `config.themeCtx.current()` auto-tracks the signal dependency.
 *
 * Falls back through: themeCtx signal → static theme input → defaultTheme.
 */
export function useTokens<T>(contract: TokenContract<T>, config: { themeCtx?: ThemeContext; theme?: ThemeInput }, componentName: string): T {
  const theme = config.themeCtx?.current() ?? createTheme(config.theme);
  return resolveComponentTokens(contract, theme, componentName);
}

/**
 * Resolve the current SemanticTheme from a component's config.
 *
 * Use alongside `useTokens()` when a component needs the full theme
 * (e.g., for variant → tone color lookup). Both functions read the same
 * signal, so both are reactive when `themeCtx` is provided.
 */
export function resolveTheme(config: { themeCtx?: ThemeContext; theme?: ThemeInput }): SemanticTheme {
  return config.themeCtx?.current() ?? createTheme(config.theme);
}

export function resolveAnimatedBorderColor(theme: SemanticTheme, resting: Color, emphasis: Color, tick: number, maxMix: number = 0.22): Color {
  if (theme.motion.reduceMotion) {
    return resting;
  }

  const cycle = (tick % 24) / 24;
  const wave = 0.5 - Math.cos(cycle * Math.PI * 2) * 0.5;
  const eased = theme.motion.easing.default(wave);
  return color.lerpOklch(resting, emphasis, Math.min(0.08 + eased * maxMix, 0.38));
}

/**
 * Resolve a color scale for a given tone from the current theme.
 * Scales provide 7-step color ramps (50/100/200/400/600/800/900)
 * for creating tints and shades of semantic tone colors.
 */
export function resolveScale(config: { themeCtx?: ThemeContext; theme?: ThemeInput }, tone: Tone): ColorScale {
  const theme = resolveTheme(config);
  return theme.scales[tone];
}

export type { ColorScale } from '@celestial/core/corona';

// ─── Typography & State helpers ─────────────────────────────────────────

/**
 * Convert a TypographyToken into a Style for use with text elements.
 * Applies color, bold, italic, dim, and underline from the token.
 * Optional overrides merge on top of token values.
 */
export function applyTypography(token: TypographyToken, overrides?: Partial<StyleProps>): Style {
  return style({
    color: token.color,
    bold: token.bold,
    italic: token.italic,
    dim: token.dim,
    underline: token.underline,
    ...overrides,
  });
}

/**
 * Convert a StateToken into a Style for use with interactive elements.
 * Applies fg as color, optional bg/border, and style flags.
 * Optional overrides merge on top of token values.
 */
export function applyState(token: StateToken, overrides?: Partial<StyleProps>): Style {
  return style({
    color: token.fg,
    background: token.bg,
    borderColor: token.border,
    bold: token.bold,
    dim: token.dim,
    underline: token.underline,
    ...overrides,
  });
}
