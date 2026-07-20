/**
 * Spectrum Grammar Helpers
 *
 * Utilities for building language grammars with less boilerplate.
 * Converts keyword lists + common patterns into regex-based TokenRules.
 */

import type { TokenCategory, TokenRule } from './types.js';

/**
 * Create a keyword rule from an array of keywords.
 * Generates a single regex alternation with word boundaries.
 */
export function keywords(words: string[], token: TokenCategory = 'keyword'): TokenRule {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    pattern: new RegExp(`(?:${escaped.join('|')})(?![a-zA-Z_$0-9])`, 'y'),
    token,
  };
}

/**
 * Create a case-insensitive keyword rule.
 */
export function keywordsCI(words: string[], token: TokenCategory = 'keyword'): TokenRule {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    pattern: new RegExp(`(?:${escaped.join('|')})(?![a-zA-Z_$0-9])`, 'iy'),
    token,
  };
}

/**
 * Create a line comment rule for a given prefix.
 */
export function lineComment(prefix: string): TokenRule {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    pattern: new RegExp(`${escaped}.*`, 'y'),
    token: 'comment',
  };
}

/**
 * Create a single-line string rule for a given delimiter.
 * Handles backslash escapes.
 */
export function stringLiteral(delim: string): TokenRule {
  const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    pattern: new RegExp(`${escaped}(?:[^${escaped}\\\\]|\\\\.)*${escaped}`, 'y'),
    token: 'string',
  };
}

/**
 * Template literal (backtick) string rule.
 * Simple version — doesn't parse ${} interpolations as separate tokens.
 */
export function templateLiteral(): TokenRule {
  return {
    pattern: /`(?:[^`\\]|\\.)*`/y,
    token: 'string',
  };
}

/**
 * Number literal rule — handles integers, floats, hex, octal, binary,
 * scientific notation, and numeric separators.
 */
export function numberLiteral(): TokenRule {
  return {
    pattern: /(?:0[xX][\da-fA-F][\da-fA-F_]*|0[oO][0-7][0-7_]*|0[bB][01][01_]*|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)/y,
    token: 'number',
  };
}

/**
 * Identifier rule — matches word-boundary identifiers.
 * Used as a fallback for unrecognized identifiers.
 */
export function identifier(token: TokenCategory = 'variable'): TokenRule {
  return {
    pattern: /[a-zA-Z_$][a-zA-Z_$0-9]*/y,
    token,
  };
}

/**
 * Function call detection — identifier followed by (.
 * Uses a lookahead to not consume the paren.
 */
export function functionCall(): TokenRule {
  return {
    pattern: /[a-zA-Z_$][a-zA-Z_$0-9]*(?=\s*(?:<[^>]*>)?\s*\()/y,
    token: 'function',
  };
}

/**
 * Operator characters rule.
 */
export function operators(chars: string): TokenRule {
  const escaped = chars
    .split('')
    .map((c) => c.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return {
    pattern: new RegExp(`[${escaped}]+`, 'y'),
    token: 'operator',
  };
}

/**
 * Whitespace rule — preserves whitespace as text tokens.
 */
export function whitespace(): TokenRule {
  return {
    pattern: /\s+/y,
    token: 'text',
  };
}

/**
 * Punctuation rule for specific characters.
 */
export function punctuation(chars: string): TokenRule {
  const escaped = chars
    .split('')
    .map((c) => c.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('');
  return {
    pattern: new RegExp(`[${escaped}]`, 'y'),
    token: 'punctuation',
  };
}
