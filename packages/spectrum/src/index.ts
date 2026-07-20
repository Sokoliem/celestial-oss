/**
 * @celestial/spectrum
 *
 * State-machine syntax highlighting engine for the Celestial TUI framework.
 * Supports 42 languages, 12 built-in themes, document helpers, and extensible grammars.
 */

// ── Document API ────────────────────────────────────────────────────────
export { findMatchingBracket, getFoldingRanges, retokenizeDocument, tokenizeDocument } from './document.js';
// ── Grammar Helpers ─────────────────────────────────────────────────────
export {
  functionCall,
  identifier,
  keywords,
  keywordsCI,
  lineComment,
  numberLiteral,
  operators,
  punctuation,
  stringLiteral,
  templateLiteral,
  whitespace,
} from './grammar-helpers.js';
// ── Grammars ────────────────────────────────────────────────────────────
export {
  getLanguageGrammar,
  listLanguages,
  registerGrammar,
  registerLanguage,
} from './grammars.js';
// ── Highlight API ───────────────────────────────────────────────────────
export { highlight, highlightCode, highlightLineToVNodes, highlightPartial, highlightToVNodes, tokenizeCode } from './highlight.js';
// ── Language Detection ──────────────────────────────────────────────────
export { detectLanguage, detectLanguageFromShebang } from './language-detect.js';
// ── TextMate Import ─────────────────────────────────────────────────────
export { importTextMateGrammar, parseTextMateGrammar } from './textmate.js';
// ── Themes ──────────────────────────────────────────────────────────────
export { applyTheme, createTheme, fromSemanticTheme, getTheme, resolveTheme } from './themes.js';
// ── Tokenizer ───────────────────────────────────────────────────────────
export { initialState, tokenize, tokenizeLine } from './tokenizer.js';

// ── Types ───────────────────────────────────────────────────────────────
export type {
  BracketMatch,
  FoldingRange,
  HighlightTheme,
  HighlightThemeName,
  LanguageGrammar,
  LineChange,
  LinePosition,
  StateRule,
  Token,
  TokenCategory,
  TokenizedDocument,
  TokenizedLine,
  TokenizerState,
  TokenRule,
} from './types.js';
