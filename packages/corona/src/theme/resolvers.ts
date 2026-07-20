import type { Color } from '../color.js';
import { createTheme } from './create.js';
import { defaultTheme } from './defaults.js';
import type { ScaleStep, SemanticTheme, Size, ThemeInput, Tone } from './types.js';

export function isSemanticTheme(v: SemanticTheme | ThemeInput | undefined): v is SemanticTheme {
  if (!v) return false;
  const candidate = v as SemanticTheme;
  return (
    typeof candidate.colors === 'object' &&
    typeof candidate.spacing === 'object' &&
    typeof candidate.glyphs === 'object' &&
    typeof candidate.colors.text === 'object' &&
    typeof candidate.colors.tones === 'object'
  );
}

/**
 * Resolve the color for a given tone from a theme (or partial theme input).
 * Resolves against `defaultTheme` when input is a `ThemeInput`.
 */
export function resolveToneColor(themeOrInput: SemanticTheme | ThemeInput | undefined, tone: Tone = 'neutral'): Color {
  const t = isSemanticTheme(themeOrInput) ? themeOrInput : createTheme(themeOrInput);
  return t.colors.tones[tone];
}

/** Resolve a color from a tone's scale at a given step. */
export function resolveScale(themeOrInput: SemanticTheme | ThemeInput | undefined, tone: Tone, step: ScaleStep): Color {
  const t = isSemanticTheme(themeOrInput) ? themeOrInput : createTheme(themeOrInput);
  return t.scales[tone][step];
}

/** Resolve the numeric spacing value for a given size from a theme. */
export function resolveSpacing(size: Size = 'md', themeOrInput?: SemanticTheme | ThemeInput): number {
  const t = isSemanticTheme(themeOrInput) ? themeOrInput : createTheme(themeOrInput);
  return t.spacing[size];
}

/** Resolve a spacing size to a numeric cell-unit value, suitable for Gravity's `gap` prop. */
export function spacingGap(size: Size, theme?: SemanticTheme): number {
  return resolveSpacing(size, theme);
}

/** Return the full spacing scale as a record of size -> cell-unit values. */
export function spacingScale(theme?: SemanticTheme): Record<Size, number> {
  const t = theme ?? defaultTheme;
  return { ...t.spacing };
}
