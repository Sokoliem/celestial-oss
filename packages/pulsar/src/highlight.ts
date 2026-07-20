/**
 * Pulsar Syntax Highlighter
 *
 * Thin wrapper around @celestial/spectrum's state-machine highlighting engine.
 * Preserves pulsar's public API for backward compatibility.
 */

import type { HighlightTheme, HighlightThemeName, LanguageGrammar, TokenizerState } from '@celestial/spectrum';
import {
  createTheme,
  getTheme,
  getLanguageGrammar as spectrumGetLanguageGrammar,
  highlight as spectrumHighlight,
  highlightCode as spectrumHighlightCode,
  highlightPartial as spectrumHighlightPartial,
  initialState as spectrumInitialState,
  listLanguages as spectrumListLanguages,
  registerLanguage as spectrumRegisterLanguage,
} from '@celestial/spectrum';

// ── Re-export types for backward compatibility ─────────────────────────
export type { HighlightTheme, HighlightThemeName, LanguageGrammar };

// ── Theme API ──────────────────────────────────────────────────────────

/**
 * Get a highlight theme by name.
 */
export function getHighlightTheme(name: HighlightThemeName): HighlightTheme {
  return getTheme(name);
}

/**
 * Create a custom highlight theme by merging overrides onto the default.
 */
export function createHighlightTheme(overrides: Partial<HighlightTheme>): HighlightTheme {
  return createTheme(overrides);
}

// ── Grammar API ────────────────────────────────────────────────────────

/**
 * Register a custom language grammar.
 */
export function registerLanguage(grammar: LanguageGrammar): void {
  spectrumRegisterLanguage(grammar);
}

/**
 * Get a language grammar by name (case-insensitive).
 */
export function getLanguageGrammar(language: string): LanguageGrammar | undefined {
  return spectrumGetLanguageGrammar(language);
}

/**
 * List all registered language names.
 */
export function listLanguages(): string[] {
  return spectrumListLanguages();
}

// ── Highlight API ──────────────────────────────────────────────────────

/**
 * Apply syntax highlighting to code.
 *
 * Falls back to unstyled text for unknown languages. Supports named
 * highlight themes: 'default', 'monokai', 'github', 'dracula', 'solarized'.
 */
export function highlight(code: string, language: string, theme?: HighlightTheme | HighlightThemeName): string {
  return spectrumHighlight(code, language, theme);
}

/**
 * Highlight code with options object. Alias for convenience.
 */
export function highlightCode(code: string, options: { language: string; theme?: HighlightTheme | HighlightThemeName }): string {
  return spectrumHighlightCode(code, options);
}

/**
 * Highlight a single line incrementally, preserving tokenizer state for
 * multi-line constructs. Pass the returned state into the next call to
 * continue highlighting across chunk boundaries (e.g., streaming markdown).
 */
export function highlightPartial(
  line: string,
  language: string,
  state: TokenizerState,
  theme?: HighlightTheme | HighlightThemeName,
): { text: string; state: TokenizerState } {
  return spectrumHighlightPartial(line, language, state, theme);
}

/** Initial tokenizer state for incremental highlighting. */
export function initialState(): TokenizerState {
  return spectrumInitialState();
}
