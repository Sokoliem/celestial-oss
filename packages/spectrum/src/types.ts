/**
 * Spectrum Type Definitions
 *
 * Core types for the state-machine syntax highlighting engine.
 */

// ── Token Categories ────────────────────────────────────────────────────

/**
 * Semantic token categories for syntax highlighting.
 * Maps to theme styling functions.
 */
export type TokenCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'operator'
  | 'type'
  | 'function'
  | 'variable'
  | 'punctuation'
  | 'builtin'
  | 'meta' // preprocessor directives, decorators, annotations
  | 'tag' // HTML/XML tags
  | 'attribute' // HTML/XML attributes
  | 'regexp' // regular expression literals
  | 'constant' // language constants (true, false, null, nil, etc.)
  | 'namespace' // module/package/namespace identifiers
  | 'parameter' // function parameters
  | 'property' // object properties
  | 'label' // goto labels, case labels
  | 'escape' // escape sequences inside strings
  | 'text'; // plain unstyled text

// ── Tokens ──────────────────────────────────────────────────────────────

/**
 * A token produced by the tokenizer — a span of text with a category.
 */
export interface Token {
  /** The token category for styling */
  readonly category: TokenCategory;
  /** The literal text content */
  readonly text: string;
}

// ── Grammar Rules ───────────────────────────────────────────────────────

/**
 * A regex-based token rule. Tried in order — first match wins.
 * The pattern MUST use a sticky flag (will be enforced at runtime).
 */
export interface TokenRule {
  /** Regex pattern to match at the current position */
  pattern: RegExp;
  /** Token category to assign to the match */
  token: TokenCategory;
  /** Optional: push a named state onto the state stack */
  push?: string;
  /** Optional: pop the current state off the stack */
  pop?: boolean;
  /** Optional: use capture group index for the token (default: 0 = full match) */
  group?: number;
}

/**
 * A state with begin/end delimiters for multi-line constructs.
 * When `begin` matches, the tokenizer pushes this state.
 * When `end` matches, the tokenizer pops back to the parent state.
 */
export interface StateRule {
  /** State name (used for push references) */
  name: string;
  /** Regex that opens this state */
  begin: RegExp;
  /** Regex that closes this state */
  end: RegExp;
  /** Token category for the begin/end delimiters themselves */
  token: TokenCategory;
  /** Token category for content between delimiters (if no contentRules match) */
  contentToken?: TokenCategory;
  /** Nested rules to try within this state (before end is checked) */
  contentRules?: TokenRule[];
}

/**
 * A complete language grammar definition.
 */
export interface LanguageGrammar {
  /** Language canonical name (lowercase) */
  name: string;
  /** Alternative names / aliases */
  aliases?: string[];
  /** Root-level token rules, tried in order */
  rules: TokenRule[];
  /** Named states for multi-line/nested constructs */
  states?: StateRule[];
}

// ── Themes ──────────────────────────────────────────────────────────────

/**
 * A highlight theme — maps token categories to styled string functions.
 */
export interface HighlightTheme {
  /** Theme display name */
  name: string;
  /** Styling functions for each token category */
  keyword: (text: string) => string;
  string: (text: string) => string;
  comment: (text: string) => string;
  number: (text: string) => string;
  operator: (text: string) => string;
  type: (text: string) => string;
  function: (text: string) => string;
  variable: (text: string) => string;
  punctuation: (text: string) => string;
  builtin: (text: string) => string;
  // Extended categories — optional, fall back to related categories
  meta?: (text: string) => string;
  tag?: (text: string) => string;
  attribute?: (text: string) => string;
  regexp?: (text: string) => string;
  constant?: (text: string) => string;
  namespace?: (text: string) => string;
  parameter?: (text: string) => string;
  property?: (text: string) => string;
  label?: (text: string) => string;
  escape?: (text: string) => string;
  text?: (text: string) => string;
}

/** Named built-in theme identifiers */
export type HighlightThemeName =
  | 'default'
  | 'monokai'
  | 'github'
  | 'github-light'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'solarized'
  | 'one-dark'
  | 'catppuccin'
  | 'tokyo-night'
  | 'gruvbox';

// ── Tokenizer State ─────────────────────────────────────────────────────

/**
 * The tokenizer's persistent state between lines.
 * Enables multi-line constructs (block comments, multi-line strings, etc.).
 */
export interface TokenizerState {
  /** Stack of active state names (empty = root) */
  readonly stack: readonly string[];
}

// ── Document Tokenization ───────────────────────────────────────────────

/** A 0-based line/column position inside a tokenized document. */
export interface LinePosition {
  readonly line: number;
  readonly column: number;
}

/** Tokenized representation of a single source line with state checkpoints. */
export interface TokenizedLine {
  readonly text: string;
  readonly tokens: readonly Token[];
  readonly hash: string;
  readonly stateBefore: TokenizerState;
  readonly stateAfter: TokenizerState;
  readonly stateBeforeSignature: string;
  readonly stateAfterSignature: string;
}

/** A full tokenized document split into line records. */
export interface TokenizedDocument {
  readonly source: string;
  readonly language: string;
  readonly lines: readonly TokenizedLine[];
}

/** A line-oriented document edit used for incremental re-tokenization. */
export interface LineChange {
  readonly startLine: number;
  readonly deleteCount: number;
  readonly insertLines: readonly string[];
}

/** Matching bracket pair at a given position. */
export interface BracketMatch {
  readonly bracket: '(' | '[' | '{' | '<';
  readonly open: LinePosition;
  readonly close: LinePosition;
}

/** Foldable region detected from indentation or bracket structure. */
export interface FoldingRange {
  readonly kind: 'indent' | 'bracket';
  readonly startLine: number;
  readonly endLine: number;
}
