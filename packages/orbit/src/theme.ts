import { type Color, createTheme, defaultTheme, resolveToneColor, type SemanticTheme, type ThemeInput, type Tone } from '@celestial/corona';
import type { ThemeContext } from '@celestial/nebula';

/**
 * Shared themed-config slot mixed into Form/Wizard/SchemaForm/Prompt configs.
 *
 * Consumers can either:
 * - Pass `theme` to override the static palette for a single surface
 *   (e.g. light, dark, high-contrast).
 * - Pass `themeCtx` so the surface participates in the host app's render-time
 *   theme switching (matches the `themeCtx` pattern used by constellation
 *   components).
 *
 * Both are optional; orbit falls back to corona's default theme when neither
 * is supplied so existing call sites need no changes.
 */
export interface ThemedConfig {
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

/**
 * Resolve a `SemanticTheme` from a themed config. `themeCtx` wins when it
 * carries a `theme`; otherwise `theme` is run through `createTheme`; otherwise
 * the package-level default is returned. The result is always a fully
 * materialised theme — never `undefined` — so callers can read colors
 * directly.
 */
export function resolveOrbitTheme(config: ThemedConfig | undefined): SemanticTheme {
  const ctxTheme = (config?.themeCtx as { theme?: SemanticTheme } | undefined)?.theme;
  if (ctxTheme && typeof ctxTheme === 'object' && 'colors' in ctxTheme) {
    return ctxTheme as SemanticTheme;
  }
  if (config?.theme !== undefined) {
    return createTheme(config.theme);
  }
  return defaultTheme;
}

/** Resolve a tone color (`success`, `warning`, `danger`, `info`, `accent`) for a themed config. */
export function orbitToneColor(config: ThemedConfig | undefined, tone: Tone): Color {
  return resolveToneColor(resolveOrbitTheme(config), tone);
}

/** Resolve a feedback color by semantic kind, matching `feedbackTokensMixin`. */
export function feedbackColor(config: ThemedConfig | undefined, kind: 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'textSoft'): Color {
  const theme = resolveOrbitTheme(config);
  switch (kind) {
    case 'muted':
      return theme.colors.muted;
    case 'textSoft':
      return theme.colors.textSoft;
    default:
      return theme.colors.tones[kind];
  }
}

/**
 * Resolve a form-control color matching `formTokensMixin` (text / border / highlight / muted).
 * Use these for field-level chrome rather than raw `color.X` constants.
 */
export function formColor(config: ThemedConfig | undefined, kind: 'text' | 'highlight' | 'muted' | 'border'): Color {
  const theme = resolveOrbitTheme(config);
  switch (kind) {
    case 'text':
      return theme.colors.text;
    case 'highlight':
      return theme.colors.highlight;
    case 'muted':
      return theme.colors.muted;
    case 'border':
      return theme.colors.border;
  }
}
