/**
 * Component Token Contracts
 *
 * Components declare what theme tokens they consume via a `TokenContract`.
 * The contract maps token names to resolver functions that extract values
 * from a `SemanticTheme`. Users can override individual tokens per-component
 * via `createTheme({ components: { componentName: { ... } } })`.
 *
 * ## Shared Mixins
 *
 * Common token patterns are provided as **mixin contracts** that components
 * can spread into their own contracts:
 *
 * ```ts
 * const myContract: TokenContract<BaseTokens & InteractiveTokens & MyExtras> = {
 *   ...baseTokensMixin,
 *   ...interactiveTokensMixin,
 *   customField: (t) => t.colors.tones.accent,
 * };
 * ```
 */

import type { Color } from './color.js';
import type { SemanticTheme, TypographyToken } from './theme.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A contract declaring which tokens a component needs and how to
 * resolve each one from the theme.
 */
export type TokenContract<T> = {
  [K in keyof T]: (theme: SemanticTheme) => T[K];
};

/**
 * The resolved output of a `TokenContract` — concrete values for each key.
 */
export type ResolvedTokens<C extends TokenContract<any>> = {
  [K in keyof C]: C[K] extends (theme: SemanticTheme) => infer R ? R : never;
};

// ─── Key for storing component overrides on the theme ───────────────────────

export const COMPONENT_OVERRIDES_KEY = '__componentOverrides';

// ─── Resolution functions ───────────────────────────────────────────────────

/**
 * Resolve a token contract against a theme, with optional direct overrides.
 */
export function resolveTokens<T>(contract: TokenContract<T>, theme: SemanticTheme, overrides?: Partial<T>): T {
  const result = {} as T;
  for (const key of Object.keys(contract) as (keyof T & string)[]) {
    if (overrides && key in overrides && overrides[key] !== undefined) {
      result[key] = overrides[key] as T[typeof key];
    } else {
      result[key] = contract[key](theme) as T[typeof key];
    }
  }
  return result;
}

/**
 * Resolve a token contract with per-component overrides from the theme.
 * Components are identified by name; overrides are set via
 * `createTheme({ components: { [name]: { ... } } })`.
 */
export function resolveComponentTokens<T>(contract: TokenContract<T>, theme: SemanticTheme, componentName: string): T {
  const overrides = (theme as unknown as Record<string, unknown>)[COMPONENT_OVERRIDES_KEY] as Record<string, Partial<T>> | undefined;
  return resolveTokens(contract, theme, overrides?.[componentName]);
}

// ─── Contract composition ───────────────────────────────────────────────────

/**
 * Merge multiple token contracts into a single contract.
 *
 * ```ts
 * const combined = mergeContracts(baseTokensMixin, interactiveTokensMixin, {
 *   custom: (t) => t.colors.tones.info,
 * });
 * ```
 */
export function mergeContracts<A, B>(a: TokenContract<A>, b: TokenContract<B>): TokenContract<A & B>;
export function mergeContracts<A, B, C>(a: TokenContract<A>, b: TokenContract<B>, c: TokenContract<C>): TokenContract<A & B & C>;
export function mergeContracts<A, B, C, D>(a: TokenContract<A>, b: TokenContract<B>, c: TokenContract<C>, d: TokenContract<D>): TokenContract<A & B & C & D>;
export function mergeContracts(...contracts: TokenContract<any>[]): TokenContract<any> {
  return Object.assign({}, ...contracts);
}

// ─── Shared mixin token types ───────────────────────────────────────────────

/** Base tokens used by nearly every component (text + border). */
export interface BaseTokens {
  text: Color;
  border: Color;
}

/** Surface tokens for components that render backgrounds. */
export interface SurfaceTokens {
  bg: Color;
  textSoft: Color;
  muted: Color;
}

/** Interactive tokens for components with hover/focus/selection. */
export interface InteractiveTokens {
  highlight: Color;
  borderHover: Color;
  borderActive: Color;
}

/** Container tokens for overlay-type components (dialog, modal, popover). */
export interface ContainerTokens {
  bg: Color;
  backdrop: Color;
  border: Color;
  divider: Color;
  titleStyle: TypographyToken;
  captionStyle: TypographyToken;
}

/** Form control tokens for input-like components. */
export interface FormTokens {
  text: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  highlight: Color;
  muted: Color;
  labelStyle: TypographyToken;
}

/** Feedback tokens for status-reporting components (alert, toast). */
export interface FeedbackTokens {
  text: Color;
  textSoft: Color;
  bg: Color;
  border: Color;
}

// ─── Shared mixin contracts ─────────────────────────────────────────────────

/** Base mixin: text + border. Spread into any component contract. */
export const baseTokensMixin: TokenContract<BaseTokens> = {
  text: (t) => t.colors.text,
  border: (t) => t.colors.border,
};

/** Surface mixin: bg + textSoft + muted. For components rendering backgrounds. */
export const surfaceTokensMixin: TokenContract<SurfaceTokens> = {
  bg: (t) => t.colors.surfaceRaised,
  textSoft: (t) => t.colors.textSoft,
  muted: (t) => t.colors.muted,
};

/** Interactive mixin: highlight + borderHover + borderActive. For interactive components. */
export const interactiveTokensMixin: TokenContract<InteractiveTokens> = {
  highlight: (t) => t.colors.highlight,
  borderHover: (t) => t.colors.borderHover,
  borderActive: (t) => t.colors.borderActive,
};

/** Container mixin: bg + backdrop + border + divider + titleStyle + captionStyle. For overlays. */
export const containerTokensMixin: TokenContract<ContainerTokens> = {
  bg: (t) => t.colors.surfaceRaised,
  backdrop: (t) => t.colors.backdrop,
  border: (t) => t.colors.border,
  divider: (t) => t.colors.divider,
  titleStyle: (t) => t.typography.heading,
  captionStyle: (t) => t.typography.caption,
};

/** Form control mixin: text + border + borderHover + borderActive + highlight + muted + labelStyle. */
export const formTokensMixin: TokenContract<FormTokens> = {
  text: (t) => t.colors.text,
  border: (t) => t.colors.border,
  borderHover: (t) => t.colors.borderHover,
  borderActive: (t) => t.colors.borderActive,
  highlight: (t) => t.colors.highlight,
  muted: (t) => t.colors.muted,
  labelStyle: (t) => t.typography.label,
};

/** Feedback mixin: text + textSoft + bg + border. For status-reporting components. */
export const feedbackTokensMixin: TokenContract<FeedbackTokens> = {
  text: (t) => t.colors.text,
  textSoft: (t) => t.colors.textSoft,
  bg: (t) => t.colors.surfaceRaised,
  border: (t) => t.colors.border,
};
