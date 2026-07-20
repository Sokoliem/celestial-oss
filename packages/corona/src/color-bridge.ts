/**
 * Corona — Widget Color Bridge
 *
 * A generic pattern for mapping theme values to widget/external system
 * color configs. Codifies the `toQuasarColors()` pattern from the wrapper
 * into a reusable `ColorBridge<T>`.
 *
 * A color bridge is an object mapping keys to resolver functions
 * `(theme: SemanticTheme) => V`. Resolve the bridge against a theme to
 * get concrete values, optionally with per-key overrides.
 *
 * Bridges can be merged (`mergeColorBridge`) to compose color configs
 * from smaller pieces.
 *
 * ```ts
 * const widgetBridge = defineColorBridge({
 *   accent: (t) => t.colors.tones.accent,
 *   muted: (t) => t.colors.muted,
 *   bg: (t) => t.colors.surface,
 * });
 *
 * // Resolve for a specific theme
 * const colors = resolveColorBridge(widgetBridge, theme);
 * // → { accent: Color, muted: Color, bg: Color }
 *
 * // With per-key overrides
 * const colors2 = resolveColorBridge(widgetBridge, theme, {
 *   accent: color.hex('#ff0000'),
 * });
 * ```
 */

import type { SemanticTheme } from './theme.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A color bridge definition: maps keys to resolver functions that extract
 * values from a SemanticTheme. Similar to `TokenContract` but for
 * widget-level color configs rather than component tokens.
 */
export type ColorBridge<T> = {
  [K in keyof T]: (theme: SemanticTheme) => T[K];
};

/**
 * The resolved output of a `ColorBridge` — concrete values for each key.
 */
export type ResolvedColorBridge<B extends ColorBridge<any>> = {
  [K in keyof B]: B[K] extends (theme: SemanticTheme) => infer R ? R : never;
};

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Identity function that provides type inference for color bridges.
 * Returns the input as-is (no wrapping overhead).
 */
export function defineColorBridge<T>(bridge: ColorBridge<T>): ColorBridge<T> {
  return bridge;
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/**
 * Resolve a color bridge against a theme, with optional per-key overrides.
 *
 * Override values take precedence over the bridge resolver when defined
 * and not `undefined`.
 */
export function resolveColorBridge<T>(bridge: ColorBridge<T>, theme: SemanticTheme, overrides?: Partial<T>): T {
  const result = {} as T;
  for (const key of Object.keys(bridge) as (keyof T & string)[]) {
    if (overrides && key in overrides && overrides[key] !== undefined) {
      result[key] = overrides[key] as T[typeof key];
    } else {
      result[key] = bridge[key](theme) as T[typeof key];
    }
  }
  return result;
}

// ─── Composition ────────────────────────────────────────────────────────────

/**
 * Merge two color bridges into one. The extension bridge's resolvers
 * override the base bridge's resolvers for duplicate keys.
 */
export function mergeColorBridge<A, B>(base: ColorBridge<A>, extension: ColorBridge<B>): ColorBridge<A & B> {
  return { ...base, ...extension } as ColorBridge<A & B>;
}
