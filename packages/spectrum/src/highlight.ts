/**
 * Spectrum Highlighter
 *
 * High-level API that wires the tokenizer, themes, and grammars together.
 * This is the main entry point consumers use for syntax highlighting.
 */

import { color, style } from '@celestial/corona';
import { row, text, type VNode } from '@celestial/nebula';
import { type BracketDepth, bracketPairColors, groupBracketDepthsByLine } from './bracket-colors.js';
import { tokenizeDocument } from './document.js';
import { getLanguageGrammar } from './grammars.js';
import { applyTheme, resolveTheme } from './themes.js';
import { initialState, tokenizeLine } from './tokenizer.js';
import type { HighlightTheme, HighlightThemeName, Token, TokenizedLine, TokenizerState } from './types.js';

// ── Bracket colour palette ──────────────────────────────────────────────

/**
 * Default 6-color cycle for bracket-pair coloring. Picked for visual
 * distinctness on both light and dark themes; consumers can override
 * via `HighlightOptions.bracketColors`.
 */
export const DEFAULT_BRACKET_COLORS: readonly ((t: string) => string)[] = [
  (t) => style({ color: color.yellow }).render(t),
  (t) => style({ color: color.brightMagenta }).render(t),
  (t) => style({ color: color.brightCyan }).render(t),
  (t) => style({ color: color.brightBlue }).render(t),
  (t) => style({ color: color.brightGreen }).render(t),
  (t) => style({ color: color.brightRed }).render(t),
];

/** Default styling applied to unmatched brackets — bright red, bold. */
export const DEFAULT_UNMATCHED_BRACKET_COLOR: (t: string) => string = (t) => style({ color: color.brightRed, bold: true }).render(t);

// ── Highlight options ───────────────────────────────────────────────────

/**
 * Options bag for `highlight()` and friends. All fields are optional;
 * an unset object reproduces today's behaviour byte-for-byte.
 */
export interface HighlightOptions {
  /** Theme name or full theme. Default `'default'`. */
  readonly theme?: HighlightTheme | HighlightThemeName;
  /**
   * Enable bracket-pair colorization. When `true`, every bracket
   * character is rendered with a per-depth color from
   * `bracketColors`, and unmatched brackets use
   * `unmatchedBracketColor`. Pure overlay — non-bracket tokens render
   * exactly as before.
   */
  readonly colorizeBrackets?: boolean;
  /** Custom bracket-color cycle. Default `DEFAULT_BRACKET_COLORS` (6 entries). */
  readonly bracketColors?: readonly ((t: string) => string)[];
  /** Custom style for unmatched brackets. Default red+bold. */
  readonly unmatchedBracketColor?: (t: string) => string;
}

// ── Core Highlight API ──────────────────────────────────────────────────

/**
 * Apply syntax highlighting to code using the state-machine tokenizer.
 *
 * Returns ANSI-styled text. Falls back to unstyled text for unknown languages.
 * Supports named themes: 'default', 'monokai', 'github', 'dracula', 'solarized'.
 *
 * @param code - Source code to highlight
 * @param language - Language identifier (e.g., 'typescript', 'python', 'sql')
 * @param theme - Theme name or theme object (default: 'default')
 * @returns ANSI-styled string
 */
export function highlight(code: string, language: string, theme?: HighlightTheme | HighlightThemeName, opts?: Omit<HighlightOptions, 'theme'>): string {
  if (!code) return code;

  const ht = resolveTheme(theme);
  const document = tokenizeDocument(code, language);
  if (document) {
    const depthMap = opts?.colorizeBrackets ? groupBracketDepthsByLine(bracketPairColors(document)) : undefined;
    return document.lines
      .map((line, lineIndex) => {
        const lineDepths = depthMap?.get(lineIndex);
        return lineDepths && lineDepths.length > 0 ? renderTokensWithBrackets(line, lineDepths, ht, opts) : renderTokens([...line.tokens], ht);
      })
      .join('\n');
  }

  const grammar = getLanguageGrammar(language);
  if (!grammar) return code;

  const lines = code.split('\n');
  let state = initialState();
  const styledLines: string[] = [];

  // Bracket coloring requires a TokenizedDocument (it walks across all
  // lines for depth tracking). When the language has no tokenizer-document
  // path we fall back to plain rendering — a documented limitation.
  for (const line of lines) {
    const [tokens, nextState] = tokenizeLine(line, grammar, state);
    styledLines.push(renderTokens(tokens, ht));
    state = nextState;
  }

  return styledLines.join('\n');
}

/**
 * Highlight code with an options object. Alias for convenience.
 *
 * @param code - Source code to highlight
 * @param options - `{ language, theme? }`
 * @returns ANSI-styled string
 */
export function highlightCode(code: string, options: { language: string; theme?: HighlightTheme | HighlightThemeName }): string {
  return highlight(code, options.language, options.theme);
}

/**
 * Highlight a single line incrementally, preserving tokenizer state for
 * multi-line constructs (block comments, template strings, etc.).
 *
 * Returns the styled text for the line and the next state. Pass the
 * returned state into the next call to continue highlighting across
 * chunk boundaries (e.g., streaming markdown code fences).
 *
 * Falls back to unstyled text for unknown languages.
 *
 * @param line - Single line of source code (no trailing newline)
 * @param language - Language identifier
 * @param state - Current tokenizer state (from previous call or `initialState()`)
 * @param theme - Theme name or theme object (default: 'default')
 * @returns `{ text, state }` — styled line and next state
 */
export function highlightPartial(
  line: string,
  language: string,
  state: TokenizerState,
  theme?: HighlightTheme | HighlightThemeName,
): { text: string; state: TokenizerState } {
  const ht = resolveTheme(theme);
  const grammar = getLanguageGrammar(language);
  if (!grammar) {
    return { text: line, state };
  }

  const [tokens, nextState] = tokenizeLine(line, grammar, state);
  return { text: renderTokens(tokens, ht), state: nextState };
}

/**
 * Tokenize code into an array of categorized tokens (without styling).
 * Useful when consumers need raw tokens for custom rendering.
 *
 * @param code - Source code to tokenize
 * @param language - Language identifier
 * @returns Array of Token objects, or null if the language is unknown
 */
export function tokenizeCode(code: string, language: string): Token[] | null {
  const document = tokenizeDocument(code, language);
  if (document) {
    const allTokens: Token[] = [];
    for (let i = 0; i < document.lines.length; i++) {
      if (i > 0) {
        allTokens.push({ category: 'text', text: '\n' });
      }
      allTokens.push(...document.lines[i]!.tokens);
    }
    return allTokens;
  }

  const grammar = getLanguageGrammar(language);
  if (!grammar) return null;

  const lines = code.split('\n');
  const allTokens: Token[] = [];
  let state = initialState();

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      allTokens.push({ category: 'text', text: '\n' });
    }
    const [tokens, nextState] = tokenizeLine(lines[i]!, grammar, state);
    allTokens.push(...tokens);
    state = nextState;
  }

  return allTokens;
}

// ── VNode Highlight API ─────────────────────────────────────────────────

/**
 * Convert a single line's tokens into a VNode row with theme styling.
 * Each token becomes a styled `text()` node, grouped into a `row()`.
 *
 * Use this when you already have pre-tokenized lines (e.g. from
 * `tokenizeDocument().lines[i].tokens`) and need VNode output.
 *
 * @param tokens - Token array for a single line
 * @param theme - Theme name or theme object (default: 'default')
 * @returns A single row VNode containing styled text nodes
 */
export function highlightLineToVNodes(tokens: readonly Token[], theme?: HighlightTheme | HighlightThemeName): VNode {
  const ht = resolveTheme(theme);
  const nodes: VNode[] = [];
  for (const token of tokens) {
    nodes.push(text(applyTheme(ht, token.category, token.text)));
  }
  return row(...nodes);
}

/**
 * Apply syntax highlighting to code, returning VNode[] (one row per line).
 *
 * Unlike `highlight()` which returns a flat ANSI string, this returns
 * structured VNodes suitable for composition in layout trees, overlays,
 * and diff renderers.
 *
 * @param code - Source code to highlight
 * @param language - Language identifier (e.g., 'typescript', 'python')
 * @param theme - Theme name or theme object (default: 'default')
 * @returns Array of row VNodes, one per source line
 */
export function highlightToVNodes(code: string, language: string, theme?: HighlightTheme | HighlightThemeName): VNode[] {
  if (!code) return [];

  const ht = resolveTheme(theme);
  const document = tokenizeDocument(code, language);
  if (document) {
    return document.lines.map((line) => renderTokensToVNode([...line.tokens], ht));
  }

  const grammar = getLanguageGrammar(language);
  if (!grammar) {
    return code.split('\n').map((line) => row(text(line)));
  }

  const lines = code.split('\n');
  let state = initialState();
  const vnodes: VNode[] = [];

  for (const line of lines) {
    const [tokens, nextState] = tokenizeLine(line, grammar, state);
    vnodes.push(renderTokensToVNode(tokens, ht));
    state = nextState;
  }

  return vnodes;
}

// ── Internals ───────────────────────────────────────────────────────────

/**
 * Render an array of tokens into a styled string using a theme.
 */
function renderTokens(tokens: Token[], theme: HighlightTheme): string {
  let result = '';
  for (const token of tokens) {
    result += applyTheme(theme, token.category, token.text);
  }
  return result;
}

/**
 * Render a single line with bracket-depth color overlay. Walks tokens
 * column-by-column; when a column matches a known bracket depth, emit
 * the bracket character with the depth-cycled color (or unmatched color)
 * instead of the token's regular theme styling.
 */
function renderTokensWithBrackets(
  line: TokenizedLine,
  depths: readonly BracketDepth[],
  theme: HighlightTheme,
  opts: Omit<HighlightOptions, 'theme'> | undefined,
): string {
  const customPalette = opts?.bracketColors?.filter((candidate): candidate is (text: string) => string => typeof candidate === 'function').slice(0, 256);
  const palette = customPalette && customPalette.length > 0 ? customPalette : DEFAULT_BRACKET_COLORS;
  const unmatched = typeof opts?.unmatchedBracketColor === 'function' ? opts.unmatchedBracketColor : DEFAULT_UNMATCHED_BRACKET_COLOR;
  const cycle = palette.length;

  // O(1) lookup by column.
  const byColumn = new Map<number, BracketDepth>();
  for (const d of depths) byColumn.set(d.column, d);

  let result = '';
  let column = 0;
  for (const token of line.tokens) {
    // Fast path: no brackets in this token's column range.
    let hasBracketInToken = false;
    for (let i = 0; i < token.text.length; i++) {
      if (byColumn.has(column + i)) {
        hasBracketInToken = true;
        break;
      }
    }
    if (!hasBracketInToken) {
      result += applyTheme(theme, token.category, token.text);
      column += token.text.length;
      continue;
    }

    // Slow path: split the token at bracket positions and apply the
    // depth color to bracket chars only.
    let pending = '';
    for (let i = 0; i < token.text.length; i++) {
      const at = column + i;
      const bracket = byColumn.get(at);
      if (bracket) {
        if (pending.length > 0) {
          result += applyTheme(theme, token.category, pending);
          pending = '';
        }
        const colorize = bracket.unmatched ? unmatched : palette[bracket.depth % cycle]!;
        result += colorize(token.text[i]!);
      } else {
        pending += token.text[i]!;
      }
    }
    if (pending.length > 0) result += applyTheme(theme, token.category, pending);
    column += token.text.length;
  }

  return result;
}

/**
 * Render an array of tokens into a row VNode with themed text nodes.
 */
function renderTokensToVNode(tokens: Token[], theme: HighlightTheme): VNode {
  const nodes: VNode[] = [];
  for (const token of tokens) {
    nodes.push(text(applyTheme(theme, token.category, token.text)));
  }
  return row(...nodes);
}
