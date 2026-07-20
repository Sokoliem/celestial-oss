/**
 * Nebula Theme Plugin — shared reactive theme state via signals
 *
 * Provides a theme context backed by signals, enabling reactive theme
 * propagation through the component tree. Mirrors the breakpointPlugin
 * pattern: context creation + plugin factory.
 *
 * Theme changes propagate through the signal graph directly — when a
 * view function reads `context.current()`, it auto-tracks the dependency.
 * When the theme signal updates, the signal system triggers re-render.
 */

import {
  type A11yLevel,
  applyVariant,
  createTheme,
  extendTheme,
  type SemanticTheme,
  type ThemeA11yReport,
  type ThemeInput,
  type ThemeVariant,
  validateThemeContrast,
} from '@celestial/corona';
import type { Plugin } from './plugin.js';
import { batch, type Signal, signal } from './signals.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThemeContext {
  /** Current theme as a reactive signal. */
  readonly current: Signal<SemanticTheme>;
  /** Current variant name as a reactive signal. */
  readonly variantName: Signal<string>;
  /** Switch to a named theme variant. Scales/states/typography recompute. */
  setVariant(variant: ThemeVariant): void;
  /** Merge partial overrides into the current theme. */
  patch(input: ThemeInput): void;
  /** Reset to the initial theme (before any variant or patch). */
  reset(): void;
  /** Validate current theme against WCAG contrast requirements. */
  validate(level?: A11yLevel): ThemeA11yReport;
}

// ─── createThemeContext ─────────────────────────────────────────────────────

/**
 * Create a reactive theme context.
 * Optionally pass initial ThemeInput overrides.
 */
export function createThemeContext(initial?: ThemeInput): ThemeContext {
  const initialTheme = createTheme(initial);
  const [currentTheme, setCurrentTheme] = signal<SemanticTheme>(initialTheme);
  const [vName, setVName] = signal<string>('default');

  function setVariant(variant: ThemeVariant): void {
    batch(() => {
      setCurrentTheme(applyVariant(initialTheme, variant));
      setVName(variant.name);
    });
  }

  function patch(input: ThemeInput): void {
    // Corona owns the deep-merge and contrast policy. Routing reactive patches
    // through the same constructor prevents ThemeContext from becoming a
    // second, weaker theme implementation or dropping newer token families.
    setCurrentTheme(extendTheme(currentTheme(), input));
  }

  function reset(): void {
    batch(() => {
      setCurrentTheme(initialTheme);
      setVName('default');
    });
  }

  function validate(level?: A11yLevel): ThemeA11yReport {
    return validateThemeContrast(currentTheme(), level);
  }

  return {
    current: currentTheme,
    variantName: vName,
    setVariant,
    patch,
    reset,
    validate,
  };
}

// ─── themePlugin ────────────────────────────────────────────────────────────

export interface ThemePlugin<Model, M> extends Plugin<Model, M> {
  /** The theme context managed by this plugin. */
  readonly context: ThemeContext;
}

/**
 * Create a plugin that manages a theme context.
 * Theme changes propagate reactively via signals — no subscription
 * interception needed (unlike breakpointPlugin).
 */
export function themePlugin<Model = unknown, M = unknown>(initial?: ThemeInput): ThemePlugin<Model, M> {
  const context = createThemeContext(initial);

  return {
    name: 'theme',
    context,
    // No wrap needed — theme propagates via signal graph, not subscriptions
  };
}
