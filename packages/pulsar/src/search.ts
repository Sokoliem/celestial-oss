/**
 * Markdown In-Document Search
 *
 * Find and navigate matches across a parsed markdown document.
 *
 * Searches against the *rendered* visible text of each block — link
 * URLs, raw HTML, and footnote definition labels are excluded so the
 * match results align with what the reader sees on screen, not the
 * source markup.
 *
 * Uses the same small `initSearch` / `findMatches` / `nextMatch` /
 * `prevMatch` / `clearSearch` contract as Celestial's other search surfaces
 * without importing them.
 */

import type { InlineToken, ListItem, MarkdownSearchMatch, MarkdownSearchState, Token } from './types.js';

const DEFAULT_MAX_MATCHES = 10_000;
const MAX_SEARCH_QUERY_LENGTH = 100_000;
const MAX_FLATTEN_DEPTH = 256;

// ── Public API ──────────────────────────────────────────────────────────

/** Try to compile the user's query as a regex. */
function tryRegex(query: string, flags = 'g'): RegExp | null {
  if (query.length > MAX_SEARCH_QUERY_LENGTH) return null;
  try {
    return new RegExp(query, flags);
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the visible (rendered) text from a single block token.
 * Skips link URLs, image URLs, and raw markup; preserves the text
 * the reader actually sees. Code-block content is searchable in full
 * (including syntax — that's intentional, since search-in-code is a
 * common use case).
 */
export function flattenSearchableText(token: Token): string {
  return flattenToken(token, 0, new WeakSet<object>());
}

function flattenToken(token: Token, depth: number, active: WeakSet<object>): string {
  if (!token || typeof token !== 'object' || depth > MAX_FLATTEN_DEPTH || active.has(token)) return '';
  active.add(token);
  try {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return inlineText(token.content, depth + 1, active);
    case 'code-block':
      return token.content;
    case 'blockquote':
      return token.content.map((child) => flattenToken(child, depth + 1, active)).join('\n');
    case 'list':
      return token.items.map((item) => listItemText(item, depth + 1, active)).join('\n');
    case 'hr':
      return '';
    case 'table': {
      const headerRow = token.headers.map((cell) => inlineText(cell, depth + 1, active)).join(' | ');
      const bodyRows = token.rows.map((row) => row.map((cell) => inlineText(cell, depth + 1, active)).join(' | ')).join('\n');
      return `${headerRow}\n${bodyRows}`;
    }
    case 'admonition':
      return `${token.title}\n${token.content.map((child) => flattenToken(child, depth + 1, active)).join('\n')}`;
    case 'footnote-def':
      return `${token.label}\n${token.content.map((child) => flattenToken(child, depth + 1, active)).join('\n')}`;
    case 'image':
      return token.alt;
    case 'definition-list':
      return token.items
        .map((item) => `${inlineText(item.term, depth + 1, active)}\n${item.descriptions.map((description) => inlineText(description, depth + 1, active)).join('\n')}`)
        .join('\n');
    case 'math-block':
      return token.content;
    case 'details':
      return `${inlineText(token.summary, depth + 1, active)}\n${token.content.map((child) => flattenToken(child, depth + 1, active)).join('\n')}`;
    case 'frontmatter':
      return '';
    case 'wiki-link-block':
      return token.alias ?? token.target;
    case 'live-exec':
      return token.source;
  }
  } finally {
    active.delete(token);
  }
}

function inlineText(tokens: readonly InlineToken[], depth: number, active: WeakSet<object>): string {
  if (!Array.isArray(tokens) || depth > MAX_FLATTEN_DEPTH || active.has(tokens)) return '';
  active.add(tokens);
  let out = '';
  try {
  for (const t of tokens) {
    if (!t || typeof t !== 'object') continue;
    switch (t.type) {
      case 'text':
        out += t.content;
        break;
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'mark':
      case 'sup':
      case 'sub':
        out += inlineText(t.content, depth + 1, active);
        break;
      case 'code':
        out += t.content;
        break;
      case 'link':
        // Visible link text only; the URL is excluded so users searching
        // for prose don't get false hits on URLs.
        out += t.text;
        break;
      case 'footnote-ref':
        out += `[^${t.label}]`;
        break;
      case 'emoji':
        out += `:${t.name}:`;
        break;
      case 'math-inline':
        out += t.content;
        break;
      case 'wiki-link':
        out += t.alias ?? t.target;
        break;
      case 'image-inline':
        out += t.alt;
        break;
      case 'hard-break':
        out += '\n';
        break;
    }
  }
  } finally {
    active.delete(tokens);
  }
  return out;
}

function listItemText(item: ListItem, depth: number, active: WeakSet<object>): string {
  if (!item || typeof item !== 'object' || depth > MAX_FLATTEN_DEPTH || active.has(item)) return '';
  active.add(item);
  const head = inlineText(item.content, depth + 1, active);
  const children = item.children ? item.children.map((child) => flattenToken(child, depth + 1, active)).join('\n') : '';
  active.delete(item);
  return children ? `${head}\n${children}` : head;
}

// ── Match finding ───────────────────────────────────────────────────────

export interface FindMatchesOptions {
  /**
   * Match mode. `'literal'` (default) treats the query as a plain
   * substring — `$`, `.`, `(` and other regex metacharacters match
   * themselves. `'regex'` treats the query as a JavaScript regex; an
   * invalid pattern falls back to literal matching.
   */
  readonly mode?: 'literal' | 'regex';
  /** Maximum results retained across the document. Defaults to 10,000. */
  readonly maxMatches?: number;
}

/**
 * Find every match of `query` in the document. The search is
 * case-sensitive when the query contains uppercase, case-insensitive
 * otherwise (a "smartcase" convention familiar from Vim).
 *
 * Default mode is `'literal'` — the query is treated as a plain
 * substring so the common case "search for a literal $ or ." works
 * without escaping. Pass `{ mode: 'regex' }` to opt into regex
 * matching.
 */
export function findMatches(tokens: readonly Token[], query: string, opts?: FindMatchesOptions): readonly MarkdownSearchMatch[] {
  if (!query || query.length > MAX_SEARCH_QUERY_LENGTH) return [];
  const flags = query === query.toLowerCase() ? 'giu' : 'gu';
  const mode = opts?.mode ?? 'literal';
  const regex = mode === 'regex' ? (tryRegex(query, flags) ?? new RegExp(escapeRegex(query), flags)) : new RegExp(escapeRegex(query), flags);
  const maxMatches =
    opts?.maxMatches === undefined || !Number.isFinite(opts.maxMatches) ? DEFAULT_MAX_MATCHES : Math.max(0, Math.min(DEFAULT_MAX_MATCHES, Math.floor(opts.maxMatches)));
  if (maxMatches === 0) return [];

  const matches: MarkdownSearchMatch[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const flat = flattenSearchableText(tokens[i]!);
    if (flat.length === 0) continue;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(flat)) !== null) {
      matches.push({
        blockIndex: i,
        column: m.index,
        length: m[0].length,
        snippet: extractSnippet(flat, m.index, m[0].length),
      });
      if (matches.length >= maxMatches) return matches;
      if (m[0].length === 0) {
        const codePoint = flat.codePointAt(regex.lastIndex);
        regex.lastIndex += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
      }
    }
  }

  return matches;
}

function extractSnippet(text: string, column: number, length: number): string {
  const before = Math.max(0, column - 30);
  const after = Math.min(text.length, column + length + 30);
  let s = text.slice(before, after);
  if (before > 0) s = '…' + s;
  if (after < text.length) s = s + '…';
  // Newlines collapse to spaces in the preview snippet.
  return s.replace(/\s+/g, ' ').trim();
}

// ── State / navigation ──────────────────────────────────────────────────

export function initSearch(query: string, tokens: readonly Token[], opts?: FindMatchesOptions): MarkdownSearchState {
  return {
    query,
    regex: opts?.mode === 'regex' ? tryRegex(query) : null,
    matches: findMatches(tokens, query, opts),
    currentMatchIndex: 0,
    inputActive: false,
  };
}

export function nextMatch(state: MarkdownSearchState): MarkdownSearchState {
  if (state.matches.length === 0) return state;
  const current = Number.isSafeInteger(state.currentMatchIndex) ? ((state.currentMatchIndex % state.matches.length) + state.matches.length) % state.matches.length : 0;
  return { ...state, currentMatchIndex: (current + 1) % state.matches.length };
}

export function prevMatch(state: MarkdownSearchState): MarkdownSearchState {
  if (state.matches.length === 0) return state;
  const current = Number.isSafeInteger(state.currentMatchIndex) ? ((state.currentMatchIndex % state.matches.length) + state.matches.length) % state.matches.length : 0;
  return { ...state, currentMatchIndex: (current - 1 + state.matches.length) % state.matches.length };
}

export function clearSearch(): null {
  return null;
}
